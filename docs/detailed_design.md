# 系统详细设计与核心机制文档 (Detailed Design Document)

> **文档版本**：v1.0.0  
> **更新时间**：2026-09-22  
> **面向对象**：核心开发人员、系统维护者与扩展接入者。

---

## 1. 核心模块类设计与接口契约

### 1.1 系统类图 (UML Class Diagram)

```mermaid
classDiagram
    class XClient {
        -Config config
        -Browser browser
        -BrowserContext context
        +initialize(headless: bool)
        +fetch_following_timeline(limit: int) List~Tweet~
        +search_tweets(query: str, search_type: str, limit: int) List~Tweet~
        +fetch_explore_trends(category: str, top_n: int) List~TrendTopic~
        +fetch_tweet_detail(tweet_id_or_url: str) Tweet
        +fetch_user_timeline(username: str, limit: int) List~Tweet~
        +fetch_list_timeline(list_id: str, limit: int) List~Tweet~
        +download_media(url: str, output_dir: str) str
        +close()
    }

    class TweetStorage {
        -str db_path
        -sqlite3.Connection conn
        +init_db()
        +save_tweets(tweets: List~Tweet~) int
        +get_tweets(since_hours: int, min_likes: int, min_rts: int) List~Tweet~
        +search_tweets(keyword: str, limit: int) List~Tweet~
        +get_tweet_by_id(tweet_id: str) Optional~Tweet~
    }

    class AuthManager {
        -Config config
        +interactive_login(platform: str) bool
        +check_auth_status(platform: str) bool
        +extract_and_save_cookies(context: BrowserContext, target_path: str)
    }

    class BaseLLMProvider {
        <<abstract>>
        +str provider_name
        +str model_name
        +generate_response(messages: List~Message~) str*
        +generate_stream(messages: List~Message~) Generator~StreamChunk~*
    }

    class OpenAICompatProvider {
        -httpx.Client client
        -str api_key
        -str base_url
        -bool is_domestic
        +generate_response(messages: List~Message~) str
        +generate_stream(messages: List~Message~) Generator~StreamChunk~
        -_build_payload(messages: List~Message~, stream: bool) dict
    }

    class GeminiAccountProvider {
        -str agy_bin_path
        +generate_response(messages: List~Message~) str
        +generate_stream(messages: List~Message~) Generator~StreamChunk~
    }

    class ChatGPTAccountProvider {
        -str session_file
        +generate_response(messages: List~Message~) str
        +generate_stream(messages: List~Message~) Generator~StreamChunk~
    }

    class LLMFactory {
        <<static>>
        +create_provider(provider_type: str, auth_mode: str, model: str) BaseLLMProvider
    }

    class Summarizer {
        -BaseLLMProvider llm
        +generate_daily_digest(tweets: List~Tweet~) str
        +generate_trends_digest(trends: List~TrendTopic~, tweets_map: dict) str
        +refine_search_queries(raw_titles: List~str~) List~str~
    }

    BaseLLMProvider <|-- OpenAICompatProvider
    BaseLLMProvider <|-- GeminiAccountProvider
    BaseLLMProvider <|-- ChatGPTAccountProvider
    LLMFactory ..> BaseLLMProvider : Instantiates
    Summarizer --> BaseLLMProvider : Uses
    XClient --> AuthManager : Validates session
```

---

## 2. 关键底层机制与控制流设计

### 2.1 机制 1：Playwright 异步透明网络流拦截与动态防抖

#### 2.1.1 拦截原理与路由分发
推特为单页面 React 应用（SPA），所有数据通过 GraphQL 端点异步拉取。系统启动 Chromium 后，在 `Page.route` 或 `Page.on("response")` 上注册全局监听器：

```mermaid
flowchart TD
    Req[客户端触发页面导航/滚动] --> Listen["Page.on('response', handle_response)"]
    Listen --> CheckURL{"URL 是否包含\n/i/api/graphql/？"}
    CheckURL -- "否" --> Pass[忽略通行]
    CheckURL -- "是" --> RouteType{"判断具体 GraphQL 操作名"}
    RouteType -- "HomeLatestTimeline" --> ParseFollowing["解析关注流推文列表"]
    RouteType -- "SearchTimeline" --> ParseSearch["解析搜索结果推文列表"]
    RouteType -- "ExplorePage" --> ParseTrends["解析全网趋势模块"]
    RouteType -- "TweetDetail" --> ParseDetail["解析主推文及回复线程"]
    
    ParseFollowing --> DePromote["广告剥离过滤器 (entryId != promoted-*)"]
    ParseSearch --> DePromote
    DePromote --> Deduplicate["按 rest_id 主键去重缓存"]
```

#### 2.1.2 动态防抖与时机控制 (Timing & Debounce)
- **挑战**：页面发起 GraphQL 请求为异步非阻塞，若页面刚触发导航就立刻断言退出，会捕获到空响应；若等待时间过长则浪费吞吐。
- **解法**：
  1. 页面导航状态采用 `wait_until="domcontentloaded"`，确保推特前端核心渲染引擎就绪；
  2. 采用**累积计数 + 短超时防抖**策略：当捕获到目标首包后，维持 2 秒的防抖窗口（Debounce Window）等待可能的分页包，随后立即恢复执行，兼顾完整性与速度。

---

### 2.2 机制 2：免查 Token 浏览器会话截获

#### 2.2.1 交互式截获时序
为了彻底摆脱让用户打开 F12 手工寻找 `auth_token` 和 `ct0` 的反人类体验，设计了交互式自动化捕获机制：

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户
    participant Auth as AuthManager
    participant PW as Playwright (有头窗口)
    participant FS as 磁盘 (data/auth_state.json)

    User->>Auth: main.py --login x
    Auth->>PW: 启动可见 Chromium 窗口 (headless=False)
    PW->>PW: 导航至 https://x.com/login
    Auth-->>User: 终端提示："请在弹出的浏览器中完成登录..."
    
    loop 每 1 秒轮询上下文 Cookie
        Auth->>PW: 获取 context.cookies()
        Note over Auth: 检查是否同时存在 "auth_token" 与 "ct0"
    end

    User->>PW: 完成账号密码/2FA登录
    PW-->>Auth: 探测到 auth_token 与 ct0 凭据已写入
    Auth->>PW: context.storage_state(path="data/auth_state.json")
    PW->>FS: 持久化保存完整 Cookie、LocalStorage 与 Session
    Auth->>PW: 关闭浏览器
    Auth-->>User: 终端高亮提示："✅ X 登录成功，凭据已安全保存！"
```

---

### 2.3 机制 3：时效性双重过滤架构 (Multi-Layer Freshness Guarantee)

#### 2.3.1 为什么需要双重过滤？
- **单靠搜索关键词**：X 平台的 Top 排序由历史累计互动决定，常把数月前的万赞推文排在首位；
- **单靠 X 算子 `since:YYYY-MM-DD`**：推特该算子粒度仅到「天」，且可能存在跨时区边缘漂移；
- **单靠内存硬过滤**：若 X 下发的推文全部被历史推文霸榜，本地硬过滤后会导致有效推文为 0。

#### 2.3.2 双重拦截算法逻辑

```python
# 第一层：精确构造注入 X 搜索算子
now_utc = datetime.now(timezone.utc)
since_date = (now_utc - timedelta(hours=hours)).strftime("%Y-%m-%d")
search_query = f"{refined_keyword} since:{since_date}"

# 第二层：语料进入大模型前的内存 UTC 硬校验
def is_tweet_within_hours(created_at_str: str, hours: int = 48) -> bool:
    if not created_at_str:
        return True
    try:
        # X 官方时间格式: "Fri Sep 21 14:32:00 +0000 2026"
        dt = datetime.strptime(created_at_str, "%a %b %d %H:%M:%S %z %Y")
        return (datetime.now(timezone.utc) - dt).total_seconds() <= hours * 3600
    except Exception:
        return True
```

---

### 2.4 机制 4：AI 搜索词智能提炼与安全串行节流

#### 2.4.1 AI 提炼算法
针对趋势榜单的新闻长标题，直接搜索命中率为 0。系统在下钻前构建专属 Prompt 调用 LLM：
- **输入**：`["DeepSeek Bets Big on Huawei Chips to Train Massive AI Models", "World of Warcraft Classic Fresh 2026 Announced"]`
- **系统约束**：
  > 提取 2~4 个推特用户最常用的核心实体短语/英文原词，禁止使用句式、连词与长定语。
- **输出**：`["DeepSeek Huawei chips", "WoW Classic Fresh"]`

#### 2.4.2 安全串行步长与防风控
```mermaid
flowchart LR
    Topic1["话题 1 搜索"] --> Delay1["强制睡眠 2.0s\n(拟人节流)"]
    Delay1 --> Topic2["话题 2 搜索"]
    Topic2 --> Delay2["强制睡眠 2.0s\n(拟人节流)"]
    Delay2 --> Topic3["话题 3 搜索"]
```
- **核心防线**：坚决摒弃 `asyncio.gather` 并发请求。X 风控系统会将同一 Cookie 在 1 秒内的并发 GraphQL 请求标记为自动化脚本并触发 Cloudflare 阻断或封号。单线程串行加 2 秒停顿将风控概率降至零。

---

### 2.5 机制 5：SSE 流式长思维链解析机制

针对主流模型开启 `reasoning_effort: "high"` 后长达 2~3 分钟的深度思考，非流式 HTTP 会直接遭遇 `ReadTimeout`（120 秒断开）。详细数据流如下：

```mermaid
sequenceDiagram
    autonumber
    participant CLI as 终端展示
    participant Prov as OpenAICompatProvider
    participant API as 云厂商模型端点 (Qwen/DeepSeek/GLM)

    Prov->>API: POST /chat/completions (stream=True, reasoning_effort="high")
    API-->>Prov: HTTP 200 (Transfer-Encoding: chunked, text/event-stream)
    
    loop 逐行读取 SSE Chunk
        API-->>Prov: data: {"choices": [{"delta": {"reasoning_content": "推演中..."}}]}
        Prov->>CLI: 触发心跳检测，更新思考时长计数器
        
        API-->>Prov: data: {"choices": [{"delta": {"content": "# 科技热点研报..."}}]}
        Note over Prov,CLI: 思考结束，进入正文输出流
        Prov->>CLI: 实时缓冲或追加正文
    end

    API-->>Prov: data: [DONE]
    Prov-->>CLI: 流式调用完成，写入最终 Markdown
```

---

## 3. 本地存储模型与数据字典

### 3.1 SQLite 数据库表设计 (`data/tweets.db`)

```sql
CREATE TABLE IF NOT EXISTS tweets (
    tweet_id TEXT PRIMARY KEY,          -- 推文唯一 Snowflake ID
    author_username TEXT NOT NULL,      -- 作者 Handle (如 elonmusk)
    author_name TEXT NOT NULL,          -- 作者昵称展示名
    text TEXT NOT NULL,                 -- 清洗后的完整推文文本
    created_at TEXT NOT NULL,           -- X 原始时间戳 (如 "Fri Sep 21 14:32:00 +0000 2026")
    like_count INTEGER DEFAULT 0,       -- 点赞数
    retweet_count INTEGER DEFAULT 0,    -- 转推/转发数
    reply_count INTEGER DEFAULT 0,      -- 回复数
    quote_count INTEGER DEFAULT 0,      -- 引用数
    view_count INTEGER DEFAULT 0,       -- 浏览曝光量 (Impression)
    media_urls TEXT,                    -- 逗号分隔的原始图片/视频封面 URL
    source_type TEXT DEFAULT 'following',-- 采集来源: following | search | trends | user | list
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 本地入库时间戳
);

-- 核心加速索引
CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at);
CREATE INDEX IF NOT EXISTS idx_tweets_likes ON tweets(like_count);
CREATE INDEX IF NOT EXISTS idx_tweets_source ON tweets(source_type);
```

### 3.2 离线媒体与报告目录规约
- `data/auth_state.json`：仅存储 X 凭证状态（严格 Git 忽略）。
- `data/raw/raw_YYYYMMDD_HHMM.json`：保存近 30 天调试捕获的原始网络快照。
- `output/reports/YYYY-MM-DD.md`：每日关注流智能早报。
- `output/reports/trends_YYYY-MM-DD.md`：全网趋势深度研报。
- `output/tweet_{id}_{author}.md`：离线单篇/长推文无损归档文档。

---

## 4. 多厂商端点路由与特化参数映射

系统自动对 API Key 前缀或配置参数进行智能路由与特化参数装载：

| 厂商 | 标识 | 专属端点 Base URL | 特化思考参数 Payload |
| :--- | :--- | :--- | :--- |
| **阿里千问 (Token Plan)** | `qwen-token-plan` | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | `{"enable_thinking": true, "reasoning_effort": "high"}` |
| **阿里千问 (按量)** | `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `{"enable_thinking": true, "reasoning_effort": "high"}` |
| **智谱清言 (Coding Plan)**| `zhipu-code-plan` | `https://open.bigmodel.cn/api/coding/paas/v4` | `{"thinking": {"type": "enabled"}, "reasoning_effort": "high"}` |
| **智谱清言 (普通)** | `zhipu` | `https://open.bigmodel.cn/api/paas/v4` | `{"thinking": {"type": "enabled"}, "reasoning_effort": "high"}` |
| **DeepSeek** | `deepseek` | `https://api.deepseek.com/v1` | `{"thinking": {"type": "enabled"}, "reasoning_effort": "high"}` |
| **MiniMax** | `minimax` | `https://api.minimax.chat/v1` | `{"thinking": {"type": "enabled"}, "reasoning_split": true}` |
| **月之暗面 Kimi** | `kimi` | `https://api.moonshot.cn/v1` | `{"reasoning_effort": "high"}` |
| **OpenAI** | `openai` | `https://api.openai.com/v1` | `{"reasoning_effort": "high"}` |
| **Google Gemini** | `gemini` | 走本地 `agy` 账号免 Key 驱动通道 | `--effort high` / `thinking_level: HIGH` |
