/**
 * macOS Chrome cookie 定位、解密与清洗（纯逻辑层）
 *
 * 契约见 openspec/changes/2026-10-01-chrome-credential-import/design.md。
 * 本文件不得引入 Playwright 或任何浏览器依赖——解密与清洗必须可独立单测。
 *
 * 所有结论均由 scratch/ 下的探针实跑验证，未经验证的假设不写入此处。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/** Chrome 加密值的版本前缀 */
const VALUE_PREFIXES = ['v10', 'v11', 'v20'];

/** AES-128-CBC 固定 IV：16 个空格 */
const AES_IV = Buffer.alloc(16, 0x20);

/** 明文布局候选偏移：旧版 [32B domain][value]，新版多 32B SHA256(domain) */
const LAYOUT_SKIPS = [32, 64];

/**
 * Keychain 中 Chrome 密钥的 service 名。
 * 注意：必须以 -s 参数指定；写成位置参数会被 security 当作「空 service」而查不到。
 */
export const CHROME_KEYCHAIN_SERVICE = 'Chrome Safe Storage';

/** Chrome 浏览器数据根目录 */
export function chromeBaseDir(): string {
  return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
}

/** 枚举可能存有 cookie 的 profile（Default 与 Profile N） */
export function listChromeProfiles(baseDir: string = chromeBaseDir()): string[] {
  if (!fs.existsSync(baseDir)) return [];
  try {
    return fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && (d.name === 'Default' || d.name.startsWith('Profile')))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/** 解析 profile 下的 cookie 库路径，兼容不同 Chrome 版本的两种存储位置 */
export function parseCookieDbPath(profileDir: string): string | null {
  for (const rel of ['Cookies', 'Network/Cookies']) {
    const p = path.join(profileDir, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * 从 Keychain 密码派生 Chrome 加密密钥。
 * Chrome 使用 PBKDF2-SHA1，salt="saltysalt"，迭代 **1003** 次（历史值 1000 已废弃）。
 */
export function deriveChromeKey(keychainPassword: string): Buffer {
  return crypto.pbkdf2Sync(keychainPassword, 'saltysalt', 1003, 16, 'sha1');
}

/** 按指定偏移解密单个 cookie 值 */
export function decryptCookieValue(key: Buffer, encrypted: Buffer, skip: number): string | null {
  if (encrypted.length < 4) return null;
  const prefix = encrypted.subarray(0, 3).toString('utf8');
  if (!VALUE_PREFIXES.includes(prefix)) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, AES_IV);
    const plain = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
    if (plain.length <= skip) return null;
    return plain.subarray(skip).toString('utf8');
  } catch {
    return null;
  }
}

/** 解出的值是否「干净」：前缀不含控制字符、不含 Unicode 替换字符 U+FFFD */
function looksClean(value: string): boolean {
  const head = value.slice(0, 64);
  for (let i = 0; i < head.length; i++) {
    const code = head.charCodeAt(i);
    const isControl = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    if (isControl || code === 0xfffd) return false;
  }
  return true;
}

/**
 * 自动选择明文布局偏移并解密。
 * Chrome 各版本布局不同且无法可靠通过版本号判断，故在 32/64 两个候选中择优。
 */
export function decryptCookieValueAuto(key: Buffer, encrypted: Buffer): string | null {
  let fallback: string | null = null;
  for (const skip of LAYOUT_SKIPS) {
    const value = decryptCookieValue(key, encrypted, skip);
    if (value === null) continue;
    if (looksClean(value)) return value;
    if (fallback === null) fallback = value;
  }
  return fallback;
}

/** 期望为纯 hex 的 cookie，清洗时按 hex 前缀裁剪 */
const HEX_COOKIES = ['auth_token', 'ct0', 'kdt'];

/**
 * 清洗解密结果：
 * 1. 截断到首个 NUL 字节（尾部对齐 padding）
 * 2. 对已知 hex 型 cookie，裁剪到首个非 hex 字符
 */
export function sanitizeCookieValue(name: string, raw: string): string {
  let value = raw;
  const nul = value.indexOf('\u0000');
  if (nul > 0) value = value.slice(0, nul);
  if (HEX_COOKIES.includes(name)) {
    const m = value.match(/^[0-9a-fA-F]+/);
    if (m) value = m[0];
  }
  return value;
}

/**
 * 校验 auth_token 是否可用：必须是 hex 串且长度在合理区间。
 * 畸形 token 绝不能写入配置，否则会得到一个静默失效的登录态。
 */
export function isValidAuthToken(value: string | undefined | null): boolean {
  if (!value) return false;
  if (value.length < 20 || value.length > 128) return false;
  return /^[0-9a-fA-F]+$/.test(value);
}

/**
 * 过期时间换算 SQL 片段。
 *
 * ★ 两个必须避开的陷阱：
 *   1. expires_utc 是 **微秒**，除以 1000 会得到 1.3e13 的荒谬时间戳（公元 42 万年），
 *      Playwright 会直接抛 `Cookie should have a valid expires`；
 *   2. expires_utc 约 1.3e16，**超出 JS 安全整数上限**（2^53 ≈ 9.0e15），
 *      在 JS 侧做算术会静默精度丢失。必须在 SQL 侧完成换算。
 */
export const EXPIRES_UNIX_SQL = `
  CASE WHEN is_persistent = 1 AND expires_utc > 0
       THEN expires_utc / 1000000 - 11644473600
       ELSE 0 END AS expires_unix
`;

/** 只读 x.com / twitter.com 域，其余域不进入内存 */
export const X_DOMAIN_FILTER_SQL = `host_key LIKE '%x.com%' OR host_key LIKE '%twitter%'`;
