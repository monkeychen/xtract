import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { Config } from '../config.js';
import { normalizeTweetDate } from '../client/parser.js';
import type { Tweet, TrendTopic, DeleteFilter, DeleteResult, TweetQueryOptions } from '../types.js';

export function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.m3u8') || lower.includes('video.twimg.com');
}

export function parseDurationMs(durationStr: string): number | null {
  const match = durationStr.trim().match(/^(\d+)\s*([dhwm])$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'm':
      return num * 60 * 1000;
    case 'h':
      return num * 3600 * 1000;
    case 'd':
      return num * 24 * 3600 * 1000;
    case 'w':
      return num * 7 * 24 * 3600 * 1000;
    default:
      return null;
  }
}

export async function downloadImage(
  url: string,
  destPath: string,
  timeoutMs = 15000
): Promise<boolean> {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
    return true;
  }

  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions: any = {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        Referer: 'https://x.com/',
      },
      signal: controller.signal,
    };
    if (Config.HTTP_PROXY && !(process as any).versions?.electron) {
      try {
        const { ProxyAgent } = await import('undici');
        fetchOptions.dispatcher = new ProxyAgent(Config.HTTP_PROXY);
      } catch {
        // ignore
      }
    }

    const res = await fetch(url, fetchOptions);

    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 0) {
        fs.writeFileSync(destPath, buffer);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export class Storage {
  private db: Database.Database;
  public readonly dbPath: string;
  public readonly baseOutputDir: string;

  constructor(dbPath?: string, baseOutputDir?: string) {
    this.dbPath = dbPath || Config.DB_PATH;
    this.baseOutputDir = baseOutputDir || path.join(Config.PROJECT_ROOT, 'output');
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(this.dbPath);
    this.initDb();
  }

  private initDb(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tweets (
        tweet_id TEXT PRIMARY KEY,
        author_id TEXT,
        author_name TEXT,
        author_username TEXT,
        text TEXT NOT NULL,
        created_at TEXT,
        is_retweet INTEGER DEFAULT 0,
        retweeted_author TEXT,
        retweeted_text TEXT,
        is_quote INTEGER DEFAULT 0,
        quoted_author TEXT,
        quoted_text TEXT,
        like_count INTEGER DEFAULT 0,
        retweet_count INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        urls TEXT,
        media_urls TEXT,
        source_type TEXT DEFAULT 'legacy',
        list_id TEXT,
        fetched_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_created_at ON tweets(created_at);
      CREATE INDEX IF NOT EXISTS idx_fetched_at ON tweets(fetched_at);
      CREATE TABLE IF NOT EXISTS trends_cache (
        category TEXT PRIMARY KEY,
        trends_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // 自动平滑迁移已有历史数据库表结构
    try {
      const columns = this.db.pragma('table_info(tweets)') as { name: string }[];
      const hasSourceType = columns.some((c) => c.name === 'source_type');
      if (!hasSourceType) {
        this.db.exec(`ALTER TABLE tweets ADD COLUMN source_type TEXT DEFAULT 'legacy'`);
      }
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_source_type ON tweets(source_type)`);

      const hasListId = columns.some((c) => c.name === 'list_id');
      if (!hasListId) {
        this.db.exec(`ALTER TABLE tweets ADD COLUMN list_id TEXT`);
      }
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_list_id ON tweets(list_id)`);

      // 自动清洗并规范化存量非 ISO-8601 格式的推文时间 (如推特原生 "Wed Aug 26 ...")
      // 确保 SQLite 中字符串排序 ORDER BY created_at DESC 与物理真实时间完全一致
      const nonIsoRows = this.db.prepare(`
        SELECT tweet_id, created_at FROM tweets 
        WHERE created_at NOT LIKE '____-__-__T__:__:__.___Z' 
          AND created_at NOT LIKE '____-__-__T__:__:__Z'
      `).all() as { tweet_id: string; created_at: string }[];

      if (nonIsoRows.length > 0) {
        const updateStmt = this.db.prepare('UPDATE tweets SET created_at = ? WHERE tweet_id = ?');
        const migrateTx = this.db.transaction(() => {
          for (const row of nonIsoRows) {
            const normalized = normalizeTweetDate(row.created_at);
            if (normalized !== row.created_at) {
              updateStmt.run(normalized, row.tweet_id);
            }
          }
        });
        migrateTx();
      }
    } catch {
      // 忽略迁移警告
    }
  }

  public saveTweets(
    tweets: Partial<Tweet>[],
    defaultSourceType: 'following' | 'search' | 'trends' | 'user' | 'list' | 'legacy' = 'following',
    listId?: string
  ): { inserted: number; skipped: number } {
    let inserted = 0;
    let skipped = 0;
    const nowIso = new Date().toISOString();

    const insertStmt = this.db.prepare(`
      INSERT INTO tweets (
        tweet_id, author_id, author_name, author_username,
        text, created_at, is_retweet, retweeted_author, retweeted_text,
        is_quote, quoted_author, quoted_text, like_count, retweet_count,
        reply_count, view_count, urls, media_urls, source_type, list_id, fetched_at
      ) VALUES (
        @tweet_id, @author_id, @author_name, @author_username,
        @text, @created_at, @is_retweet, @retweeted_author, @retweeted_text,
        @is_quote, @quoted_author, @quoted_text, @like_count, @retweet_count,
        @reply_count, @view_count, @urls, @media_urls, @source_type, @list_id, @fetched_at
      )
    `);

    const transaction = this.db.transaction((items: Partial<Tweet>[]) => {
      for (const item of items) {
        if (!item.tweet_id || !item.text) continue;
        try {
          insertStmt.run({
            tweet_id: item.tweet_id,
            author_id: item.author_id || '',
            author_name: item.author_name || 'Unknown',
            author_username: item.author_username || 'unknown',
            text: item.text,
            created_at: normalizeTweetDate(item.created_at),
            is_retweet: item.is_retweet ? 1 : 0,
            retweeted_author: item.retweeted_author || null,
            retweeted_text: item.retweeted_text || null,
            is_quote: item.is_quote ? 1 : 0,
            quoted_author: item.quoted_author || null,
            quoted_text: item.quoted_text || null,
            like_count: item.like_count || 0,
            retweet_count: item.retweet_count || 0,
            reply_count: item.reply_count || 0,
            view_count: item.view_count || 0,
            urls: JSON.stringify(item.urls || []),
            media_urls: JSON.stringify(item.media_urls || []),
            source_type: item.source_type || defaultSourceType || 'following',
            list_id: item.list_id || listId || null,
            fetched_at: item.fetched_at || nowIso,
          });
          inserted++;
        } catch (err: unknown) {
          if (err && typeof err === 'object' && 'code' in err && err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            const existing = this.getTweetById(item.tweet_id!);
            if (existing) {
              // 1. 防死锁与历史认领晋级 (Legacy Promotion)：
              // 若该推文在库中当前为 'legacy' 状态，而本次抓取来自明确数据源 (defaultSourceType !== 'legacy')
              // 则将其 source_type 晋级更新为明确的正式来源，彻底解开历史数据死锁！
              const shouldPromoteSource =
                existing.source_type === 'legacy' && defaultSourceType && defaultSourceType !== 'legacy';
              const targetSourceType = shouldPromoteSource ? defaultSourceType : existing.source_type;

              // 2. 富文本与媒体补齐
              const hasRicherContent =
                item.text &&
                (item.text.length > (existing.text || '').length ||
                  (item.media_urls?.length || 0) > (existing.media_urls?.length || 0));

              this.db
                .prepare(
                  `
                UPDATE tweets SET
                  text = CASE WHEN ? THEN ? ELSE text END,
                  media_urls = CASE WHEN ? THEN ? ELSE media_urls END,
                  urls = CASE WHEN ? THEN ? ELSE urls END,
                  source_type = ?,
                  list_id = COALESCE(?, list_id),
                  like_count = ?,
                  retweet_count = ?,
                  reply_count = ?,
                  view_count = ?,
                  fetched_at = ?
                WHERE tweet_id = ?
              `
                )
                .run(
                  hasRicherContent ? 1 : 0,
                  item.text || existing.text,
                  hasRicherContent ? 1 : 0,
                  JSON.stringify(item.media_urls || existing.media_urls || []),
                  hasRicherContent ? 1 : 0,
                  JSON.stringify(item.urls || existing.urls || []),
                  targetSourceType,
                  item.list_id || listId || null,
                  item.like_count ?? existing.like_count,
                  item.retweet_count ?? existing.retweet_count,
                  item.reply_count ?? existing.reply_count,
                  item.view_count ?? existing.view_count,
                  nowIso,
                  item.tweet_id!
                );
            }
            skipped++;
          } else {
            throw err;
          }
        }
      }
    });

    transaction(tweets);
    return { inserted, skipped };
  }

  public getUnsummarizedTweets(options: {
    hours?: number;
    limit?: number;
    minLikes?: number;
    minRetweets?: number;
  } = {}): Tweet[] {
    const hours = options.hours ?? 24;
    const limit = options.limit ?? 150;
    const minLikes = options.minLikes ?? 0;
    const minRetweets = options.minRetweets ?? 0;

    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    const stmt = this.db.prepare(`
      SELECT * FROM tweets
      WHERE fetched_at >= ? AND like_count >= ? AND retweet_count >= ?
      ORDER BY created_at DESC, tweet_id DESC
      LIMIT ?
    `);

    const rows = stmt.all(cutoff, minLikes, minRetweets, limit) as Record<string, unknown>[];
    return rows.map(this.mapRowToTweet);
  }

  public getTotalCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM tweets').get() as { count: number };
    return row ? row.count : 0;
  }

  private buildWhereClauses(options: TweetQueryOptions): {
    whereClauses: string[];
    params: (string | number)[];
  } {
    const minLikes = options.minLikes ?? 0;
    const minRetweets = options.minRetweets ?? 0;

    const whereClauses: string[] = ['like_count >= ?', 'retweet_count >= ?'];
    const params: (string | number)[] = [minLikes, minRetweets];

    // 1. 博主追踪维度：若显式指定了博主，彻底放开 source_type 限制，聚合该博主在全库的所有推文（关注流、搜索或列表）
    if (options.user && options.user.trim()) {
      whereClauses.push('LOWER(author_username) = LOWER(?)');
      params.push(options.user.replace(/^@/, '').trim());
    } else if (options.sourceType && options.sourceType !== 'all') {
      // 2. 按数据源筛选
      if (options.sourceType === 'following') {
        whereClauses.push(`source_type IN ('following', 'legacy')`);
      } else if (options.sourceType === 'user') {
        whereClauses.push(`(source_type = 'user' OR source_type = 'legacy')`);
      } else if (options.sourceType === 'list') {
        // 监控列表：若指定了具体 listId，精准匹配 list_id
        if (options.listId && options.listId.trim()) {
          whereClauses.push('(list_id = ? OR (source_type = \'list\' AND list_id IS NULL))');
          params.push(options.listId.trim());
        } else {
          whereClauses.push(`source_type = 'list'`);
        }
      } else if (options.sourceType === 'search') {
        // 全网搜索：
        // 若带有 query，彻底放开 source_type 限制，直接对本地全库执行全文搜索！
        // 若未提供 query，则退化展示已抓取的 search 或全量推文
        if (!options.query || !options.query.trim()) {
          whereClauses.push(`(source_type = 'search' OR source_type = 'legacy')`);
        }
      } else {
        whereClauses.push('source_type = ?');
        params.push(options.sourceType);
      }
    }

    // 3. 关键词全文模糊检索：命中正文、作者名或 Handle
    if (options.query && options.query.trim()) {
      const q = `%${options.query.trim().toLowerCase()}%`;
      whereClauses.push('(LOWER(text) LIKE ? OR LOWER(author_username) LIKE ? OR LOWER(author_name) LIKE ?)');
      params.push(q, q, q);
    }

    return { whereClauses, params };
  }

  public queryTweets(options: TweetQueryOptions = {}): Tweet[] {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const { whereClauses, params } = this.buildWhereClauses(options);

    const sql = `
      SELECT * FROM tweets
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY created_at DESC, tweet_id DESC
      LIMIT ? OFFSET ?
    `;

    const rows = this.db.prepare(sql).all(...params, limit, offset) as Record<string, unknown>[];
    return rows.map(this.mapRowToTweet.bind(this));
  }

  public countTweets(options: TweetQueryOptions = {}): number {
    const { whereClauses, params } = this.buildWhereClauses(options);

    const sql = `SELECT COUNT(*) as total FROM tweets WHERE ${whereClauses.join(' AND ')}`;
    const row = this.db.prepare(sql).get(...params) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  public getRecentTweets(options: {
    limit?: number;
    offset?: number;
    minLikes?: number;
    minRetweets?: number;
    sourceType?: 'following' | 'search' | 'trends' | 'user' | 'list' | 'all';
  } = {}): Tweet[] {
    return this.queryTweets(options);
  }

  public getTweetById(tweetId: string): Tweet | null {
    const row = this.db.prepare('SELECT * FROM tweets WHERE tweet_id = ?').get(tweetId) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapRowToTweet(row) : null;
  }

  public getTweetsByUser(
    username: string,
    options: { limit?: number; offset?: number; minLikes?: number; minRetweets?: number } = {}
  ): Tweet[] {
    return this.queryTweets({ ...options, user: username });
  }

  public searchLocalTweets(
    query: string,
    options: { limit?: number; offset?: number; minLikes?: number; minRetweets?: number } = {}
  ): Tweet[] {
    return this.queryTweets({ ...options, query });
  }

  public getCachedTrends(category: string): { trends: TrendTopic[]; updatedAt: string } | null {
    const row = this.db
      .prepare('SELECT trends_json, updated_at FROM trends_cache WHERE category = ?')
      .get(category.toLowerCase()) as { trends_json: string; updated_at: string } | undefined;
    if (!row) return null;
    try {
      const trends = JSON.parse(row.trends_json) as TrendTopic[];
      return { trends, updatedAt: row.updated_at };
    } catch {
      return null;
    }
  }

  public saveCachedTrends(category: string, trends: TrendTopic[]): void {
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO trends_cache (category, trends_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(category) DO UPDATE SET
        trends_json = excluded.trends_json,
        updated_at = excluded.updated_at
    `
      )
      .run(category.toLowerCase(), JSON.stringify(trends), nowIso);
  }

  public getThreadTweets(tweetId: string): Tweet[] {
    const primary = this.getTweetById(tweetId);
    if (!primary || !primary.fetched_at) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM tweets
      WHERE LOWER(author_username) = LOWER(?) AND fetched_at = ?
      ORDER BY tweet_id ASC
    `);

    const rows = stmt.all(primary.author_username, primary.fetched_at) as Record<string, unknown>[];
    return rows.map(this.mapRowToTweet);
  }

  public exportMarkdown(options: {
    outputFile?: string;
    limit?: number;
    minLikes?: number;
    minRetweets?: number;
  } = {}): string {
    const limit = options.limit ?? 200;
    const minLikes = options.minLikes ?? 0;
    const minRetweets = options.minRetweets ?? 0;

    const tweets = this.getRecentTweets({ limit, minLikes, minRetweets });
    const today = new Date().toISOString().slice(0, 10);
    const defaultFile = path.join(Config.PROJECT_ROOT, 'output', `tweets_${today}.md`);
    let filePath = options.outputFile || defaultFile;

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, `tweets_${today}.md`);
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filterDesc: string[] = [];
    if (minLikes > 0) filterDesc.push(`赞数 ≥ ${minLikes}`);
    if (minRetweets > 0) filterDesc.push(`转发 ≥ ${minRetweets}`);
    const filterStr = filterDesc.length ? `（筛选: ${filterDesc.join(', ')}）` : '';

    const lines: string[] = [
      `# 📚 X 推文存档 (${today})`,
      `\n> 本地数据库共计 **${this.getTotalCount()}** 条推文，本文件展示符合条件的最近 **${tweets.length}** 条推文${filterStr}。\n`,
      '---\n',
    ];

    tweets.forEach((t, idx) => {
      const urlTwitter = `https://x.com/${t.author_username}/status/${t.tweet_id}`;
      lines.push(`### ${idx + 1}. [${t.author_name} (@${t.author_username})](${urlTwitter})`);
      lines.push(
        `- **发布时间**: \`${t.created_at}\` | **互动**: ❤️ \`${t.like_count}\`  🔁 \`${t.retweet_count}\`  👁️ \`${t.view_count || 0}\` | **ID**: \`${t.tweet_id}\``
      );
      lines.push(`\n${t.text}\n`);

      if (t.is_retweet) {
        lines.push(`> 🔁 **转推自 @${t.retweeted_author}**:\n> ${t.retweeted_text}\n`);
      } else if (t.is_quote) {
        lines.push(`> 💬 **引用推文 @${t.quoted_author}**:\n> ${t.quoted_text}\n`);
      }

      if (t.urls && t.urls.length > 0) {
        lines.push(`- 🔗 包含链接: ${t.urls.map((u) => `[${u}](${u})`).join(', ')}`);
      }
      if (t.media_urls && t.media_urls.length > 0) {
        lines.push(
          `- 🖼️ 媒体附件: ${t.media_urls.map((m, i) => `[附件 ${i + 1}](${m})`).join(', ')}`
        );
      }
      lines.push('\n---\n');
    });

    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    return filePath;
  }

  public async exportSingleTweetMarkdown(
    tweetId: string,
    options: { outputPath?: string; downloadImages?: boolean } = {}
  ): Promise<{ filePath: string; downloadedImagesCount: number }> {
    const primaryTweet = this.getTweetById(tweetId);
    if (!primaryTweet) {
      throw new Error(`推文 ID \`${tweetId}\` 不存在于本地数据库中。`);
    }

    const thread = this.getThreadTweets(tweetId);
    const allTweets = thread.length ? thread : [primaryTweet];

    const authorUser = primaryTweet.author_username || 'unknown';
    const primaryId = String(primaryTweet.tweet_id);

    let bundleDir = path.join(this.baseOutputDir, authorUser, primaryId);
    let mdFile = path.join(bundleDir, 'index.md');

    if (options.outputPath) {
      const p = path.resolve(options.outputPath);
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        bundleDir = path.join(p, authorUser, primaryId);
        mdFile = path.join(bundleDir, 'index.md');
      } else {
        mdFile = p;
        bundleDir = path.dirname(mdFile);
      }
    }

    if (!fs.existsSync(bundleDir)) fs.mkdirSync(bundleDir, { recursive: true });

    const tweetImagesDir = path.join(bundleDir, 'images');
    const shouldDownload = options.downloadImages ?? true;

    if (shouldDownload && !fs.existsSync(tweetImagesDir)) {
      fs.mkdirSync(tweetImagesDir, { recursive: true });
    }

    let dlCount = 0;
    const lines: string[] = [
      `# 📝 推文归档: @${authorUser} (${primaryTweet.tweet_id})`,
      `\n> 来源博主: **${primaryTweet.author_name}** (@${authorUser}) | 原文链接: https://x.com/${authorUser}/status/${primaryId}\n`,
      '---\n',
    ];

    for (let idx = 0; idx < allTweets.length; idx++) {
      const t = allTweets[idx];
      lines.push(`### 篇章 ${idx + 1} (ID: \`${t.tweet_id}\`)`);
      lines.push(
        `- **发布时间**: \`${t.created_at}\` | **互动**: ❤️ \`${t.like_count}\`  🔁 \`${t.retweet_count}\`  👁️ \`${t.view_count || 0}\``
      );
      let tweetBody = t.text;
      const extraMediaLines: string[] = [];

      if (t.is_retweet) {
        lines.push(`> 🔁 **转推自 @${t.retweeted_author}**:\n> ${t.retweeted_text}\n`);
      } else if (t.is_quote) {
        lines.push(`> 💬 **引用推文 @${t.quoted_author}**:\n> ${t.quoted_text}\n`);
      }

      if (t.media_urls && t.media_urls.length > 0) {
        const mediaEntries = t.media_urls.map((mediaUrl, mIdx) => {
          let ext = '.jpg';
          let rawStem = `img_${mIdx + 1}`;
          try {
            const urlObj = new URL(mediaUrl);
            const cleanPath = urlObj.pathname;
            const origName = path.basename(cleanPath);
            const detectedExt = path.extname(origName).toLowerCase();
            if (detectedExt && ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(detectedExt)) {
              ext = detectedExt;
            } else {
              const format = urlObj.searchParams.get('format');
              ext = format ? `.${format.toLowerCase()}` : '.jpg';
            }
            const stem = path.basename(origName, path.extname(origName));
            if (stem) rawStem = stem;
          } catch {
            // fallback to default
          }
          const cleanStem = rawStem.replace(/[^\w\-_\.]/g, '_').slice(0, 30) || `img_${mIdx + 1}`;
          const isPrimary = idx === 0;
          const imgFilename = isPrimary
            ? `${mIdx + 1}_${cleanStem}${ext}`
            : `${t.tweet_id}_${mIdx + 1}_${cleanStem}${ext}`;
          const localDest = path.join(tweetImagesDir, imgFilename);
          const localRel = `images/${imgFilename}`;
          return { mediaUrl, mIdx, localDest, localRel };
        });

        // Concurrently download non-video images
        const downloadResults = await Promise.all(
          mediaEntries.map(async (entry) => {
            if (isVideoUrl(entry.mediaUrl) || !shouldDownload) return false;
            return await downloadImage(entry.mediaUrl, entry.localDest);
          })
        );

        for (let mIdx = 0; mIdx < mediaEntries.length; mIdx++) {
          const entry = mediaEntries[mIdx];
          const ok = downloadResults[mIdx];
          if (isVideoUrl(entry.mediaUrl)) {
            extraMediaLines.push(`- 🎥 [视频/音频流](${entry.mediaUrl})`);
          } else if (shouldDownload && ok) {
            dlCount++;
            if (tweetBody.includes(entry.mediaUrl)) {
              tweetBody = tweetBody.replaceAll(entry.mediaUrl, entry.localRel);
            } else {
              extraMediaLines.push(`![图片 ${mIdx + 1}](${entry.localRel})`);
            }
          } else {
            if (!tweetBody.includes(entry.mediaUrl)) {
              extraMediaLines.push(`![图片 ${mIdx + 1}](${entry.mediaUrl})`);
            }
          }
        }
      }

      lines.push(`\n${tweetBody}\n`);
      if (extraMediaLines.length > 0) {
        lines.push(`\n#### 媒体附件:`);
        lines.push(...extraMediaLines);
      }
      lines.push('\n---\n');
    }

    fs.writeFileSync(mdFile, lines.join('\n'), 'utf-8');
    return { filePath: mdFile, downloadedImagesCount: dlCount };
  }

  public async deleteTweets(filter: DeleteFilter): Promise<DeleteResult> {
    const { tweetId, tweetIds, username, since, until, olderThan, dryRun } = filter;

    if (!tweetId && (!tweetIds || tweetIds.length === 0) && !username && !since && !until && !olderThan) {
      throw new Error(
        '删除操作必须指定至少一个筛选条件（推文ID/URL、tweetIds、--user、--since、--until 或 --older-than）。'
      );
    }

    let sql = 'SELECT * FROM tweets WHERE 1=1';
    const params: unknown[] = [];

    if (tweetId) {
      const match = tweetId.match(/\d{5,}/)?.[0] || tweetId.trim();
      sql += ' AND tweet_id = ?';
      params.push(match);
    }

    if (tweetIds && tweetIds.length > 0) {
      const placeholders = tweetIds.map(() => '?').join(',');
      sql += ` AND tweet_id IN (${placeholders})`;
      params.push(...tweetIds);
    }

    if (username) {
      const cleanUser = username.replace(/^@/, '').trim();
      sql += ' AND LOWER(author_username) = LOWER(?)';
      params.push(cleanUser);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    let candidates = rows.map((r) => this.mapRowToTweet(r));

    const now = Date.now();

    if (olderThan) {
      const ms = parseDurationMs(olderThan);
      if (ms === null) {
        throw new Error(`无效的时间跨度格式 '${olderThan}'，请使用如 '30d'、'48h'、'7d'。`);
      }
      const cutoffTime = now - ms;
      candidates = candidates.filter((t) => {
        let time = NaN;
        if (t.created_at) time = new Date(t.created_at).getTime();
        if (isNaN(time) && t.fetched_at) time = new Date(t.fetched_at).getTime();
        return !isNaN(time) && time <= cutoffTime;
      });
    }

    if (since) {
      const sinceTime = new Date(`${since.slice(0, 10)}T00:00:00.000Z`).getTime();
      if (!isNaN(sinceTime)) {
        candidates = candidates.filter((t) => {
          let time = NaN;
          if (t.created_at) time = new Date(t.created_at).getTime();
          if (isNaN(time) && t.fetched_at) time = new Date(t.fetched_at).getTime();
          return !isNaN(time) && time >= sinceTime;
        });
      }
    }

    if (until) {
      const untilTime = new Date(`${until.slice(0, 10)}T23:59:59.999Z`).getTime();
      if (!isNaN(untilTime)) {
        candidates = candidates.filter((t) => {
          let time = NaN;
          if (t.created_at) time = new Date(t.created_at).getTime();
          if (isNaN(time) && t.fetched_at) time = new Date(t.fetched_at).getTime();
          return !isNaN(time) && time <= untilTime;
        });
      }
    }

    const matchedCount = candidates.length;
    const deletedDirs: string[] = [];
    const deletedFiles: string[] = [];
    const affectedAuthors = new Set<string>();

    for (const t of candidates) {
      const author = t.author_username || 'unknown';
      affectedAuthors.add(author);

      // Page bundle directory: output/{author}/{tweet_id}
      const bundleDir = path.join(this.baseOutputDir, author, t.tweet_id);
      if (fs.existsSync(bundleDir)) {
        deletedDirs.push(bundleDir);
      }

      // Legacy flat markdown: output/tweet_{tweet_id}_{author}.md
      const legacyMd = path.join(this.baseOutputDir, `tweet_${t.tweet_id}_${author}.md`);
      if (fs.existsSync(legacyMd)) {
        deletedFiles.push(legacyMd);
      }

      // Legacy images directory: output/images/{tweet_id}
      const legacyImgDir = path.join(this.baseOutputDir, 'images', t.tweet_id);
      if (fs.existsSync(legacyImgDir)) {
        deletedDirs.push(legacyImgDir);
      }
    }

    if (dryRun) {
      return {
        matchedCount,
        deletedCount: 0,
        deletedDirs,
        deletedFiles,
        dryRun: true,
      };
    }

    if (matchedCount === 0) {
      return {
        matchedCount: 0,
        deletedCount: 0,
        deletedDirs: [],
        deletedFiles: [],
        dryRun: false,
      };
    }

    // 1. Remove files and bundle directories
    for (const dirPath of deletedDirs) {
      try {
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } catch (err) {
        console.error(`Failed to delete directory ${dirPath}:`, err);
      }
    }

    for (const filePath of deletedFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err);
      }
    }

    // 2. Prune empty author directories & empty images directory
    for (const author of affectedAuthors) {
      const authorDir = path.join(this.baseOutputDir, author);
      if (fs.existsSync(authorDir)) {
        try {
          if (fs.readdirSync(authorDir).length === 0) {
            fs.rmdirSync(authorDir);
          }
        } catch {}
      }
    }
    const legacyImagesDir = path.join(this.baseOutputDir, 'images');
    if (fs.existsSync(legacyImagesDir)) {
      try {
        if (fs.readdirSync(legacyImagesDir).length === 0) {
          fs.rmdirSync(legacyImagesDir);
        }
      } catch {}
    }

    // 3. Delete records from SQLite in transaction
    const deleteTx = this.db.transaction((tweetIds: string[]) => {
      const stmt = this.db.prepare('DELETE FROM tweets WHERE tweet_id = ?');
      for (const id of tweetIds) {
        stmt.run(id);
      }
    });

    deleteTx(candidates.map((t) => t.tweet_id));

    return {
      matchedCount,
      deletedCount: matchedCount,
      deletedDirs,
      deletedFiles,
      dryRun: false,
    };
  }

  public close(): void {
    this.db.close();
  }

  private mapRowToTweet(row: Record<string, unknown>): Tweet {
    let urls: string[] = [];
    let mediaUrls: string[] = [];
    try {
      urls = JSON.parse((row.urls as string) || '[]');
    } catch {}
    try {
      mediaUrls = JSON.parse((row.media_urls as string) || '[]');
    } catch {}

    return {
      tweet_id: String(row.tweet_id),
      author_id: (row.author_id as string) || undefined,
      author_name: String(row.author_name || 'Unknown'),
      author_username: String(row.author_username || 'unknown'),
      text: String(row.text || ''),
      created_at: String(row.created_at || ''),
      is_retweet: Boolean(row.is_retweet),
      retweeted_author: (row.retweeted_author as string) || undefined,
      retweeted_text: (row.retweeted_text as string) || undefined,
      is_quote: Boolean(row.is_quote),
      quoted_author: (row.quoted_author as string) || undefined,
      quoted_text: (row.quoted_text as string) || undefined,
      like_count: Number(row.like_count || 0),
      retweet_count: Number(row.retweet_count || 0),
      reply_count: Number(row.reply_count || 0),
      view_count: Number(row.view_count || 0),
      urls,
      media_urls: mediaUrls,
      source_type: (row.source_type as any) || 'following',
      list_id: (row.list_id as string) || undefined,
      fetched_at: String(row.fetched_at || ''),
    };
  }
}
