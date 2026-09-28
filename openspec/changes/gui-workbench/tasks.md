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
