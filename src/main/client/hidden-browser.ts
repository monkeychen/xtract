import fs from 'node:fs';
import { Config } from '../config.js';

export interface InterceptedResponse {
  url: () => string;
  status: () => number;
  headers: () => Record<string, string>;
  text: () => Promise<string>;
  json: () => Promise<any>;
}

export interface CrawlPage {
  on: (event: 'response', listener: (res: InterceptedResponse) => void | Promise<void>) => void;
  goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<void>;
  url: () => string;
  title: () => Promise<string>;
  evaluate: <T = any>(fnOrExpr: (() => T) | string) => Promise<T>;
  waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<void>;
}

export interface CrawlSession {
  page: CrawlPage;
  getCookies: () => Promise<Array<{ name: string; value: string }>>;
  close: () => Promise<void>;
}

export function isElectronRuntime(): boolean {
  return Boolean((process as any).versions?.electron);
}

/**
 * 组装发往 x.com 的 Cookie 请求头：优先读取持久化 auth_state.json 中的 .x.com Cookie，
 * 并确保 config.env / .env 中的 auth_token 与 ct0 始终生效。
 */
export function buildXCookieHeader(): string {
  const cookieMap = new Map<string, string>();
  try {
    if (fs.existsSync(Config.AUTH_STATE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(Config.AUTH_STATE_PATH, 'utf-8'));
      for (const c of raw?.cookies || []) {
        if (
          c?.name &&
          c?.value &&
          typeof c.domain === 'string' &&
          (c.domain.includes('x.com') || c.domain.includes('twitter.com'))
        ) {
          cookieMap.set(c.name, String(c.value));
        }
      }
    }
  } catch {
    // ignore malformed storageState
  }

  if (Config.X_AUTH_TOKEN) cookieMap.set('auth_token', Config.X_AUTH_TOKEN);
  if (Config.X_CT0) cookieMap.set('ct0', Config.X_CT0);

  return Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * 使用 Electron 内置隐藏窗口（BrowserWindow show: false）与 CDP Network 监听器建立零弹窗抓取会话。
 * - 真正单运行时：复用应用自身 Chromium，不拉起外部 HeadlessChrome，完全隐藏无弹窗；
 * - 使用 Electron 原生正常浏览器环境，规避 x-web 拒绝 HeadlessChrome (HTTP 403)。
 */
export async function openElectronHiddenSession(timeoutMs: number): Promise<CrawlSession> {
  const electron = await import('electron');
  const { app, BrowserWindow, session } = electron;

  if (app && typeof app.isReady === 'function' && !app.isReady()) {
    await app.whenReady();
  }

  const partition = `xtract-crawl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ses = session.fromPartition(partition);

  if (Config.HTTP_PROXY) {
    await ses.setProxy({ proxyRules: Config.HTTP_PROXY });
  }

  // 注入 X 会话 Cookie（优先读取完整 storageState，再用 config.env 的 auth_token / ct0 覆盖确保最新）
  const cookiesToSet: Array<{ name: string; value: string; domain?: string; path?: string }> = [];
  try {
    if (fs.existsSync(Config.AUTH_STATE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(Config.AUTH_STATE_PATH, 'utf-8'));
      for (const c of raw?.cookies || []) {
        if (c?.name && c?.value && typeof c.domain === 'string' && c.domain.includes('x.com')) {
          cookiesToSet.push({
            name: String(c.name),
            value: String(c.value),
            domain: c.domain,
            path: c.path || '/',
          });
        }
      }
    }
  } catch {
    // ignore
  }

  if (Config.X_AUTH_TOKEN) {
    cookiesToSet.push({ name: 'auth_token', value: Config.X_AUTH_TOKEN, domain: '.x.com', path: '/' });
  }
  if (Config.X_CT0) {
    cookiesToSet.push({ name: 'ct0', value: Config.X_CT0, domain: '.x.com', path: '/' });
  }

  for (const c of cookiesToSet) {
    try {
      await ses.cookies.set({
        url: 'https://x.com',
        name: c.name,
        value: c.value,
        domain: c.domain || '.x.com',
        path: c.path || '/',
        secure: true,
      });
    } catch {
      // ignore individual cookie failure
    }
  }

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // 静音，防止自动播放视频发出声音
  win.webContents.setAudioMuted(true);

  await win.loadURL('about:blank');

  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Network.enable');

  const listeners: Array<(res: InterceptedResponse) => void | Promise<void>> = [];
  const pendingRequests = new Map<
    string,
    { url: string; status: number; headers: Record<string, string>; type: string }
  >();
  let closed = false;

  dbg.on('message', (_ev: any, method: string, params: any) => {
    if (closed) return;
    if (method === 'Network.responseReceived') {
      const reqId = String(params?.requestId || '');
      const resp = params?.response;
      const type = String(params?.type || '');
      if (!reqId || !resp?.url) return;

      // 仅追踪 XHR / Fetch / Document（过滤图片、字体、媒体流与 CORS OPTIONS 预检）
      if (type !== 'XHR' && type !== 'Fetch' && type !== 'Document') return;

      const rawHeaders = resp.headers || {};
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawHeaders)) {
        headers[k.toLowerCase()] = String(v);
      }

      pendingRequests.set(reqId, {
        url: String(resp.url),
        status: Number(resp.status || 0),
        headers,
        type,
      });
    } else if (method === 'Network.loadingFinished') {
      const reqId = String(params?.requestId || '');
      const meta = pendingRequests.get(reqId);
      if (!meta) return;
      pendingRequests.delete(reqId);

      // 仅对 GraphQL API 或 x.com 页面 HTML 触发回调
      const isGql = meta.url.includes('/graphql/');
      const isDoc = meta.type === 'Document' && meta.url.includes('x.com/');
      if (!isGql && !isDoc) return;

      let cachedBodyPromise: Promise<string> | null = null;
      const readBody = (): Promise<string> => {
        if (!cachedBodyPromise) {
          cachedBodyPromise = (async () => {
            if (closed || win.isDestroyed()) return '';
            const res = await dbg.sendCommand('Network.getResponseBody', { requestId: reqId });
            return res.base64Encoded
              ? Buffer.from(res.body, 'base64').toString('utf8')
              : String(res.body || '');
          })();
        }
        return cachedBodyPromise;
      };

      const intercepted: InterceptedResponse = {
        url: () => meta.url,
        status: () => meta.status,
        headers: () => meta.headers,
        text: readBody,
        json: async () => JSON.parse(await readBody()),
      };

      for (const listener of listeners) {
        try {
          Promise.resolve(listener(intercepted)).catch(() => {});
        } catch {
          // ignore listener errors
        }
      }
    } else if (method === 'Network.loadingFailed') {
      const reqId = String(params?.requestId || '');
      pendingRequests.delete(reqId);
    }
  });

  const page: CrawlPage = {
    on: (_event, listener) => {
      listeners.push(listener);
    },
    goto: async (url, options) => {
      const navTimeout = options?.timeout || timeoutMs || 25000;
      await new Promise<void>((resolve, reject) => {
        if (closed || win.isDestroyed()) {
          reject(new Error('隐藏抓取窗口已关闭'));
          return;
        }
        let settled = false;
        const cleanup = () => {
          clearTimeout(timer);
          if (!win.isDestroyed()) {
            win.webContents.removeListener('did-navigate', onDone);
            win.webContents.removeListener('dom-ready', onDone);
            win.webContents.removeListener('did-finish-load', onDone);
            win.webContents.removeListener('did-fail-load', onFail);
          }
        };
        const finishOk = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };
        const onDone = () => finishOk();
        const onFail = (_e: any, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
          // 忽略子框架失败或重定向引起的 ERR_ABORTED (-3)
          if (!isMainFrame || errorCode === -3) return;
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(`page.goto: ${errorDescription} (${errorCode}) at ${validatedURL || url}`));
        };
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(`page.goto: net::ERR_TIMED_OUT at ${url}`));
        }, navTimeout);

        const waitUntil = options?.waitUntil || 'commit';
        if (waitUntil === 'commit') {
          win.webContents.once('did-navigate', onDone);
        } else if (waitUntil === 'domcontentloaded') {
          win.webContents.once('dom-ready', onDone);
        } else {
          win.webContents.once('did-finish-load', onDone);
        }
        win.webContents.on('did-fail-load', onFail);

        win.loadURL(url).catch((err: any) => {
          const msg = String(err?.message || err);
          if (msg.includes('ERR_ABORTED')) return;
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        });
      });
    },
    url: () => (win.isDestroyed() ? '' : win.webContents.getURL()),
    title: async () => (win.isDestroyed() ? '' : win.getTitle()),
    evaluate: async <T = any>(fnOrExpr: (() => T) | string): Promise<T> => {
      if (closed || win.isDestroyed()) {
        throw new Error('隐藏抓取窗口已关闭');
      }
      const code =
        typeof fnOrExpr === 'function' ? `(${fnOrExpr.toString()})()` : fnOrExpr;
      return (await win.webContents.executeJavaScript(code, true)) as T;
    },
    waitForSelector: async (selector: string, options?: { timeout?: number }) => {
      const limitMs = options?.timeout ?? 10000;
      const deadline = Date.now() + limitMs;
      const serialized = JSON.stringify(selector);
      while (Date.now() < deadline) {
        if (closed || win.isDestroyed()) return;
        const found = await win.webContents
          .executeJavaScript(`Boolean(document.querySelector(${serialized}))`, true)
          .catch(() => false);
        if (found) return;
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`waitForSelector timeout: ${selector}`);
    },
  };

  return {
    page,
    getCookies: async () => {
      const list = await ses.cookies.get({ domain: 'x.com' });
      return list.map((c: any) => ({ name: String(c.name), value: String(c.value) }));
    },
    close: async () => {
      if (closed) return;
      closed = true;
      pendingRequests.clear();
      listeners.length = 0;
      try {
        if (!win.isDestroyed()) {
          if (win.webContents.debugger.isAttached()) {
            win.webContents.debugger.detach();
          }
          win.destroy();
        }
      } catch {
        // ignore cleanup errors
      }
    },
  };
}
