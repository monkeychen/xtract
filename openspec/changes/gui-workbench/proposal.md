# Proposal

## Why

Xtract 目前已具备生产级 CLI 管道与核心流水线，但在桌面交互侧缺乏完整、严密对齐用户生产力目标的图形界面。作为独立开发者、AI 培训讲师与新媒体创作者，用户需要一套「结论先行、信噪比高、开箱即用」的情报内参工作台，一键获取每日早报、捕捉突发热点、提取培训选题与自媒体写作素材，并在离线环境下沉浸式精读与管理 Page Bundle 推文资产。

## What Changes

本变更引入 Xtract 桌面 GUI 原生界面与工作流，涵盖「3 核心视窗 + 1 常驻抽屉」：

- **智能研报 (Intelligence Reports)**：
  - 默认首页呈现最新早报与全网趋势深度研报（720px 版心编辑杂志风）；
  - **💡 选题便签栏 (Actionable Insights)**：从研报论述中自动提炼高价值新媒体选题与培训大纲，支持一键复制；
  - **论据联动溯源**：研报引文卡片支持点击一键跳转至工作台定位原推；
  - **校样稿流式思考容器 (Thinking Block)**：流式长思维链推演展示（支持展开/折叠与耗时统计）；
  - 一键复制 Markdown、Finder 中定位本地归档文件。
- **趋势雷达 (Trends Radar)**：
  - 科技前沿（默认）、全网综合、商业金融、全球时事多分类热点看板；
  - 卡片突出排名标号、话题名、推文体量与大模型提炼的结构化检索短语（Refined Query）；
  - 支持一键下钻到工作台看原始推文，或一键触发专项深度研报生成。
- **情报工作台 (Feeds & Search Studio)**：
  - 意图驱动的多数据源切换（时间线关注流 Following、全网搜索 Search、博主追踪 User、X Lists 列表）；
  - 全网搜索与博主追踪输入框默认绝对为空；搜索为空时直接呈现本地全库推文，有关键词时全库模糊检索；博主追踪跨库聚合博主推文；
  - X Lists 物理分区隔离：`list_id` 真实落库与强联动过滤，列表互不混淆；
  - 推特日期 ISO-8601 标准化与严格绝对物理时间倒序；
  - 推文全文与 X Article 万字长文自动识别同步，并引入 `activeTweetIdRef` 异步防竞态守卫；
  - 信噪比（SNR）门槛过滤药丸（`全部` / `50+ 赞` / `200+ 赞`）；
  - Master-Detail 双栏：左侧 380px 紧凑推文流，右侧 Page Bundle 离线全文与配图阅读器；
  - 底部浮动批量操作条（`.selbar`）多选导出 Markdown；
  - 级联物理清理（包含 `--dry-run` 预览与防误删确认）。
- **全局偏好设置抽屉 (Settings Drawer)**：
  - 刊头状态指示胶囊（X 会话有效性指示灯、代理状态）；
  - 免 Cookie 原生登录捕获与持久化；
  - 7 大主流模型与双轨认证（API Key / 账号订阅免 Key）；
  - 专属套餐端点自动识别（阿里 Token Plan `sk-sp-` / 智谱 Coding Plan）；
  - **模型深度推理开关与强度分级**：开关（ON/OFF）+ 3 级强度（低 Low / 中 Medium / 高 High，默认 ON-High）；
  - 代理穿透与国内模型自动旁路直连。

## Capabilities

### New Capabilities
- `gui-workbench`: 包含智能研报阅读与选题便签提取、全网趋势雷达下钻、多源推文工作台精读与级联清理、全局设置抽屉与模型深度推理控制的完整 GUI 交互规范。

### Modified Capabilities
<!-- 无现有 capability 发生需求变更 -->

## Impact

- **UI / 渲染进程**：新增桌面渲染进程界面组件与交互逻辑，严格遵循 Warm Editorial 暖色编辑杂志风规范；
- **Preload / IPC 通信**：`window.xtractAPI` 配置契约扩展支持 `reasoningEnabled` 与 `reasoningEffort` 字段；
- **LLM 调度层**：`src/main/llm/index.ts` 动态响应推理开关与强度参数并按厂商协议格式化请求体。
