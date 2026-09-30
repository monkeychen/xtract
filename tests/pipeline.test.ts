import { describe, it, expect, vi, beforeEach } from 'vitest';
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

    expect(results.length).toBe(1);
    expect(results[0].tweet_id).toBe('t2');

    // Clean up
    storage.close();
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  });

  it('Pipeline fetchAndStore passes limit correctly to client', async () => {
    const tmpDb = path.join(os.tmpdir(), `test_pipe_limit_${Date.now()}.db`);
    const storage = new Storage(tmpDb);

    const mockTweets: Tweet[] = Array.from({ length: 20 }, (_, i) => ({
      tweet_id: `f_${i}`,
      author_name: `User ${i}`,
      author_username: `user_${i}`,
      text: `Tweet content ${i}`,
      created_at: new Date().toISOString(),
      like_count: 10,
      retweet_count: 1,
      is_note_tweet: true,
    }));

    const mockClient: any = {
      fetchFollowingTimeline: vi.fn().mockResolvedValue(mockTweets),
    };

    const pipeline = new Pipeline(storage, mockClient);
    const [fetched, inserted, skipped] = await pipeline.fetchAndStore({ limit: 20, maxPages: 1 });

    expect(mockClient.fetchFollowingTimeline).toHaveBeenCalledWith({
      maxPages: 1,
      limit: 20,
      onlyLongTweets: true,
      timeout: undefined,
    });
    expect(fetched).toBe(20);
    expect(inserted).toBe(20);

    storage.close();
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  });
});
