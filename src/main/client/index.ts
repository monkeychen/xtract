import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright-core';
import { Config } from '../config.js';
import type { Tweet, TrendTopic, XListInfo } from '../types.js';
import {
  parseTweetResult,
  parseTimelineInstructions,
  extractTimelineInstructions,
  parseTrendsFromGraphQL,
  extractListsFromGraphQL,
} from './parser.js';

export {
  parseTweetResult,
  parseTimelineInstructions,
  extractTimelineInstructions,
  parseTrendsFromGraphQL,
  extractListsFromGraphQL,
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

  private async createSession(
    headless = true,
    timeoutMs?: number
  ): Promise<{
    context: BrowserContext;
    page: Page;
    close: () => Promise<void>;
  }> {
    const effectiveTimeoutMs = timeoutMs || this.timeoutMs;
    Config.ensureDirs();
    const profileDir = Config.BROWSER_PROFILE_DIR;

    const proxy = Config.HTTP_PROXY ? { server: Config.HTTP_PROXY } : undefined;
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ];

    try {
      let context: BrowserContext;
      try {
        context = await chromium.launchPersistentContext(profileDir, {
          channel: 'chrome',
          headless,
          proxy,
          args,
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 900 },
          locale: 'zh-CN',
          timezoneId: 'Asia/Shanghai',
        });
      } catch {
        context = await chromium.launchPersistentContext(profileDir, {
          headless,
          proxy,
          args,
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 900 },
          locale: 'zh-CN',
          timezoneId: 'Asia/Shanghai',
        });
      }

      if (Config.X_AUTH_TOKEN) {
        const cookies = [
          { name: 'auth_token', value: Config.X_AUTH_TOKEN, domain: '.x.com', path: '/' },
        ];
        if (Config.X_CT0) {
          cookies.push({ name: 'ct0', value: Config.X_CT0, domain: '.x.com', path: '/' });
        }
        await context.addCookies(cookies);
      }

      await context.addInitScript(
        'Object.defineProperty(navigator, "webdriver", { get: () => undefined });'
      );
      context.setDefaultNavigationTimeout(effectiveTimeoutMs);
      context.setDefaultTimeout(effectiveTimeoutMs);

      const page = context.pages()[0] || (await context.newPage());

      return {
        context,
        page,
        close: async () => {
          await context.close().catch(() => {});
        },
      };
    } catch {
      // Fallback: If lock conflict occurs or persistent context fails, fall back to ephemeral browser
      const browser = await this.launchBrowser(headless);
      const context = await this.setupContext(browser, effectiveTimeoutMs);
      const page = await context.newPage();
      return {
        context,
        page,
        close: async () => {
          await browser.close().catch(() => {});
        },
      };
    }
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

  async verifyAuth(
    options?: { forceBrowser?: boolean; timeoutSeconds?: number } | number
  ): Promise<{ id: string; name: string; screen_name: string }> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在 .env 中填写 X_AUTH_TOKEN，或运行 pnpm dev:cli -- --login 登录。'
      );
    }

    const timeoutSeconds = typeof options === 'number' ? options : options?.timeoutSeconds;
    const forceBrowser = typeof options === 'object' ? Boolean(options.forceBrowser) : false;

    // Check cached verified user if browser verification is not explicitly forced
    if (!forceBrowser) {
      const cached = Config.getCachedUser();
      if (cached && cached.screen_name && cached.screen_name !== 'logged_in') {
        return {
          id: cached.id,
          name: cached.name,
          screen_name: cached.screen_name,
        };
      }
    }

    const timeout = timeoutSeconds || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;

    const browser = await this.launchBrowser(true);
    try {
      const context = await this.setupContext(browser, timeoutMs);
      const page = await context.newPage();

      await page.goto('https://x.com/home', { waitUntil: 'commit', timeout: timeoutMs });
      
      // Wait for hydration or account switcher
      try {
        await page.waitForSelector('a[data-testid="AppTabBar_Profile_Link"], [data-testid="SideNav_AccountSwitcher_Button"]', {
          timeout: 6000,
        });
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }

      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('i/flow')) {
        throw new Error('会话失效（被重定向至登录页）。请重新执行登录。');
      }

      const cookies = await context.cookies();
      const hasAuthToken = cookies.some((c) => c.name === 'auth_token');
      if (!hasAuthToken) {
        throw new Error('未检测到有效 auth_token Cookie。');
      }

      const twidCookie = cookies.find((c) => c.name === 'twid');
      const userId = twidCookie
        ? decodeURIComponent(twidCookie.value).replace(/^u=/, '').trim()
        : 'Authenticated';

      // Extract real user handle and display name
      const domData = await page.evaluate(() => {
        let handle = '';
        let displayName = '';

        const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
        if (profileLink) {
          const href = profileLink.getAttribute('href');
          if (href && href.startsWith('/')) {
            handle = href.replace(/^\//, '').split('/')[0].trim();
          }
        }

        const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        if (switcher) {
          const fullText = switcher.textContent || '';
          const match = fullText.match(/@([A-Za-z0-9_]{1,30})/);
          if (match && !handle) {
            handle = match[1];
          }
          const parts = fullText.split('@');
          if (parts[0]) {
            displayName = parts[0].trim();
          }
        }

        return { handle, displayName };
      });

      const title = await page.title();
      const finalName = domData.displayName || domData.handle || title.replace('/ X', '').trim() || 'cza55008';
      const finalHandle = domData.handle || 'cza55008';

      const authUser = {
        id: userId,
        name: finalName,
        screen_name: finalHandle,
      };

      Config.setCachedUser(authUser);
      return authUser;
    } finally {
      await browser.close();
    }
  }

  async fetchUserLists(username?: string): Promise<XListInfo[]> {
    if (!Config.hasXCredentials()) {
      return Config.getUserLists();
    }

    const cachedLists = Config.getUserLists();
    const handle = username || Config.getCachedUser()?.screen_name || 'cza55008';
    const targetUrl = `https://x.com/${handle}/lists`;

    const capturedLists: XListInfo[] = [];
    const browser = await this.launchBrowser(true);
    try {
      const context = await this.setupContext(browser, 20000);
      const page = await context.newPage();

      page.on('response', async (res: Response) => {
        const url = res.url();
        if (
          url.includes('/graphql/') &&
          (url.includes('ListsManagement') ||
            url.includes('List') ||
            url.includes('UserLists') ||
            url.includes('TimelineResponse')) &&
          res.status() === 200
        ) {
          try {
            const data = await res.json();
            const found = extractListsFromGraphQL(data);
            if (found.length > 0) {
              capturedLists.push(...found);
            }
          } catch {
            // ignore
          }
        }
      });

      try {
        await page.goto(targetUrl, { waitUntil: 'commit', timeout: 15000 });
        await new Promise((r) => setTimeout(r, 4000));
      } catch {
        // ignore navigation timeout
      }

      const domLists = await page.evaluate(() => {
        const items: { id: string; name: string }[] = [];
        const links = Array.from(document.querySelectorAll('a[href*="/i/lists/"]'));
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          const match = href.match(/\/i\/lists\/(\d{5,})/);
          if (match) {
            const id = match[1];
            // Skip utility links like /i/lists/create or members
            if (href.includes('/members') || href.includes('/followers')) continue;
            const text = a.textContent?.trim() || '';
            if (id && text && !items.some((it) => it.id === id)) {
              items.push({ id, name: text });
            }
          }
        }
        return items;
      });

      if (domLists && domLists.length > 0) {
        capturedLists.push(...domLists);
      }
    } catch (err) {
      process.stderr.write(`⚠️ 获取 X 线上列表提示: ${err}\n`);
    } finally {
      await browser.close();
    }

    // Merge captured lists with local saved lists (excluding legacy mock IDs)
    const mergedMap = new Map<string, XListInfo>();
    for (const l of cachedLists) {
      if (l.id !== '1827364512938' && l.id !== '1827364512939') {
        mergedMap.set(l.id, l);
      }
    }
    for (const l of capturedLists) {
      if (l.id !== '1827364512938' && l.id !== '1827364512939') {
        mergedMap.set(l.id, { ...mergedMap.get(l.id), ...l });
        Config.saveUserList(l);
      }
    }

    const finalLists = Array.from(mergedMap.values());
    return finalLists.length > 0 ? finalLists : Config.getUserLists();
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
          (url.includes('HomeLatestTimeline') ||
            url.includes('HomeTimeline') ||
            url.includes('HomeTimelineV2') ||
            url.includes('TimelineResponse')) &&
          res.status() === 200
        ) {
          try {
            const data = await res.json();
            const inst = extractTimelineInstructions(data);
            if (inst.length > 0) {
              capturedInstructions.push(inst);
            }
          } catch {
            // ignore JSON parse failure
          }
        }
      });

      process.stderr.write(`🌐 正在打开 x.com/home 并挂载网络监听器...\n`);
      await page.goto('https://x.com/home', { waitUntil: 'commit', timeout: timeoutMs });

      // Wait for navigation tabs or hydration
      try {
        await page.waitForSelector('div[role="tablist"], [role="tab"], a[href="/home"]', {
          timeout: 10000,
        });
      } catch {
        // ignore
      }

      if (page.url().includes('login') || page.url().includes('i/flow')) {
        throw new Error('X 认证失败：页面被重定向至登录页。请检查 auth_token 是否过期。');
      }

      // Try finding and clicking "Following" tab
      try {
        const tabs = page.locator('[role="tab"]');
        const count = await tabs.count();
        let clickedTab = false;
        for (let i = 0; i < count; i++) {
          const tab = tabs.nth(i);
          const text = (await tab.textContent()) || '';
          if (/Following|正在关注|关注/i.test(text)) {
            process.stderr.write('📌 切换至「正在关注 (Following)」时间线...\n');
            await tab.click();
            clickedTab = true;
            await new Promise((r) => setTimeout(r, 2500));
            break;
          }
        }
        if (!clickedTab && count > 1) {
          // Default: second tab is usually Following
          const secondTab = tabs.nth(1);
          await secondTab.click().catch(() => {});
        }
      } catch {
        // ignore tab click error
      }

      // Initial batch wait with gentle scroll assist
      for (let i = 0; i < Math.max(10, timeout / 2); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (capturedInstructions.length > 0) break;
        if (i === 2 || i === 5) {
          await page.evaluate(() => window.scrollBy(0, 1000)).catch(() => {});
        }
      }

      // Paginate by scrolling if user requested more
      for (let pIdx = 1; pIdx < maxPages; pIdx++) {
        process.stderr.write(`📜 正在向下滚动加载第 ${pIdx + 1} 页推文...\n`);
        await page.evaluate(() => window.scrollBy(0, 2500)).catch(() => {});
        await new Promise((r) => setTimeout(r, pageDelay * 1000));
      }

      await new Promise((r) => setTimeout(r, 1500));
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

    process.stderr.write(
      `⏳ 正在通过推特双轨机制拉取博主 @${cleanUser} 的最新推文（目标 ${limit} 篇）...\n`
    );

    // 轨道 1：官方实时搜索流 (SearchTimeline: from:username)
    // 优势：极速（3~5秒）、推特边缘直接下发推文数据、彻底绕过博主个人主页 18+ UI chunks 的水合瓶颈
    try {
      process.stderr.write(`🌐 [双轨-主轨] 正在通过推特实时搜索流检索 @${cleanUser} 的推文...\n`);
      const searchTweets = await this.fetchSearchTimeline(`from:${cleanUser}`, {
        searchType: 'live',
        limit: Math.max(limit, 20),
        pageDelay,
        timeout: Math.min(timeout, 25),
      });

      const matched = searchTweets.filter(
        (t) => t.author_username.toLowerCase() === cleanUser.toLowerCase()
      );

      if (matched.length > 0) {
        process.stderr.write(
          `✓ [双轨-主轨] 成功获取到 ${matched.length} 条 @${cleanUser} 的推文\n`
        );
        return matched.slice(0, limit);
      }
      process.stderr.write(`ℹ️ [双轨-主轨] 搜索流未命中推文，自动平滑切换至博主主页兜底抓取...\n`);
    } catch (err: any) {
      process.stderr.write(
        `⚠️ [双轨-主轨] 实时流检索提示: ${err?.message || err}，切换至博主主页兜底...\n`
      );
    }

    // 轨道 2：个人主页兜底抓取 (UserTimeline Fallback)
    const capturedInstructions: any[][] = [];
    const session = await this.createSession(true, timeoutMs);

    try {
      const page = session.page;

      page.on('response', async (res: Response) => {
        const url = res.url();
        if (
          url.includes('/graphql/') &&
          (url.includes('UserOriginalsTimeline') ||
            url.includes('UserTweets') ||
            url.includes('UserTweetsAndReplies') ||
            url.includes('UserArticles')) &&
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
      process.stderr.write(`🌐 [双轨-备轨] 正在打开博主主页 ${userUrl} 并监听推文流...\n`);
      await page.goto(userUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      // Wait for initial batch with gentle scroll assist
      for (let i = 0; i < Math.max(20, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (capturedInstructions.length > 0) break;
        if (i % 4 === 0) {
          await page.evaluate(() => window.scrollBy(0, 1500)).catch(() => {});
        }
      }

      // Paginate if more than 20
      const pagesNeeded = Math.max(1, Math.ceil(limit / 20));
      for (let pIdx = 1; pIdx < pagesNeeded; pIdx++) {
        process.stderr.write(`📜 正在向下滚动加载第 ${pIdx + 1} 页...\n`);
        await page.evaluate(() => window.scrollBy(0, 2500)).catch(() => {});
        await new Promise((r) => setTimeout(r, pageDelay * 1000));
      }

      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      await session.close();
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
    let listNotFound = false;
    let notFoundReason = '';
    const browser = await this.launchBrowser(true);

    try {
      const context = await this.setupContext(browser, timeoutMs);
      const page = await context.newPage();

      page.on('response', async (res: Response) => {
        const url = res.url();
        if (url.includes('/graphql/') && res.status() === 200) {
          if (url.includes('ListByRestId')) {
            try {
              const data = await res.json();
              const l = data.data?.list;
              if (l) {
                // If it returns only id_str and empty timeline without name or description, list is deleted/nonexistent
                if (!l.name && !l.description && (!l.tweets_timeline || Object.keys(l.tweets_timeline).length === 0)) {
                  listNotFound = true;
                  notFoundReason = '该 X 列表在服务器上不存在或已失效';
                } else if (l.name) {
                  // Auto-save discovered list metadata
                  Config.saveUserList({
                    id: listId,
                    name: l.name,
                    member_count: l.member_count,
                    description: l.description,
                  });
                }
              } else {
                listNotFound = true;
                notFoundReason = '该 X 列表不存在';
              }
            } catch {
              // ignore
            }
          }

          if (
            url.includes('ListLatestTweetsTimeline') ||
            url.includes('ListTweetsTimeline') ||
            url.includes('List')
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
        }
      });

      process.stderr.write(`🌐 正在打开 X 列表主页 ${targetUrl} 并监听推文流...\n`);
      await page.goto(targetUrl, { waitUntil: 'commit', timeout: timeoutMs });

      // Intelligent polling: proceed immediately upon receiving timeline data or detecting 404
      for (let i = 0; i < Math.max(15, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (listNotFound) break;
        if (capturedInstructions.length > 0) break;

        if (i >= 3) {
          const domCheck = await page
            .evaluate(() => {
              const text = document.body?.innerText || '';
              const isNotExist =
                text.includes('doesn’t exist') ||
                text.includes('does not exist') ||
                text.includes('This List does not exist') ||
                text.includes('Hmm...this page');
              const hasTweets = document.querySelectorAll('[data-testid="tweet"]').length > 0;
              return { isNotExist, hasTweets };
            })
            .catch(() => ({ isNotExist: false, hasTweets: false }));

          if (domCheck.isNotExist) {
            listNotFound = true;
            notFoundReason = '页面提示该列表不存在或已被作者设为私密';
            break;
          }
          if (domCheck.hasTweets) {
            await new Promise((r) => setTimeout(r, 1000));
            break;
          }
        }
      }

      if (listNotFound) {
        throw new Error(
          `X 列表（ID: ${listId}）抓取失败：${notFoundReason || '列表不存在或为私密列表'}，请检查列表 ID 或粘贴正确的公开列表链接。`
        );
      }

      const pagesNeeded = Math.max(1, Math.ceil(limit / 20));
      for (let pIdx = 1; pIdx < pagesNeeded; pIdx++) {
        process.stderr.write(`📜 正在向下滚动加载第 ${pIdx + 1} 页...\n`);
        await page.evaluate(() => window.scrollBy(0, 2500));
        await new Promise((r) => setTimeout(r, pageDelay * 1000));
      }

      await new Promise((r) => setTimeout(r, 1500));
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
    const session = await this.createSession(true, timeoutMs);

    try {
      const page = session.page;

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
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      for (let i = 0; i < Math.max(30, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (capturedInstructions.length > 0) break;
        if (i % 4 === 0) {
          await page.evaluate(() => window.scrollBy(0, 1000)).catch(() => {});
        }
      }

      const pagesNeeded = Math.max(1, Math.ceil(limit / 20));
      for (let pIdx = 1; pIdx < pagesNeeded; pIdx++) {
        process.stderr.write(`📜 正在向下滚动加载第 ${pIdx + 1} 页...\n`);
        await page.evaluate(() => window.scrollBy(0, 2500)).catch(() => {});
        await new Promise((r) => setTimeout(r, pageDelay * 1000));
      }

      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      await session.close();
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
      sports: 'https://x.com/explore/tabs/sports',
      entertainment: 'https://x.com/explore/tabs/entertainment',
      news: 'https://x.com/explore/tabs/news',
      all: 'https://x.com/explore/tabs/trending',
      business: 'https://x.com/explore/tabs/trending',
      tech: 'https://x.com/explore',
    };
    const targetUrl = catUrls[cat] || 'https://x.com/explore';

    const interceptedPayloads: any[] = [];
    const domExtractedTrends: TrendTopic[] = [];
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
      // Use 'commit' navigation to avoid timeouts caused by heavy background media / tracking requests
      await page.goto(targetUrl, { waitUntil: 'commit', timeout: Math.min(timeoutMs, 25000) });

      // Intelligent polling: proceed as soon as GraphQL payloads are received or DOM trends are rendered
      for (let i = 0; i < Math.max(15, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (interceptedPayloads.length >= 1) {
          await new Promise((r) => setTimeout(r, 1500));
          break;
        }
        const hasDomTrends = await page
          .evaluate(() => document.querySelectorAll('[data-testid="trend"]').length > 0)
          .catch(() => false);
        if (hasDomTrends && i >= 4) {
          await new Promise((r) => setTimeout(r, 1500));
          break;
        }
      }

      // Robust DOM Fallback extraction directly from page DOM
      try {
        const domTrends = await page.evaluate(() => {
          const trendElements = Array.from(document.querySelectorAll('[data-testid="trend"]'));
          return trendElements.map((el, index) => {
            const text = (el as HTMLElement).innerText || '';
            const lines = text.split('\n').map((s) => s.trim()).filter((s) => s && s !== '·');
            let rank = index + 1;
            let domain = '';
            let name = '';
            let tweetCount = '高热度讨论';

            let start = 0;
            if (/^\d+$/.test(lines[0])) {
              rank = parseInt(lines[0], 10);
              start = 1;
            }

            if (
              lines[start] &&
              (lines[start].includes('Trending') ||
                lines[start].includes('News') ||
                lines[start].includes('Entertainment') ||
                lines[start].includes('Sports') ||
                lines[start].includes('ago'))
            ) {
              domain = lines[start];
              name = lines[start + 1] || '';
              tweetCount = lines[start + 2] || '高热度讨论';
            } else {
              name = lines[start] || '';
              if (lines[start + 1]) {
                if (
                  lines[start + 1].includes('posts') ||
                  lines[start + 1].includes('Trending') ||
                  lines[start + 1].includes('ago') ||
                  lines[start + 1].includes('Trending with')
                ) {
                  tweetCount = lines[start + 1];
                } else {
                  domain = lines[start + 1];
                }
              }
              if (lines[start + 2]) {
                tweetCount = lines[start + 2];
              }
            }

            return {
              name,
              query: name,
              rank,
              domain,
              tweet_count: tweetCount,
            };
          }).filter((t) => Boolean(t.name));
        });

        if (Array.isArray(domTrends) && domTrends.length > 0) {
          domExtractedTrends.push(...domTrends);
        }
      } catch {
        // ignore DOM extraction errors
      }
    } finally {
      await browser.close();
    }

    const allTrends: TrendTopic[] = [];
    const seenNames = new Set<string>();

    // 1. Ingest GraphQL trends first
    for (const payload of interceptedPayloads) {
      for (const item of parseTrendsFromGraphQL(payload)) {
        const key = item.name.toLowerCase();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          // If DOM extraction got a more descriptive tweet count, enrich it
          const matchingDom = domExtractedTrends.find((d) => d.name.toLowerCase() === key);
          if (matchingDom && matchingDom.tweet_count && matchingDom.tweet_count !== '高热度讨论') {
            item.tweet_count = matchingDom.tweet_count;
          }
          allTrends.push(item);
        }
      }
    }

    // 2. Fallback / supplement with DOM extracted trends
    for (const dItem of domExtractedTrends) {
      const key = dItem.name.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        allTrends.push(dItem);
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
