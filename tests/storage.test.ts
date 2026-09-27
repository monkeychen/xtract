import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Storage } from '../src/main/storage/index.js';
import type { Tweet } from '../src/main/types.js';

describe('Storage Module (100% Python Parity)', () => {
  let tmpDir: string;
  let dbPath: string;
  let storage: Storage;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xtract-test-storage-'));
    dbPath = path.join(tmpDir, 'test_tweets.db');
    storage = new Storage(dbPath);
  });

  afterEach(() => {
    storage.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('test_storage_init_and_deduplication (1:1 mirror of Python test)', () => {
    const sampleTweets: Partial<Tweet>[] = [
      {
        tweet_id: '1001',
        author_id: 'user1',
        author_name: 'Alice',
        author_username: 'alice',
        text: 'Hello world from Alice',
        created_at: '2026-09-10T08:00:00Z',
        is_retweet: false,
        is_quote: false,
        like_count: 10,
        retweet_count: 2,
        reply_count: 1,
        view_count: 100,
        urls: ['https://example.com/a'],
        media_urls: [],
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
        is_quote: false,
        like_count: 5,
        retweet_count: 0,
        reply_count: 0,
        view_count: 50,
        urls: [],
        media_urls: ['https://example.com/img.jpg'],
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
        author_id: 'user3',
        author_name: 'David',
        author_username: 'david',
        text: 'New tweet from David',
        created_at: '2026-09-10T09:00:00Z',
      },
    ];

    const res2 = storage.saveTweets(newBatch);
    expect(res2.inserted).toBe(1);
    expect(res2.skipped).toBe(1);
    expect(storage.getTotalCount()).toBe(3);

    // Query unsummarized tweets (recent 24h)
    const recent = storage.getUnsummarizedTweets({ hours: 24 });
    expect(recent.length).toBe(3);
    const ids = recent.map((t) => t.tweet_id);
    expect(ids).toContain('1001');
    expect(ids).toContain('1002');
    expect(ids).toContain('1003');

    // Test get_recent_tweets with limit
    const paged = storage.getRecentTweets({ limit: 2 });
    expect(paged.length).toBe(2);

    // Test engagement filtering (min_likes & min_retweets)
    const highLikeTweets = storage.getRecentTweets({ minLikes: 8 });
    expect(highLikeTweets.length).toBe(1);
    expect(highLikeTweets[0].tweet_id).toBe('1001');

    const highRtTweets = storage.getRecentTweets({ minRetweets: 1 });
    expect(highRtTweets.length).toBe(1);
    expect(highRtTweets[0].tweet_id).toBe('1001');

    const unsummarizedFiltered = storage.getUnsummarizedTweets({ hours: 24, minLikes: 8 });
    expect(unsummarizedFiltered.length).toBe(1);
    expect(unsummarizedFiltered[0].tweet_id).toBe('1001');

    // Test get_tweet_by_id
    const t = storage.getTweetById('1001');
    expect(t).not.toBeNull();
    expect(t?.author_name).toBe('Alice');
    expect(storage.getTweetById('non_existent')).toBeNull();

    // Test get_tweets_by_user
    const aliceTweets = storage.getTweetsByUser('alice');
    expect(aliceTweets.length).toBe(1);
    expect(aliceTweets[0].author_username).toBe('alice');

    // Case-insensitive and leading @ symbol handling
    const aliceTweetsAt = storage.getTweetsByUser('@ALICE');
    expect(aliceTweetsAt.length).toBe(1);
    expect(aliceTweetsAt[0].tweet_id).toBe('1001');

    const nonUserTweets = storage.getTweetsByUser('unknown_user');
    expect(nonUserTweets.length).toBe(0);

    // Test export_markdown
    const outFile = path.join(tmpDir, 'test_export.md');
    const exportedPath = storage.exportMarkdown({ outputFile: outFile });
    expect(fs.existsSync(exportedPath)).toBe(true);
    const content = fs.readFileSync(exportedPath, 'utf-8');
    expect(content).toContain('Alice');
    expect(content).toContain('1001');

    // Test export_single_tweet_markdown without downloading images
    const singleMdPath = path.join(tmpDir, 'single.md');
    return storage
      .exportSingleTweetMarkdown('1002', {
        outputPath: singleMdPath,
        downloadImages: false,
      })
      .then(({ filePath, downloadedImagesCount }) => {
        expect(fs.existsSync(filePath)).toBe(true);
        expect(downloadedImagesCount).toBe(0);
        const singleContent = fs.readFileSync(filePath, 'utf-8');
        expect(singleContent).toContain('Bob');
        expect(singleContent).toContain('1002');
        expect(singleContent).toContain('转推自 @charlie');
        expect(singleContent).toContain('https://example.com/img.jpg');

        // Test export_single_tweet_markdown with pre-existing local image in images subdirectory
        const subImgDir = path.join(tmpDir, 'images');
        fs.mkdirSync(subImgDir, { recursive: true });
        const localImg = path.join(subImgDir, '1_img.jpg');
        fs.writeFileSync(localImg, 'mock_image_bytes');

        const singleMd2Path = path.join(tmpDir, 'single2.md');
        return storage
          .exportSingleTweetMarkdown('1002', {
            outputPath: singleMd2Path,
            downloadImages: true,
          })
          .then(({ filePath: filePath2, downloadedImagesCount: dlCount2 }) => {
            expect(fs.existsSync(filePath2)).toBe(true);
            expect(dlCount2).toBe(1);
            const singleContent2 = fs.readFileSync(filePath2, 'utf-8');
            expect(singleContent2).toContain('images/1_img.jpg');

            // Test default Scheme B Page Bundle path: output/{author}/{tweet_id}/index.md
            return storage
              .exportSingleTweetMarkdown('1002', { downloadImages: false })
              .then(({ filePath: bundlePath }) => {
                expect(fs.existsSync(bundlePath)).toBe(true);
                expect(path.basename(bundlePath)).toBe('index.md');
                expect(path.basename(path.dirname(bundlePath))).toBe('1002');
                expect(path.basename(path.dirname(path.dirname(bundlePath)))).toBe('bob');
              });
          });
      });
  });
});
