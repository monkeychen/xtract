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

### 4. 推文来源标识的「首次入库永久固定」去重原则 (First-crawl Invariance)
- **为什么**：推文在全网可能同时出现在关注流、全网搜索、博主主页或特定 X 列表中。如果后续抓取通过 `INSERT OR REPLACE` 覆盖 `source_type`，会导致推文在工作台各数据源之间乱窜，破坏用户的分类认知。
- **决定**：
  1. 抓取入库统一采用 `INSERT OR IGNORE INTO tweets ...`，主键为 `tweet_id`；
  2. 首次入库记录该推文被发现时的 `source_type`（`following` / `search` / `user` / `list`），一旦写入终身不可被其他后续数据源抓取所篡改；
  3. 后续再次命中该推文时判定为重复，直接跳过并计入 `skipped`；
  4. 工作台切换数据源时，严格根据 `source_type` 执行过滤，并严格按 `created_at DESC` 时间倒序排列（最新在前）。

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

## Risks / Trade-offs

- **[Risk] 国内外模型在不同推理强度下的等待时间差异大**  
  → **Mitigation**: 在研报生成态中通过 `ThinkingBlock` 提供朱砂脉冲圆点与实时秒级计时器，若推理关闭则直接跳过该容器打字吐出正文，彻底消除黑屏焦虑。
- **[Risk] 本地推文列表数据量大时可能导致滚动掉帧**  
  → **Mitigation**: 列表容器采用 `content-visibility: auto` 与 `contain-intrinsic-size`，保持极低渲染开销。
