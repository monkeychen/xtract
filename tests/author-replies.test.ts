import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Config } from '../src/main/config.js';
import { Storage } from '../src/main/storage/index.js';
import { Pipeline } from '../src/main/pipeline/index.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Author Replies Fetch & Filter Control (§Spec config-fetch-author-replies)', () => {
  const originalEnv = process.env.FETCH_AUTHOR_REPLIES;
  let storage: Storage;

  beforeEach(() => {
    delete process.env.FETCH_AUTHOR_REPLIES;
    storage = new Storage();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.FETCH_AUTHOR_REPLIES = originalEnv;
    } else {
      delete process.env.FETCH_AUTHOR_REPLIES;
    }
  });

  it('1. Config.FETCH_AUTHOR_REPLIES should be false by default and respect env var', () => {
    expect(Config.FETCH_AUTHOR_REPLIES).toBe(false);

    process.env.FETCH_AUTHOR_REPLIES = 'true';
    expect(Config.FETCH_AUTHOR_REPLIES).toBe(true);

    process.env.FETCH_AUTHOR_REPLIES = 'false';
    expect(Config.FETCH_AUTHOR_REPLIES).toBe(false);
  });

  it('2. Pipeline.fetchTweetAndStore should pass fetchAuthorReplies option to client', async () => {
    const mockClient: any = {
      fetchTweetThread: vi.fn().mockResolvedValue([
        {
          tweet_id: '12345678',
          author_username: 'test_author',
          author_name: 'Test Author',
          text: 'Main tweet content',
          created_at: '2026-09-30T10:00:00Z',
          like_count: 10,
          retweet_count: 5,
        },
      ]),
    };

    const pipeline = new Pipeline(storage, mockClient);

    // Call with explicit option fetchAuthorReplies: false
    await pipeline.fetchTweetAndStore('12345678', { fetchAuthorReplies: false });
    expect(mockClient.fetchTweetThread).toHaveBeenCalledWith('12345678', {
      timeout: undefined,
      fetchAuthorReplies: false,
    });

    // Call with explicit option fetchAuthorReplies: true
    await pipeline.fetchTweetAndStore('12345678', { fetchAuthorReplies: true });
    expect(mockClient.fetchTweetThread).toHaveBeenCalledWith('12345678', {
      timeout: undefined,
      fetchAuthorReplies: true,
    });
  });

  it('3. exportSingleTweetMarkdown should render clean single tweet without ### 篇章 1 when replies off', async () => {
    const mainTweetId = '9990001';
    const mainTweet = {
      tweet_id: mainTweetId,
      author_username: 'sol_dev',
      author_name: 'Sol Dev',
      text: 'This is the main standalone tweet body.',
      created_at: '2026-09-30T12:00:00Z',
      like_count: 100,
      retweet_count: 20,
      reply_count: 5,
      view_count: 1000,
    };

    storage.saveTweets([mainTweet], 'search');

    const tmpOut = path.join(Config.PROJECT_ROOT, 'data', 'test_out');
    const { filePath } = await storage.exportSingleTweetMarkdown(mainTweetId, {
      outputPath: tmpOut,
      downloadImages: false,
      fetchAuthorReplies: false,
    });

    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Should NOT contain '### 篇章 1' when only exporting single tweet
    expect(content).not.toContain('### 篇章 1');
    expect(content).toContain('This is the main standalone tweet body.');
    expect(content).toContain('@sol_dev');

    // Clean up
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
});
