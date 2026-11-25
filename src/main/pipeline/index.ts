import fs from 'node:fs';
import path from 'node:path';
import { Config } from '../config.js';
import { Storage } from '../storage/index.js';
import { XClient, matchesContentTypes, isTweetContentIncomplete } from '../client/index.js';
import { Summarizer } from './summarizer.js';
import {
  ALL_TWEET_CONTENT_TYPES,
  type BatchExportRequest,
  type BatchExportSummary,
  type Tweet,
  type TweetContentType,
  type TrendTopic,
  type StreamChunk,
} from '../types.js';

export { Summarizer };

export interface PipelineProgressEvent {
  stage: 'init' | 'fetch_trends' | 'refine_query' | 'fetch_topic' | 'summarize' | 'done' | 'error';
  message: string;
  progress?: number;
  meta?: Record<string, unknown>;
}

export interface GenerateReportOptions {
  hours?: number;
  minLikes?: number;
  minRetweets?: number;
  provider?: string;
  authMode?: string;
  model?: string;
  dateStr?: string;
  summarizerInstance?: Summarizer;
  onChunk?: (chunk: StreamChunk) => void;
  onProgress?: (event: PipelineProgressEvent) => void;
}

export interface RunTrendsDigestOptions {
  category?: string;
  top?: number;
  hours?: number;
  minLikes?: number;
  minRetweets?: number;
  provider?: string;
  authMode?: string;
  model?: string;
  timeout?: number;
  summarizerInstance?: Summarizer;
  onChunk?: (chunk: StreamChunk) => void;
  onProgress?: (event: PipelineProgressEvent) => void;
}

/** 抓取入库类方法的统一返回：推文本体 + 真实落库统计（fetched=拉取数，inserted=新增，skipped=去重跳过） */
export interface FetchAndStoreResult {
  tweets: Tweet[];
  fetched: number;
  inserted: number;
  skipped: number;
}

export interface BatchExportItem {
  tweetId: string;
  filePath: string;
  downloadedVideos?: string[];
}

export interface BatchExportResult {
  exported: BatchExportItem[];
  failed: Array<{ tweetId: string; error: string }>;
}

export function isTweetWithinHours(tweet: Tweet, hours: number): boolean {
  if (!tweet.created_at) return true;
  try {
    const tweetTime = new Date(tweet.created_at).getTime();
    if (isNaN(tweetTime)) return true;
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return tweetTime >= cutoff;
  } catch {
    return true;
  }
}

export class Pipeline {
  readonly storage: Storage;
  readonly client: XClient;

  constructor(storage?: Storage, client?: XClient) {
    Config.ensureDirs();
    this.storage = storage || new Storage();
    this.client = client || new XClient();
  }

  async fetchAndStore(
    optionsOrPages?: { maxPages?: number; limit?: number; timeout?: number } | number,
    timeout?: number
  ): Promise<[number, number, number]> {
    let pages: number | undefined;
    let limit: number | undefined;
    let actualTimeout: number | undefined = timeout;

    if (typeof optionsOrPages === 'number') {
      pages = optionsOrPages;
    } else if (optionsOrPages && typeof optionsOrPages === 'object') {
      pages = optionsOrPages.maxPages;
      limit = optionsOrPages.limit;
      if (optionsOrPages.timeout !== undefined) {
        actualTimeout = optionsOrPages.timeout;
      }
    }

    const effectivePages = pages || (limit ? Math.max(1, Math.ceil(limit / 20)) : Config.FETCH_MAX_PAGES);
    const targetDesc = limit ? `目标 ${limit} 条 (至多 ${effectivePages} 页)` : `计划拉取 ${effectivePages} 页`;
    process.stderr.write(`⏳ 开始从 X (Following 时间线) 抓取推文，${targetDesc}...\n`);

    const contentTypes = Config.FETCH_CONTENT_TYPES;
    const tweets = await this.client.fetchFollowingTimeline({
      maxPages: effectivePages,
      limit,
      timeout: actualTimeout,
      contentTypes,
    });
    const fetchedCount = tweets.length;
    process.stderr.write(`✓ 成功拉取到 ${fetchedCount} 条推文\n`);

    if (fetchedCount > 0) {
      const nowStr = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
      const rawPath = path.join(Config.RAW_DIR, `raw_${nowStr}.json`);
      fs.writeFileSync(rawPath, JSON.stringify(tweets, null, 2), 'utf-8');

      const targetTweets = tweets.filter((t) => matchesContentTypes(t, contentTypes));
      const { inserted, skipped } = this.storage.saveTweets(targetTweets, 'following');
      process.stderr.write(
        `✓ 本地库更新完毕：新增入库 ${inserted} 条，跳过重复 ${skipped} 条 (库内总计 ${this.storage.getTotalCount()} 条)\n`
      );
      return [fetchedCount, inserted, skipped];
    } else {
      process.stderr.write('⚠️ 未拉取到推文，请检查网络或账号状态\n');
      return [0, 0, 0];
    }
  }

  async fetchRecommendedAndStore(
    optionsOrPages?: { maxPages?: number; limit?: number; timeout?: number } | number,
    timeout?: number
  ): Promise<[number, number, number]> {
    let pages: number | undefined;
    let limit: number | undefined;
    let actualTimeout: number | undefined = timeout;

    if (typeof optionsOrPages === 'number') {
      pages = optionsOrPages;
    } else if (optionsOrPages && typeof optionsOrPages === 'object') {
      pages = optionsOrPages.maxPages;
      limit = optionsOrPages.limit;
      if (optionsOrPages.timeout !== undefined) {
        actualTimeout = optionsOrPages.timeout;
      }
    }

    const effectivePages = pages || (limit ? Math.max(1, Math.ceil(limit / 20)) : Config.FETCH_MAX_PAGES);
    const targetDesc = limit ? `目标 ${limit} 条 (至多 ${effectivePages} 页)` : `计划拉取 ${effectivePages} 页`;
    process.stderr.write(`⏳ 开始从 X (For You 推荐流) 抓取推文，${targetDesc}...\n`);

    const contentTypes = Config.FETCH_CONTENT_TYPES;
    const tweets = await this.client.fetchRecommendedTimeline({
      maxPages: effectivePages,
      limit,
      timeout: actualTimeout,
      contentTypes,
    });
    const fetchedCount = tweets.length;
    process.stderr.write(`✓ 成功拉取到 ${fetchedCount} 条推荐流推文\n`);

    if (fetchedCount > 0) {
      const nowStr = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
      const rawPath = path.join(Config.RAW_DIR, `raw_recommended_${nowStr}.json`);
      fs.writeFileSync(rawPath, JSON.stringify(tweets, null, 2), 'utf-8');

      const targetTweets = tweets.filter((t) => matchesContentTypes(t, contentTypes));
      const { inserted, skipped } = this.storage.saveTweets(targetTweets, 'recommended');
      process.stderr.write(
        `✓ 本地库更新完毕：新增入库 ${inserted} 条，跳过重复 ${skipped} 条 (库内总计 ${this.storage.getTotalCount()} 条)\n`
      );
      return [fetchedCount, inserted, skipped];
    } else {
      process.stderr.write('⚠️ 未拉取到推荐流推文，请检查网络或账号状态\n');
      return [0, 0, 0];
    }
  }

  async fetchUserAndStore(
    username: string,
    limit = 20,
    timeout?: number
  ): Promise<FetchAndStoreResult> {
    const cleanUser = username.replace(/^@/, '').trim();
    process.stderr.write(`⏳ 开始抓取博主 @${cleanUser} 的最新推文（目标 ${limit} 篇）...\n`);

    const contentTypes = Config.FETCH_CONTENT_TYPES;
    const tweets = await this.client.fetchUserTimeline(cleanUser, {
      limit,
      timeout,
      contentTypes,
    });
    const fetchedCount = tweets.length;
    process.stderr.write(`✓ 成功拉取到 ${fetchedCount} 条 @${cleanUser} 的推文\n`);

    let inserted = 0;
    let skipped = 0;
    if (fetchedCount > 0) {
      const targetTweets = tweets.filter((t) => matchesContentTypes(t, contentTypes));
      ({ inserted, skipped } = this.storage.saveTweets(targetTweets, 'user'));
      process.stderr.write(
        `✓ 本地库更新完毕：新增入库 ${inserted} 条，跳过重复 ${skipped} 条 (库内总计 ${this.storage.getTotalCount()} 条)\n`
      );
    }
    return { tweets, fetched: fetchedCount, inserted, skipped };
  }

  async fetchListAndStore(
    listIdOrUrl: string,
    limit = 20,
    timeout?: number
  ): Promise<FetchAndStoreResult> {
    process.stderr.write(`⏳ 开始抓取 X 列表 (${listIdOrUrl}) 的最新推文（目标 ${limit} 篇）...\n`);

    const match = listIdOrUrl.match(/(\d{5,})/);
    const cleanListId = match ? match[1] : listIdOrUrl.trim();
    if (match) {
      Config.saveUserList({
        id: match[1],
        name: `X 列表 #${match[1].slice(-4)}`,
      });
    }

    const contentTypes = Config.FETCH_CONTENT_TYPES;
    const tweets = await this.client.fetchListTimeline(listIdOrUrl, {
      limit,
      timeout,
      contentTypes,
    });
    const fetchedCount = tweets.length;
    process.stderr.write(`✓ 成功从列表拉取到 ${fetchedCount} 条推文\n`);

    let inserted = 0;
    let skipped = 0;
    if (fetchedCount > 0) {
      const targetTweets = tweets.filter((t) => matchesContentTypes(t, contentTypes));
      ({ inserted, skipped } = this.storage.saveTweets(targetTweets, 'list', cleanListId));
      process.stderr.write(
        `✓ 本地库更新完毕：新增入库 ${inserted} 条，跳过重复 ${skipped} 条 (库内总计 ${this.storage.getTotalCount()} 条)\n`
      );
    }
    return { tweets, fetched: fetchedCount, inserted, skipped };
  }

  async fetchTweetAndStore(
    tweetIdOrUrl: string,
    options?: { timeout?: number; fetchAuthorReplies?: boolean } | number
  ): Promise<Tweet[]> {
    const opts = typeof options === 'number' ? { timeout: options } : options;
    const timeout = opts?.timeout;
    const fetchAuthorReplies = opts?.fetchAuthorReplies ?? Config.FETCH_AUTHOR_REPLIES;
    process.stderr.write(`⏳ 开始抓取推文 (${tweetIdOrUrl})...\n`);

    const tweets = await this.client.fetchTweetThread(tweetIdOrUrl, { timeout, fetchAuthorReplies });
    const fetchedCount = tweets.length;
    process.stderr.write(`✓ 成功从 X 拉取到 ${fetchedCount} 条相关推文\n`);

    if (fetchedCount > 0) {
      const { inserted, skipped } = this.storage.saveTweets(tweets, 'search');
      process.stderr.write(
        `✓ 本地库更新完毕：新增入库 ${inserted} 条，跳过重复 ${skipped} 条 (库内总计 ${this.storage.getTotalCount()} 条)\n`
      );
    }
    return tweets;
  }

  /**
   * 批量导出为独立 Markdown Page Bundle（与 GUI 勾选批量导出行为对齐）。
   * 本地缺失的推文先尝试在线抓取；单条失败仅记入 failed，不中断批次。
   */
  async exportTweetsByIds(
    tweetIds: string[],
    options?: {
      timeout?: number;
      fetchAuthorReplies?: boolean;
      downloadVideos?: boolean;
    }
  ): Promise<BatchExportResult> {
    const exported: BatchExportItem[] = [];
    const failed: Array<{ tweetId: string; error: string }> = [];

    for (const tweetId of tweetIds) {
      try {
        if (!this.storage.getTweetById(tweetId)) {
          await this.fetchTweetAndStore(tweetId, options);
        }
        const exportRes = await this.storage.exportSingleTweetMarkdown(tweetId, {
          downloadImages: true,
          downloadVideos: options?.downloadVideos,
          fetchAuthorReplies: options?.fetchAuthorReplies,
          onVideoProgress: options?.downloadVideos
            ? (p) => {
                if (p.percent === 100 || p.percent % 25 === 0) {
                  process.stderr.write(
                    `⬇️ [${tweetId}] 下载视频 (${p.index + 1}/${p.total}): ${p.percent}%\n`
                  );
                }
              }
            : undefined,
        });
        const item: BatchExportItem = { tweetId, filePath: exportRes.filePath };
        if (exportRes.downloadedVideos && exportRes.downloadedVideos.length > 0) {
          item.downloadedVideos = exportRes.downloadedVideos;
        }
        exported.push(item);
      } catch (err: any) {
        failed.push({ tweetId, error: err?.message || String(err) });
      }
    }
    return { exported, failed };
  }

  /**
   * 桌面工作台批量导出已选文章至用户指定目录（v0.1.5）：
   * 1. 对本地缺失或未展开全文（截断长推 / 仅标题预览的 X Article）的文章静默补齐全文；
   * 2. 视频是否下载严格遵循设置中的 `Config.AUTO_DOWNLOAD_VIDEOS` 开关；
   * 3. 支持两种目录形态：
   *    - `merged`：合并为单一自包含目录（1 份 `index.md` + 统一 `images/` 与按开关 `videos/`）；
   *    - `separate`：按篇扁平导出至 `{targetDir}/{author}_{tweetId}/index.md`。
   */
  async exportSelectedTweets(
    request: BatchExportRequest,
    callbacks?: {
      onProgress?: (info: { current: number; total: number; message: string; percent: number }) => void;
    }
  ): Promise<BatchExportSummary> {
    const uniqueIds = Array.from(new Set((request.tweetIds || []).map((id) => String(id).trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new Error('请至少选择一篇推文再导出。');
    }
    const targetDir = path.resolve(request.targetDir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const downloadVideos = Config.AUTO_DOWNLOAD_VIDEOS;
    const failed: Array<{ tweetId: string; error: string }> = [];
    const readyIds: string[] = [];

    // 阶段 1：静默补齐缺失或未展开全文的文章
    for (let i = 0; i < uniqueIds.length; i++) {
      const tweetId = uniqueIds[i];
      let tweet = this.storage.getTweetById(tweetId);
      const needsSync = !tweet || isTweetContentIncomplete(tweet);
      callbacks?.onProgress?.({
        current: i + 1,
        total: uniqueIds.length,
        message: needsSync
          ? `正在静默补齐全文 (${i + 1}/${uniqueIds.length}) · ${tweet?.author_username ? '@' + tweet.author_username : tweetId}`
          : `正在校验文章 (${i + 1}/${uniqueIds.length}) · @${tweet?.author_username || tweetId}`,
        percent: Math.round(((i + 0.5) / uniqueIds.length) * 50),
      });

      if (needsSync) {
        try {
          const fetchTarget = tweet?.author_username
            ? `https://x.com/${tweet.author_username}/status/${tweetId}`
            : tweetId;
          await this.fetchTweetAndStore(fetchTarget, {
            fetchAuthorReplies: Config.FETCH_AUTHOR_REPLIES,
          });
          tweet = this.storage.getTweetById(tweetId);
        } catch (err: any) {
          if (!tweet) {
            failed.push({ tweetId, error: err?.message || String(err) });
            continue;
          }
          // 本地已有旧版摘要时降级保留，避免整批导出中断
        }
      }

      if (tweet) {
        readyIds.push(tweetId);
      } else {
        failed.push({ tweetId, error: '未找到推文记录' });
      }
    }

    if (readyIds.length === 0) {
      return {
        mode: request.mode,
        outputPath: targetDir,
        exportedCount: 0,
        failed,
        downloadedImagesCount: 0,
        downloadedVideosCount: 0,
      };
    }

    // 阶段 2：按模式落盘至目标目录
    if (request.mode === 'merged') {
      callbacks?.onProgress?.({
        current: readyIds.length,
        total: readyIds.length,
        message: `正在合并生成单一归档目录（${readyIds.length} 篇）...`,
        percent: 75,
      });
      const res = await this.storage.exportMergedTweetsMarkdown(readyIds, targetDir, {
        downloadImages: true,
        downloadVideos,
        fetchAuthorReplies: Config.FETCH_AUTHOR_REPLIES,
      });
      callbacks?.onProgress?.({
        current: readyIds.length,
        total: readyIds.length,
        message: `导出完成（${res.exportedCount} 篇）`,
        percent: 100,
      });
      return {
        mode: 'merged',
        outputPath: res.bundleDir,
        exportedCount: res.exportedCount,
        failed,
        downloadedImagesCount: res.downloadedImagesCount,
        downloadedVideosCount: res.downloadedVideosCount,
      };
    }

    let exportedCount = 0;
    let totalImages = 0;
    let totalVideos = 0;
    for (let i = 0; i < readyIds.length; i++) {
      const tweetId = readyIds[i];
      const tweet = this.storage.getTweetById(tweetId);
      const author = (tweet?.author_username || 'tweet').replace(/[^\w-]/g, '_');
      callbacks?.onProgress?.({
        current: i + 1,
        total: readyIds.length,
        message: `正在导出独立目录 (${i + 1}/${readyIds.length}) · @${author}`,
        percent: 50 + Math.round(((i + 1) / readyIds.length) * 50),
      });
      try {
        const destMd = path.join(targetDir, `${author}_${tweetId}`, 'index.md');
        const res = await this.storage.exportSingleTweetMarkdown(tweetId, {
          outputPath: destMd,
          downloadImages: true,
          downloadVideos,
          fetchAuthorReplies: Config.FETCH_AUTHOR_REPLIES,
        });
        exportedCount++;
        totalImages += res.downloadedImagesCount;
        totalVideos += res.downloadedVideosCount;
      } catch (err: any) {
        failed.push({ tweetId, error: err?.message || String(err) });
      }
    }

    return {
      mode: 'separate',
      outputPath: targetDir,
      exportedCount,
      failed,
      downloadedImagesCount: totalImages,
      downloadedVideosCount: totalVideos,
    };
  }

  async fetchSearchAndStore(
    query: string,
    options?: {
      searchType?: 'live' | 'top';
      limit?: number;
      minLikes?: number;
      minRetweets?: number;
      timeout?: number;
      contentTypes?: TweetContentType[];
    }
  ): Promise<FetchAndStoreResult> {
    const searchType = options?.searchType || 'live';
    const limit = options?.limit || 20;
    const minLikes = options?.minLikes || 0;
    const minRetweets = options?.minRetweets || 0;
    const timeout = options?.timeout;
    const contentTypes = options?.contentTypes?.length ? options.contentTypes : Config.FETCH_CONTENT_TYPES;

    const typeStr = searchType === 'top' ? '热门' : '实时最新';
    process.stderr.write(`⏳ 开始在 X 搜索 ('${query}', ${typeStr})，目标 ${limit} 篇...\n`);

    const tweets = await this.client.fetchSearchTimeline(query, {
      searchType,
      limit,
      timeout,
      contentTypes,
    });
    const fetchedCount = tweets.length;
    process.stderr.write(`✓ 成功从搜索拉取到 ${fetchedCount} 条推文\n`);

    const filtered = tweets.filter(
      (t) => (t.like_count || 0) >= minLikes && (t.retweet_count || 0) >= minRetweets
    );

    if ((minLikes > 0 || minRetweets > 0) && filtered.length < fetchedCount) {
      process.stderr.write(
        `ℹ️ 互动门槛过滤：保留 ${filtered.length} 条符合条件的推文 (点赞 ≥ ${minLikes}, 转发 ≥ ${minRetweets})\n`
      );
    }

    let inserted = 0;
    let skipped = 0;
    if (fetchedCount > 0) {
      const targetTweets = tweets.filter((t) => matchesContentTypes(t, contentTypes));
      ({ inserted, skipped } = this.storage.saveTweets(targetTweets, 'search'));
      process.stderr.write(
        `✓ 本地库更新完毕：新增入库 ${inserted} 条，跳过重复 ${skipped} 条 (库内总计 ${this.storage.getTotalCount()} 条)\n`
      );
    }

    return { tweets: filtered, fetched: fetchedCount, inserted, skipped };
  }

  async generateReport(options?: GenerateReportOptions): Promise<string | null> {
    const hours = options?.hours || 24;
    const minLikes = options?.minLikes || 0;
    const minRetweets = options?.minRetweets || 0;
    const filterMsg = minLikes > 0 ? `（最低赞数 ≥ ${minLikes}）` : '';

    options?.onProgress?.({
      stage: 'init',
      message: `正在从本地数据库检索近 ${hours} 小时的推文...`,
    });

    process.stderr.write(`🔍 正在从本地数据库检索近 ${hours} 小时的推文${filterMsg}...\n`);
    const tweets = this.storage.getUnsummarizedTweets({
      hours,
      minLikes,
      minRetweets,
    });

    if (tweets.length === 0) {
      process.stderr.write(
        '⚠️ 本地数据库在指定时间窗口内没有符合条件的推文数据，无法生成早报。\n'
      );
      options?.onProgress?.({
        stage: 'error',
        message: '本地数据库在指定时间窗口内没有符合条件的推文数据',
      });
      return null;
    }

    const summarizer =
      options?.summarizerInstance ||
      new Summarizer({
        provider: options?.provider,
        authMode: options?.authMode,
        model: options?.model,
      });

    options?.onProgress?.({
      stage: 'summarize',
      message: `找到 ${tweets.length} 条相关推文，正在调用 ${summarizer.llm.providerName} 进行主题聚类与提炼...`,
      progress: 30,
    });

    process.stderr.write(
      `ℹ️ 找到 ${tweets.length} 条相关推文，正在调用 ${summarizer.llm.providerName} [${summarizer.llm.modelName}] 进行主题聚类与提炼...\n`
    );

    const today = options?.dateStr || new Date().toISOString().slice(0, 10);
    const reportContent = await summarizer.summarize(tweets, today, {
      onChunk: options?.onChunk,
    });

    const reportFile = path.join(Config.REPORTS_DIR, `${today}.md`);
    fs.writeFileSync(reportFile, reportContent, 'utf-8');

    options?.onProgress?.({
      stage: 'done',
      message: `早报已生成：${reportFile}`,
      progress: 100,
      meta: { reportFile },
    });

    process.stderr.write(`🎉 早报已生成：${reportFile}\n`);
    return reportFile;
  }

  async showTrends(options?: {
    category?: string;
    top?: number;
    timeout?: number;
  }): Promise<TrendTopic[]> {
    const cat = options?.category || 'tech';
    const top = options?.top || 10;
    process.stderr.write(`🔥 正在拉取 X 全网实时趋势（分类: ${cat}, Top ${top}）...\n`);

    const trends = await this.client.fetchExploreTrends({ category: cat, top, timeout: options?.timeout });
    if (trends.length === 0) {
      process.stderr.write('⚠️ 未获取到趋势数据，请检查网络或稍后重试。\n');
      return [];
    }

    return trends;
  }

  async runTrendsDigest(options?: RunTrendsDigestOptions): Promise<string | null> {
    const category = options?.category || 'tech';
    const top = options?.top || 3;
    const hours = options?.hours || 48;
    const minLikes = options?.minLikes || 0;
    const minRetweets = options?.minRetweets || 0;
    const timeout = options?.timeout;

    options?.onProgress?.({
      stage: 'init',
      message: `启动全自动趋势研报流水线（分类: ${category}, Top ${top} 热点，近 ${hours} 小时）...`,
    });

    process.stderr.write(
      `🚀 启动全自动趋势研报流水线（分类: ${category}, Top ${top} 热点，时效窗口: 近 ${hours} 小时）...\n`
    );

    options?.onProgress?.({
      stage: 'fetch_trends',
      message: `正在拉取【${category}】分类实时趋势榜单...`,
      progress: 10,
    });

    const trends = await this.client.fetchExploreTrends({
      category,
      top,
      timeout,
    });
    if (trends.length === 0) {
      process.stderr.write('⚠️ 未能获取到趋势话题，终止研报生成。\n');
      options?.onProgress?.({
        stage: 'error',
        message: '未能获取到趋势话题，终止研报生成。',
      });
      return null;
    }

    const summarizer =
      options?.summarizerInstance ||
      new Summarizer({
        provider: options?.provider,
        authMode: options?.authMode,
        model: options?.model,
      });

    // AI-assisted search query refinement
    const topicNames = trends.map((t) => t.name).filter(Boolean);
    options?.onProgress?.({
      stage: 'refine_query',
      message: `正在通过 ${summarizer.llm.providerName} 提炼高命中推特搜索词...`,
      progress: 20,
    });
    process.stderr.write(`\n🧠 正在通过 ${summarizer.llm.providerName} 提炼高命中推特搜索关键词...\n`);
    const refinedQueries = await summarizer.refineSearchQueries(topicNames);

    // Freshness date constraint
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const sinceDate = cutoffDate.toISOString().slice(0, 10);

    const enrichedTrends: Array<{
      topic: string;
      domain?: string;
      volume?: string;
      tweets: Tweet[];
    }> = [];

    for (let idx = 0; idx < trends.length; idx++) {
      const item = trends[idx];
      const topicName = item.name;
      const baseQuery = refinedQueries[topicName] || item.query || topicName;
      const targetQuery = baseQuery.includes('since:') ? baseQuery : `${baseQuery} since:${sinceDate}`;

      const fetchProgress = 20 + Math.round(((idx + 1) / trends.length) * 45);
      options?.onProgress?.({
        stage: 'fetch_topic',
        message: `正在挖掘趋势【${topicName}】推文 (${idx + 1}/${trends.length})...`,
        progress: fetchProgress,
      });

      process.stderr.write(
        `\n🔍 (${idx + 1}/${trends.length}) 正在全网挖掘趋势【${topicName}】的高赞实时讨论 (搜索词: '${targetQuery}')...\n`
      );

      let topicTweets: Tweet[] = [];
      try {
        topicTweets = (
          await this.fetchSearchAndStore(targetQuery, {
            searchType: 'top',
            limit: 10,
            minLikes,
            minRetweets,
            timeout: timeout || 25,
            // 趋势研报热点实时讨论绝大多数为短推/长推，不受默认「仅拉取文章」配置限制
            contentTypes: [...ALL_TWEET_CONTENT_TYPES],
          })
        ).tweets;
      } catch (err: any) {
        process.stderr.write(`⚠️ 话题【${topicName}】推文抓取受限: ${err?.message || err}，将使用基础趋势信息...\n`);
      }

      // Secondary in-memory UTC timestamp verification
      const freshTweets = topicTweets.filter((t) => isTweetWithinHours(t, hours));
      if (freshTweets.length < topicTweets.length) {
        const filteredOut = topicTweets.length - freshTweets.length;
        process.stderr.write(`  ↳ 🕒 时效性过滤：已剔除 ${filteredOut} 篇超出近 ${hours} 小时的历史陈旧推文\n`);
      }

      enrichedTrends.push({
        topic: topicName,
        domain: item.domain,
        volume: String(item.tweet_count || '高讨论量'),
        tweets: freshTweets.length > 0 ? freshTweets : topicTweets,
      });

      // Safe pause between searches to prevent X rate limits
      if (idx < trends.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    options?.onProgress?.({
      stage: 'summarize',
      message: `正在调用 ${summarizer.llm.providerName} [${summarizer.llm.modelName}] 深度聚合提炼研报...`,
      progress: 70,
    });
    process.stderr.write(
      `\n🧠 正在调用 ${summarizer.llm.providerName} [${summarizer.llm.modelName}] 深度聚合提炼趋势研报...\n`
    );

    const reportContent = await summarizer.summarizeTrends(
      enrichedTrends,
      category,
      today,
      { onChunk: options?.onChunk }
    );

    const reportFile = path.join(Config.REPORTS_DIR, `trends_${today}.md`);
    fs.writeFileSync(reportFile, reportContent, 'utf-8');

    options?.onProgress?.({
      stage: 'done',
      message: `全网趋势研报已生成：${reportFile}`,
      progress: 100,
      meta: { reportFile },
    });

    process.stderr.write(`🎉 全网趋势研报已生成：${reportFile}\n`);
    return reportFile;
  }

  async runDaily(options?: {
    maxPages?: number;
    hours?: number;
    minLikes?: number;
    minRetweets?: number;
    provider?: string;
    authMode?: string;
    model?: string;
    timeout?: number;
    summarizerInstance?: Summarizer;
  }): Promise<string | null> {
    await this.fetchAndStore(options?.maxPages, options?.timeout);
    return this.generateReport({
      hours: options?.hours,
      minLikes: options?.minLikes,
      minRetweets: options?.minRetweets,
      provider: options?.provider,
      authMode: options?.authMode,
      model: options?.model,
      summarizerInstance: options?.summarizerInstance,
    });
  }
}
