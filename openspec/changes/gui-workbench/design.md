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
- **决定**：左侧栏固定 `380px`，采用 `.feed-item` 紧凑行模式（博主印章首字 + 昵称 + 两行摘要 + 互动徽章），单屏可高效扫读 8~10 条推文；右侧版心 `720px` 严格遵循杂志精读风，还原 Page Bundle 本地高清配图与未截断长文。

## Risks / Trade-offs

- **[Risk] 国内外模型在不同推理强度下的等待时间差异大**  
  → **Mitigation**: 在研报生成态中通过 `ThinkingBlock` 提供朱砂脉冲圆点与实时秒级计时器，若推理关闭则直接跳过该容器打字吐出正文，彻底消除黑屏焦虑。
- **[Risk] 本地推文列表数据量大时可能导致滚动掉帧**  
  → **Mitigation**: 列表容器采用 `content-visibility: auto` 与 `contain-intrinsic-size`，保持极低渲染开销。
