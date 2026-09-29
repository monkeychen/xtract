import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Storage } from '../src/main/storage/index.js';
import type { Tweet } from '../src/main/types.js';

describe('Storage Module', () => {
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

  it('test_storage_init_and_deduplication', () => {
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

  it('test_storage_upgrade_and_article_markdown_export', async () => {
    const upgradeTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xtract-upgrade-test-'));
    const upgradeDb = path.join(upgradeTmpDir, 'upgrade_test.db');
    const upgradeStorage = new Storage(upgradeDb);

    try {
      // 1. Initial insert with truncated short link (as fetched from timeline)
      const truncatedTweet = {
        tweet_id: '2094624092015992854',
        author_id: 'u_dotey',
        author_name: '宝玉',
        author_username: 'dotey',
        text: 'https://t.co/w9w8G0m6Fv',
        created_at: 'Tue Sep 01 03:11:14 +0000 2026',
        media_urls: [],
        urls: ['https://t.co/w9w8G0m6Fv'],
        like_count: 100,
      };
      upgradeStorage.saveTweets([truncatedTweet]);
      const tBefore = upgradeStorage.getTweetById('2094624092015992854');
      expect(tBefore?.text.length).toBe(23);

      // 2. Upgrade insert with full X Article content and images
      const fullArticleTweet = {
        tweet_id: '2094624092015992854',
        author_id: 'u_dotey',
        author_name: '宝玉',
        author_username: 'dotey',
        text: '# 腾讯学堂：AI 原生思维\n\n![封面图](https://pbs.twimg.com/media/cover.jpg)\n\n## 一、找需求\n\n完整万字正文内容...',
        created_at: 'Tue Sep 01 03:11:14 +0000 2026',
        media_urls: ['https://pbs.twimg.com/media/cover.jpg'],
        urls: ['https://x.com/i/article/2094620108811390976'],
        like_count: 1090,
        retweet_count: 221,
      };
      upgradeStorage.saveTweets([fullArticleTweet]);
      const tAfter = upgradeStorage.getTweetById('2094624092015992854');
      expect(tAfter?.text).toContain('腾讯学堂：AI 原生思维');
      expect(tAfter?.text.length).toBeGreaterThan(50);
      expect(tAfter?.like_count).toBe(1090);

      // 3. Export markdown with pre-existing local image to check path substitution
      const imgDir = path.join(upgradeTmpDir, 'images');
      fs.mkdirSync(imgDir, { recursive: true });
      const localCover = path.join(imgDir, '1_cover.jpg');
      fs.writeFileSync(localCover, 'cover_bytes');

      const outMdPath = path.join(upgradeTmpDir, 'article.md');
      const { filePath: exportedPath } = await upgradeStorage.exportSingleTweetMarkdown(
        '2094624092015992854',
        {
          outputPath: outMdPath,
          downloadImages: true,
        }
      );
      expect(fs.existsSync(exportedPath)).toBe(true);
      const mdText = fs.readFileSync(exportedPath, 'utf-8');
      expect(mdText).toContain('images/1_cover.jpg');
      // Inlined image should be replaced in place and not duplicated under 附图
      expect(mdText).not.toContain('### 🖼️ 附图');
    } finally {
      upgradeStorage.close();
      fs.rmSync(upgradeTmpDir, { recursive: true, force: true });
    }
  });

  it('test_storage_delete_tweets (cascade file cleanup and multi-condition filtering)', async () => {
    const delTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xtract-del-test-'));
    const delOutputDir = path.join(delTmpDir, 'output');
    const delDb = path.join(delTmpDir, 'del_test.db');
    const delStorage = new Storage(delDb, delOutputDir);

    try {
      // 1. Insert test tweets:
      // Tweet 1: user 'alice', 40 days old
      // Tweet 2: user 'alice', 5 days old
      // Tweet 3: user 'bob', 2 days old
      const now = Date.now();
      const d40 = new Date(now - 40 * 24 * 3600 * 1000).toISOString();
      const d5 = new Date(now - 5 * 24 * 3600 * 1000).toISOString();
      const d2 = new Date(now - 2 * 24 * 3600 * 1000).toISOString();

      delStorage.saveTweets([
        {
          tweet_id: '101',
          author_name: 'Alice',
          author_username: 'alice',
          text: 'Alice tweet 1 (40d ago)',
          created_at: d40,
        },
        {
          tweet_id: '102',
          author_name: 'Alice',
          author_username: 'alice',
          text: 'Alice tweet 2 (5d ago)',
          created_at: d5,
        },
        {
          tweet_id: '103',
          author_name: 'Bob',
          author_username: 'bob',
          text: 'Bob tweet (2d ago)',
          created_at: d2,
        },
      ]);

      expect(delStorage.getTotalCount()).toBe(3);

      // Create page bundle files for all 3 tweets
      await delStorage.exportSingleTweetMarkdown('101', { downloadImages: false });
      await delStorage.exportSingleTweetMarkdown('102', { downloadImages: false });
      await delStorage.exportSingleTweetMarkdown('103', { downloadImages: false });

      const alice101Dir = path.join(delOutputDir, 'alice', '101');
      const alice102Dir = path.join(delOutputDir, 'alice', '102');
      const bob103Dir = path.join(delOutputDir, 'bob', '103');

      expect(fs.existsSync(path.join(alice101Dir, 'index.md'))).toBe(true);
      expect(fs.existsSync(path.join(alice102Dir, 'index.md'))).toBe(true);
      expect(fs.existsSync(path.join(bob103Dir, 'index.md'))).toBe(true);

      // 2. Test safety: error when no condition is provided
      await expect(delStorage.deleteTweets({})).rejects.toThrow('至少一个筛选条件');

      // 3. Test dry-run on older-than 30d
      const dryRes = await delStorage.deleteTweets({ olderThan: '30d', dryRun: true });
      expect(dryRes.matchedCount).toBe(1);
      expect(dryRes.deletedCount).toBe(0);
      expect(dryRes.dryRun).toBe(true);
      expect(dryRes.deletedDirs).toContain(alice101Dir);
      // Ensure file and DB row still exist after dry-run
      expect(fs.existsSync(alice101Dir)).toBe(true);
      expect(delStorage.getTotalCount()).toBe(3);

      // 4. Test actual deletion with older-than 30d (should delete tweet 101)
      const realRes = await delStorage.deleteTweets({ olderThan: '30d' });
      expect(realRes.matchedCount).toBe(1);
      expect(realRes.deletedCount).toBe(1);
      expect(fs.existsSync(alice101Dir)).toBe(false);
      expect(delStorage.getTweetById('101')).toBeNull();
      expect(delStorage.getTotalCount()).toBe(2);
      // Alice still has tweet 102, so alice directory still exists
      expect(fs.existsSync(path.join(delOutputDir, 'alice'))).toBe(true);

      // 5. Test deletion by single tweet ID (tweet 102)
      const del102Res = await delStorage.deleteTweets({ tweetId: '102' });
      expect(del102Res.deletedCount).toBe(1);
      expect(fs.existsSync(alice102Dir)).toBe(false);
      expect(delStorage.getTweetById('102')).toBeNull();
      // Alice has no more tweets, so author directory should be pruned
      expect(fs.existsSync(path.join(delOutputDir, 'alice'))).toBe(false);
      expect(delStorage.getTotalCount()).toBe(1);

      // 6. Test deletion by username (bob) with @ symbol
      const delBobRes = await delStorage.deleteTweets({ username: '@BOB' });
      expect(delBobRes.deletedCount).toBe(1);
      expect(fs.existsSync(bob103Dir)).toBe(false);
      expect(fs.existsSync(path.join(delOutputDir, 'bob'))).toBe(false);
      expect(delStorage.getTotalCount()).toBe(0);
    } finally {
      delStorage.close();
      fs.rmSync(delTmpDir, { recursive: true, force: true });
    }
  });

  it('test_source_type_first_crawl_invariance_and_multi_source_queries', async () => {
    // 1. First crawl via 'following'
    const tweet1: Partial<Tweet> = {
      tweet_id: '9001',
      author_name: 'Alpha',
      author_username: 'alpha',
      text: 'Alpha tweet about AI',
      created_at: '2026-09-20T10:00:00Z',
      like_count: 100,
    };
    const res1 = storage.saveTweets([tweet1], 'following');
    expect(res1.inserted).toBe(1);
    expect(res1.skipped).toBe(0);

    const saved1 = storage.getTweetById('9001');
    expect(saved1?.source_type).toBe('following');

    // 2. Second crawl for the same tweet via 'search' -> must be ignored / skipped without tampering source_type
    const res2 = storage.saveTweets([tweet1], 'search');
    expect(res2.inserted).toBe(0);
    expect(res2.skipped).toBe(1);

    const saved2 = storage.getTweetById('9001');
    expect(saved2?.source_type).toBe('following'); // Invariance preserved!

    // 3. Insert other tweets with different source_types and timestamps
    const tweet2: Partial<Tweet> = {
      tweet_id: '9002',
      author_name: 'Beta',
      author_username: 'beta',
      text: 'Beta search result tweet',
      created_at: '2026-09-21T12:00:00Z',
      like_count: 50,
    };
    const tweet3: Partial<Tweet> = {
      tweet_id: '9003',
      author_name: 'Charlie',
      author_username: 'charlie',
      text: 'Charlie blogger tweet',
      created_at: '2026-09-22T14:00:00Z',
      like_count: 250,
    };
    storage.saveTweets([tweet2], 'search');
    storage.saveTweets([tweet3], 'user');

    // 4. Test multi-source isolated querying & reverse-chronological order (created_at DESC)
    const followingList = storage.queryTweets({ sourceType: 'following' });
    expect(followingList.length).toBe(1);
    expect(followingList[0].tweet_id).toBe('9001');

    const searchList = storage.queryTweets({ sourceType: 'search' });
    expect(searchList.length).toBe(1);
    expect(searchList[0].tweet_id).toBe('9002');

    const userList = storage.queryTweets({ sourceType: 'user' });
    expect(userList.length).toBe(1);
    expect(userList[0].tweet_id).toBe('9003');

    // 5. Test countTweets across filters
    expect(storage.countTweets({ sourceType: 'following' })).toBe(1);
    expect(storage.countTweets({ sourceType: 'search' })).toBe(1);
    expect(storage.countTweets({ sourceType: 'user' })).toBe(1);
    expect(storage.countTweets({ minLikes: 200 })).toBe(1);
    expect(storage.countTweets({})).toBe(3);

    // 6. Test batch cascade deletion by tweetIds
    await storage.exportSingleTweetMarkdown('9001', { downloadImages: false });
    await storage.exportSingleTweetMarkdown('9002', { downloadImages: false });

    const batchDelRes = await storage.deleteTweets({ tweetIds: ['9001', '9002'] });
    expect(batchDelRes.deletedCount).toBe(2);
    expect(storage.getTweetById('9001')).toBeNull();
    expect(storage.getTweetById('9002')).toBeNull();
    expect(storage.getTweetById('9003')).not.toBeNull();
    expect(storage.countTweets({})).toBe(1);
  });
});

