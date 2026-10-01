import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Config } from '../src/main/config.js';

/**
 * savePersistentConfig 的去重契约
 *
 * 踩坑记录：原实现用 `^KEY=` 匹配，只能命中原有**未注释**的行。当配置里
 * 只有 `#X_AUTH_TOKEN=` 这类被注释的占位行时，正则不命中，于是走「追加」
 * 分支，结果同一份 config.env 里同时存在注释行与新行。dotenv 解析时行为
 * 依赖实现细节，属于典型的静默隐患。
 */
describe('savePersistentConfig 写入去重', () => {
  let testRoot: string;
  const originalRoot = process.env.XTRACT_STORAGE_ROOT;

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xtract_cfg_'));
    process.env.XTRACT_STORAGE_ROOT = testRoot;
    Config.ensureDirectories();
  });

  afterEach(() => {
    if (originalRoot === undefined) delete process.env.XTRACT_STORAGE_ROOT;
    else process.env.XTRACT_STORAGE_ROOT = originalRoot;
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  const read = () => fs.readFileSync(Config.CONFIG_ENV_PATH, 'utf-8');

  it('should create the file with the key when it does not exist', () => {
    Config.savePersistentConfig({ X_AUTH_TOKEN: 'abc123' });
    expect(read().trim()).toBe('X_AUTH_TOKEN=abc123');
  });

  it('should replace an existing uncommented value in place', () => {
    fs.writeFileSync(Config.CONFIG_ENV_PATH, 'X_AUTH_TOKEN=old\nHTTP_PROXY=http://p\n');
    Config.savePersistentConfig({ X_AUTH_TOKEN: 'new' });
    const content = read();
    expect(content).toContain('X_AUTH_TOKEN=new');
    expect(content).not.toContain('X_AUTH_TOKEN=old');
    expect(content).toContain('HTTP_PROXY=http://p');
  });

  it('MUST NOT leave a stale commented line alongside the newly written key', () => {
    fs.writeFileSync(Config.CONFIG_ENV_PATH, '#X_AUTH_TOKEN=placeholder\n#X_CT0=placeholder\n');
    Config.savePersistentConfig({ X_AUTH_TOKEN: 'fresh', X_CT0: 'freshct0' });

    const lines = read().split('\n').map((l) => l.trim()).filter(Boolean);
    const authLines = lines.filter((l) => l.startsWith('X_AUTH_TOKEN=') || l.startsWith('#X_AUTH_TOKEN='));
    const ct0Lines = lines.filter((l) => l.startsWith('X_CT0=') || l.startsWith('#X_CT0='));

    expect(authLines).toEqual(['X_AUTH_TOKEN=fresh']);
    expect(ct0Lines).toEqual(['X_CT0=freshct0']);
  });

  it('should collapse repeated writes into a single line', () => {
    Config.savePersistentConfig({ X_AUTH_TOKEN: 'first' });
    Config.savePersistentConfig({ X_AUTH_TOKEN: 'second' });
    Config.savePersistentConfig({ X_AUTH_TOKEN: 'third' });
    const lines = read().split('\n').map((l) => l.trim()).filter(Boolean);
    expect(lines.filter((l) => l.includes('X_AUTH_TOKEN'))).toEqual(['X_AUTH_TOKEN=third']);
  });

  it('should preserve unrelated keys and comments', () => {
    fs.writeFileSync(
      Config.CONFIG_ENV_PATH,
      '# 注释行\nLLM_PROVIDER=gemini\n#X_AUTH_TOKEN=old\nHTTP_PROXY=http://p\n'
    );
    Config.savePersistentConfig({ X_AUTH_TOKEN: 'new' });
    const content = read();
    expect(content).toContain('# 注释行');
    expect(content).toContain('LLM_PROVIDER=gemini');
    expect(content).toContain('HTTP_PROXY=http://p');
  });

  it('should keep values that contain regex-significant characters intact', () => {
    Config.savePersistentConfig({ X_AUTH_TOKEN: 'a.b*c+d' });
    expect(read()).toContain('X_AUTH_TOKEN=a.b*c+d');
  });
});
