import type { Tweet, TrendTopic, DeleteFilter, DeleteResult, XListInfo } from '../../main/types';
import type { StreamEvent, AppConfigView, XtractAPI } from '../../preload/index';

export type { Tweet, TrendTopic, DeleteFilter, DeleteResult, StreamEvent, AppConfigView, XtractAPI, XListInfo };

export interface ReportItem {
  id: string;
  title: string;
  category: string;
  date: string;
  timeSpan: string;
  tweetCount: number;
  provider: string;
  summary: string;
  markdownContent: string;
  filePath?: string;
}

export type ActiveTab = 'reports' | 'trends' | 'studio';

// Mock datasets for standalone prototype preview
export const MOCK_REPORTS: ReportItem[] = [
  {
    id: 'rep-20260927-1',
    title: '全网技术趋势深度研报：Claude 3.7 全模态长思维链与 DeepSeek 普及潮',
    category: 'tech',
    date: '2026-09-27 10:00',
    timeSpan: '过去 24 小时',
    tweetCount: 142,
    provider: 'gemini-3.8-flash',
    summary: '今日 X 圈内关于混合推理模型（Hybrid Reasoning）的架构讨论达到年内峰值。硅谷一线开发者正在大规模评测多模态代码自修复与自省机制。',
    markdownContent: `# 🗞️ X 全网技术情报深度研报 (Tech Intelligence Radar)
*生成时间: 2026-09-27 10:00:15 | 统计周期: 过去 24 小时 | 覆盖高信噪比推文: 142 篇*

---

## 核心讨论聚焦 (Executive Summary)
过去 24 小时内，全网技术圈对于大模型长思维链（Long-horizon CoT）在复杂工程代码生成与自主修复中的落地表现进行了密集研判。

### 1. 混合推理模型的范式转移
- **观点归纳**：越来越多的系统开始支持在推理前评估问题的熵值，以动态决定分配 500ms 极速响应还是 120s 深度思维推演。
- **代表推文**：
  > @"AI_Researcher": "Dynamic test-time compute is no longer research; it's production engineering. If your agent burns 60k tokens on a greeting, you're burning cash."

### 2. 本地自托管与私有化浪潮
- **观点归纳**：随着国内 DeepSeek 等模型针对消费级硬件优化的深入，个人开发者在 Mac Studio / RTX 4090 上搭建专属 Agent 研发流的热度高居不下。

---

## 高互动推文精选 (Curated Tweets)
1. **@karpathy** (14.2k ❤️ / 3.8k 🔁): "The shift from training compute to test-time compute changes how we evaluate model benchmarks completely."
2. **@swyx** (5.1k ❤️ / 1.2k 🔁): "Electron + Local SQLite + Streaming Reasoning is genuinely the most reliable stack for personal desktop intelligence."
`,
  },
  {
    id: 'rep-20260926-1',
    title: 'X 关注流每日晨报：大模型生产力工具链与端侧推理革新',
    category: 'following',
    date: '2026-09-26 09:30',
    timeSpan: '过去 24 小时',
    tweetCount: 88,
    provider: 'deepseek-flash',
    summary: '个人关注流重点讨论了 Node.js 22 稳定版原生的 SQLite 表现、开源 Agent 的桌面化落地、以及自动化内容过滤方案。',
    markdownContent: `# 🌅 X 关注流晨报 (Following Daily Digest)
*生成时间: 2026-09-26 09:30:00 | 覆盖精选推文: 88 篇*

---

## 今日核心资讯
- **更好的数据持久化**：关注的多位全栈架构师推荐使用更好更轻量的嵌入式 SQLite，替代高复杂度的外部云数据库。
- **抗噪能力**：信息爆炸时代，基于互动量门槛的二次清洗成为阅读必备手段。
`,
  },
];

export const MOCK_TRENDS: TrendTopic[] = [
  {
    rank: 1,
    name: 'Claude 3.7 Sonnet',
    tweet_count: '185.4K',
    query: '"Claude 3.7" OR "Hybrid Reasoning" lang:en',
    category: 'tech',
  },
  {
    rank: 2,
    name: 'DeepSeek V4',
    tweet_count: '142.1K',
    query: 'DeepSeek V4 open source lang:en',
    category: 'tech',
  },
  {
    rank: 3,
    name: 'OpenAI GPT-5',
    tweet_count: '98.6K',
    query: 'GPT-5 release schedule OR Altman',
    category: 'tech',
  },
  {
    rank: 4,
    name: 'NVIDIA GTC 2026',
    tweet_count: '76.3K',
    query: 'NVIDIA GTC Blackwell Ultra GPU',
    category: 'tech',
  },
  {
    rank: 5,
    name: 'Apple M5 Max',
    tweet_count: '54.2K',
    query: 'Apple M5 chip benchmark leaks',
    category: 'tech',
  },
  {
    rank: 6,
    name: 'Federal Reserve Rate Cut',
    tweet_count: '112.5K',
    query: '"Fed rate cut" inflation yield',
    category: 'business',
  },
];

export const MOCK_TWEETS: Tweet[] = [
  {
    tweet_id: '18888001',
    author_username: 'karpathy',
    author_name: 'Andrej Karpathy',
    text: 'The transition from pre-training heavy models to test-time reasoning compute is fundamentally changing developer ergonomics. We are entering an era of software that self-corrects through recursive loops.',
    created_at: '2026-09-27T08:15:00Z',
    like_count: 14200,
    retweet_count: 3820,
    reply_count: 940,
    media_urls: ['https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop'],
  },
  {
    tweet_id: '18888002',
    author_username: 'sama',
    author_name: 'Sam Altman',
    text: 'excited for what comes next. the compute curves look extraordinary, but what matters is how helpful the systems become for individual humans doing creative and scientific work.',
    created_at: '2026-09-27T07:42:00Z',
    like_count: 9800,
    retweet_count: 1540,
    reply_count: 1200,
  },
  {
    tweet_id: '18888003',
    author_username: 'swyx',
    author_name: 'swyx',
    text: 'Building personal intelligence digests is the #1 way to defeat algorithmic brain rot. High signal-to-noise ratio filters + local Markdown archives will outlive any closed platform.',
    created_at: '2026-09-27T06:10:00Z',
    like_count: 3410,
    retweet_count: 820,
    reply_count: 150,
    media_urls: ['https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop'],
  },
  {
    tweet_id: '18888004',
    author_username: 'gaborcselle',
    author_name: 'Gabor Cselle',
    text: 'A clean desktop tool with zero API keys required (account session mode) combined with SQLite deduplication is the gold standard for power users. No cloud sync latency.',
    created_at: '2026-09-27T05:30:00Z',
    like_count: 1240,
    retweet_count: 290,
    reply_count: 65,
  },
];
