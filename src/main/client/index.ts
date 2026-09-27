import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Response } from 'playwright-core';
import { Config } from '../config.js';
import type { Tweet, TrendTopic } from '../types.js';
import {
  parseTweetResult,
  parseTimelineInstructions,
  extractTimelineInstructions,
  parseTrendsFromGraphQL,
} from './parser.js';

export {
  parseTweetResult,
  parseTimelineInstructions,
  extractTimelineInstructions,
  parseTrendsFromGraphQL,
};

export interface FetchTimelineOptions {
  maxPages?: number;
  pageDelay?: number;
  timeout?: number;
}

export interface FetchUserOptions {
  limit?: number;
  pageDelay?: number;
  timeout?: number;
}

export interface FetchSearchOptions {
  searchType?: 'live' | 'top';
  limit?: number;
  pageDelay?: number;
  timeout?: number;
}

export class XClient {
  private readonly timeoutSeconds: number;
  private readonly timeoutMs: number;

  constructor(timeout?: number) {
    this.timeoutSeconds = timeout || Config.FETCH_TIMEOUT;
    this.timeoutMs = this.timeoutSeconds * 1000;
  }

  private async launchBrowser(headless = true): Promise<Browser> {
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
    ];

    const proxy = Config.HTTP_PROXY ? { server: Config.HTTP_PROXY } : undefined;

    try {
      // Prefer system Google Chrome for authentic fingerprint
      return await chromium.launch({
        channel: 'chrome',
        headless,
        proxy,
        args,
      });
    } catch {
      // Fallback to default Chromium bundled/cached by playwright
      return await chromium.launch({
        headless,
        proxy,
        args,
      });
    }
  }

  private async setupContext(browser: Browser, timeoutMs?: number): Promise<BrowserContext> {
    const effectiveTimeoutMs = timeoutMs || this.timeoutMs;
    const contextOptions: any = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    };

    if (fs.existsSync(Config.AUTH_STATE_PATH)) {
      contextOptions.storageState = Config.AUTH_STATE_PATH;
    }

    const context = await browser.newContext(contextOptions);

    // If no storageState file but auth_token exists in env, inject cookies
    if (!fs.existsSync(Config.AUTH_STATE_PATH) && Config.X_AUTH_TOKEN) {
      const cookies = [
        { name: 'auth_token', value: Config.X_AUTH_TOKEN, domain: '.x.com', path: '/' },
      ];
      if (Config.X_CT0) {
        cookies.push({ name: 'ct0', value: Config.X_CT0, domain: '.x.com', path: '/' });
      }
      await context.addCookies(cookies);
    }

    // Remove navigator.webdriver automation flag
    await context.addInitScript(
      'Object.defineProperty(navigator, "webdriver", { get: () => undefined });'
    );
    context.setDefaultNavigationTimeout(effectiveTimeoutMs);
    context.setDefaultTimeout(effectiveTimeoutMs);

    return context;
  }

  async loginInteractive(timeoutSeconds?: number): Promise<void> {
    const timeout = timeoutSeconds || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;
    Config.ensureDirs();

    process.stderr.write(
      `🚀 正在启动真实 Chrome 浏览器（超时阈值: ${timeout} 秒），请在窗口中登录 X...\n`
    );

    const browser = await this.launchBrowser(false);
    const context = await this.setupContext(browser, timeoutMs);
    const page = await context.newPage();

    try {
      await page.goto('https://x.com/login', { waitUntil: 'commit', timeout: timeoutMs });
    } catch (err: any) {
      process.stderr.write(`⚠️ 页面加载中: ${err?.message || err}，请直接在窗口中操作...\n`);
    }

    process.stderr.write(
      '⏳ 请在浏览器窗口中完成登录。检测到成功跳转至首页后将自动保存凭证并退出...\n'
    );

    for (let i = 0; i < Math.max(300, timeout); i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const url = page.url();
        if (url.includes('x.com/home')) {
          await new Promise((r) => setTimeout(r, 2000));
          await context.storageState({ path: Config.AUTH_STATE_PATH });
          process.stderr.write(
            `🎉 登录成功！会话凭证已持久化至: ${Config.AUTH_STATE_PATH}\n`
          );
          await browser.close();
          return;
        }
      } catch {
        // ignore navigation checks during page shifts
      }
    }

    await browser.close();
    throw new Error('登录超时（未检测到成功进入 X 首页）。');
  }

  async verifyAuth(timeoutSeconds?: number): Promise<{ id: string; name: string; screen_name: string }> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在 .env 中填写 X_AUTH_TOKEN，或运行 pnpm dev:cli -- --login 登录。'
      );
    }

    const timeout = timeoutSeconds || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;

    const browser = await this.launchBrowser(true);
    try {
      const context = await this.setupContext(browser, timeoutMs);
      const page = await context.newPage();

      await page.goto('https://x.com/home', { waitUntil: 'commit', timeout: timeoutMs });
      await new Promise((r) => setTimeout(r, 3000));

      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('i/flow')) {
        throw new Error('会话失效（被重定向至登录页）。请重新执行登录。');
      }

      const cookies = await context.cookies();
      const hasAuthToken = cookies.some((c) => c.name === 'auth_token');
      if (!hasAuthToken) {
        throw new Error('未检测到有效 auth_token Cookie。');
      }

      const title = await page.title();
      return {
        id: 'Authenticated',
        name: title.replace('/ X', '').trim() || 'X User',
        screen_name: 'logged_in',
      };
    } finally {
      await browser.close();
    }
  }

  async fetchFollowingTimeline(options?: FetchTimelineOptions): Promise<Tweet[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在 .env 中填写 X_AUTH_TOKEN，或运行 pnpm dev:cli -- --login 登录。'
      );
    }

    const maxPages = options?.maxPages || Config.FETCH_MAX_PAGES;
    const pageDelay = options?.pageDelay || 2.5;
    const timeout = options?.timeout || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;

    const capturedInstructions: any[][] = [];

    const browser = await this.launchBrowser(true);
    try {
      const context = await this.setupContext(browser, timeoutMs);
      const page = await context.newPage();

      page.on('response', async (res: Response) => {
        const url = res.url();
        if (
          url.includes('/graphql/') &&
          (url.includes('HomeLatestTimeline') || url.includes('HomeTimeline')) &&
          res.status() === 200
        ) {
          try {
            const data = await res.json();
            const inst = data?.data?.home?.home_timeline_urt?.instructions;
            if (Array.isArray(inst) && inst.length > 0) {
              capturedInstructions.push(inst);
            }
          } catch {
            // ignore JSON parse failure
          }
        }
      });

      process.stderr.write(`🌐 正在打开 x.com/home 并挂载网络监听器...\n`);
      await page.goto('https://x.com/home', { waitUntil: 'commit', timeout: timeoutMs });

      // Wait for navigation tabs
      try {
        await page.waitForSelector('div[role="tablist"], [role="tab"]', { timeout: 15000 });
      } catch {
        // ignore
      }

      if (page.url().includes('login') || page.url().includes('i/flow')) {
        throw new Error('X 认证失败：页面被重定向至登录页。请检查 auth_token 是否过期。');
      }

      // Click "Following" tab
      try {
        const tabs = page.locator('[role="tab"]');
        const count = await tabs.count();
        for (let i = 0; i < count; i++) {
          const tab = tabs.nth(i);
          const text = (await tab.textContent()) || '';
          if (/Following|正在关注|关注/i.test(text)) {
            process.stderr.write('📌 切换至「正在关注 (Following)」时间线...\n');
            await tab.click();
            await new Promise((r) => setTimeout(r, 4000));
            break;
          }
        }
      } catch {
        // ignore tab click error
      }

      // Paginate by scrolling
      for (let pIdx = 1; pIdx < maxPages; pIdx++) {
        process.stderr.write(`📜 正在向下滚动加载第 ${pIdx + 1} 页推文...\n`);
        await page.evaluate(() => window.scrollBy(0, 2500));
        await new Promise((r) => setTimeout(r, pageDelay * 1000));
      }

      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      await browser.close();
    }

    const seenIds = new Set<string>();
    const allTweets: Tweet[] = [];
    for (const instList of capturedInstructions) {
      const batch = parseTimelineInstructions(instList);
      for (const t of batch) {
        if (!seenIds.has(t.tweet_id)) {
          seenIds.add(t.tweet_id);
          allTweets.push(t);
        }
      }
    }

    return allTweets;
  }

  async fetchUserTimeline(username: string, options?: FetchUserOptions): Promise<Tweet[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在 .env 中填写 X_AUTH_TOKEN，或运行 pnpm dev:cli -- --login 登录。'
      );
    }

    const cleanUser = username.replace(/^@/, '').trim();
    const limit = options?.limit || 20;
    const pageDelay = options?.pageDelay || 2.0;
    const timeout = options?.timeout || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;

    const capturedInstructions: any[][] = [];
    const browser = await this.launchBrowser(true);

    try {
      const context = await this.setupContext(browser, timeoutMs);
      const page = await context.newPage();

      page.on('response', async (res: Response) => {
        const url = res.url();
        if (
          url.includes('/graphql/') &&
          (url.includes('UserOriginalsTimeline') || url.includes('UserTweets')) &&
          res.status() === 200
        ) {
          try {
            const data = await res.json();
            const inst = extractTimelineInstructions(data);
            if (inst.length > 0) {
              capturedInstructions.push(inst);
            }
          } catch {
            // ignore
          }
        }
      });

      const userUrl = `https://x.com/${cleanUser}`;
      process.stderr.write(`🌐 正在打开博主主页 ${userUrl} 并监听推文流...\n`);
      await page.goto(userUrl, { waitUntil: 'commit', timeout: timeoutMs });

      // Wait for initial batch
      for (let i = 0; i < Math.max(30, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (capturedInstructions.length > 0) break;
      }

      // Paginate if more than 20
      const pagesNeeded = Math.max(1, Math.ceil(limit / 20));
      for (let pIdx = 1; pIdx < pagesNeeded; pIdx++) {
        process.stderr.write(`📜 正在向下滚动加载第 ${pIdx + 1} 页...\n`);
        await page.evaluate(() => window.scrollBy(0, 2500));
        await new Promise((r) => setTimeout(r, pageDelay * 1000));
      }

      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      await browser.close();
    }

    const seenIds = new Set<string>();
    const allTweets: Tweet[] = [];
    for (const instList of capturedInstructions) {
      const batch = parseTimelineInstructions(instList);
      for (const t of batch) {
        if (!seenIds.has(t.tweet_id)) {
          seenIds.add(t.tweet_id);
          allTweets.push(t);
        }
      }
    }

    return allTweets.slice(0, limit);
  }

  async fetchListTimeline(listIdOrUrl: string, options?: FetchUserOptions): Promise<Tweet[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在 .env 中填写 X_AUTH_TOKEN，或运行 pnpm dev:cli -- --login 登录。'
      );
    }

    const match = listIdOrUrl.match(/(\d{5,})/);
    if (!match) {
      throw new Error(`无效的列表 ID 或 URL：'${listIdOrUrl}'。`);
    }

    const listId = match[1];
    const targetUrl = `https://x.com/i/lists/${listId}`;
    const limit = options?.limit || 20;
    const pageDelay = options?.pageDelay || 2.0;
    const timeout = options?.timeout || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;

    const capturedInstructions: any[][] = [];
    const browser = await this.launchBrowser(true);

    try {
      const context = await this.setupContext(browser, timeoutMs);
      const page = await context.newPage();

      page.on('response', async (res: Response) => {
        const url = res.url();
        if (
          url.includes('/graphql/') &&
          (url.includes('ListLatestTweetsTimeline') ||
            url.includes('ListTweetsTimeline') ||
            url.includes('List')) &&
          res.status() === 200
        ) {
          try {
            const data = await res.json();
            const inst = extractTimelineInstructions(data);
            if (inst.length > 0) {
              capturedInstructions.push(inst);
            }
          } catch {
            // ignore
          }
        }
      });

      process.stderr.write(`🌐 正在打开 X 列表主页 ${targetUrl} 并监听推文流...\n`);
      await page.goto(targetUrl, { waitUntil: 'commit', timeout: timeoutMs });

      for (let i = 0; i < Math.max(30, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (capturedInstructions.length > 0) break;
      }

      const pagesNeeded = Math.max(1, Math.ceil(limit / 20));
      for (let pIdx = 1; pIdx < pagesNeeded; pIdx++) {
        process.stderr.write(`📜 正在向下滚动加载第 ${pIdx + 1} 页...\n`);
        await page.evaluate(() => window.scrollBy(0, 2500));
        await new Promise((r) => setTimeout(r, pageDelay * 1000));
      }

      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      await browser.close();
    }

    const seenIds = new Set<string>();
    const allTweets: Tweet[] = [];
    for (const instList of capturedInstructions) {
      const batch = parseTimelineInstructions(instList);
      for (const t of batch) {
        if (!seenIds.has(t.tweet_id)) {
          seenIds.add(t.tweet_id);
          allTweets.push(t);
        }
      }
    }

    return allTweets.slice(0, limit);
  }

  async fetchSearchTimeline(query: string, options?: FetchSearchOptions): Promise<Tweet[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在 .env 中填写 X_AUTH_TOKEN，或运行 pnpm dev:cli -- --login 登录。'
      );
    }

    const cleanQ = query.trim();
    const encodedQ = encodeURIComponent(cleanQ);
    const searchType = options?.searchType || 'live';
    const targetUrl =
      searchType === 'top'
        ? `https://x.com/search?q=${encodedQ}`
        : `https://x.com/search?q=${encodedQ}&f=live`;

    const limit = options?.limit || 20;
    const pageDelay = options?.pageDelay || 2.0;
    const timeout = options?.timeout || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;

    const capturedInstructions: any[][] = [];
    const browser = await this.launchBrowser(true);

    try {
      const context = await this.setupContext(browser, timeoutMs);
      const page = await context.newPage();

      page.on('response', async (res: Response) => {
        const url = res.url();
        if (
          url.includes('/graphql/') &&
          (url.includes('SearchTimeline') || url.includes('Search')) &&
          res.status() === 200
        ) {
          try {
            const data = await res.json();
            const inst = extractTimelineInstructions(data);
            if (inst.length > 0) {
              capturedInstructions.push(inst);
            }
          } catch {
            // ignore
          }
        }
      });

      const typeLabel = searchType === 'top' ? '热门' : '实时最新';
      process.stderr.write(`🌐 正在打开 X 搜索 (${typeLabel}: '${cleanQ}') 并监听推文流...\n`);
      await page.goto(targetUrl, { waitUntil: 'commit', timeout: timeoutMs });

      for (let i = 0; i < Math.max(30, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (capturedInstructions.length > 0) break;
      }

      const pagesNeeded = Math.max(1, Math.ceil(limit / 20));
      for (let pIdx = 1; pIdx < pagesNeeded; pIdx++) {
        process.stderr.write(`📜 正在向下滚动加载第 ${pIdx + 1} 页...\n`);
        await page.evaluate(() => window.scrollBy(0, 2500));
        await new Promise((r) => setTimeout(r, pageDelay * 1000));
      }

      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      await browser.close();
    }

    const seenIds = new Set<string>();
    const allTweets: Tweet[] = [];
    for (const instList of capturedInstructions) {
      const batch = parseTimelineInstructions(instList);
      for (const t of batch) {
        if (!seenIds.has(t.tweet_id)) {
          seenIds.add(t.tweet_id);
          allTweets.push(t);
        }
      }
    }

    return allTweets.slice(0, limit);
  }

  async fetchTweetThread(tweetIdOrUrl: string, options?: { timeout?: number }): Promise<Tweet[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在 .env 中填写 X_AUTH_TOKEN，或运行 pnpm dev:cli -- --login 登录。'
      );
    }

    const match = tweetIdOrUrl.match(/(\d{5,})/);
    if (!match) {
      throw new Error(`无效的推文 ID 或 URL：'${tweetIdOrUrl}'。`);
    }

    const cleanId = match[1];
    const targetUrl = `https://x.com/i/status/${cleanId}`;
    const timeout = options?.timeout || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;

    const capturedTweets: Tweet[] = [];
    const browser = await this.launchBrowser(true);

    try {
      const context = await this.setupContext(browser, timeoutMs);
      const page = await context.newPage();

      page.on('response', async (res: Response) => {
        const url = res.url();
        if (
          url.includes('/graphql/') &&
          (url.includes('TweetDetail') || url.includes('TweetResult')) &&
          res.status() === 200
        ) {
          try {
            const data = await res.json();
            if (data?.data?.tweetResult?.result) {
              const t = parseTweetResult(data.data.tweetResult.result);
              if (t && t.tweet_id) capturedTweets.push(t);
            }
            const inst = extractTimelineInstructions(data);
            if (inst.length > 0) {
              const instTweets = parseTimelineInstructions(inst);
              capturedTweets.push(...instTweets);
            }
          } catch {
            // ignore
          }
        }
      });

      process.stderr.write(`🌐 正在打开推文页面 ${targetUrl} 并获取内容...\n`);
      await page.goto(targetUrl, { waitUntil: 'commit', timeout: timeoutMs });

      for (let i = 0; i < Math.max(30, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (capturedTweets.length > 0) {
          await new Promise((r) => setTimeout(r, 2000));
          break;
        }
      }
    } finally {
      await browser.close();
    }

    const seenIds = new Set<string>();
    const uniqueTweets: Tweet[] = [];
    for (const t of capturedTweets) {
      if (!seenIds.has(t.tweet_id)) {
        seenIds.add(t.tweet_id);
        uniqueTweets.push(t);
      }
    }

    return uniqueTweets;
  }

  async fetchExploreTrends(options?: {
    category?: string;
    top?: number;
    timeout?: number;
  }): Promise<TrendTopic[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在 .env 中填写 X_AUTH_TOKEN，或运行 pnpm dev:cli -- --login 登录。'
      );
    }

    const cat = (options?.category || 'tech').toLowerCase().trim();
    const top = options?.top || 10;
    const timeout = options?.timeout || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;

    const catUrls: Record<string, string> = {
      sports: 'https://x.com/explore/tabs/sports_unified',
      entertainment: 'https://x.com/explore/tabs/entertainment_unified',
      news: 'https://x.com/explore/tabs/news_unified',
      all: 'https://x.com/explore',
      business: 'https://x.com/explore',
      tech: 'https://x.com/explore',
    };
    const targetUrl = catUrls[cat] || 'https://x.com/explore';

    const interceptedPayloads: any[] = [];
    const browser = await this.launchBrowser(true);

    try {
      const context = await this.setupContext(browser, timeoutMs);
      const page = await context.newPage();

      page.on('response', async (res: Response) => {
        const url = res.url();
        if (
          url.includes('/graphql/') &&
          (url.includes('ExplorePage') ||
            url.includes('GenericTimelineById') ||
            url.includes('Explore') ||
            url.includes('Trends')) &&
          res.status() === 200
        ) {
          try {
            const data = await res.json();
            interceptedPayloads.push(data);
          } catch {
            // ignore
          }
        }
      });

      process.stderr.write(`🌐 正在打开 X 趋势中心 (${targetUrl}) 并拦截热点流...\n`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      for (let i = 0; i < Math.max(20, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (interceptedPayloads.length >= 1) {
          await new Promise((r) => setTimeout(r, 2000));
          break;
        }
      }
    } finally {
      await browser.close();
    }

    const allTrends: TrendTopic[] = [];
    const seenNames = new Set<string>();
    for (const payload of interceptedPayloads) {
      for (const item of parseTrendsFromGraphQL(payload)) {
        if (!seenNames.has(item.name)) {
          seenNames.add(item.name);
          allTrends.push(item);
        }
      }
    }

    const filtered: TrendTopic[] = [];
    const techKeywords = new Set([
      'ai', 'model', 'llm', 'claude', 'gpt', 'deepseek', 'qwen', 'tech',
      'code', 'software', 'nvidia', 'apple', 'google', 'alibaba', 'robot',
      'openai', 'agent', 'data', 'meta', 'chips', 'hardware',
    ]);
    const bizKeywords = new Set([
      'business', 'finance', 'economy', 'stock', 'market', 'fund', 'cpi', 'fed', 'ipo', 'trading',
    ]);
    const newsKeywords = new Set([
      'news', 'politics', 'war', 'minister', 'president', 'gulf', 'policy', 'election',
    ]);

    for (const t of allTrends) {
      const domainL = (t.domain || '').toLowerCase();
      const nameL = t.name.toLowerCase();

      if (cat === 'all') {
        filtered.push(t);
      } else if (cat === 'tech') {
        if (domainL.includes('tech') || [...techKeywords].some((k) => nameL.includes(k))) {
          filtered.push(t);
        }
      } else if (cat === 'business') {
        if (
          domainL.includes('business') ||
          domainL.includes('finance') ||
          [...bizKeywords].some((k) => nameL.includes(k))
        ) {
          filtered.push(t);
        }
      } else if (cat === 'news') {
        if (
          domainL.includes('news') ||
          domainL.includes('politics') ||
          [...newsKeywords].some((k) => nameL.includes(k))
        ) {
          filtered.push(t);
        }
      } else if (cat === 'sports') {
        if (domainL.includes('sports')) filtered.push(t);
      } else if (cat === 'entertainment') {
        if (domainL.includes('entertainment')) filtered.push(t);
      } else {
        filtered.push(t);
      }
    }

    // Fallback supplement with top general organic trends if filtered is smaller than top
    if (filtered.length < top) {
      for (const t of allTrends) {
        if (!filtered.includes(t)) {
          filtered.push(t);
        }
        if (filtered.length >= top) break;
      }
    }

    return filtered.slice(0, top);
  }
}
