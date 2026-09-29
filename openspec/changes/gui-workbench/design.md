# Design

## Context

见 `proposal.md`。Xtract 底层已具备稳定的 CLI 执行能力、SQLite 增量存储以及 Preload 强类型 ContextBridge 通信层。界面视觉体系基于 `docs/design-system.md` 确立的「暖色编辑杂志风（Warm Editorial）」。本设计聚焦于桌面 GUI 渲染进程的具体界面布局、状态模型、以及大模型推理控制的软硬件契约。

## Goals / Non-Goals

**Goals:**
- 实现「3 核心视窗 + 1 常驻抽屉」的一体化流式桌面布局；
- 建立单文件零依赖高保真原型 `docs/prototype.html`，100% 映射 specs 中声明的全部行为场景，作为人类评审门禁；
- 在全局设置抽屉与 Preload IPC 中打通推理开关（`reasoningEnabled`）与三级强度（`reasoningEffort`）的统一映射；
- 建立智能研报视窗中「💡 选题便签栏」与「引文点击直达工作台定位原推」的双向闭环。

**Non-Goals:**
- 不引入多窗口系统（保持单一 SPA 视窗与侧边抽屉，避免窗口管理复杂性）；
- 不做云端同步服务（所有 Page Bundle 与推文数据严格保留在本地 SQLite 与磁盘）。

## Decisions

### 1. 原型与规格的双向可追溯映射 (Traceability Matrix)
- **为什么**：杜绝 AI 凭空捏造界面或遗漏功能点。
- **决定**：在 `docs/prototype.html` 中以原生语义化 HTML+CSS+JS 完整实现所有交互，每一个规范中的 Requirement 都在原型中有独立对应的交互元素：
  - 智能研报视窗：顶部 24h/3d/7d 时间药丸、选题便签栏、引文卡片跳转定位、流式思考块与耗时；
  - 趋势雷达视窗：分类胶囊、看板卡片、AI 提炼检索词、双动作按钮；
  - 情报工作台视窗：多源单选（关注流/搜索/博主/列表）、信噪比滑块、Master-Detail、浮动批量条、级联删除弹窗；
  - 设置抽屉：X 登录捕获、7 大模型选择、推理开关与 Low/Medium/High 三级药丸选择器。

### 2. 模型深度推理参数的「统一门面」映射设计
- **为什么**：7 大主流模型厂商在开启长推理时的参数字段互不兼容（如 Gemini 用 `thinking_level`，OpenAI 用 `reasoning_effort`，Qwen 用 `enable_thinking`，DeepSeek 用 `thinking.type`）。若把厂商差异直接暴露在前端，会极大增加用户心智负担。
- **决定**：前端设置抽屉与 IPC 统一为标准契约：
  - `reasoningEnabled`: `boolean` (开关)
  - `reasoningEffort`: `'low' | 'medium' | 'high'` (三级强度，默认 `high`)
  - 后端 `src/main/llm/index.ts` 内部作为 Adapter，动态格式化为对应厂商所需的 HTTP Payload。

### 3. Master-Detail 双栏阅读器节奏设计
- **决定**：左侧栏固定 `380px`，采用 `.feed-item` 极简单行模式（作者首字母印章 + 昵称/Handle + 相对时间 + 首行紧凑点赞/转推徽章；第二行纯单行标题/第一行文字），彻底消灭多余的 120 字 snippet 冗长堆砌；右侧版心 `720px` 严格遵循杂志精读风，还原 Page Bundle 本地高清配图与未截断长文。

### 4. 首次入库来源审计元数据固定与意图驱动的本地全库检索 (Intent-First Local Search)
- **为什么**：推文在全网可能同时出现在关注流、全网搜索、博主主页或特定 X 列表中。推文的初次抓取来源是重要的审计元数据，绝不能被后续抓取覆盖；但在本地推文查询与精读时，用户的检索意图应当优先于死板的来源隔离。
- **决定**：
  1. **元数据入库原则**：抓取入库统一采用 `INSERT ... ON CONFLICT(tweet_id) DO UPDATE`，首次入库记录该推文被发现时的 `source_type`，后续重复命中仅更新互动指标与长文本，绝不覆盖篡改已有的正式 `source_type`；
  2. **意图驱动的本地检索策略 (Intent-First)**：
     - **全网搜索模式**：输入框默认绝对为空；为空时相当于不添加任何关键词过滤条件，向用户呈现本地全库所有已入库的推文（按时间倒序排列）；用户输入关键词时，系统彻底放开 `source_type` 限制，直接对本地全库推文的正文、作者昵称与用户名进行全文模糊检索（`LIKE %query%`），彻底解决“明明关注流抓过却搜不出来”的体验割裂；
     - **博主追踪模式**：输入框默认绝对为空；用户输入具体博主用户名时，系统彻底放开 `source_type` 限制，跨关注流、列表和搜索聚合该博主在本地全库的所有推文；
     - **关注流模式**：兼容呈现 `following` 与 `legacy` 推文，并在顶部提供直连 SQLite 的实时全文防抖过滤；
     - **X 列表模式**：严格依据选中的 `list_id` 执行分区隔离。

### 5. 真实动态统计、条件保全式分页加载与真实批量级联物理删除
- **为什么**：杜绝前端写死虚假数字（如硬编码的 `88` 篇），杜绝分页加载时脱离过滤条件把全库不相干推文混入，杜绝只改前端状态不删文件的“假删除”。
- **决定**：
  1. 后端 Storage 与 IPC 暴露真实的 `countTweets` 或在查询时返回符合当前条件的精确 `totalCount`；
  2. 底部“加载更多”必须原样携带当前的全部条件（`source`、`minLikes`、`query`、`user`）并以当前已有条数作为 `offset` 追加历史推文；
  3. 当加载条数达到总数时，明确提示「已加载全部 X 篇推文」并禁用按钮；
  4. 多选批量删除直连后端 `deleteTweets` 接口，原子执行 SQLite 物理删除与本地磁盘 Page Bundle 目录（含图片）强一致物理清理，删除后即时刷新前端列表与计数。

### 6. 存量历史推文兼容、防死锁晋级机制 (Legacy Compatibility & Promotion)
- **为什么**：在引入 `source_type` 之前已存入 SQLite 的历史推文（如用户此前抓取的特定博主推文或全网搜索推文），在数据库迁移时缺乏明确的来源归属。若草率全量默认降级为 `following`，会导致历史推文在「博主追踪」中隐形消失；且因“以首次抓取来源为准”铁律，用户在博主主页重抓时会被当成重复忽略，导致这些推文被永久锁死在 `following`，形成无法自愈的逻辑死锁。
- **决定**：
  1. **明确存量状态（`legacy`）**：历史未带来源标识的存量推文，在数据库迁移时显式标记为 `'legacy'`，不随意冒充 `following`；
  2. **破除死锁（Legacy Promotion）**：当用户在新版本中通过明确入口（如博主追踪 `user`、全网搜索 `search`）抓取推文命中已有推文时：
     - 若该推文来源已是明确的正式来源（`following/search/user/list`），严格保持首次来源不变，直接跳过去重；
     - **若该推文在库中的来源为 `legacy`**，则允许其由无来源的历史存量状态**被当前明确入口首次认领并晋级（Promote）**为对应数据源，解开历史死锁；
  3. **视图查询层的向下兼容**：
     - 在「关注流」下：展示 `following` 以及未被认领的 `legacy` 历史推文，保障用户时间线阅读连贯性；
     - 在「博主追踪」下：若用户输入了具体的博主用户名（如 `@karpathy`），查询条件兼容匹配该作者的 `legacy` 存量推文，确保此前入库的内容即使未重抓也能立即可见；
     - 在「全网搜索」下：若用户输入了检索词，同理兼容匹配符合词频的 `legacy` 存量推文。

### 7. 多列表物理 list_id 隔离机制 (Physical List Isolation)
- **为什么**：用户在 X 上可能拥有或关注多个不同领域的 Lists（如 AI 研究、宏观金融、产品创作者）。若在落库与查询中没有物理绑定列表标识，会导致所有列表抓取的推文在界面互相混杂。
- **决定**：
  1. 数据库 `tweets` 表新增 `list_id TEXT` 字段，并在该字段上建立同步检索索引 `idx_list_id`；
  2. 管道执行列表抓取（`fetchListAndStore`）时，强制将对应列表真实 ID 写入每条推文记录；
  3. 前端工作台选择或切换列表时，前端与后端查询强联动，严格执行 `WHERE list_id = ?`，实现列表数据物理隔离。

### 8. 推特日期 ISO-8601 标准化与绝对物理倒序 (Strict Chronological Ordering via ISO-8601)
- **为什么**：推特官方返回的发表日期为 RFC2822 格式（如 `Wed Aug 26 ...`、`Tue Sep 29 ...`）。因为星期英文首字母（`W` 的 ASCII 码大于 `T`）导致按字符串排序时，8 月份的历史文章被错误排在 9 月份最新推文的前面。
- **决定**：
  1. 在数据入库管道与 Storage 统一引入 `normalizeTweetDate` 函数，将推特 RFC2822 日期强制转换为国际标准 ISO-8601 字符串（`YYYY-MM-DDTHH:mm:ss.sssZ`）；
  2. 对数据库历史存量推文进行全量数据清洗迁移；
  3. 彻底确保 `ORDER BY created_at DESC` 在数据库索引与展示层面达到 100% 物理时间严格倒序。

### 9. X Article 万字长文按需识别与深度同步 (X Article Deep Long-form Recognition & Sync)
- **为什么**：推特除了常规短推文和 Note Tweet 外，近年来推出了 X Article 原生万字长文（格式形如 `x.com/i/article/...`）。常规爬虫抓取只能拿到卡片引文，正文大量截断。
- **决定**：
  1. 在正文和外链中检测到 `x.com/i/article/...` 标识时，推文列表醒目打上「📰 深度长文」专属徽标；
  2. 点击推文进入详情时，自动识别长文链接并调度专门的长文阅读嗅探器，完整拉取多达万字的正文与高清配图并导出 Page Bundle。

### 10. 推文详情异步请求竞态防护守卫 (Active Tweet ID Race Guard)
- **为什么**：当用户在左侧快速连续点击多篇推文时，异步同步请求（尤其是长文拉取）可能耗时数秒。由于闭包与网络返回时差，先点击的推文 A 若后返回，会错误冲掉用户当前正在阅读的推文 B 的详情内容。
- **决定**：
  1. 在前端引入 `activeTweetIdRef` 请求守卫；
  2. 每次点击推文时立即重置 `activeTweetIdRef.current = tweet.tweet_id`；
  3. 异步接口返回时，强制校验 `activeTweetIdRef.current === tweet.tweet_id`；若已切换至新推文，丢弃过期的覆盖操作，从根源消除异步竞态 Bug。

## Risks / Trade-offs

- **[Risk] 国内外模型在不同推理强度下的等待时间差异大**  
  → **Mitigation**: 在研报生成态中通过 `ThinkingBlock` 提供朱砂脉冲圆点与实时秒级计时器，若推理关闭则直接跳过该容器打字吐出正文，彻底消除黑屏焦虑。
- **[Risk] 本地推文列表数据量大时可能导致滚动掉帧**  
  → **Mitigation**: 列表容器采用 `content-visibility: auto` 与 `contain-intrinsic-size`，保持极低渲染开销。
