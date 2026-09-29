import fs from 'node:fs';
import path from 'node:path';
import { Config } from '../config.js';
import { Storage } from '../storage/index.js';
import { XClient } from '../client/index.js';
import { Summarizer } from './summarizer.js';
import type { Tweet, TrendTopic, StreamChunk } from '../types.js';

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

    const tweets = await this.client.fetchFollowingTimeline({
      maxPages: effectivePages,
      limit,
      timeout: actualTimeout,
    });
    const fetchedCount = tweets.length;
    process.stderr.write(`✓ 成功拉取到 ${fetchedCount} 条推文\n`);

    if (fetchedCount > 0) {
      const nowStr = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
      const rawPath = path.join(Config.RAW_DIR, `raw_${nowStr}.json`);
      fs.writeFileSync(rawPath, JSON.stringify(tweets, null, 2), 'utf-8');

      const { inserted, skipped } = this.storage.saveTweets(tweets, 'following');
      process.stderr.write(
        `✓ 本地库更新完毕：新增入库 ${inserted} 条，跳过重复 ${skipped} 条 (库内总计 ${this.storage.getTotalCount()} 条)\n`
      );
      return [fetchedCount, inserted, skipped];
    } else {
      process.stderr.write('⚠️ 未拉取到推文，请检查网络或账号状态\n');
      return [0, 0, 0];
    }
  }

  async fetchUserAndStore(
    username: string,
    limit = 20,
    timeout?: number
  ): Promise<Tweet[]> {
    const cleanUser = username.replace(/^@/, '').trim();
    process.stderr.write(`⏳ 开始抓取博主 @${cleanUser} 的最新推文（目标 ${limit} 篇）...\n`);

    const tweets = await this.client.fetchUserTimeline(cleanUser, { limit, timeout });
    const fetchedCount = tweets.length;
    process.stderr.write(`✓ 成功拉取到 ${fetchedCount} 条 @${cleanUser} 的推文\n`);

    if (fetchedCount > 0) {
      const { inserted, skipped } = this.storage.saveTweets(tweets, 'user');
      process.stderr.write(
        `✓ 本地库更新完毕：新增入库 ${inserted} 条，跳过重复 ${skipped} 条 (库内总计 ${this.storage.getTotalCount()} 条)\n`
      );
    }
    return tweets;
  }

  async fetchListAndStore(
    listIdOrUrl: string,
    limit = 20,
    timeout?: number
  ): Promise<Tweet[]> {
    process.stderr.write(`⏳ 开始抓取 X 列表 (${listIdOrUrl}) 的最新推文（目标 ${limit} 篇）...\n`);

    const match = listIdOrUrl.match(/(\d{5,})/);
    const cleanListId = match ? match[1] : listIdOrUrl.trim();
    if (match) {
      Config.saveUserList({
        id: match[1],
        name: `X 列表 #${match[1].slice(-4)}`,
      });
    }

    const tweets = await this.client.fetchListTimeline(listIdOrUrl, { limit, timeout });
    const fetchedCount = tweets.length;
    process.stderr.write(`✓ 成功从列表拉取到 ${fetchedCount} 条推文\n`);

    if (fetchedCount > 0) {
      const { inserted, skipped } = this.storage.saveTweets(tweets, 'list', cleanListId);
      process.stderr.write(
        `✓ 本地库更新完毕：新增入库 ${inserted} 条，跳过重复 ${skipped} 条 (库内总计 ${this.storage.getTotalCount()} 条)\n`
      );
    }
    return tweets;
  }

  async fetchTweetAndStore(
    tweetIdOrUrl: string,
    timeout?: number
  ): Promise<Tweet[]> {
    process.stderr.write(`⏳ 开始抓取推文 (${tweetIdOrUrl})...\n`);

    const tweets = await this.client.fetchTweetThread(tweetIdOrUrl, { timeout });
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

  async fetchSearchAndStore(
    query: string,
    options?: {
      searchType?: 'live' | 'top';
      limit?: number;
      minLikes?: number;
      minRetweets?: number;
      timeout?: number;
    }
  ): Promise<Tweet[]> {
    const searchType = options?.searchType || 'live';
    const limit = options?.limit || 20;
    const minLikes = options?.minLikes || 0;
    const minRetweets = options?.minRetweets || 0;
    const timeout = options?.timeout;

    const typeStr = searchType === 'top' ? '热门' : '实时最新';
    process.stderr.write(`⏳ 开始在 X 搜索 ('${query}', ${typeStr})，目标 ${limit} 篇...\n`);

    const tweets = await this.client.fetchSearchTimeline(query, {
      searchType,
      limit,
      timeout,
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

    if (fetchedCount > 0) {
      const { inserted, skipped } = this.storage.saveTweets(tweets, 'search');
      process.stderr.write(
        `✓ 本地库更新完毕：新增入库 ${inserted} 条，跳过重复 ${skipped} 条 (库内总计 ${this.storage.getTotalCount()} 条)\n`
      );
    }

    return filtered;
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
        topicTweets = await this.fetchSearchAndStore(targetQuery, {
          searchType: 'top',
          limit: 10,
          minLikes,
          minRetweets,
          timeout: timeout || 25,
        });
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
