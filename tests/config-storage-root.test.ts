import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { Config } from '../src/main/config.js';
import { Storage } from '../src/main/storage/index.js';

describe('Configurable Storage Root & Fixed Subdirectories (TDD)', () => {
  const originalEnv = { ...process.env };
  const testRoot = path.join(os.tmpdir(), `xtract_test_root_${Date.now()}`);

  beforeEach(() => {
    delete process.env.XTRACT_STORAGE_ROOT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('1. Default storage root should be ~/Documents/Xtract with fixed data/, articles/ and reports/ subdirs', () => {
    const expectedRoot = path.join(os.homedir(), 'Documents', 'Xtract');
    expect(Config.STORAGE_ROOT).toBe(expectedRoot);
    expect(Config.DATA_DIR).toBe(path.join(expectedRoot, 'data'));
    expect(Config.ARTICLES_DIR).toBe(path.join(expectedRoot, 'articles'));
    expect(Config.REPORTS_DIR).toBe(path.join(expectedRoot, 'reports'));
    expect(Config.CONFIG_ENV_PATH).toBe(path.join(expectedRoot, 'config.env'));
    expect(Config.DB_PATH).toBe(path.join(expectedRoot, 'data', 'tweets.db'));
    expect(Config.AUTH_STATE_PATH).toBe(path.join(expectedRoot, 'data', 'auth_state.json'));
  });

  it('2. Custom XTRACT_STORAGE_ROOT environment variable should redirect all subpaths dynamically', () => {
    process.env.XTRACT_STORAGE_ROOT = testRoot;
    expect(Config.STORAGE_ROOT).toBe(testRoot);
    expect(Config.DATA_DIR).toBe(path.join(testRoot, 'data'));
    expect(Config.ARTICLES_DIR).toBe(path.join(testRoot, 'articles'));
    expect(Config.REPORTS_DIR).toBe(path.join(testRoot, 'reports'));
    expect(Config.CONFIG_ENV_PATH).toBe(path.join(testRoot, 'config.env'));
    expect(Config.DB_PATH).toBe(path.join(testRoot, 'data', 'tweets.db'));
  });

  it('3. Tilde prefix (~) in XTRACT_STORAGE_ROOT should expand to os.homedir()', () => {
    process.env.XTRACT_STORAGE_ROOT = '~/CustomXtractData';
    const expected = path.join(os.homedir(), 'CustomXtractData');
    expect(Config.STORAGE_ROOT).toBe(expected);
    expect(Config.DATA_DIR).toBe(path.join(expected, 'data'));
    expect(Config.ARTICLES_DIR).toBe(path.join(expected, 'articles'));
    expect(Config.REPORTS_DIR).toBe(path.join(expected, 'reports'));
    expect(Config.CONFIG_ENV_PATH).toBe(path.join(expected, 'config.env'));
  });

  it('4. Storage instance should default to Config.DB_PATH and Config.ARTICLES_DIR', async () => {
    process.env.XTRACT_STORAGE_ROOT = testRoot;
    const storage = new Storage();
    expect(storage.dbPath).toBe(path.join(testRoot, 'data', 'tweets.db'));
    expect(storage.baseOutputDir).toBe(path.join(testRoot, 'articles'));

    // Insert a dummy tweet and export single markdown
    storage.saveTweets([
      {
        tweet_id: '9901',
        author_name: 'Test Author',
        author_username: 'test_user',
        text: 'Testing storage root export directory structure',
        created_at: new Date().toISOString(),
      },
    ]);

    const { filePath } = await storage.exportSingleTweetMarkdown('9901', { downloadImages: false });
    const expectedFile = path.join(testRoot, 'articles', 'test_user', '9901', 'index.md');
    expect(filePath).toBe(expectedFile);
    expect(fs.existsSync(expectedFile)).toBe(true);

    // Windows 强制文件锁：不关闭 SQLite 句柄会导致 afterEach 清理目录 EPERM
    storage.close();
  });

  it('5. Persistent config.env should be saved to <storageRoot>/config.env and loaded into process.env', () => {
    process.env.XTRACT_STORAGE_ROOT = testRoot;
    Config.ensureDirectories();

    const configPath = Config.CONFIG_ENV_PATH;
    expect(configPath).toBe(path.join(testRoot, 'config.env'));

    // Save persistent configurations
    Config.savePersistentConfig({
      GEMINI_API_KEY: 'test-key-tdd-12345',
      LLM_PROVIDER: 'deepseek',
      HTTP_PROXY: 'http://127.0.0.1:9999',
    });

    expect(fs.existsSync(configPath)).toBe(true);
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('GEMINI_API_KEY=test-key-tdd-12345');
    expect(content).toContain('LLM_PROVIDER=deepseek');
    expect(content).toContain('HTTP_PROXY=http://127.0.0.1:9999');

    // Simulate clean environment and load persistent config
    delete process.env.GEMINI_API_KEY;
    delete process.env.HTTP_PROXY;
    process.env.LLM_PROVIDER = 'gemini';

    Config.loadPersistentConfig();

    expect(process.env.GEMINI_API_KEY).toBe('test-key-tdd-12345');
    expect(process.env.LLM_PROVIDER).toBe('deepseek');
    expect(process.env.HTTP_PROXY).toBe('http://127.0.0.1:9999');
  });
});
