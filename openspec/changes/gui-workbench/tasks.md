# Tasks

## 1. Prototype & Specification Sign-off

- [x] 1.1 更新并交付零依赖高保真原型 `docs/prototype.html`，100% 映射 specs 中所列的选题便签、引文反查跳转、多源数据切换、以及模型推理开关与 Low/Medium/High 三级强度调节
- [x] 1.2 运行 `openspec validate gui-workbench` 确保规范语法与前后依赖 100% 通过，等待人类审查签署

## 2. IPC & LLM Architecture Contracts

- [x] 2.1 在 `src/preload/index.ts` 与 `src/main/ipc/index.ts` 中扩展 `AppConfigView`，新增 `reasoningEnabled` 与 `reasoningEffort` 契约字段并通过测试
- [x] 2.2 在 `src/main/llm/index.ts` 中实现统一推理适配器逻辑，根据配置动态转换并注入对应厂商（Gemini / OpenAI / DeepSeek / Qwen / Zhipu / MiniMax / Kimi）的 reasoning 参数

## 3. UI Component & View Implementation

- [x] 3.1 在 `src/renderer/src/views/ReportsView.tsx` 中实现「💡 选题便签栏」与「引文卡片一键点击直达工作台高亮原推」的联动机制
- [x] 3.2 在 `src/renderer/src/views/TrendsView.tsx` 中实现分类热榜看板、AI 检索短语呈现、以及点击下钻到工作台自动执行检索
- [x] 3.3 在 `src/renderer/src/views/StudioView.tsx` 中补齐关注流/搜索/博主/Lists 四大源切换、信噪比滑块过滤、Page Bundle 本地配图预览、以及级联物理清理弹窗
- [x] 3.4 在 `src/renderer/src/components/SettingsDrawer.tsx` 中实现大模型推理开关（ON/OFF）及低/中/高三级强度选择器，并实现与后端持久化同步

## 4. Verification & Testing

- [x] 4.1 运行全套自动化测试 `pnpm test`，确保原有 31 个测试用例及新增 IPC 契约测试 100% 通过
- [x] 4.2 执行生产构建 `npx tsc --noEmit && npx vite build`，确保无类型错误且打包耗时与体积达标

## 5. Data Invariants, Real Counting & Cascade Cleanup Enforcement

- [x] 5.1 数据库 `source_type` 首次入库永久固定规约：保证 `saveTweets` 使用 `INSERT OR IGNORE`，同一推文再次被抓取时直接去重跳过，绝不覆盖首次落库的 `source_type`
- [x] 5.2 Storage 与 IPC 查询增强：`listTweets` 支持按 `source_type` 隔离过滤并按 `created_at DESC` 严格倒序，新增精准 `countTweets` 统计接口与 `offset` 分页支持
- [x] 5.3 工作台前端渲染重构：彻底删除 88 硬编码，接入真实动态总数统计；底部「加载更多」严格按当前过滤条件带 offset 分页，到底部精准显示「已加载全部 X 篇」
- [x] 5.4 彻查并打通多选批量真实物理级联删除：浮动操作条点击批量删除经二次确认后，真实调用 `deleteTweets` 级联删除 SQLite 记录与磁盘 Page Bundle 文件并即时刷新
- [x] 5.5 编写并通过完整自动化测试（单元测试、真实浏览器端到端测试与全量构建），验证每个功能的真实性与可靠性
- [x] 5.6 历史存量数据（Legacy）平滑迁移与防死锁认领晋级机制：将历史存量数据统一标记为 legacy，在 saveTweets 命中已有 legacy 推文时晋级为当前正式来源，解除重抓死锁
- [x] 5.7 视图查询层向下兼容：关注流兼容 following + legacy，博主定向追踪兼容 user + legacy，确保老数据在界面不丢失
