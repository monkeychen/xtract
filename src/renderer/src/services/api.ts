import type { XtractAPI, StreamEvent, AppConfigView, XListInfo } from '../types';
import type { Tweet, TrendTopic, DeleteFilter, DeleteResult, TweetQueryOptions } from '../types';
import { MOCK_REPORTS, MOCK_TRENDS, MOCK_TWEETS } from '../types';

class ApiService {
  private hasNativeApi(): boolean {
    return typeof window !== 'undefined' && Boolean(window.xtractAPI);
  }

  async checkAuth() {
    if (this.hasNativeApi()) {
      return window.xtractAPI.checkAuth();
    }
    return {
      isValid: true,
      info: '@cza55008',
      screenName: 'cza55008',
      proxy: '127.0.0.1:7890 (Proxy Direct)',
    };
  }

  async login(service: 'x' | 'openai' | 'gemini' = 'x') {
    if (this.hasNativeApi()) {
      return window.xtractAPI.login(service);
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { success: true };
  }

  async getConfig(): Promise<AppConfigView> {
    if (this.hasNativeApi()) {
      return window.xtractAPI.getConfig();
    }
    return {
      httpProxy: 'http://127.0.0.1:7890',
      llmProvider: 'gemini',
      llmAuthMode: 'api_key',
      llmModel: 'gemini-3.8-flash',
      reasoningEnabled: true,
      reasoningEffort: 'high',
      hasXCredentials: true,
      xAuthTokenMasked: '2a8f••••••••78b9',
      xCt0Masked: 'c901••••••••55aa',
    };
  }

  async updateConfig(updates: Record<string, string>) {
    if (this.hasNativeApi()) {
      return window.xtractAPI.updateConfig(updates);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    const current = await this.getConfig();
    return {
      success: true,
      config: {
        ...current,
        reasoningEnabled: updates.LLM_REASONING_ENABLED !== undefined ? updates.LLM_REASONING_ENABLED !== 'false' : current.reasoningEnabled,
        reasoningEffort: (updates.LLM_REASONING_EFFORT as any) || current.reasoningEffort,
        llmProvider: updates.LLM_PROVIDER || current.llmProvider,
        llmAuthMode: updates.LLM_AUTH_MODE || current.llmAuthMode,
        llmModel: updates.LLM_MODEL || current.llmModel,
        httpProxy: updates.HTTP_PROXY || current.httpProxy,
      },
    };
  }

  async fetchFollowing(options: { pages?: number } = {}) {
    if (this.hasNativeApi()) {
      return window.xtractAPI.fetchFollowing(options);
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { fetched: 20, inserted: 5, skipped: 15 };
  }

  async fetchUser(username: string, options: { limit?: number } = {}) {
    if (this.hasNativeApi()) {
      return window.xtractAPI.fetchUser(username, options);
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { fetched: options.limit || 20, inserted: 3, skipped: 17 };
  }

  async fetchList(listId: string, options: { limit?: number } = {}) {
    if (this.hasNativeApi()) {
      return window.xtractAPI.fetchList(listId, options);
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { fetched: options.limit || 20, inserted: 4, skipped: 16 };
  }

  async getUserLists(): Promise<XListInfo[]> {
    if (this.hasNativeApi()) {
      return window.xtractAPI.getUserLists();
    }
    return [
      { id: '1827364512938', name: 'AI 核心圈', member_count: 42 },
      { id: '1827364512939', name: '独立开发者', member_count: 128 },
    ];
  }

  async saveUserList(list: XListInfo) {
    if (this.hasNativeApi()) {
      return window.xtractAPI.saveUserList(list);
    }
    return { success: true, lists: [list] };
  }

  async fetchOnlineLists(): Promise<XListInfo[]> {
    if (this.hasNativeApi()) {
      return window.xtractAPI.fetchOnlineLists();
    }
    return this.getUserLists();
  }

  async getTrends(
    category: string = 'tech',
    options: { top?: number; refresh?: boolean } | number = 10
  ): Promise<TrendTopic[] & { updatedAt?: string; fromCache?: boolean }> {
    const top = typeof options === 'number' ? options : options?.top || 10;
    const refresh = typeof options === 'object' ? Boolean(options.refresh) : false;

    if (this.hasNativeApi()) {
      return (await window.xtractAPI.getTrends(category, top, refresh)) as any;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    const list: any =
      category === 'all'
        ? [...MOCK_TRENDS]
        : MOCK_TRENDS.filter((t) => t.category === category || category === 'tech');
    list.updatedAt = new Date().toISOString();
    list.fromCache = !refresh;
    return list;
  }

  async listTweets(options: TweetQueryOptions = {}): Promise<Tweet[]> {
    if (this.hasNativeApi()) {
      return window.xtractAPI.listTweets(options);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    let result = [...MOCK_TWEETS];
    if (options.sourceType && options.sourceType !== 'all') {
      result = result.filter((t) => (t.source_type || 'following') === options.sourceType);
    }
    if (options.minLikes) {
      result = result.filter((t) => t.like_count >= (options.minLikes || 0));
    }
    if (options.user) {
      result = result.filter(
        (t) => t.author_username.toLowerCase() === options.user?.toLowerCase()
      );
    }
    if (options.query) {
      const q = options.query.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.text.toLowerCase().includes(q) ||
          t.author_username.toLowerCase().includes(q) ||
          t.author_name.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    return result.slice(offset, offset + limit);
  }

  async countTweets(options: TweetQueryOptions = {}): Promise<number> {
    if (this.hasNativeApi()) {
      return window.xtractAPI.countTweets(options);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    let result = [...MOCK_TWEETS];
    if (options.sourceType && options.sourceType !== 'all') {
      result = result.filter((t) => (t.source_type || 'following') === options.sourceType);
    }
    if (options.minLikes) {
      result = result.filter((t) => t.like_count >= (options.minLikes || 0));
    }
    if (options.user) {
      result = result.filter(
        (t) => t.author_username.toLowerCase() === options.user?.toLowerCase()
      );
    }
    if (options.query) {
      const q = options.query.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.text.toLowerCase().includes(q) ||
          t.author_username.toLowerCase().includes(q) ||
          t.author_name.toLowerCase().includes(q)
      );
    }
    return result.length;
  }

  async viewTweet(
    tweetIdOrUrl: string,
    options?: { exportMd?: boolean; outputPath?: string; forceRefresh?: boolean }
  ): Promise<{ tweet: Tweet; exportPath?: string }> {
    if (this.hasNativeApi()) {
      return window.xtractAPI.viewTweet(tweetIdOrUrl, options);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    const cleanId = tweetIdOrUrl.match(/\d{5,}/)?.[0] || tweetIdOrUrl;
    const tweet = MOCK_TWEETS.find((t) => t.tweet_id === cleanId) || MOCK_TWEETS[0];
    return {
      tweet,
      exportPath: `output/${tweet.author_username}/${tweet.tweet_id}/index.md`,
    };
  }

  async openExternal(url: string) {
    if (this.hasNativeApi()) {
      return window.xtractAPI.openExternal(url);
    }
    window.open(url, '_blank');
    return { success: true };
  }

  async showItemInFolder(itemPath: string) {
    if (this.hasNativeApi()) {
      return window.xtractAPI.showItemInFolder(itemPath);
    }
    return { success: true, path: itemPath };
  }

  async openPath(dirPath: string) {
    if (this.hasNativeApi()) {
      return window.xtractAPI.openPath(dirPath);
    }
    return { success: true, path: dirPath };
  }

  async searchTweets(query: string, options: { searchType?: 'live' | 'top'; limit?: number; minLikes?: number } = {}) {
    if (this.hasNativeApi()) {
      return window.xtractAPI.searchTweets(query, options);
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    const matched = MOCK_TWEETS.filter(
      (t) =>
        t.text.toLowerCase().includes(query.toLowerCase()) ||
        t.author_username.toLowerCase().includes(query.toLowerCase())
    );
    return { count: matched.length, tweets: matched };
  }

  async deleteTweets(filter: DeleteFilter): Promise<DeleteResult> {
    if (this.hasNativeApi()) {
      return window.xtractAPI.deleteTweets(filter);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      matchedCount: 1,
      deletedCount: filter.dryRun ? 0 : 1,
      deletedDirs: ['output/karpathy/18888001'],
      deletedFiles: ['output/karpathy/18888001/index.md'],
      dryRun: Boolean(filter.dryRun),
    };
  }

  async generateDailyDigest(options: any, onProgress?: (event: StreamEvent) => void) {
    if (this.hasNativeApi()) {
      const unsubscribe = this.onStreamEvent((event) => {
        onProgress?.(event);
      });
      try {
        const res = await window.xtractAPI.generateDailyDigest(options);
        return res;
      } finally {
        unsubscribe();
      }
    }

    // Standalone mock stream generator for smooth UX preview
    const taskId = 'task-' + Date.now();
    onProgress?.({ taskId, stage: 'init', type: 'status', text: '正在过滤本地 24h 高信噪比推文...', progress: 10 });
    await new Promise((r) => setTimeout(r, 600));

    onProgress?.({ taskId, stage: 'reasoning', type: 'reasoning', text: '正在进行深度长推理与信噪比研判...\n- 识别到核心议题：端侧推理架构与长思维链落地\n- 剔除低质灌水推文 24 篇\n- 提炼代表性博主论点 (@karpathy, @swyx)' });
    await new Promise((r) => setTimeout(r, 1200));

    onProgress?.({ taskId, stage: 'synthesis', type: 'content', text: '# 🗞️ X 每日情报晨报\n\n## 核心热点聚焦\n今日全网核心聚焦于混合推理在开发运维工具中的落地...', progress: 90 });
    await new Promise((r) => setTimeout(r, 800));

    onProgress?.({ taskId, stage: 'done', type: 'status', text: '研报生成完毕！已落盘至 output/reports/', progress: 100 });
    return { success: true, reportPath: 'output/reports/2026-09-27.md', content: MOCK_REPORTS[0].markdownContent };
  }

  async generateTrendsDigest(options: any, onProgress?: (event: StreamEvent) => void) {
    if (this.hasNativeApi()) {
      const unsubscribe = this.onStreamEvent((event) => {
        onProgress?.(event);
      });
      try {
        const res = await window.xtractAPI.generateTrendsDigest(options);
        return res;
      } finally {
        unsubscribe();
      }
    }

    const taskId = 'task-trend-' + Date.now();
    onProgress?.({ taskId, stage: 'init', type: 'status', text: '正在抓取全网实时热门趋势榜单...', progress: 15 });
    await new Promise((r) => setTimeout(r, 600));

    onProgress?.({ taskId, stage: 'refine_query', type: 'status', text: '大模型实体提炼：提炼核心检索实体 "Claude 3.7", "DeepSeek V4"...', progress: 35 });
    await new Promise((r) => setTimeout(r, 800));

    onProgress?.({ taskId, stage: 'reasoning', type: 'reasoning', text: '模型 High 思考链启动：\n- 话题 1 (Claude 3.7): 互动量 185.4K，情绪指数偏正面，关键议题集中在测试时计算（Test-time compute）\n- 话题 2 (DeepSeek V4): 开源权重社区适配热烈\n- 正在聚类主要技术分歧点...' });
    await new Promise((r) => setTimeout(r, 1500));

    onProgress?.({ taskId, stage: 'done', type: 'status', text: '趋势深度研报已归档！', progress: 100 });
    return { success: true, reportPath: 'output/reports/trends_2026-09-27.md', content: MOCK_REPORTS[0].markdownContent };
  }

  onStreamEvent(callback: (event: StreamEvent) => void): () => void {
    if (this.hasNativeApi()) {
      return window.xtractAPI.onStreamEvent(callback);
    }
    return () => {};
  }
}

export const api = new ApiService();
