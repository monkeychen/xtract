import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isTweetWithinHours, Pipeline, Summarizer } from '../src/main/pipeline/index.js';
import { Storage } from '../src/main/storage/index.js';
import type { BaseLLMProvider } from '../src/main/llm/index.js';
import type { Tweet } from '../src/main/types.js';

describe('Pipeline and Summarizer Modules', () => {
  it('correctly validates tweet timestamp freshness with isTweetWithinHours', () => {
    const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toUTCString(); // 2 hours ago
    const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toUTCString(); // 72 hours ago

    const recentTweet: Tweet = {
      tweet_id: '1',
      author_name: 'Test',
      author_username: 'test',
      text: 'fresh',
      created_at: recentDate,
      like_count: 10,
      retweet_count: 5,
    };

    const oldTweet: Tweet = {
      tweet_id: '2',
      author_name: 'Test',
      author_username: 'test',
      text: 'stale',
      created_at: oldDate,
      like_count: 100,
      retweet_count: 50,
    };

    expect(isTweetWithinHours(recentTweet, 24)).toBe(true);
    expect(isTweetWithinHours(oldTweet, 24)).toBe(false);
    expect(isTweetWithinHours(oldTweet, 96)).toBe(true);
  });

  it('Summarizer refines search queries using mocked LLM response', async () => {
    const mockLLM: BaseLLMProvider = {
      providerName: 'MockLLM',
      modelName: 'mock-model',
      defaultModel: 'mock-model',
      generate: vi.fn().mockResolvedValue(`\`\`\`json
{
  "Anthropic Claude 3.7 Sonnet Released": "Claude 3.7 Sonnet",
  "NVIDIA Q4 Earnings Beat Expectations": "NVIDIA Q4 earnings"
}
\`\`\``),
    };

    const summarizer = new Summarizer({ llmInstance: mockLLM });
    const refined = await summarizer.refineSearchQueries([
      'Anthropic Claude 3.7 Sonnet Released',
      'NVIDIA Q4 Earnings Beat Expectations',
      'Unchanged Topic',
    ]);

    expect(refined['Anthropic Claude 3.7 Sonnet Released']).toBe('Claude 3.7 Sonnet');
    expect(refined['NVIDIA Q4 Earnings Beat Expectations']).toBe('NVIDIA Q4 earnings');
    expect(refined['Unchanged Topic']).toBe('Unchanged Topic');
  });

  it('Summarizer formats tweets and triggers report generation', async () => {
    let capturedPrompt = '';
    const mockLLM: BaseLLMProvider = {
      providerName: 'MockLLM',
      modelName: 'mock-model',
      defaultModel: 'mock-model',
      generate: vi.fn().mockImplementation(async (prompt, options) => {
        capturedPrompt = `${options?.systemPrompt}\n\n${prompt}`;
        return '# Mock Daily Report';
      }),
    };

    const summarizer = new Summarizer({ llmInstance: mockLLM });
    const tweets: Tweet[] = [
      {
        tweet_id: '1001',
        author_name: 'Sam',
        author_username: 'sama',
        text: 'New breakthrough announced today.',
        created_at: '2026-03-27T08:00:00Z',
        like_count: 5000,
        retweet_count: 800,
      },
    ];

    const report = await summarizer.summarize(tweets, '2026-03-27');
    expect(report).toBe('# Mock Daily Report');
    expect(capturedPrompt).toContain('Sam (@sama)');
    expect(capturedPrompt).toContain('❤️ 5000');
    expect(capturedPrompt).toContain('New breakthrough announced today.');
  });

  it('Pipeline filters tweets by engagement threshold in fetchSearchAndStore', async () => {
    const tmpDb = path.join(os.tmpdir(), `test_pipe_${Date.now()}.db`);
    const storage = new Storage(tmpDb);

    const mockTweets: Tweet[] = [
      {
        tweet_id: 't1',
        author_name: 'A',
        author_username: 'a',
        text: 'Low likes',
        created_at: '2026-03-27T00:00:00Z',
        like_count: 5,
        retweet_count: 0,
      },
      {
        tweet_id: 't2',
        author_name: 'B',
        author_username: 'b',
        text: 'High likes',
        created_at: '2026-03-27T00:00:00Z',
        like_count: 100,
        retweet_count: 20,
      },
    ];

    const mockClient: any = {
      fetchSearchTimeline: vi.fn().mockResolvedValue(mockTweets),
    };

    const pipeline = new Pipeline(storage, mockClient);
    const results = await pipeline.fetchSearchAndStore('AI', {
      minLikes: 50,
      minRetweets: 10,
    });

    expect(results.tweets.length).toBe(1);
    expect(results.tweets[0].tweet_id).toBe('t2');

    // Clean up
    storage.close();
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  });

  it('Pipeline fetchAndStore passes limit and default contentTypes (article) correctly to client', async () => {
    const tmpDb = path.join(os.tmpdir(), `test_pipe_limit_${Date.now()}.db`);
    const storage = new Storage(tmpDb);

    const mockTweets: Tweet[] = Array.from({ length: 20 }, (_, i) => ({
      tweet_id: `f_${i}`,
      author_name: `User ${i}`,
      author_username: `user_${i}`,
      text: `# Article ${i}\n\nLong article body.`,
      created_at: new Date().toISOString(),
      like_count: 10,
      retweet_count: 1,
      is_article: true,
    }));

    const mockClient: any = {
      fetchFollowingTimeline: vi.fn().mockResolvedValue(mockTweets),
    };

    const origContentTypes = process.env.FETCH_CONTENT_TYPES;
    const origOnlyLong = process.env.ONLY_LONG_TWEETS;
    delete process.env.FETCH_CONTENT_TYPES;
    delete process.env.ONLY_LONG_TWEETS;

    try {
      const pipeline = new Pipeline(storage, mockClient);
      const [fetched, inserted] = await pipeline.fetchAndStore({ limit: 20, maxPages: 1 });

      expect(mockClient.fetchFollowingTimeline).toHaveBeenCalledWith({
        maxPages: 1,
        limit: 20,
        contentTypes: ['article'],
        timeout: undefined,
      });
      expect(fetched).toBe(20);
      expect(inserted).toBe(20);
    } finally {
      if (origContentTypes === undefined) delete process.env.FETCH_CONTENT_TYPES;
      else process.env.FETCH_CONTENT_TYPES = origContentTypes;
      if (origOnlyLong === undefined) delete process.env.ONLY_LONG_TWEETS;
      else process.env.ONLY_LONG_TWEETS = origOnlyLong;
      storage.close();
      if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
    }
  });

  it('UT-5: Pipeline filters four batch sources by FETCH_CONTENT_TYPES (default article only)', async () => {
    const orig = process.env.FETCH_CONTENT_TYPES;
    delete process.env.FETCH_CONTENT_TYPES;

    const tmpDb = path.join(os.tmpdir(), `test_pipe_ct_${Date.now()}.db`);
    const storage = new Storage(tmpDb);

    const mixedTweets: Tweet[] = [
      {
        tweet_id: 'art_1',
        author_name: 'Author',
        author_username: 'author',
        text: '# Deep Dive Article\n\nContent',
        created_at: '2026-11-23T08:00:00Z',
        like_count: 50,
        retweet_count: 10,
        is_article: true,
      },
      {
        tweet_id: 'note_1',
        author_name: 'Author',
        author_username: 'author',
        text: 'Long note tweet content. '.repeat(20),
        created_at: '2026-11-23T08:01:00Z',
        like_count: 50,
        retweet_count: 10,
        is_note_tweet: true,
      },
      {
        tweet_id: 'short_1',
        author_name: 'Author',
        author_username: 'author',
        text: 'Quick short update',
        created_at: '2026-11-23T08:02:00Z',
        like_count: 50,
        retweet_count: 10,
      },
    ];

    const mockClient: any = {
      fetchFollowingTimeline: vi.fn().mockResolvedValue(mixedTweets),
      fetchUserTimeline: vi.fn().mockResolvedValue(mixedTweets),
      fetchListTimeline: vi.fn().mockResolvedValue(mixedTweets),
      fetchSearchTimeline: vi.fn().mockResolvedValue(mixedTweets),
    };

    try {
      const pipeline = new Pipeline(storage, mockClient);

      // 1. Default (article only): only art_1 should be inserted
      const userRes = await pipeline.fetchUserAndStore('author', 20);
      expect(mockClient.fetchUserTimeline).toHaveBeenCalledWith('author', {
        limit: 20,
        timeout: undefined,
        contentTypes: ['article'],
      });
      expect(userRes.inserted).toBe(1);
      expect(storage.getTweetById('art_1')).not.toBeNull();
      expect(storage.getTweetById('note_1')).toBeNull();
      expect(storage.getTweetById('short_1')).toBeNull();

      // 2. List source also passes contentTypes
      await pipeline.fetchListAndStore('1234567890', 20);
      expect(mockClient.fetchListTimeline).toHaveBeenCalledWith('1234567890', {
        limit: 20,
        timeout: undefined,
        contentTypes: ['article'],
      });

      // 3. Configure article + note: note_1 is now inserted while short_1 remains filtered out
      process.env.FETCH_CONTENT_TYPES = 'article,note';
      const searchRes = await pipeline.fetchSearchAndStore('AI', { limit: 20 });
      expect(mockClient.fetchSearchTimeline).toHaveBeenCalledWith('AI', {
        searchType: 'live',
        limit: 20,
        timeout: undefined,
        contentTypes: ['article', 'note'],
      });
      expect(searchRes.inserted).toBe(1); // note_1 newly inserted, art_1 skipped
      expect(storage.getTweetById('note_1')).not.toBeNull();
      expect(storage.getTweetById('short_1')).toBeNull();
    } finally {
      if (orig === undefined) delete process.env.FETCH_CONTENT_TYPES;
      else process.env.FETCH_CONTENT_TYPES = orig;
      storage.close();
      if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
    }
  });

  it('UT-6: Exemptions - single tweet sync and trends digest ignore default article-only filter', async () => {
    const orig = process.env.FETCH_CONTENT_TYPES;
    const origRoot = process.env.XTRACT_STORAGE_ROOT;
    delete process.env.FETCH_CONTENT_TYPES; // default: ['article']

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xtract_pipe_exempt_'));
    process.env.XTRACT_STORAGE_ROOT = tmpRoot;
    const tmpDb = path.join(tmpRoot, 'data', 'tweets.db');
    const storage = new Storage(tmpDb);

    const shortTweet: Tweet = {
      tweet_id: '999999001',
      author_name: 'ShortAuthor',
      author_username: 'shortauthor',
      text: 'Breaking news short tweet!',
      created_at: new Date().toISOString(),
      like_count: 300,
      retweet_count: 80,
    };

    const mockClient: any = {
      fetchTweetThread: vi.fn().mockResolvedValue([shortTweet]),
      fetchExploreTrends: vi.fn().mockResolvedValue([{ rank: 1, name: 'AI News', query: 'AI News' }]),
      fetchSearchTimeline: vi.fn().mockResolvedValue([shortTweet]),
    };

    const mockLLM: BaseLLMProvider = {
      providerName: 'MockLLM',
      modelName: 'mock-model',
      defaultModel: 'mock-model',
      generate: vi
        .fn()
        .mockResolvedValueOnce('{"AI News": "AI News"}')
        .mockResolvedValueOnce('# Trends Digest Report'),
    };

    try {
      const pipeline = new Pipeline(storage, mockClient);

      // 1. Single tweet sync must store short tweet despite default article-only config
      await pipeline.fetchTweetAndStore('999999001');
      expect(storage.getTweetById('999999001')).not.toBeNull();

      // 2. Trends digest internal search must explicitly allow all content types
      const summarizer = new Summarizer({ llmInstance: mockLLM });
      await pipeline.runTrendsDigest({
        category: 'tech',
        top: 1,
        hours: 24,
        summarizerInstance: summarizer,
      });

      expect(mockClient.fetchSearchTimeline).toHaveBeenCalledWith(
        expect.stringContaining('AI News'),
        expect.objectContaining({
          contentTypes: ['article', 'note', 'short'],
        })
      );
    } finally {
      if (orig === undefined) delete process.env.FETCH_CONTENT_TYPES;
      else process.env.FETCH_CONTENT_TYPES = orig;
      if (origRoot === undefined) delete process.env.XTRACT_STORAGE_ROOT;
      else process.env.XTRACT_STORAGE_ROOT = origRoot;
      storage.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
