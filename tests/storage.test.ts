import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Storage } from '../src/main/storage/index.js';
import type { Tweet } from '../src/main/types.js';

describe('Storage Module (better-sqlite3)', () => {
  let tmpDir: string;
  let dbPath: string;
  let storage: Storage;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xtract-test-'));
    dbPath = path.join(tmpDir, 'test_tweets.db');
    storage = new Storage(dbPath);
  });

  afterEach(() => {
    storage.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should initialize and deduplicate tweets by tweet_id', () => {
    const sampleTweets: Partial<Tweet>[] = [
      {
        tweet_id: '1001',
        author_id: 'user1',
        author_name: 'Alice',
        author_username: 'alice',
        text: 'Hello world from Alice',
        created_at: '2026-09-10T08:00:00Z',
        like_count: 10,
        retweet_count: 2,
        urls: ['https://example.com/a'],
      },
      {
        tweet_id: '1002',
        author_id: 'user2',
        author_name: 'Bob',
        author_username: 'bob',
        text: 'Hello world from Bob',
        created_at: '2026-09-10T08:30:00Z',
        is_retweet: true,
        retweeted_author: 'charlie',
        retweeted_text: 'Original tweet from Charlie',
        like_count: 5,
        retweet_count: 0,
      },
    ];

    // First insert: 2 inserted, 0 skipped
    const res1 = storage.saveTweets(sampleTweets);
    expect(res1.inserted).toBe(2);
    expect(res1.skipped).toBe(0);
    expect(storage.getTotalCount()).toBe(2);

    // Second insert with 1 duplicate and 1 new
    const newBatch: Partial<Tweet>[] = [
      sampleTweets[0],
      {
        tweet_id: '1003',
        author_name: 'David',
        author_username: 'david',
        text: 'New tweet from David',
      },
    ];

    const res2 = storage.saveTweets(newBatch);
    expect(res2.inserted).toBe(1);
    expect(res2.skipped).toBe(1);
    expect(storage.getTotalCount()).toBe(3);
  });

  it('should query recent tweets and respect engagement filters', () => {
    storage.saveTweets([
      {
        tweet_id: '1',
        author_name: 'Tech',
        author_username: 'tech',
        text: 'Low engagement',
        like_count: 5,
        retweet_count: 1,
      },
      {
        tweet_id: '2',
        author_name: 'Tech',
        author_username: 'tech',
        text: 'High engagement',
        like_count: 100,
        retweet_count: 50,
      },
    ]);

    const all = storage.getRecentTweets();
    expect(all.length).toBe(2);

    const filtered = storage.getRecentTweets({ minLikes: 50 });
    expect(filtered.length).toBe(1);
    expect(filtered[0].tweet_id).toBe('2');

    const byUser = storage.getTweetsByUser('@TECH');
    expect(byUser.length).toBe(2);
  });

  it('should export stored tweets to Markdown document', () => {
    storage.saveTweets([
      {
        tweet_id: '999',
        author_name: 'Sam',
        author_username: 'sama',
        text: 'Shipping models.',
        like_count: 9999,
        urls: ['https://openai.com'],
      },
    ]);

    const mdPath = path.join(tmpDir, 'export.md');
    const exportedFile = storage.exportMarkdown({ outputFile: mdPath });
    expect(fs.existsSync(exportedFile)).toBe(true);

    const content = fs.readFileSync(exportedFile, 'utf-8');
    expect(content).toContain('Sam (@sama)');
    expect(content).toContain('Shipping models.');
    expect(content).toContain('https://openai.com');
  });
});
