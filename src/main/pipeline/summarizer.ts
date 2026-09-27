import { type BaseLLMProvider, getLLMProvider } from '../llm/index.js';
import type { Tweet, StreamChunk } from '../types.js';

export interface SummarizeOptions {
  onChunk?: (chunk: StreamChunk) => void;
}

export const DAILY_SYSTEM_PROMPT = `你是一名敏锐的科技与AI行业主编兼高级情报分析师。
你的任务是将用户在 X (Twitter) 关注流中抓取到的最新推文，加工成一份高信息密度、结论先行、结构清晰的「每日关注圈情报简报」。

### 目标读者背景：
读者是一名独立创作者/AI产品开发者兼企业培训顾问，关注 AI 产品前沿、技术突破、商业与创作者变现、开发工具与自动化。

### 报告输出结构要求（严格采用 Markdown 输出）：

# 🗞️ X 关注流情报早报 | {date}

## ⚡ 核心要闻速览 (Executive Summary)
用 3~5 条高密度的要点提炼今日圈内最重要的动态或争议焦点，结论先行，一句话点明核心。

## 🎯 主题聚类与深度洞察 (Key Topics)
将推文按内容性质（如：AI 模型与产品动态、开源工具与架构实践、商业化与创作者观察等）聚类为 3~4 个板块。
每个板块包含：
- **核心论点/动态**：发生了什么、背后的核心逻辑（为什么重要，对行业/用户的影响）。
- **代表观点与声音**：列出代表性博主（格式：**姓名 (@username)**）的核心观点或论据。
- **互动度高 / 深度讨论推文**：标明关键推文 ID 或引用。

## 🧵 深度长推与高价值 Thread (Featured Posts)
筛选出 2~4 篇最具信息量、技术深度或实操价值的长推/讨论串，给出简要拆解与核心干货。

## 💡 灵感便签与行动建议 (Actionable Insights)
提炼出 1~3 点可以转化为产品创意、新媒体写作选题或培训案例的洞察。

---

### 原则：
1. 结论先行，杜绝废话，客观犀利。
2. 过滤掉纯灌水、日常问候、低信息量的打卡推文。
3. 英文推文提炼其核心中文洞察，保留关键专业术语及原作者 Handle。
`;

export const TRENDS_SYSTEM_PROMPT = `你是一名全网热点趋势情报分析专家。
你的任务是将 X (Twitter) 当前最热的突发趋势话题及其高赞推文，加工成一份权威、犀利、结构清晰的「全网实时趋势深度研报」。

### 报告输出结构要求（严格采用 Markdown 输出）：

# 🔥 X 全网趋势研报 ({category_label}) | {date}

## ⚡ 热搜雷达速览 (Trending Radar)
用一张紧凑的 Markdown 表格汇总当前分析的 Top 趋势：
| 排名 | 趋势话题 | 讨论体量 | 核心事件/一句话定性 |

## 🔍 核心热点深度剖析 (Deep Dive)
对上述每个趋势话题，展开深入拆解：
### 话题名称 (附推文体量)
- **突发事件/起因**：为什么会突然爆发？源头事件或最新进展是什么？
- **多方立场与争议交锋**：行业大佬、当事人、社区主流声音与反面意见。
- **高赞爆款原声**：引用 1~2 条最具代表性或争议性的推文原话，注明博主 Handle 与点赞数。

## 💡 趋势启示与选题建议 (Actionable Insights)
- 对行业观察者/新媒体创作者/投资者的启示与预判；
- 值得跟进的潜在衍生事件或选题方向。

---

### 原则：
1. 结论先行，客观公正，禁止空话套话。
2. 重点挖掘推文间的观点碰撞与事实真相。
`;

export class Summarizer {
  readonly llm: BaseLLMProvider;

  constructor(options?: {
    provider?: string;
    authMode?: string;
    model?: string;
    llmInstance?: BaseLLMProvider;
  }) {
    if (options?.llmInstance) {
      this.llm = options.llmInstance;
    } else {
      this.llm = getLLMProvider(options?.provider, options?.authMode, options?.model);
    }
  }

  formatTweetsForPrompt(tweets: Tweet[]): string {
    const lines: string[] = [];
    for (let i = 0; i < tweets.length; i++) {
      const t = tweets[i];
      const author = `${t.author_name || ''} (@${t.author_username || ''})`;
      let text = (t.text || '').trim();

      if (t.is_retweet) {
        text = `[RT @${t.retweeted_author || ''}]: ${t.retweeted_text || text}`;
      } else if (t.is_quote) {
        text = `${text}\n[Quote @${t.quoted_author || ''}]: ${t.quoted_text || ''}`;
      }

      const likes = t.like_count || 0;
      const rts = t.retweet_count || 0;
      const tId = t.tweet_id || '';
      const urlsStr = t.urls && t.urls.length > 0 ? ` | Links: ${t.urls.join(', ')}` : '';

      lines.push(`${i + 1}. [ID: ${tId}] ${author} (❤️ ${likes}, 🔁 ${rts})${urlsStr}\n   Content: ${text}\n`);
    }
    return lines.join('\n');
  }

  async refineSearchQueries(topics: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    for (const t of topics) results[t] = t;

    const validTopics = topics.filter((t) => t && t.trim());
    if (validTopics.length === 0) return results;

    const prompt =
      '你是一名 X (Twitter) 搜索与舆情情报专家。\n' +
      '请将以下从 X 趋势榜抓取到的长标题或新闻句子，转换为最容易在 X 站内搜到真实用户高赞讨论的核心搜索词（提取 2~4 个最具辨识度的核心实体或关键词，去除冗长虚词与修饰性从句，使其符合推特用户的发帖习惯）：\n\n' +
      '待转换话题列表：\n' +
      validTopics.map((t, idx) => `${idx + 1}. ${t}`).join('\n') +
      '\n\n请直接返回纯 JSON 格式的字典（键为待转换的原话题名字符串，值为提炼后的精简搜索词，不要附带任何多余解释）：';

    try {
      const respStr = await this.llm.generate(prompt);
      let cleaned = respStr.trim();
      if (cleaned.startsWith('```')) {
        const lines = cleaned.split('\n');
        if (lines[0].startsWith('```')) lines.shift();
        if (lines.length > 0 && lines[lines.length - 1].startsWith('```')) lines.pop();
        cleaned = lines.join('\n').trim();
      }

      const parsed = JSON.parse(cleaned);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [orig, refined] of Object.entries(parsed)) {
          if (results[orig] !== undefined && typeof refined === 'string' && refined.trim()) {
            results[orig] = refined.trim();
          }
        }
      }
    } catch {
      // In case AI refinement fails or is restricted, fallback smoothly to original topics
    }

    return results;
  }

  async summarize(
    tweets: Tweet[],
    targetDate?: string,
    options?: SummarizeOptions
  ): Promise<string> {
    if (!tweets || tweets.length === 0) {
      return '# 🗞️ X 关注流情报早报\n\n今日未采集到有效推文，暂无报告。';
    }

    const today = targetDate || new Date().toISOString().slice(0, 10);
    const systemPrompt = DAILY_SYSTEM_PROMPT.replace('{date}', today);
    const formattedTweets = this.formatTweetsForPrompt(tweets);

    const userPrompt = `以下是抓取到的 ${tweets.length} 条关注流推文数据：\n\n${formattedTweets}\n\n请按规范生成今日情报简报。`;
    return this.llm.generate(userPrompt, { systemPrompt, onChunk: options?.onChunk });
  }

  async summarizeTrends(
    trendsPayload: Array<{
      topic: string;
      domain?: string;
      volume?: string;
      tweets?: Tweet[];
    }>,
    category = 'tech',
    targetDate?: string,
    options?: SummarizeOptions
  ): Promise<string> {
    if (!trendsPayload || trendsPayload.length === 0) {
      return '# 🔥 X 全网趋势研报\n\n未采集到有效趋势数据，暂无研报。';
    }

    const categoryLabels: Record<string, string> = {
      tech: '科技/AI/开发者',
      all: '全网综合热搜',
      business: '商业财经/投资',
      news: '全球要闻/时事',
      entertainment: '娱乐/影视/文化',
      sports: '体育赛事',
    };
    const catLabel = categoryLabels[category.toLowerCase()] || category;
    const today = targetDate || new Date().toISOString().slice(0, 10);
    const systemPrompt = TRENDS_SYSTEM_PROMPT.replace('{date}', today).replace(
      '{category_label}',
      catLabel
    );

    const contentBlocks: string[] = [];
    for (const item of trendsPayload) {
      const topic = item.topic || '未知话题';
      const volume = item.volume || '热度高';
      const domainStr = item.domain ? ` (${item.domain})` : '';
      const tweets = item.tweets || [];

      const block: string[] = [`### 话题: ${topic}${domainStr} | 推文量: ${volume}`];
      if (tweets.length > 0) {
        block.push('相关精选推文数据:');
        block.push(this.formatTweetsForPrompt(tweets));
      } else {
        block.push('（暂无补充推文数据）');
      }
      contentBlocks.push(block.join('\n'));
    }

    const userPrompt =
      `以下是当前分类【${catLabel}】下的 ${trendsPayload.length} 个焦点趋势话题及其高赞推文数据：\n\n` +
      contentBlocks.join('\n\n---\n\n') +
      '\n\n请按规范生成今日趋势深度研报。';

    return this.llm.generate(userPrompt, { systemPrompt, onChunk: options?.onChunk });
  }
}
