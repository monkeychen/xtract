import type { XtractAPI, StreamEvent, AppConfigView } from '../types';
import type { Tweet, TrendTopic, DeleteFilter, DeleteResult } from '../types';
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
      info: 'Twitter User @demo_investor',
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

  async getTrends(category: string = 'tech', top: number = 10): Promise<TrendTopic[]> {
    if (this.hasNativeApi()) {
      return window.xtractAPI.getTrends(category, top);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (category === 'all') return MOCK_TRENDS;
    return MOCK_TRENDS.filter((t) => t.category === category || category === 'tech');
  }

  async listTweets(options: { limit?: number; minLikes?: number; minRetweets?: number; user?: string } = {}): Promise<Tweet[]> {
    if (this.hasNativeApi()) {
      return window.xtractAPI.listTweets(options);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    let result = [...MOCK_TWEETS];
    if (options.minLikes) {
      result = result.filter((t) => t.like_count >= (options.minLikes || 0));
    }
    if (options.user) {
      result = result.filter((t) => t.author_username.toLowerCase() === options.user?.toLowerCase());
    }
    return result;
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
