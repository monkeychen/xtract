import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright-core';
import { Config } from '../config.js';
import {
  ALL_TWEET_CONTENT_TYPES,
  type Tweet,
  type TweetContentType,
  type TrendTopic,
  type XListInfo,
} from '../types.js';
import {
  extractSsrPayloadsFromHtml,
  extractSsrTimelineTweetsFromHtml,
  extractSsrTweetPayloadsFromHtml,
  extractTweetId,
  mergeRawTweetPayload,
  parseTweetResult,
  parseTweetResultsByRestIds,
  parseTimelineInstructions,
  extractTimelineInstructions,
  parseTrendsFromGraphQL,
  extractListsFromGraphQL,
  isArticleTweet,
  isNoteTweet,
  isLongContentTweet,
  classifyTweetContentType,
  matchesContentTypes,
  parseContentTypes,
  isTweetContentIncomplete,
} from './parser.js';
import {
  buildXCookieHeader,
  isElectronRuntime,
  openElectronHiddenSession,
  type CrawlPage,
  type CrawlSession,
  type InterceptedResponse,
} from './hidden-browser.js';

export {
  parseTweetResult,
  parseTweetResultsByRestIds,
  parseTimelineInstructions,
  extractTimelineInstructions,
  parseTrendsFromGraphQL,
  extractListsFromGraphQL,
  isArticleTweet,
  isNoteTweet,
  isLongContentTweet,
  classifyTweetContentType,
  matchesContentTypes,
  parseContentTypes,
  isTweetContentIncomplete,
};

/**
 * 协议级严格判定：仅放行「正在关注 (Following)」的 GraphQL 操作（HomeLatestTimeline / HomeLatestTimelineQuery）。
 * 严禁放行 HomeTimeline / HomeTimelineV2（「为你推荐」），彻底杜绝未关注推荐账号混入关注流。
 */
export function isFollowingTimelineUrl(url: string): boolean {
  return url.includes('/graphql/') && url.includes('HomeLatestTimeline');
}

/**
 * 协议级严格判定：仅放行「为你推荐 (For You)」的 GraphQL 操作（HomeTimeline / HomeTimelineV2 / HomeTimelineQuery）。
 * 严格排除 HomeLatestTimeline（「正在关注」），确保推荐流与关注流互不串台。
 */
export function isRecommendedTimelineUrl(url: string): boolean {
  return (
    url.includes('/graphql/') &&
    url.includes('HomeTimeline') &&
    !url.includes('HomeLatestTimeline')
  );
}

export function resolveContentTypes(options?: {
  contentTypes?: readonly TweetContentType[];
  onlyLongTweets?: boolean;
}): TweetContentType[] {
  if (options?.contentTypes && options.contentTypes.length > 0) {
    return parseContentTypes(options.contentTypes);
  }
  if (options?.onlyLongTweets !== undefined) {
    return options.onlyLongTweets ? ['article', 'note'] : [...ALL_TWEET_CONTENT_TYPES];
  }
  return Config.FETCH_CONTENT_TYPES;
}

function isLoopbackHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * 纯 Node.js HTTP SSR 直取单推 / X Article（含全部内嵌推文卡片与视频链接）：
 * - 零浏览器启动、零弹窗，耗时约 0.7~1.2 秒；
 * - 适用于 X 新版 x-web (TanStack Router SSR) 直出页面。
 */
export async function fetchTweetThreadViaHttpSsr(
  targetUrl: string,
  cleanId: string,
  options?: { cookieHeader?: string; proxyUrl?: string; timeoutMs?: number }
): Promise<Tweet[]> {
  const cookieHeader = options?.cookieHeader !== undefined ? options.cookieHeader : buildXCookieHeader();
  const proxyUrl = options?.proxyUrl !== undefined ? options.proxyUrl : Config.HTTP_PROXY;
  const timeoutMs = options?.timeoutMs ?? 20000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { fetch: undiciFetch, ProxyAgent } = await import('undici');
    const fetchOpts: Record<string, unknown> = {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      redirect: 'follow',
      signal: controller.signal,
    };
    if (proxyUrl && !isLoopbackHost(targetUrl)) {
      fetchOpts.dispatcher = new ProxyAgent(proxyUrl);
    }

    const res = await undiciFetch(targetUrl, fetchOpts as any);
    if (!res.ok) return [];
    const html = await res.text();
    const ssrPayloads = extractSsrTweetPayloadsFromHtml(html);
    if (ssrPayloads.size === 0) return [];

    let rawMain: any = null;
    const embeddedMap = new Map<string, Tweet>();
    for (const [restId, rawMerged] of ssrPayloads.entries()) {
      if (restId === cleanId) {
        rawMain = rawMerged;
      } else {
        const emb = parseTweetResult(rawMerged);
        if (emb && emb.tweet_id) {
          embeddedMap.set(emb.tweet_id, emb);
        }
      }
    }

    if (!rawMain) return [];
    const enrichedMain = parseTweetResult(rawMain, embeddedMap);
    if (!enrichedMain || !enrichedMain.tweet_id) return [];

    return [enrichedMain, ...Array.from(embeddedMap.values())];
  } finally {
    clearTimeout(timer);
  }
}

function formatContentTypesLabel(types: readonly TweetContentType[]): string {
  const labels: Record<TweetContentType, string> = {
    article: '专栏文章 (X Article)',
    note: '长推文 (Note Tweet)',
    short: '普通短推文',
  };
  return types.map((t) => labels[t]).join('、');
}

/**
 * X 列表滚动加载的停止判据（纯函数，便于单测）。
 *
 * 历史缺陷：固定滚动 ceil(limit/20) 轮、每轮仅 2500px——列表内容加载慢时
 * GraphQL 流只捕获到十几条就停手，limit=50 实得 15 条（真机实测）。
 * 改为按「实际捕获的 GraphQL 响应批次数」驱动，三重停止条件：
 *   1. 捕获批次数 ≥ 目标页数（limit 已吃满）
 *   2. 连续 3 轮无新增批次（列表已到底，提前收手）
 *   3. 轮数硬上限（防死循环护栏）
 */
export function shouldScrollListTimeline(params: {
  capturedBatches: number;
  targetBatches: number;
  stagnantRounds: number;
  round: number;
  maxRounds: number;
}): boolean {
  if (params.capturedBatches >= params.targetBatches) return false;
  if (params.stagnantRounds >= 3) return false;
  if (params.round > params.maxRounds) return false;
  return true;
}

export interface FetchTimelineOptions {
  limit?: number;
  maxPages?: number;
  pageDelay?: number;
  timeout?: number;
  contentTypes?: TweetContentType[];
  /** @deprecated 请优先使用 contentTypes */
  onlyLongTweets?: boolean;
}

export interface FetchUserOptions {
  limit?: number;
  pageDelay?: number;
  timeout?: number;
  contentTypes?: TweetContentType[];
  /** @deprecated 请优先使用 contentTypes */
  onlyLongTweets?: boolean;
}

export interface FetchSearchOptions {
  searchType?: 'live' | 'top';
  limit?: number;
  pageDelay?: number;
  timeout?: number;
  contentTypes?: TweetContentType[];
  /** @deprecated 请优先使用 contentTypes */
  onlyLongTweets?: boolean;
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

  /**
   * 弹性安全页面导航：具备指数退避重试与网络中断友好诊断
   */
  private async safeNavigate(
    page: CrawlPage | Page,
    url: string,
    options: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
      timeout?: number;
      retries?: number;
    } = {}
  ): Promise<void> {
    const maxRetries = options.retries ?? 2;
    const waitUntil = options.waitUntil ?? 'commit';
    const timeout = options.timeout ?? 25000;

    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        await page.goto(url, { waitUntil, timeout });
        return;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        const isNetworkErr =
          msg.includes('net::ERR_CONNECTION_CLOSED') ||
          msg.includes('net::ERR_CONNECTION_RESET') ||
          msg.includes('net::ERR_TIMED_OUT') ||
          msg.includes('net::ERR_PROXY_CONNECTION_FAILED') ||
          msg.includes('net::ERR_NAME_NOT_RESOLVED');

        if (isNetworkErr && attempt <= maxRetries) {
          process.stderr.write(
            `⚠️ [网络波动] 访问 ${url} 连接异常，正在尝试第 ${attempt} 次重试...\n`
          );
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }

        if (isNetworkErr) {
          const currentProxy = Config.HTTP_PROXY || '未检测到代理';
          throw new Error(
            `无法连接 X 官方服务器 (${msg.includes('CLOSED') ? 'ERR_CONNECTION_CLOSED' : '网络连接中断'})。当前代理: [${currentProxy}]。请检查 Clash/Surge 客户端是否运行正常并接管 X 流量。`,
            { cause: err }
          );
        }
        throw err;
      }
    }
    throw lastError;
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
          viewport: { width: 1280, height: 900 },
          locale: 'zh-CN',
          timezoneId: 'Asia/Shanghai',
        });
      } catch {
        context = await chromium.launchPersistentContext(profileDir, {
          headless,
          proxy,
          args,
          viewport: { width: 1280, height: 900 },
          locale: 'zh-CN',
          timezoneId: 'Asia/Shanghai',
        });
      }

      // 持久化 profile 自带磁盘 cookie，只有在 profile 中确实没有登录态时才用 .env 兜底。
      // 此前是无条件注入，会导致刚通过「从浏览器读取登录态」导入的新会话被 .env 中的
      // 旧 token 覆盖，与 setupContext() 的 storageState 优先策略不一致。
      if (Config.X_AUTH_TOKEN) {
        const hasPersistedSession = await context
          .cookies(['https://x.com', 'https://twitter.com'])
          .then((cs) => cs.some((c) => c.name === 'auth_token' && c.value))
          .catch(() => false);
        if (!hasPersistedSession) {
          const cookies = [
            { name: 'auth_token', value: Config.X_AUTH_TOKEN, domain: '.x.com', path: '/' },
          ];
          if (Config.X_CT0) {
            cookies.push({ name: 'ct0', value: Config.X_CT0, domain: '.x.com', path: '/' });
          }
          await context.addCookies(cookies);
        }
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


  /**
   * 统一零弹窗抓取会话工厂：
   * - Electron 运行时（桌面工作台 GUI 与打包态 CLI）：优先使用 Electron 原生隐藏窗口 BrowserWindow({ show: false }) + CDP 拦截，
   *   零弹窗、零外部 Chrome 进程、原生浏览器指纹（规避 x-web 拒绝 HeadlessChrome 403）；
   * - 纯 Node 运行时（如开发态 `pnpm dev:cli`）：回退到 Playwright 无头会话。
   */
  private async openCrawlSession(timeoutMs?: number): Promise<CrawlSession> {
    const effectiveTimeoutMs = timeoutMs || this.timeoutMs;
    if (isElectronRuntime()) {
      return await openElectronHiddenSession(effectiveTimeoutMs);
    }

    const browser = await this.launchBrowser(true);
    const context = await this.setupContext(browser, effectiveTimeoutMs);
    const pwPage = await context.newPage();

    const page: CrawlPage = {
      on: (event, listener) => {
        pwPage.on(event, (res: Response) => {
          const wrapped: InterceptedResponse = {
            url: () => res.url(),
            status: () => res.status(),
            headers: () => res.headers(),
            text: () => res.text(),
            json: () => res.json(),
          };
          void listener(wrapped);
        });
      },
      goto: async (url, opts) => {
        await pwPage.goto(url, opts as any);
      },
      url: () => pwPage.url(),
      title: () => pwPage.title(),
      evaluate: <T = any>(fnOrExpr: (() => T) | string) => pwPage.evaluate(fnOrExpr as any),
      waitForSelector: async (selector, opts) => {
        await pwPage.waitForSelector(selector, opts);
      },
    };

    return {
      page,
      getCookies: async () => {
        const list = await context.cookies();
        return list.map((c) => ({ name: c.name, value: c.value }));
      },
      close: async () => {
        await browser.close().catch(() => {});
      },
    };
  }

  async verifyAuth(
    options?: { forceBrowser?: boolean; timeoutSeconds?: number } | number
  ): Promise<{ id: string; name: string; screen_name: string }> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在桌面端设置中点击「从 Chrome 读取登录态」，'
        + '或在 .env 中填写 X_AUTH_TOKEN。'
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

    const crawlSession = await this.openCrawlSession(timeoutMs);
    try {
      const page = crawlSession.page;

      await this.safeNavigate(page, 'https://x.com/home', { waitUntil: 'commit', timeout: timeoutMs });
      
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

      const cookies = await crawlSession.getCookies();
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
      await crawlSession.close();
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
    const crawlSession = await this.openCrawlSession(20000);
    try {
      const page = crawlSession.page;

      page.on('response', async (res: InterceptedResponse) => {
        const url = res.url();
        const contentType = res.headers()['content-type'] || '';
        if (res.status() === 200 && contentType.includes('text/html') && url.includes('/lists')) {
          try {
            const html = await res.text();
            for (const payload of extractSsrPayloadsFromHtml(html)) {
              const found = extractListsFromGraphQL(payload);
              if (found.length > 0) capturedLists.push(...found);
            }
          } catch {
            // ignore
          }
          return;
        }
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
            if (href.includes('/members') || href.includes('/followers') || href.includes('/create')) continue;

            // 过滤推特官方推荐发现的第三方列表区域 (Discover new Lists)
            let isDiscover = false;
            let cur: Element | null = a;
            while (cur && cur !== document.body) {
              if (
                cur.matches?.('[data-testid*="discover"], [data-testid*="suggest"]') ||
                cur.querySelector?.('h2')?.textContent?.match(/(?:discover|发现|推荐|suggested)/i)
              ) {
                isDiscover = true;
                break;
              }
              cur = cur.parentElement;
            }
            if (isDiscover) continue;

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
      await crawlSession.close();
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
    return this.fetchHomeTimelineTab('following', options);
  }

  async fetchRecommendedTimeline(options?: FetchTimelineOptions): Promise<Tweet[]> {
    return this.fetchHomeTimelineTab('recommended', options);
  }

  private async fetchHomeTimelineTab(
    mode: 'following' | 'recommended',
    options?: FetchTimelineOptions
  ): Promise<Tweet[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在桌面端设置中点击「从 Chrome 读取登录态」，'
        + '或在 .env 中填写 X_AUTH_TOKEN。'
      );
    }

    const isFollowing = mode === 'following';
    const matchTimelineUrl = isFollowing ? isFollowingTimelineUrl : isRecommendedTimelineUrl;
    const modeLabel = isFollowing ? '正在关注 (Following)' : '为你推荐 (For You)';

    const limit = options?.limit;
    const maxPages = options?.maxPages || (limit ? Math.max(1, Math.ceil(limit / 20)) : Config.FETCH_MAX_PAGES);
    const pageDelay = options?.pageDelay || 2.5;
    const timeout = options?.timeout || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;

    const capturedInstructions: any[][] = [];

    const crawlSession = await this.openCrawlSession(timeoutMs);
    try {
      const page = crawlSession.page;

      page.on('response', async (res: InterceptedResponse) => {
        const url = res.url();
        if (matchTimelineUrl(url) && res.status() === 200) {
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

      process.stderr.write(`🌐 正在打开 x.com/home 并挂载「${modeLabel}」专属网络监听器...\n`);
      await this.safeNavigate(page, 'https://x.com/home', { waitUntil: 'commit', timeout: timeoutMs });

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

      // 确保切换并锁定至目标标签页（通过 aria-selected="true" 二次确认，防止 React 尚未绑定时点击无效）
      const tabSwitchScript = isFollowing
        ? `(() => {
            const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
            let target = tabs.find((t) => /Following|正在关注|关注/i.test((t.textContent || '').trim()));
            if (!target && tabs.length > 1) target = tabs[1];
            if (!target) return { found: false, selected: false, label: '' };
            const already = target.getAttribute('aria-selected') === 'true';
            if (!already) target.click();
            return {
              found: true,
              selected: target.getAttribute('aria-selected') === 'true',
              clicked: !already,
              label: (target.textContent || '').trim(),
            };
          })()`
        : `(() => {
            const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
            let target = tabs.find((t) => /For you|为你推荐|推荐/i.test((t.textContent || '').trim()));
            if (!target && tabs.length > 0) target = tabs[0];
            if (!target) return { found: false, selected: false, label: '' };
            const already = target.getAttribute('aria-selected') === 'true';
            if (!already) target.click();
            return {
              found: true,
              selected: target.getAttribute('aria-selected') === 'true',
              clicked: !already,
              label: (target.textContent || '').trim(),
            };
          })()`;

      for (let attempt = 0; attempt < 4; attempt++) {
        if (capturedInstructions.length > 0) break;
        try {
          const res = (await page.evaluate(tabSwitchScript)) as {
            found?: boolean;
            selected?: boolean;
            clicked?: boolean;
            label?: string;
          };
          if (res?.found) {
            if (res.clicked) {
              process.stderr.write(`📌 切换至「${modeLabel}」时间线 (${res.label || mode})...\n`);
            }
            if (res.selected) {
              break;
            }
          }
        } catch {
          // ignore transient DOM error while hydrating
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Initial batch wait with gentle scroll assist
      for (let i = 0; i < Math.max(10, timeout / 2); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (capturedInstructions.length > 0) break;
        if (i === 2 || i === 5) {
          await page.evaluate(() => window.scrollBy(0, 1000)).catch(() => {});
        }
      }

      const contentTypes = resolveContentTypes(options);

      // Paginate by scrolling if user requested more and we haven't reached limit
      for (let pIdx = 1; pIdx < maxPages; pIdx++) {
        if (limit) {
          let countSoFar = 0;
          for (const instList of capturedInstructions) {
            const batch = parseTimelineInstructions(instList);
            countSoFar += batch.filter((t) => matchesContentTypes(t, contentTypes)).length;
          }
          if (countSoFar >= limit) {
            break;
          }
        }
        process.stderr.write(`📜 正在向下滚动加载第 ${pIdx + 1} 页推文...\n`);
        await page.evaluate(() => window.scrollBy(0, 2500)).catch(() => {});
        await new Promise((r) => setTimeout(r, pageDelay * 1000));
      }

      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      await crawlSession.close();
    }

    const contentTypes = resolveContentTypes(options);

    const seenIds = new Set<string>();
    const allTweets: Tweet[] = [];
    for (const instList of capturedInstructions) {
      const batch = parseTimelineInstructions(instList);
      for (const t of batch) {
        if (!seenIds.has(t.tweet_id)) {
          seenIds.add(t.tweet_id);
          if (matchesContentTypes(t, contentTypes)) {
            allTweets.push(t);
          }
        }
      }
    }

    if (contentTypes.length < ALL_TWEET_CONTENT_TYPES.length) {
      process.stderr.write(`ℹ️ 过滤规则生效：仅抓取${formatContentTypesLabel(contentTypes)}\n`);
    }

    return limit ? allTweets.slice(0, limit) : allTweets;
  }

  async fetchUserTimeline(username: string, options?: FetchUserOptions): Promise<Tweet[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在桌面端设置中点击「从 Chrome 读取登录态」，'
        + '或在 .env 中填写 X_AUTH_TOKEN。'
      );
    }

    const cleanUser = username.replace(/^@/, '').trim();
    const limit = options?.limit || 20;
    const pageDelay = options?.pageDelay || 2.0;
    const timeout = options?.timeout || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;
    const contentTypes = resolveContentTypes(options);

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
        contentTypes,
      });

      const matched = searchTweets.filter(
        (t) =>
          t.author_username.toLowerCase() === cleanUser.toLowerCase() &&
          matchesContentTypes(t, contentTypes)
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
    const ssrTweets: Tweet[] = [];
    const crawlSession = await this.openCrawlSession(timeoutMs);

    try {
      const page = crawlSession.page;

      page.on('response', async (res: InterceptedResponse) => {
        const url = res.url();
        const contentType = res.headers()['content-type'] || '';
        if (res.status() === 200 && contentType.includes('text/html') && url.toLowerCase().includes(`/${cleanUser.toLowerCase()}`)) {
          try {
            const html = await res.text();
            const parsed = extractSsrTimelineTweetsFromHtml(html);
            if (parsed.length > 0) ssrTweets.push(...parsed);
          } catch {
            // ignore
          }
          return;
        }
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
      await this.safeNavigate(page, userUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      // Wait for initial batch with gentle scroll assist
      for (let i = 0; i < Math.max(20, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (capturedInstructions.length > 0 || ssrTweets.length > 0) break;
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
      await crawlSession.close();
    }

    const seenIds = new Set<string>();
    const allTweets: Tweet[] = [];
    for (const t of ssrTweets) {
      if (!seenIds.has(t.tweet_id)) {
        seenIds.add(t.tweet_id);
        if (matchesContentTypes(t, contentTypes)) {
          allTweets.push(t);
        }
      }
    }
    for (const instList of capturedInstructions) {
      const batch = parseTimelineInstructions(instList);
      for (const t of batch) {
        if (!seenIds.has(t.tweet_id)) {
          seenIds.add(t.tweet_id);
          if (matchesContentTypes(t, contentTypes)) {
            allTweets.push(t);
          }
        }
      }
    }

    return allTweets.slice(0, limit);
  }

  async fetchListTimeline(listIdOrUrl: string, options?: FetchUserOptions): Promise<Tweet[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在桌面端设置中点击「从 Chrome 读取登录态」，'
        + '或在 .env 中填写 X_AUTH_TOKEN。'
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
    const crawlSession = await this.openCrawlSession(timeoutMs);

    try {
      const page = crawlSession.page;

      const handleListPayload = (data: any, allowNotFoundFlag: boolean) => {
        const l = data?.data?.list || data?.data?.list_by_rest_id_v2;
        const inst = extractTimelineInstructions(data);
        if (inst.length > 0) {
          capturedInstructions.push(inst);
          listNotFound = false;
        }
        if (l) {
          if (l.name) {
            listNotFound = false;
            Config.saveUserList({
              id: listId,
              name: l.name,
              member_count: l.member_count,
              description: l.description,
            });
          } else if (
            allowNotFoundFlag &&
            capturedInstructions.length === 0 &&
            !l.description &&
            (!l.tweets_timeline || Object.keys(l.tweets_timeline).length === 0)
          ) {
            listNotFound = true;
            notFoundReason = '该 X 列表在服务器上不存在或已失效';
          }
        }
      };

      page.on('response', async (res: InterceptedResponse) => {
        const url = res.url();
        const contentType = res.headers()['content-type'] || '';

        // A. X 新版 x-web SSR HTML 内联列表首屏数据（list_by_rest_id_v2 常拆成多个分片下发，需全部扫描后再判定）
        if (res.status() === 200 && contentType.includes('text/html') && url.includes(`/lists/${listId}`)) {
          try {
            const html = await res.text();
            const listPayloads = extractSsrPayloadsFromHtml(html).filter(
              (p) => p?.data?.list_by_rest_id_v2 !== undefined || p?.data?.list !== undefined
            );
            for (const payload of listPayloads) {
              handleListPayload(payload, false);
            }
            if (listPayloads.length > 0 && capturedInstructions.length === 0) {
              const hasAnyMeta = listPayloads.some((p) => {
                const l = p?.data?.list_by_rest_id_v2 || p?.data?.list;
                return Boolean(l?.name || l?.description || (l?.tweets_timeline && Object.keys(l.tweets_timeline).length > 0));
              });
              if (!hasAnyMeta) {
                listNotFound = true;
                notFoundReason = '该 X 列表在服务器上不存在或已失效';
              }
            }
          } catch {
            // ignore
          }
          return;
        }

        // B. GraphQL 列表响应（首屏或滚动翻页）
        if (url.includes('/graphql/') && res.status() === 200) {
          if (url.includes('ListByRestId')) {
            try {
              const data = await res.json();
              const l = data.data?.list || data.data?.list_by_rest_id_v2;
              if (!l && capturedInstructions.length === 0) {
                listNotFound = true;
                notFoundReason = '该 X 列表不存在';
              } else if (l) {
                handleListPayload(data, true);
              }
            } catch {
              // ignore
            }
          } else if (
            url.includes('ListLatestTweetsTimeline') ||
            url.includes('ListTweetsTimeline') ||
            url.includes('List')
          ) {
            try {
              const data = await res.json();
              const inst = extractTimelineInstructions(data);
              if (inst.length > 0) {
                capturedInstructions.push(inst);
                listNotFound = false;
              }
            } catch {
              // ignore
            }
          }
        }
      });

      process.stderr.write(`🌐 正在打开 X 列表主页 ${targetUrl} 并监听推文流...\n`);
      await this.safeNavigate(page, targetUrl, { waitUntil: 'commit', timeout: timeoutMs });

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

      // 按实际捕获量驱动滚动（旧版固定轮数在列表加载慢时会少抓一半以上）：
      // 捕获批次够目标页数 / 连续 3 轮无新增 / 硬上限，三者任一即停
      const pagesNeeded = Math.max(1, Math.ceil(limit / 20));
      const maxRounds = pagesNeeded + 4;
      let lastSeenBatches = capturedInstructions.length;
      let stagnantRounds = 0;
      for (let round = 1; shouldScrollListTimeline({
        capturedBatches: capturedInstructions.length,
        targetBatches: pagesNeeded,
        stagnantRounds,
        round,
        maxRounds,
      }); round++) {
        process.stderr.write(
          `📜 已捕获 ${capturedInstructions.length}/${pagesNeeded} 批，继续向下滚动加载第 ${round + 1} 屏...\n`
        );
        await page.evaluate(() => window.scrollBy(0, 2500));
        await new Promise((r) => setTimeout(r, pageDelay * 1000));
        if (capturedInstructions.length === lastSeenBatches) {
          stagnantRounds++;
        } else {
          stagnantRounds = 0;
        }
        lastSeenBatches = capturedInstructions.length;
      }

      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      await crawlSession.close();
    }

    const contentTypes = resolveContentTypes(options);

    const seenIds = new Set<string>();
    const allTweets: Tweet[] = [];
    for (const instList of capturedInstructions) {
      const batch = parseTimelineInstructions(instList);
      for (const t of batch) {
        if (!seenIds.has(t.tweet_id)) {
          seenIds.add(t.tweet_id);
          if (matchesContentTypes(t, contentTypes)) {
            allTweets.push(t);
          }
        }
      }
    }

    return allTweets.slice(0, limit);
  }

  async fetchSearchTimeline(query: string, options?: FetchSearchOptions): Promise<Tweet[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在桌面端设置中点击「从 Chrome 读取登录态」，'
        + '或在 .env 中填写 X_AUTH_TOKEN。'
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
    const crawlSession = await this.openCrawlSession(timeoutMs);

    try {
      const page = crawlSession.page;

      page.on('response', async (res: InterceptedResponse) => {
        const url = res.url();
        const contentType = res.headers()['content-type'] || '';
        if (res.status() === 200 && contentType.includes('text/html') && url.includes('/search')) {
          try {
            const html = await res.text();
            for (const payload of extractSsrPayloadsFromHtml(html)) {
              const inst = extractTimelineInstructions(payload);
              if (inst.length > 0) capturedInstructions.push(inst);
            }
          } catch {
            // ignore
          }
          return;
        }
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
      await this.safeNavigate(page, targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

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
      await crawlSession.close();
    }

    const contentTypes = resolveContentTypes(options);

    const seenIds = new Set<string>();
    const allTweets: Tweet[] = [];
    for (const instList of capturedInstructions) {
      const batch = parseTimelineInstructions(instList);
      for (const t of batch) {
        if (!seenIds.has(t.tweet_id)) {
          seenIds.add(t.tweet_id);
          if (matchesContentTypes(t, contentTypes)) {
            allTweets.push(t);
          }
        }
      }
    }

    return allTweets.slice(0, limit);
  }

  async fetchTweetThread(
    tweetIdOrUrl: string,
    options?: { timeout?: number; fetchAuthorReplies?: boolean }
  ): Promise<Tweet[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在桌面端设置中点击「从 Chrome 读取登录态」，'
        + '或在 .env 中填写 X_AUTH_TOKEN。'
      );
    }

    const cleanId = extractTweetId(tweetIdOrUrl);
    if (!cleanId) {
      throw new Error(`无效的推文 ID 或 URL：'${tweetIdOrUrl}'。`);
    }
    const fullUrlMatch = tweetIdOrUrl.match(/https?:\/\/(?:x|twitter)\.com\/([^/?#]+)\/status(?:es)?\/(\d{5,})/i);
    const targetUrl = fullUrlMatch
      ? `https://x.com/${fullUrlMatch[1]}/status/${fullUrlMatch[2]}`
      : `https://x.com/i/status/${cleanId}`;
    const timeout = options?.timeout || this.timeoutSeconds;
    const timeoutMs = timeout * 1000;
    const shouldFetchReplies = options?.fetchAuthorReplies ?? Config.FETCH_AUTHOR_REPLIES;

    // 快车道：不需要追评时，优先通过纯 HTTP 直取 X 新版 SSR HTML（零弹窗、零浏览器、~1 秒完成）
    if (!shouldFetchReplies) {
      try {
        process.stderr.write(`⚡ 正在通过高速 SSR 通道同步推文 ${targetUrl}...\n`);
        const ssrResult = await fetchTweetThreadViaHttpSsr(targetUrl, cleanId, {
          timeoutMs: Math.min(timeoutMs, 20000),
        });
        if (ssrResult.length > 0 && ssrResult[0].tweet_id === cleanId) {
          return ssrResult;
        }
      } catch (err: any) {
        process.stderr.write(`ℹ️ 高速 SSR 通道未命中（${err?.message || err}），自动切换至后台隐藏会话...\n`);
      }
    }

    const collectExpectedArticleTweetIds = (rawResult: any, expectedSet: Set<string>) => {
      const inner =
        rawResult?.__typename === 'TweetWithVisibilityResults' ? rawResult.tweet : rawResult;
      const articleResult = inner?.article?.article_results?.result;
      const rawEntityMap =
        articleResult?.content_state?.entityMap ?? articleResult?.content_state?.entity_map;
      const entries = Array.isArray(rawEntityMap)
        ? rawEntityMap
        : rawEntityMap && typeof rawEntityMap === 'object'
          ? Object.values(rawEntityMap)
          : [];
      for (const e of entries as any[]) {
        const val = e?.value ?? e;
        const tid = val?.data?.tweetId ?? val?.data?.tweet_id;
        if (val?.type === 'TWEET' && tid) {
          expectedSet.add(String(tid));
        }
      }
    };

    const capturedTweets: Tweet[] = [];
    let rawMainTweetResult: any = null;
    const embeddedTweetsMap = new Map<string, Tweet>();
    const expectedArticleTweetIds = new Set<string>();
    const crawlSession = await this.openCrawlSession(timeoutMs);

    try {
      const page = crawlSession.page;

      page.on('response', async (res: InterceptedResponse) => {
        const url = res.url();
        const status = res.status();
        const contentType = res.headers()['content-type'] || '';

        // A. X 新版前端 x-web (TanStack Router SSR) 首屏 HTML 内联载荷
        if (status === 200 && contentType.includes('text/html') && url.includes(`/status/${cleanId}`)) {
          try {
            const html = await res.text();
            const ssrPayloads = extractSsrTweetPayloadsFromHtml(html);
            for (const [restId, rawMerged] of ssrPayloads.entries()) {
              if (restId === cleanId) {
                rawMainTweetResult = rawMainTweetResult
                  ? mergeRawTweetPayload(rawMainTweetResult, rawMerged, cleanId)
                  : rawMerged;
                collectExpectedArticleTweetIds(rawMainTweetResult, expectedArticleTweetIds);
                const parsedMain = parseTweetResult(rawMainTweetResult, embeddedTweetsMap);
                if (parsedMain && parsedMain.tweet_id) {
                  capturedTweets.push(parsedMain);
                }
              } else {
                const parsedEmbedded = parseTweetResult(rawMerged);
                if (parsedEmbedded && parsedEmbedded.tweet_id) {
                  embeddedTweetsMap.set(parsedEmbedded.tweet_id, parsedEmbedded);
                  capturedTweets.push(parsedEmbedded);
                }
              }
            }
          } catch {
            // ignore SSR parse errors
          }
          return;
        }

        // B. 经典 /graphql/ 网络流拦截
        if (
          url.includes('/graphql/') &&
          (url.includes('TweetDetail') || url.includes('TweetResult') || url.includes('TweetResultsByRestIds')) &&
          status === 200
        ) {
          try {
            const data = await res.json();

            // 1. TweetResultsByRestIds (数组形态：Article 内嵌推文卡片批量查询)
            if (url.includes('TweetResultsByRestIds') || Array.isArray(data?.data?.tweetResult)) {
              const batchTweets = parseTweetResultsByRestIds(data);
              for (const bt of batchTweets) {
                if (bt && bt.tweet_id) {
                  embeddedTweetsMap.set(bt.tweet_id, bt);
                  capturedTweets.push(bt);
                }
              }
            }

            // 2. 单篇主推文或结果（兼容 tweetResult 与 tweet_result_by_rest_id）
            const singleWrapper = data?.data?.tweetResult || data?.data?.tweet_result_by_rest_id;
            if (singleWrapper?.result) {
              const rawResult = singleWrapper.result;
              const fallbackId = singleWrapper.rest_id ? String(singleWrapper.rest_id) : undefined;
              const normalizedRaw = mergeRawTweetPayload(null, rawResult, fallbackId);
              const t = parseTweetResult(normalizedRaw);
              if (t && t.tweet_id) {
                if (t.tweet_id === cleanId) {
                  rawMainTweetResult = rawMainTweetResult
                    ? mergeRawTweetPayload(rawMainTweetResult, normalizedRaw, cleanId)
                    : normalizedRaw;
                  collectExpectedArticleTweetIds(rawMainTweetResult, expectedArticleTweetIds);
                }
                capturedTweets.push(t);
              }
            }

            // 3. 时间线指令 (包含追评及对话流)
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

      process.stderr.write(`🌐 正在后台加载推文页面 ${targetUrl} 并获取内容...\n`);
      await this.safeNavigate(page, targetUrl, { waitUntil: 'commit', timeout: timeoutMs, retries: 2 });

      let mainCapturedAt = -1;
      for (let i = 0; i < Math.max(30, timeout); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (capturedTweets.length > 0) {
          const hasMain = capturedTweets.some((t) => t.tweet_id === cleanId);
          if (hasMain) {
            if (mainCapturedAt < 0) mainCapturedAt = i;
            const waitElapsed = i - mainCapturedAt;
            // 若主推文为包含内嵌推文的 Article，最多留 6 秒等待所有 TweetResultsByRestIds 补齐
            if (
              expectedArticleTweetIds.size > 0 &&
              embeddedTweetsMap.size < expectedArticleTweetIds.size &&
              waitElapsed < 6
            ) {
              if (waitElapsed === 2 || waitElapsed === 4) {
                await page.evaluate(() => window.scrollBy(0, 1200)).catch(() => {});
              }
              continue;
            }
            if (!shouldFetchReplies) {
              await new Promise((r) => setTimeout(r, 1000));
              break;
            } else if (shouldFetchReplies) {
              await new Promise((r) => setTimeout(r, 2000));
              break;
            }
          }
        }
      }
    } finally {
      await crawlSession.close();
    }

    // 若存在合并后的原始主推文（尤其是含内嵌推文或 SSR 分片合并的 Article），用最终合并体重新解析
    if (rawMainTweetResult) {
      const enrichedMain = parseTweetResult(rawMainTweetResult, embeddedTweetsMap);
      if (enrichedMain && enrichedMain.tweet_id) {
        const idx = capturedTweets.findIndex((t) => t.tweet_id === cleanId);
        if (idx >= 0) {
          capturedTweets[idx] = enrichedMain;
        } else {
          capturedTweets.unshift(enrichedMain);
        }
      }
    }

    const seenIds = new Set<string>();
    const uniqueTweets: Tweet[] = [];
    for (const t of capturedTweets) {
      if (!seenIds.has(t.tweet_id)) {
        seenIds.add(t.tweet_id);
        uniqueTweets.push(t);
      }
    }

    const mainTweet = uniqueTweets.find((t) => t.tweet_id === cleanId);
    if (!mainTweet) {
      return uniqueTweets.filter((t) => t.tweet_id === cleanId);
    }

    // 默认或显式关闭追评时：返回主推文 + 内嵌推文卡片（排除评论区路人/追评）
    // 这样 pipeline 可以将内嵌推文一并存入本地数据库，且主推文排在首位
    if (!shouldFetchReplies) {
      const result: Tweet[] = [mainTweet];
      for (const t of uniqueTweets) {
        if (t.tweet_id !== cleanId && embeddedTweetsMap.has(t.tweet_id)) {
          result.push(t);
        }
      }
      return result;
    }

    // 显式开启追评时：保留主推文、内嵌推文以及该推文作者本人的追加回复
    return uniqueTweets.filter(
      (t) =>
        t.tweet_id === cleanId ||
        t.author_username === mainTweet.author_username ||
        embeddedTweetsMap.has(t.tweet_id)
    );
  }

  async fetchExploreTrends(options?: {
    category?: string;
    top?: number;
    timeout?: number;
  }): Promise<TrendTopic[]> {
    if (!Config.hasXCredentials()) {
      throw new Error(
        '未配置认证信息：请在桌面端设置中点击「从 Chrome 读取登录态」，'
        + '或在 .env 中填写 X_AUTH_TOKEN。'
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
    const crawlSession = await this.openCrawlSession(timeoutMs);

    try {
      const page = crawlSession.page;

      page.on('response', async (res: InterceptedResponse) => {
        const url = res.url();
        const contentType = res.headers()['content-type'] || '';
        if (res.status() === 200 && contentType.includes('text/html') && url.includes('/explore')) {
          try {
            const html = await res.text();
            for (const payload of extractSsrPayloadsFromHtml(html)) {
              if (payload?.data?.explore_page || payload?.data?.timeline) {
                interceptedPayloads.push(payload);
              }
            }
          } catch {
            // ignore
          }
          return;
        }
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
      await this.safeNavigate(page, targetUrl, { waitUntil: 'commit', timeout: Math.min(timeoutMs, 25000) });

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
            let name: string;
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
      await crawlSession.close();
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
