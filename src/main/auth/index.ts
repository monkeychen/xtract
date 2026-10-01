/**
 * 编排层：从用户日常浏览器读取既有 X 登录态，注入项目持久化 profile。
 *
 * 设计约束见 openspec/changes/2026-10-01-chrome-credential-import/design.md。
 *
 * 为什么不做自动化登录：X 对空白 profile 的登录动作持续限流（scratch 探针 1 已实跑
 * 验证）。登录动作必须由用户在真实浏览器中完成，本模块只负责「读取既有会话」。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';
import { Config } from '../config.js';
import {
  CHROME_KEYCHAIN_SERVICE,
  EXPIRES_UNIX_SQL,
  X_DOMAIN_FILTER_SQL,
  chromeBaseDir,
  decryptCookieValueAuto,
  deriveChromeKey,
  isValidAuthToken,
  listChromeProfiles,
  parseCookieDbPath,
  sanitizeCookieValue,
} from './chrome-cookie.js';

export interface BrowserImportResult {
  success: boolean;
  /** 导入的 cookie 数量（不含明文） */
  importedCount?: number;
  /** 账号名（若有） */
  account?: string;
  /** 失败或提示信息（面向用户的中文） */
  message?: string;
}

interface XCookie {
  name: string;
  value: string;
  domain: string;
  expires?: number;
}

/** Chrome 刷盘是异步的：注入后需留出时间让 cookie 写入磁盘 */
const FLUSH_WAIT_MS = 3000;
/** 注入后等待 Chrome 自身落盘 cookie 的时间 */
const INJECT_FLUSH_MS = 2500;

function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * 从 Keychain 读取 Chrome Safe Storage 密码并派生密钥。
 * ★ service 名必须用 -s 指定；写成位置参数会搜到「空 service」而报找不到。
 */
function readChromeKey(): Buffer | null {
  try {
    const password = execFileSync(
      '/usr/bin/security',
      ['find-generic-password', '-s', CHROME_KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8' }
    ).trim();
    if (!password) return null;
    return deriveChromeKey(password);
  } catch {
    return null;
  }
}

/**
 * 读取所有 profile 中 x.com 域的 cookie 并解密。
 * 隐私边界：SQL 层即限定域名；cookie 库以只读副本访问，读完立即删除副本。
 */
function collectXCookies(key: Buffer): { cookies: XCookie[]; hasAuthToken: boolean } {
  const base = chromeBaseDir();
  const collected: XCookie[] = [];
  let hasAuthToken = false;
  const nowSec = Date.now() / 1000;

  for (const profile of listChromeProfiles(base)) {
    const dbPath = parseCookieDbPath(path.join(base, profile));
    if (!dbPath) continue;

    // 只读副本：Chrome 运行时数据库被锁，且绝不能触碰用户原文件
    const tmp = path.join(os.tmpdir(), `xtract_cookie_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    try {
      fs.copyFileSync(dbPath, tmp);
    } catch {
      continue;
    }

    try {
      const db = new Database(tmp, { readonly: true });
      const rows = db
        .prepare(
          `SELECT name, host_key, encrypted_value, ${EXPIRES_UNIX_SQL}
           FROM cookies
           WHERE (${X_DOMAIN_FILTER_SQL})
             AND encrypted_value IS NOT NULL
             AND length(encrypted_value) > 3`
        )
        .all() as any[];
      db.close();

      for (const row of rows) {
        const plain = decryptCookieValueAuto(key, row.encrypted_value as Buffer);
        if (plain === null) continue;
        const value = sanitizeCookieValue(row.name, plain);
        if (!value) continue;

        if (row.name === 'auth_token' && isValidAuthToken(value)) {
          hasAuthToken = true;
        }

        // 过期时间换算已在 SQL 侧完成（expires_utc 是微秒且超出 JS 安全整数范围）
        const expiresUnix = Number(row.expires_unix || 0);
        collected.push({
          name: row.name,
          value,
          domain: row.host_key,
          expires: expiresUnix > nowSec ? expiresUnix : undefined,
        });
      }
    } catch {
      // 单个 profile 不可读时跳过，不影响其余
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* 临时文件删除失败不影响主流程 */
      }
    }
  }

  // 同名 cookie 保留后写入的一条（Chrome 为 .x.com 与 x.com 分别存储）
  const dedup = new Map<string, XCookie>();
  for (const c of collected) dedup.set(`${c.domain}|${c.name}`, c);

  return { cookies: [...dedup.values()], hasAuthToken };
}

/** 注入 cookie 并验证登录态是否真的可用 */
async function injectAndVerify(cookies: XCookie[]): Promise<{ ok: boolean; account?: string; reason?: string }> {
  Config.ensureDirs();
  const profileDir = Config.BROWSER_PROFILE_DIR;
  fs.mkdirSync(profileDir, { recursive: true });

  const proxy = Config.HTTP_PROXY ? { server: Config.HTTP_PROXY } : undefined;

  // ★ 必须 headful：headless 会被 Cloudflare 拦截（scratch 探针 4 实测）
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    proxy,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-infobars'],
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });

  try {
    await context.addInitScript('Object.defineProperty(navigator, "webdriver", { get: () => undefined });');
    await context.addCookies(
      cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: '/',
        // 不传 expires 会被当作 session cookie，浏览器一关即失效
        ...(c.expires ? { expires: c.expires } : {}),
      }))
    );

    const page = context.pages()[0] || (await context.newPage());
    const response = await page
      .goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 45_000 })
      .catch(() => null);

    if (!response) return { ok: false, reason: '无法访问 x.com，请检查网络代理是否正常' };
    if (response.status() !== 200) {
      return { ok: false, reason: `访问 x.com 返回 HTTP ${response.status()}` };
    }

    // 等待 SPA 渲染，再判断是否真的处于登录态
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const state = await page
        .evaluate(() => {
          const txt = document.body?.innerText || '';
          return {
            limited: /temporarily limited|已临时限制|rate limit|too many/i.test(txt),
            hasLoginCta: !!document.querySelector('a[href="/login"], a[href="/i/flow/login"]'),
            hasShell: !!document.querySelector('[data-testid="primaryColumn"]'),
          };
        })
        .catch(() => null);
      if (!state) continue;
      if (state.limited) return { ok: false, reason: '触发了 X 的风控限流，请稍后重试' };
      if (state.hasLoginCta) return { ok: false, reason: '登录态未生效' };
      if (state.hasShell) {
        const account = await page
          .evaluate(() => {
            const el = document.querySelector('[data-testid="UserName"]');
            return el ? (el.textContent || '').trim() : undefined;
          })
          .catch(() => undefined);
        return { ok: true, account: account ? `@${account}` : undefined };
      }
    }
    return { ok: false, reason: '页面未能在预期时间内加载完成' };
  } finally {
    // 给 Chrome 刷盘时间，让注入的 cookie 真正落盘
    await new Promise((r) => setTimeout(r, INJECT_FLUSH_MS));
    await context.close().catch(() => {});
    await new Promise((r) => setTimeout(r, FLUSH_WAIT_MS));
  }
}

/**
 * 从浏览器导入 X 登录态。
 * 全程只返回计数与账号名，绝不回传任何 cookie 明文。
 */
export async function importXCredentialsFromBrowser(): Promise<BrowserImportResult> {
  if (!isMacOS()) {
    return { success: false, message: '当前平台暂不支持自动读取，请使用下方的手工填入通道。' };
  }

  const base = chromeBaseDir();
  if (!fs.existsSync(base)) {
    return { success: false, message: '未检测到 Chrome 浏览器，请使用手工填入通道。' };
  }

  const key = readChromeKey();
  if (!key) {
    return {
      success: false,
      message: '无法读取系统钥匙串中的 Chrome 密钥。请在弹出的授权框中点「允许」后重试。',
    };
  }

  const { cookies, hasAuthToken } = collectXCookies(key);
  if (cookies.length === 0) {
    return { success: false, message: '未能读取到 Chrome 的 cookie 数据，请确认已使用 Chrome 访问过 x.com。' };
  }
  if (!hasAuthToken) {
    return {
      success: false,
      message: 'Chrome 中没有检测到 x.com 的登录态。请先在 Chrome 中登录 x.com，然后再点击此处。',
    };
  }

  let verified: { ok: boolean; account?: string; reason?: string };
  try {
    verified = await injectAndVerify(cookies);
  } catch (err: any) {
    return { success: false, message: `注入登录态失败：${err?.message || String(err)}` };
  }

  if (!verified.ok) {
    return {
      success: false,
      message: `${verified.reason || '登录态未生效'}。若浏览器中曾主动退出或更改过密码，请重新登录 Chrome 后再试。`,
    };
  }

  // 验证通过后才同步写入配置，保证 config.env 与手工通道字段一致
  const authToken = cookies.find((c) => c.name === 'auth_token');
  const ct0 = cookies.find((c) => c.name === 'ct0');
  if (authToken) {
    Config.savePersistentConfig({
      X_AUTH_TOKEN: authToken.value,
      ...(ct0 ? { X_CT0: ct0.value } : {}),
    });
    process.env.X_AUTH_TOKEN = authToken.value;
    if (ct0) process.env.X_CT0 = ct0.value;
  }

  return {
    success: true,
    importedCount: cookies.length,
    account: verified.account,
    message: `已从浏览器导入 ${cookies.length} 项会话数据，登录态验证通过。`,
  };
}
