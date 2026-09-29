import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/renderer/src/services/api.js';

describe('Renderer API Service (Dual-Mode: Standalone Browser & Electron Bridge)', () => {
  beforeEach(() => {
    // Ensure window.xtractAPI is undefined to test standalone fallback
    (globalThis as any).window = {};
  });

  it('getConfig should return full config including reasoningEnabled and reasoningEffort', async () => {
    const cfg = await api.getConfig();
    expect(cfg).toBeDefined();
    expect(cfg.llmProvider).toBe('gemini');
    expect(cfg.reasoningEnabled).toBe(true);
    expect(cfg.reasoningEffort).toBe('high');
  });

  it('updateConfig should update in-memory config in standalone mode', async () => {
    const res = await api.updateConfig({
      LLM_REASONING_ENABLED: 'false',
      LLM_REASONING_EFFORT: 'low',
      LLM_PROVIDER: 'deepseek',
    });
    expect(res.success).toBe(true);
    expect(res.config.reasoningEnabled).toBe(false);
    expect(res.config.reasoningEffort).toBe('low');
    expect(res.config.llmProvider).toBe('deepseek');
  });

  it('fetchFollowing, fetchUser, fetchList should return simulated crawl results', async () => {
    const following = await api.fetchFollowing({ pages: 2 });
    expect(following.fetched).toBe(20);
    expect(following.inserted).toBeGreaterThan(0);

    const user = await api.fetchUser('karpathy', { limit: 50 });
    expect(user.fetched).toBe(50);

    const list = await api.fetchList('1682802314011197441', { limit: 20 });
    expect(list.fetched).toBe(20);
  });

  it('getTrends should return categorized trend topics', async () => {
    const techTrends = await api.getTrends('tech');
    expect(techTrends.length).toBeGreaterThan(0);
    expect(techTrends[0].name).toBeDefined();

    const allTrends = await api.getTrends('all');
    expect(allTrends.length).toBeGreaterThan(0);
  });

  it('listTweets and searchTweets should support SNR filtering', async () => {
    const all = await api.listTweets({ minLikes: 0 });
    const filtered50 = await api.listTweets({ minLikes: 50 });
    expect(all.length).toBeGreaterThanOrEqual(filtered50.length);

    const searchRes = await api.searchTweets('AI');
    expect(searchRes.count).toBeGreaterThan(0);
  });

  it('deleteTweets should return deleted structure', async () => {
    const res = await api.deleteTweets({ tweetId: '18888001' });
    expect(res.deletedCount).toBe(1);
    expect(res.deletedDirs.length).toBeGreaterThan(0);
  });
});
