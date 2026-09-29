# Project: Xtract (X Intelligence Radar & AI Digest)

## 1. 目标与背景
从 X（Twitter）个人的 Following（时间线关注流）、指定 Lists（列表）、特定博主、全网热门趋势（Explore Trends）以及关键词高级搜索（Search Timeline）中自动拉取最新实时推文，通过本地 SQLite 存储去重与互动指标信噪比过滤，利用国内外多大模型（双轨认证：API-Key / 账号订阅免Key）对核心讨论、要闻资讯与全网突发热点进行结构化聚类与研报生成。

本项目采用 **纯 Node.js / Electron（TypeScript）工业级架构**，实现 **GUI 桌面应用 + Headless CLI 同一二进制双模运行**：
- **无参启动**：呼出跨平台原生桌面 GUI 窗口（趋势雷达、监控信箱、搜索工作台、推文详情、智能研报阅读器与设置中心）；
- **带参启动**：命中命令行白名单时直接进入 Headless CLI，stdout 输出纯 JSON，stderr 输出进度，支持终端与 Agent 自动化调度。

## 2. 核心架构与设计决策

### 架构流程
`Fetch (Following / List / User / Search / Trends Playwright 拦截)` -> `Deduplicate & Store (better-sqlite3 去重落库)` -> `Filter (互动门槛与无效过滤)` -> `Summarize (多模型 SSE 流式调度)` -> `Output (Markdown 归档与 GUI 视图渲染)`

### 设计决策说明
1. **纯 Node.js / Electron 工业级单运行时架构**：
   - **为什么**：采用单一 Node.js / Electron 运行时，彻底消灭外挂进程或「双重 Chromium」带来的内存吞噬与性能卡顿；杜绝多进程 IPC 管道通信脆弱性，安装包轻量且跨平台原生签名体验极佳。
   - **对用户的影响**：安装包体积仅 ~100MB，内存占用极低，启动秒开，极致丝滑。
2. **GUI + CLI 同一二进制双模契约（参考 wx-kit 沉淀模式）**：
   - **为什么**：兼顾无技术背景大众（开箱即用图形交互）与高阶开发者/Agent 自动化需求（纯 JSON CLI 管道）。
   - **对用户的影响**：大众双击图标直接用，极客与自动化运维可通过终端无缝调用。
3. **采用 Playwright 监听官方网络流替代第三方逆向库**：
   - **为什么**：X 官方频繁重构前端打包结构（如 `responsive-web` 迁至 `x-web`），第三方逆向库频繁因反爬签名计算崩溃。而真实浏览器运行官方 JS 永远合法。
   - **对用户的影响**：零维护、防封抗风控、永不因 X 改版报废；抓取稳定性达到生产级。
4. **Electron 内嵌原生会话拦截（零 Cookie 认知）**：
   - **为什么**：无需像传统爬虫那样拉起外置浏览器或让用户 F12 查抓 Token。
   - **对用户的影响**：在桌面应用内直接通过原生窗口完成 X / Google 账号登录，系统自动调用 `session.defaultSession.cookies` 秒级捕获并持久化。
5. **better-sqlite3 本地增量去重**：
   - **为什么**：Node.js 生态最高性能的同步 C 绑定 SQLite 驱动，定时拉取按 `tweet_id` 主键入库，只抓增量。
   - **对用户的影响**：节省 LLM Token 成本，早报只呈现最新内容，本地几十万推文检索毫秒级返回。
6. **主动关键词高级搜索监控（Search Timeline）**：
   - **为什么**：Following 与 List 属于封闭白名单，无法监控圈外未关注用户的突发热点。拦截官方 `SearchTimeline` 支持 `min_faves:`、`lang:` 等高级语法。
   - **对用户的影响**：从「被动阅读关注流」升级为「主动追踪全网特定技术/商业主题情报」。
7. **互动信噪比门槛过滤（Engagement Filtering）**：
   - **为什么**：推特信息流充斥水帖、闲聊与低质灌水。按 `min_likes` / `min_retweets` 在采集、查阅、早报生成中过滤。
   - **对用户的影响**：大幅提升早报质量与阅读效率，专注高价值讨论。
8. **全网热搜与趋势雷达（Explore Trends Discovery）**：
   - **为什么**：解决用户在不知道关键词前置条件时的「信息盲区」。支持分类看板与全自动研报（默认 `tech`，开放全分类）。
   - **对用户的影响**：实现「从未知到已知」的情报闭环；零输入全自动发现热点并生成研报。
9. **统一多大模型驱动与双轨认证（Unified LLM & Dual-Track Auth）**：
   - **为什么**：支持国内外 7 大主流大模型（Google Gemini, OpenAI GPT, DeepSeek, 阿里通义千问 Qwen, 智谱清言 GLM, MiniMax, 月之暗面 Kimi）；同时支持 API Key 计费与账号认证模式。
   - **对用户的影响**：零额外 API 账单（直接复用月付订阅）；专属套餐端点（Token Plan / Coding Plan）智能识别路由。
10. **AI 辅助搜索词提炼与安全串行节流（AI Query Refinement & Safe Sequential Crawling）**：
    - **为什么**：X Explore 趋势话题多为一整句新闻长标题，直接全句在推特搜索几乎搜不到推文；并发请求极易被 X 识别为爬虫触发 429 限制或封号。
    - **对用户的影响**：大模型提炼核心实体短语，大幅提升推文抓取质量；坚持安全串行与适度停顿，零封禁风险。
11. **SSE 流式传输与全量 High 级长推理保障（Streaming & High Reasoning by Default）**：
    - **为什么**：长思维链推演可能长达数分钟，非流式 HTTP 易触发 ReadTimeout 断开。
    - **对用户的影响**：全面引入原生 SSE 流式连接与国内节点隔离直连，打字机实时展示思考过程，消除黑屏焦虑。
12. **多层时效性双重过滤保障（Multi-layer Freshness Guarantee）**：
    - **为什么**：X 官方 Top（热门）算法基于全网历史累计互动量，仅搜关键词极易把数月前的万赞长青旧帖推在前面。
    - **对用户的影响**：系统在搜索层自动注入 X 原生 `since:YYYY-MM-DD` 时间算子（支持 `--hours`），并在语料进入大模型前进行 `created_at` 的 UTC 二次硬校验，彻底阻断陈旧推文。

### 7 大主流模型 2026 最新版本与文档约定（全量默认开启推理/思考模式与多模态，等级为 high）
- **Google Gemini**：默认主力 `gemini-3.8-flash`（高智商超高速，全模态，`--effort high` / `thinking_level: HIGH`），长推理 `gemini-3.1-pro`，轻量 `gemini-2.5-flash`。
- **OpenAI GPT**：默认主力 `gpt-5.6-sol`（GPT-5.6 Sol 旗舰全模态推理，默认 `reasoning_effort: "high"`，兼容 `gpt-5.6` 别名）。
- **DeepSeek**：默认主力 `deepseek-flash`（DeepSeek-V4.1-Flash，1M上下文多模态，默认 `thinking: {"type": "enabled"}` 与 `reasoning_effort: "high"`），高阶 `deepseek-v4-pro`。
- **阿里通义千问 Qwen**：默认主力 `qwen3.8-flash`（原生全模态推理，默认携带 `enable_thinking: true` 与 `reasoning_effort: "high"`），旗舰 `qwen3.8-max`，平衡版 `qwen3.7-plus`。
  - 普通按量端点：`https://dashscope.aliyuncs.com/compatible-mode/v1`（Key 为 `sk-` 开头）
  - **Token Plan 专属端点**：`https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`（Key 为 `sk-sp-` 开头，系统自动识别）
- **智谱清言 Zhipu**：默认主力 `glm-5.3-flash`（原生多模态高吞吐，默认携带 `thinking: {"type": "enabled"}` 与 `reasoning_effort: "high"`），旗舰复杂工程 `glm-5.3`，极速 `glm-5.3-flashx`。
  - 普通开放平台端点：`https://open.bigmodel.cn/api/paas/v4`
  - **Coding Plan 专属端点**：`https://open.bigmodel.cn/api/coding/paas/v4`
- **MiniMax**：默认主力 `MiniMax-M3`（1M多模态旗舰，默认启用 `thinking: {"type": "enabled"}` 与 `reasoning_split: true`），极速 `MiniMax-M2.7-highspeed`。
- **月之暗面 Kimi**：默认主力 `kimi-k3`（2.8T参数1M上下文旗舰，原生全模态推理，默认携带 `reasoning_effort: "high"`），代码 `kimi-k2.7-code`。

---

## 3. 目录与命名规范

```
xtract/
├── GEMINI.md               # 项目规范与架构约定（本文件）
├── LICENSE                 # Apache-2.0 开源协议
├── README.md               # 项目产品指南与使用手册
├── package.json            # Node.js 项目配置与构建脚本
├── pnpm-lock.yaml          # pnpm 依赖锁定
├── tsconfig.json           # TypeScript 全局配置
├── electron-builder.yml    # 跨平台安装包构建配置
├── docs/                   # 正式工程设计与架构文档
│   ├── architecture.md     # 系统总体架构设计 (HLD)
│   ├── detailed_design.md  # 详细设计与核心机制 (LLD)
│   └── vibe-coding-log.md  # 项目全周期复盘与踩坑设计日志
├── src/
│   ├── main/               # Electron 主进程 & CLI 核心引擎
│   │   ├── index.ts        # 双模入口分发器 (无参启动 GUI / 有参进入 CLI)
│   │   ├── config.ts       # 配置加载与持久化
│   │   ├── client/         # Playwright 拦截与推特官方流嗅探
│   │   ├── storage/        # better-sqlite3 存储与 Markdown 导出
│   │   ├── llm/            # 7 大主流大模型统一驱动与 SSE 流式长推理
│   │   └── pipeline/       # 全生命周期流水线 (Trends/Search/Digest 编排)
│   ├── preload/            # 安全隔离桥梁 (ContextBridge)
│   │   └── index.ts        # 强类型 IPC 通信接口
│   └── renderer/           # GUI 渲染进程前端 (SPA)
│       ├── index.html      # 主视窗入口
│       └── src/            # 界面视图组件 (趋势雷达/监控信箱/搜索/阅读器/设置)
├── data/                   # 本地数据持久化（Git 忽略）
│   ├── tweets.db           # SQLite 数据库
│   └── auth_state.json     # X 登录持久化凭据
└── output/                 # 输出结果
    ├── reports/            # 导出的 Markdown 研报（YYYY-MM-DD.md / trends_YYYY-MM-DD.md）
    └── {author}/           # 按博主与文章 ID 组织的自包含单篇推文包 (Page Bundle)
        └── {tweet_id}/     # 单篇推文独立归档目录
            ├── index.md    # 推文全文 Markdown 文档（图片直接相对引用 images/...）
            └── images/     # 该推文专属的本地配图文件夹
```

### 规范约定
- **文件与变量命名**：TypeScript 文件采用 `camelCase` 或 `kebab-case`；类名与接口采用 `PascalCase`；常量采用 `UPPER_CASE`。
- **数据保留策略**：
  - `data/tweets.db`：持久化保留推文元数据用于历史去重。
  - `output/reports/`：早报输出文件命名为 `YYYY-MM-DD.md`，趋势研报命名为 `trends_YYYY-MM-DD.md`。
  - `output/{author}/{tweet_id}/`：单篇推文自包含归档包（Page Bundle 模式），正文固定命名为 `index.md`，配图统一落盘于同级 `images/`，移动或迁移时不破坏相对链接。
- **数据清理与级联删除规约**：
  - 支持按推文 ID/URL、博主用户名、日期范围（`--since` / `--until`）或留存时长（`--older-than`）执行删除。
  - 删除必须保证 SQLite 数据库与本地文件强一致级联清理：物理删除对应推文的 `output/{author}/{tweet_id}/` 目录，若作者目录为空则顺带修剪空目录。
  - 防误删保护：要求至少提供一项筛选条件；提供 `--dry-run` 预览演练机制；脚本化执行需带 `-y / --yes`。

---

## 4. 运行与验证命令
- 依赖安装：`pnpm install`
- 启动 GUI 桌面应用（开发态）：`pnpm dev`
- 运行 Headless CLI 命令（开发态）：`pnpm dev:cli -- [命令选项]`
  - 查看全网趋势榜单：`pnpm dev:cli -- --trends [--category tech|all|business]`
  - 生成全网趋势深度研报：`pnpm dev:cli -- --trends-digest [--hours 24] [--provider qwen-token-plan]`
  - 关键词实时搜索：`pnpm dev:cli -- --search "<关键词>" [--min-likes 50]`
  - 查看或导出单篇推文：`pnpm dev:cli -- --view <tweetId|url>`
  - 级联删除推文及本地文件：
    - 按单篇 ID 删除：`pnpm dev:cli -- --delete <tweetId|url> [-y]`
    - 按博主批量删除：`pnpm dev:cli -- --delete --user <username> [-y]`
    - 按日期范围删除：`pnpm dev:cli -- --delete --since 2026-09-01 --until 2026-09-15 [-y]`
    - 按过期天数删除：`pnpm dev:cli -- --delete --older-than 30d [-y]`
    - 演练预览（不实际删除）：`pnpm dev:cli -- --delete --user <username> --dry-run`
  - 仅抓取关注流：`pnpm dev:cli -- --fetch-only`
  - 仅生成今日早报：`pnpm dev:cli -- --report-only [--hours 24]`
  - 检索本地推文：`pnpm dev:cli -- --list [数量]`
- 运行自动化测试：`pnpm test`
- 类型合规校验：`npx tsc --noEmit`
- 生产构建验证：`npx vite build`
- 构建全平台桌面安装包（DMG / EXE）：`pnpm build`

---

## 5. 开发流程与质量规约（Vibe-Coding 工作流）
详细工程落地规约参见根目录：[dev-workflow.md](file:///Users/chenzhian/workspace/ai/xtract/dev-workflow.md)

### 核心研发哲学
1. **第一性原理与决策透明**：所有决策从问题本质出发，不因「惯例如此」照搬；向用户讲清技术决策的「为什么」与「对用户体验的影响」。
2. **用户体验是最高准则**：系统承担复杂性；绝不允许无反馈白屏、无上限卡顿死等；绝不允许静默吞没错误（如 404/无权限错误必须在 3 秒内主动抛出并提示修复指引）。
3. **约束先行与真实探针**：修改已有规范先改文档再改代码；涉及复杂网络嗅探与第三方协议逆向时，**探针先行（Probing First）**，挂真实代理与真实凭据验证真实 DOM/GraphQL 结构，严禁脱离实际凭空假设。
4. **防御性编码与零假数据准则**：严禁硬编码不存在的假用户、假推文、假列表 ID；预置数据必须经过真实连通性测试。网络流嗅探必须配备 DOM 提取双轨兜底。

### 标准五步研发闭环 (Vibe-Coding 5-Step Loop)
```
[1. 探针先行] -> [2. 规范先行] -> [3. 坚固实现] -> [4. 全量验证] -> [5. 安全归档]
 (Probing)        (Spec/Doc)       (Coding)         (E2E Tests)      (Git Commit)
```

### 三大质量验收门禁 (交付必须 100% 通过)
每一次功能迭代或 Bug 修复交付前，必须主动运行并全量通过以下三大门禁：
1. **测试套件门禁**：`pnpm test`（覆盖存储去重、网络嗅探、大模型调度等核心单测与集成测试，0 Failed）；
2. **静态类型门禁**：`npx tsc --noEmit`（强类型校验，0 TypeScript Error）；
3. **构建打包门禁**：`npx vite build`（生产环境打包验证，0 Error / 0 Warning）。

### Git 提交规范
- Commit Message 统一采用英文动词开头的前缀规约（`feat:`, `fix:`, `refactor:`, `docs:`, `test:`）；
- **严禁自动执行 `git push`**：push 仅用于跨设备同步，必须等待用户明确指令后方可执行。

