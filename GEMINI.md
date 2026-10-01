# Xtract 工程宪法与 AI 协同基线 (Project Constitution)

## 1. 项目定位与终极目标
Xtract 是一款面向专业技术人员与创作者的高信噪比 X (Twitter) 实时情报雷达与 AI 结构化研报系统。
项目采用 **纯 Node.js / Electron（TypeScript）工业级单运行时架构**，实现 **GUI 桌面工作台 + Headless CLI 同一二进制双模运行**：
- **无参启动**：呼出跨平台原生桌面工作台（聚焦于 XTRACT 情报工作台，四维情报聚合、长文沉浸式阅读、免落盘视频流式播放与设置中心）；
- **带参启动**：命中命令行白名单时直接进入 Headless CLI，stdout 输出标准 JSON，stderr 输出诊断进度，支持终端与下游 Agent 管道组合。

---

## 2. 规范化文档体系与路由矩阵 (Documentation Matrix)
本项目实行**各司其职的文档分工体系**。AI 与开发者进行功能设计、开发或重构前，必须按图索骥查询对应权威文档：

| 关注维度 | 权威文档 | 核心职责 |
| :--- | :--- | :--- |
| **产品需求与业务规格** | [`docs/prd/`](file:///Users/chenzhian/workspace/ai/xtract/docs/prd/README.md) | 产品总览、整体进度大盘、已取消功能清单与版本化 PRD (v1.0/v1.1/v1.2/v2.0) |
| **系统总体架构 (HLD)** | [`docs/architecture.md`](file:///Users/chenzhian/workspace/ai/xtract/docs/architecture.md) | 系统分层、数据流向、IPC 通信契约、安全隔离模型与容灾机制 |
| **核心机制与详细设计 (LLD)** | [`docs/detailed_design.md`](file:///Users/chenzhian/workspace/ai/xtract/docs/detailed_design.md) | 抓取早停过滤、视频代理穿透、追评受控、级联删除、7大主流模型端点规范 |
| **研发日志与踩坑复盘** | [`docs/vibe-coding-log.md`](file:///Users/chenzhian/workspace/ai/xtract/docs/vibe-coding-log.md) | 历史攻坚踩坑记录、技术权衡理由与设计复盘 |
| **外部用户手册** | [`README.md`](file:///Users/chenzhian/workspace/ai/xtract/README.md) | 项目总览、5 分钟快速开始、CLI 速查表与文档索引（保持精简，细节一律下沉到下方 docs/） |
| **CLI 命令与工作流** | [`docs/cli-reference.md`](file:///Users/chenzhian/workspace/ai/xtract/docs/cli-reference.md) | 全部命令行参数详解、用法示例与典型工作流场景 |
| **凭据与模型配置** | [`docs/configuration.md`](file:///Users/chenzhian/workspace/ai/xtract/docs/configuration.md) | X 会话凭据、网络代理、7 大模型端点解析规则与双轨认证 |
| **部署与运维** | [`docs/operations.md`](file:///Users/chenzhian/workspace/ai/xtract/docs/operations.md) | 定时任务（cron / launchd）、存储架构与数据目录规范、FAQ |
| **研发流程与交付规约** | [`dev-workflow.md`](file:///Users/chenzhian/workspace/ai/xtract/dev-workflow.md) | Vibe-Coding 5步研发闭环、门禁检查流程与 Git 规范 |
| **敏捷功能演进** | [`openspec/`](file:///Users/chenzhian/workspace/ai/xtract/openspec/) | 每个增量变更的 Proposal、Delta Spec、Technical Design 与 Tasks |

---

## 3. 不可动摇的技术红线与设计基线 (Immutable Principles)
1. **纯单进程/单运行时架构红线**：
   - 严禁引入外挂 Python 进程、第三方逆向爬虫库或拉起“双重 Chromium”；必须通过单一 Node.js / Electron 运行时与 Playwright 官方网络流嗅探保障极低内存与零维护稳定性。
2. **用户体验最高准则**：
   - 系统承担复杂性，绝不允许白屏卡死、绝不允许无上限死等、绝不允许静默吞没错误（404/风控必须 3 秒内显式提示指引）。
3. **约束先行与真实探针准则**：
   - 严禁脱离实际凭空编造 DOM/GraphQL 结构；涉及复杂网络嗅探时，探针先行（Probing First）；严禁硬编码不存在的假用户或假数据。
4. **测试驱动开发 (TDD) 与全量自动化 E2E 交付红线**：
   - **编码一律 TDD**：开发任何新功能或逻辑变更前，严禁先写业务代码；必须先根据 Spec/PRD 编写测试用例（单元/集成），运行验证红灯失败后，再编写最小业务实现转绿，最后重构优化（Red-Green-Refactor 循环）；
   - **端到端 (E2E) 必须覆盖**：凡涉及跨进程 IPC 契约、GUI 桌面工作台核心交互、CLI 管道链路或复杂级联操作，必须在 `tests/gui-workbench.e2e.test.ts` 或 `tests/e2e.test.ts` 中补充或更新自动化端到端测试用例；
   - **自动化无人工介入**：所有测试必须通过 `pnpm test` 一键全自动执行（0 Failed），严禁依赖手动点按测试。
5. **Git 与安全红线**：
   - Commit Message 必须采用英文动词前缀（`feat:`, `fix:`, `refactor:`, `docs:`, `test:`）；
   - **严禁自动执行 `git push`**（必须等待用户明确指令）；
   - 密钥、Token 与本地会话凭据绝不入代码仓库。

---

## 4. 目录结构与数据物理映射
```
xtract/
├── README.md               # 外部用户说明书与快速上手
├── dev-workflow.md         # 研发流程与门禁规范
├── docs/                   # 架构、详细设计、用户文档、产品版本库与复盘沉淀
│   ├── prd/                # 版本化 PRD 体系 (README 进度大盘, v1.0, v1.1, v1.2, v2.0)
│   ├── architecture.md     # 高层架构 (HLD)
│   ├── detailed_design.md  # 详细设计 (LLD)
│   ├── cli-reference.md    # CLI 完整命令手册与工作流场景
│   ├── configuration.md    # 凭据、代理与多模型端点配置
│   ├── operations.md       # 定时任务、存储架构与 FAQ
│   └── vibe-coding-log.md  # 研发踩坑与复盘日志
├── openspec/               # 增量变更规范体系
├── src/
│   ├── main/               # Electron 主进程 & CLI 核心引擎 (client/storage/llm/pipeline)
│   ├── preload/            # 安全隔离桥梁 (ContextBridge)
│   └── renderer/           # GUI 工作台前端 (React 19 + 手写 CSS 设计令牌，无 UI 框架)
│       └── src/views/studio/  # 工作台模块：logic/formatters/useStudioData + 6 个展示组件
├── data/                   # 本地数据持久化（Git 忽略：tweets.db, auth_state.json）
└── output/                 # 归档产物（reports/ 早报, {author}/{tweet_id}/ 自包含 Page Bundle）
```

---

## 5. 核心运行命令与三大质量交付门禁

### 常用运行命令
- 依赖安装：`pnpm install`
- 启动 GUI 桌面应用（开发态）：`pnpm dev`
- 运行 Headless CLI 命令（开发态）：`pnpm dev:cli -- [命令选项]`
  - 查看全网趋势榜单：`pnpm dev:cli -- --trends [--category tech|all|business]`
  - 全网趋势深度研报：`pnpm dev:cli -- --trends-digest [--hours 24] [--provider qwen-token-plan]`
  - 关键词实时搜索：`pnpm dev:cli -- --search "<关键词>" [--min-likes 50]`
  - 查看或导出单推：`pnpm dev:cli -- --view <tweetId|url> [--author-replies | --no-author-replies]`
  - 级联删除推文及本地文件：`pnpm dev:cli -- --delete <tweetId|url> [-y]`
  - 检索本地推文：`pnpm dev:cli -- --list [数量]`

### 三大质量验收门禁 (交付必须 100% 通过)
每一次迭代交付前，必须主动全量跑通三大门禁。**统一入口是一条命令**：

```bash
pnpm verify     # 依次执行：pnpm lint && pnpm test && tsc --noEmit && vite build
```

任一环节失败即中断并返回非零退出码。三道门禁的明细：
1. **代码风格门禁**：`pnpm lint`（ESLint 9 flat config，0 Error）；
2. **测试套件门禁**：`pnpm test`（覆盖存储、网络嗅探、大模型调度、组件逻辑与 E2E，0 Failed）；
3. **静态类型门禁**：`npx tsc --noEmit`（强类型校验，0 Error）；
4. **构建打包门禁**：`npx vite build`（生产环境打包验证，0 Error / 0 Warning）。

代码风格由 ESLint 门禁强制（与 Prettier 规则互斥已通过 `eslint-config-prettier` 关闭冲突项）。

另提供 `pnpm format` / `pnpm format:check`（Prettier）作为**可选**工具，**不在门禁内**。
存量代码与 Prettier 默认输出差异较大（大量内联 style 的 JSX 会被重排），
首次全量格式化建议单独提交，不要混在功能变更里。
