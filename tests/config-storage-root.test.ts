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

  it('1. Default storage root should be ~/Documents/Xtract with fixed data/ and articles/ subdirs', () => {
    const expectedRoot = path.join(os.homedir(), 'Documents', 'Xtract');
    expect(Config.STORAGE_ROOT).toBe(expectedRoot);
    expect(Config.DATA_DIR).toBe(path.join(expectedRoot, 'data'));
    expect(Config.ARTICLES_DIR).toBe(path.join(expectedRoot, 'articles'));
    expect(Config.DB_PATH).toBe(path.join(expectedRoot, 'data', 'tweets.db'));
    expect(Config.AUTH_STATE_PATH).toBe(path.join(expectedRoot, 'data', 'auth_state.json'));
    expect(Config.REPORTS_DIR).toBe(path.join(expectedRoot, 'articles', 'reports'));
  });

  it('2. Custom XTRACT_STORAGE_ROOT environment variable should redirect all subpaths dynamically', () => {
    process.env.XTRACT_STORAGE_ROOT = testRoot;
    expect(Config.STORAGE_ROOT).toBe(testRoot);
    expect(Config.DATA_DIR).toBe(path.join(testRoot, 'data'));
    expect(Config.ARTICLES_DIR).toBe(path.join(testRoot, 'articles'));
    expect(Config.DB_PATH).toBe(path.join(testRoot, 'data', 'tweets.db'));
    expect(Config.REPORTS_DIR).toBe(path.join(testRoot, 'articles', 'reports'));
  });

  it('3. Tilde prefix (~) in XTRACT_STORAGE_ROOT should expand to os.homedir()', () => {
    process.env.XTRACT_STORAGE_ROOT = '~/CustomXtractData';
    const expected = path.join(os.homedir(), 'CustomXtractData');
    expect(Config.STORAGE_ROOT).toBe(expected);
    expect(Config.DATA_DIR).toBe(path.join(expected, 'data'));
    expect(Config.ARTICLES_DIR).toBe(path.join(expected, 'articles'));
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
  });
});
