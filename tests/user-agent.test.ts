import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 禁止硬编码浏览器 User-Agent（回归护栏）
 *
 * 背景：Xtraxt 曾在 5 处把 UA 硬编码为 `Chrome/133.0.0.0`，而实际运行的
 * 系统 Chrome 是 154.x。Playwright 启动的是真实浏览器，TLS 握手携带的是
 * 真实版本的指纹，但 HTTP 头却声称是另一个版本——这个自相矛盾的信号让 X
 * 在建立会话阶段（用户尚未输入任何凭据）就返回「我们已临时限制你的登录」。
 *
 * 正确做法：Playwright 自己知道真实浏览器 UA，不要覆盖；
 * 底层 HTTP 客户端若需要浏览器语义 UA，也不得写死版本号。
 */

const SRC_ROOT = path.resolve('src');

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const sourceFiles = collectSourceFiles(SRC_ROOT);

describe('禁止硬编码浏览器 User-Agent（反爬指纹一致性）', () => {
  it('should find source files to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  it('MUST NOT hardcode a Chrome version number in a User-Agent string', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const src = fs.readFileSync(file, 'utf8');
      // 匹配形如 "Chrome/133.0.0.0" 的版本化 UA 片段
      const matches = src.match(/Chrome\/\d+[\d.]*/g);
      if (matches) {
        offenders.push(`${path.relative(process.cwd(), file)}: ${[...new Set(matches)].join(', ')}`);
      }
    }

    expect(
      offenders,
      `检测到硬编码的浏览器版本号。真实浏览器的 TLS 指纹与 HTTP 头中的 UA 必须一致，\n` +
        `覆盖 UA 会让二者矛盾并被反爬系统判定为伪装。请删除 userAgent 覆盖，\n` +
        `让 Playwright 继承真实浏览器的 UA。\n\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('MUST NOT pass a userAgent option to Playwright launch or context creation', () => {
    // Playwright 启动真实浏览器时会自动使用与该浏览器版本一致的 UA，
    // 任何显式覆盖都只会制造指纹矛盾。
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      if (!file.endsWith('.ts')) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (!/playwright/i.test(src) && !src.includes('XClient')) continue;
      if (/userAgent\s*[:=]/.test(src)) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(
      offenders,
      `以下文件向 Playwright 传入了 userAgent，应改为继承真实浏览器 UA：\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('should not hardcode a versioned UA in undici/fetch headers either', () => {
    const storagePath = path.resolve('src/main/storage/index.ts');
    const src = fs.readFileSync(storagePath, 'utf8');
    const uaHeader = src.match(/'User-Agent':\s*'([^']+)'/);
    expect(uaHeader, "storage 下载图片时仍硬编码了 UA header").toBeNull();
  });
});
