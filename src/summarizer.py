import json
from datetime import datetime, timezone
from typing import Any

from .config import Config
from .llm import BaseLLMProvider, get_llm_provider


DAILY_SYSTEM_PROMPT = """你是一名敏锐的科技与AI行业主编兼高级情报分析师。
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
"""

TRENDS_SYSTEM_PROMPT = """你是一名全网热点趋势情报分析专家。
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
"""


class Summarizer:
    def __init__(
        self,
        provider: str | None = None,
        auth_mode: str | None = None,
        model: str | None = None,
        llm_instance: BaseLLMProvider | None = None,
    ) -> None:
        if llm_instance:
            self.llm = llm_instance
        else:
            self.llm = get_llm_provider(provider=provider, auth_mode=auth_mode, model=model)

    def _format_tweets_for_prompt(self, tweets: list[dict[str, Any]]) -> str:
        lines = []
        for i, t in enumerate(tweets, 1):
            author = f"{t.get('author_name', '')} (@{t.get('author_username', '')})"
            text = t.get("text", "").strip()
            if t.get("is_retweet"):
                rt_author = t.get("retweeted_author", "")
                text = f"[RT @{rt_author}]: {t.get('retweeted_text', text)}"
            elif t.get("is_quote"):
                q_author = t.get("quoted_author", "")
                text = f"{text} \n[Quote @{q_author}]: {t.get('quoted_text', '')}"

            likes = t.get("like_count", 0)
            rts = t.get("retweet_count", 0)
            t_id = t.get("tweet_id", "")
            urls = t.get("urls", [])
            if isinstance(urls, str):
                try:
                    urls = json.loads(urls)
                except Exception:
                    urls = []

            url_str = f" | Links: {', '.join(urls)}" if urls else ""
            lines.append(
                f"{i}. [ID: {t_id}] {author} (❤️ {likes}, 🔁 {rts}){url_str}\n"
                f"   Content: {text}\n"
            )
        return "\n".join(lines)

    def summarize(self, tweets: list[dict[str, Any]], target_date: str | None = None) -> str:
        if not tweets:
            return "# 🗞️ X 关注流情报早报\n\n今日未采集到有效推文，暂无报告。"

        date_str = target_date or datetime.now().strftime("%Y-%m-%d")
        prompt_system = DAILY_SYSTEM_PROMPT.format(date=date_str)
        formatted_tweets = self._format_tweets_for_prompt(tweets)

        user_content = f"以下是抓取到的 {len(tweets)} 条关注流推文数据：\n\n{formatted_tweets}\n\n请按规范生成今日情报简报。"
        return self.llm.generate(prompt=user_content, system_prompt=prompt_system)

    def summarize_trends(
        self,
        trends_payload: list[dict[str, Any]],
        category: str = "tech",
        target_date: str | None = None,
    ) -> str:
        if not trends_payload:
            return "# 🔥 X 全网趋势研报\n\n未采集到有效趋势数据，暂无研报。"

        category_labels = {
            "tech": "科技/AI/开发者",
            "all": "全网综合热搜",
            "business": "商业财经/投资",
            "news": "全球要闻/时事",
            "entertainment": "娱乐/影视/文化",
            "sports": "体育赛事",
        }
        cat_label = category_labels.get(category.lower(), category)
        date_str = target_date or datetime.now().strftime("%Y-%m-%d")
        prompt_system = TRENDS_SYSTEM_PROMPT.format(date=date_str, category_label=cat_label)

        content_blocks = []
        for item in trends_payload:
            topic = item.get("topic", "未知话题")
            volume = item.get("volume", "热度高")
            domain = item.get("domain", "")
            domain_str = f" ({domain})" if domain else ""
            tweets = item.get("tweets", [])

            block = [f"### 话题: {topic}{domain_str} | 推文量: {volume}"]
            if tweets:
                block.append("相关精选推文数据:")
                block.append(self._format_tweets_for_prompt(tweets))
            else:
                block.append("（暂无补充推文数据）")
            content_blocks.append("\n".join(block))

        user_content = (
            f"以下是当前分类【{cat_label}】下的 {len(trends_payload)} 个焦点趋势话题及其高赞推文数据：\n\n"
            + "\n\n---\n\n".join(content_blocks)
            + "\n\n请按规范生成今日趋势深度研报。"
        )

        return self.llm.generate(prompt=user_content, system_prompt=prompt_system)
