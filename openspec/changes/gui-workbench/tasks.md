# Tasks

## 1. Prototype & Specification Sign-off

- [x] 1.1 更新并交付零依赖高保真原型 `docs/prototype.html`，100% 映射 specs 中所列的选题便签、引文反查跳转、多源数据切换、以及模型推理开关与 Low/Medium/High 三级强度调节
- [x] 1.2 运行 `openspec validate gui-workbench` 确保规范语法与前后依赖 100% 通过，等待人类审查签署

## 2. IPC & LLM Architecture Contracts

- [x] 2.1 在 `src/preload/index.ts` 与 `src/main/ipc/index.ts` 中扩展 `AppConfigView`，新增 `reasoningEnabled` 与 `reasoningEffort` 契约字段并通过测试
- [x] 2.2 在 `src/main/llm/index.ts` 中实现统一推理适配器逻辑，根据配置动态转换并注入对应厂商（Gemini / OpenAI / DeepSeek / Qwen / Zhipu / MiniMax / Kimi）的 reasoning 参数

## 3. UI Component & View Implementation

- [x] 3.1 剥离不可用二级 Tab，聚焦单一「XTRACT 情报工作台 (StudioView)」，以顶部四维 Chip 承载关注流、全网搜索、博主追踪与 X 列表
- [x] 3.2 在 `src/renderer/src/views/StudioView.tsx` 中补齐关注流/搜索/博主/Lists 四大源切换、信噪比滑块过滤、Page Bundle 本地配图预览、以及级联物理清理弹窗
- [x] 3.3 在 `src/renderer/src/components/SettingsDrawer.tsx` 中实现大模型推理开关（ON/OFF）及低/中/高三级强度选择器，并实现与后端持久化同步

## 4. Verification & Testing

- [x] 4.1 运行全套自动化测试 `pnpm test`，确保原有测试用例及新增 IPC 契约测试 100% 通过
- [x] 4.2 执行生产构建 `npx tsc --noEmit && npx vite build`，确保无类型错误且打包耗时与体积达标

## 5. Data Invariants, Real Counting & Cascade Cleanup Enforcement

- [x] 5.1 数据库 `source_type` 首次入库永久固定规约：保证 `saveTweets` 使用 `INSERT OR IGNORE`，同一推文再次被抓取时直接去重跳过，绝不覆盖首次落库的 `source_type`
- [x] 5.2 Storage 与 IPC 查询增强：`listTweets` 支持按 `source_type` 隔离过滤并按 `created_at DESC` 严格倒序，新增精准 `countTweets` 统计接口与 `offset` 分页支持
- [x] 5.3 工作台前端渲染重构：彻底删除 88 硬编码，接入真实动态总数统计；底部「加载更多」严格按当前过滤条件带 offset 分页，到底部精准显示「已加载全部 X 篇」
- [x] 5.4 彻查并打通多选批量真实物理级联删除：浮动操作条点击批量删除经二次确认后，真实调用 `deleteTweets` 级联删除 SQLite 记录与磁盘 Page Bundle 文件并即时刷新
- [x] 5.5 编写并通过完整自动化测试（单元测试、真实浏览器端到端测试与全量构建），验证每个功能的真实性与可靠性
- [x] 5.6 历史存量数据（Legacy）平滑迁移与防死锁认领晋级机制：将历史存量数据统一标记为 legacy，在 saveTweets 命中已有 legacy 推文时晋级为当前正式来源，解除重抓死锁
- [x] 5.7 视图查询层向下兼容：关注流兼容 following + legacy，博主定向追踪兼容 user + legacy，确保老数据在界面不丢失

## 6. Trends Radar Caching Gate & Dual-Track Fetch Reliability

- [x] 6.1 Trends IPC 严格门禁：当 `!args?.refresh` 时仅读取本地缓存，若无缓存返回空数组（`fromCache: true`），坚决阻断暗中启动 Playwright 爬虫卡顿前端
- [x] 6.2 Trends 抓取器导航韧性：路由对齐 X Explore 最新规范（trending / news / sports / entertainment / tech），切换为 `commit` 加载并智能轮询趋势渲染
- [x] 6.3 GraphQL + DOM 双轨抽取与数据增强：当 GraphQL 拦截未命中或字段缺失时，由 DOM `[data-testid="trend"]` 自动兜底抽取话题名、精准帖子数与分类，实现 100% 抓取率
- [x] 6.4 运行全套自动化测试并进行端到端验证，确保所有既有用例与趋势抓取完全通过

## 7. X Lists Crawling Overhaul & Genuine Verified Public Lists

- [x] 7.1 清除无效假 ID：清除 `1827364512938` 等 404 伪造列表，替换为真实活跃且实测验证的公开精选列表（如 `1682802314011197441` AI & Tech Creators）
- [x] 7.2 列表有效性主动检测与明确报错：识别 X 404 / 不存在 / 私密页面状态，遇到无效列表即时抛出清晰可操作的错误引导，杜绝静默返回 0 篇
- [x] 7.3 `fetchListTimeline` 智能轮询与双轨抽取：拦截命中或推文渲染即刻提前结束，耗时从 30s 缩减至 4s；自动提取 `ListByRestId` 真实名称并持久化
- [x] 7.4 `fetchUserLists` 统一升级为官方 `/i/lists` 路由，账号无自建列表时优雅降级并引导输入公开链接
- [x] 7.5 全量自动化测试与真实抓取验证：确保所有既有测试及新增 List 校验测试 100% 通过，生产构建 0 错误

## 8. Multi-Source Search Intent Relaxation & List ID Isolation

- [x] 8.1 SQLite 数据库表迁移：新增 `list_id TEXT` 字段并在迁移完成后创建 `idx_list_id` 物理索引，支持列表物理分区
- [x] 8.2 存储层 `buildWhereClauses` 重构：全网搜索在前端无关键词时查全库、有关键词时全库模糊检索；博主追踪指定作者时放开来源壁垒全库聚合；关注流支持本地全文过滤；列表精准按 `list_id` 过滤
- [x] 8.3 前端 `StudioView.tsx` 交互重构：全网搜索与博主追踪输入框默认绝对为空，彻底消除硬编码与假数据 fallback；列表下拉选单与底层物理 `list_id` 强联动
- [x] 8.4 真实 E2E 验证：在真实系统 Chrome 环境下验证切换到全网搜索与博主追踪时输入框默认为空，输入关键词或博主名实时联动查询通过

## 9. RFC2822 Date Normalization & Strict Chronological Ordering

- [x] 9.1 全链路推特日期规范化：在入库管道与 Storage 引入 `normalizeTweetDate`，将推特 RFC2822 格式（如 `Wed Aug 26`）解析并标准化为国际标准 ISO-8601 字符串
- [x] 9.2 历史存量数据清洗：执行增量迁移脚本清洗数据库存量推文，消除因英文星期首字母 ASCII 码导致的排序倒置问题
- [x] 9.3 验证排序单调性：确保工作台列表按 `created_at DESC` 在物理时间上严格单调倒序，通过全套测试验证

## 10. X Article Long-Form Synchronization & Async Race Guard

- [x] 10.1 X Article 原生万字长文嗅探：识别正文及链接中的 `x.com/i/article/...` 深度文章，工作台推文项打上「📰 深度长文」专属标签
- [x] 10.2 长文自动/手动同步拉取：在详情页支持一键同步或自动拉取上万字完整长文与高清配图并导出 Page Bundle
- [x] 10.3 前端异步请求防竞态守卫：在 `handleSelectTweet` 中引入 `activeTweetIdRef` 守卫，丢弃快速切换推文时的过期请求回调，杜绝详情覆盖跳变
- [x] 10.4 全量验收门禁：运行全套单测与 E2E 测试全部 PASS，tsc 0 错误，vite 生产构建 0 错误

## 11. Strict Fetch Limit Contract & Early Termination

- [x] 11.1 全链路贯通 `limit` 参数契约：UI 下拉选单（20 / 50 / 100）-> IPC -> Pipeline -> XClient 全程透传明确条数
- [x] 11.2 向下滚动加载早停机制：在滚动循环中动态统计已捕获推文，一旦 `countSoFar >= limit` 立即提前 break 退出循环，大幅缩短抓取等待时间
- [x] 11.3 精准切片入库保证：返回前严格执行 `allTweets.slice(0, limit)`，入库条数与前端展示 100% 吻合

## 12. macOS Native Window Lifecycle Management

- [x] 12.1 拦截窗口 `close` 事件：macOS 平台下默认调用 `win.hide()`，保持后台常驻不销毁 Chromium 实例与 IPC 状态
- [x] 12.2 监听 `app.on('activate')`：用户点击 Dock 图标时瞬间无感恢复主视窗并置顶 (`win.show(); win.focus()`)
- [x] 12.3 规范退出管理：监听 `before-quit` 设置 `isQuitting = true`，确保快捷键 Cmd+Q 或菜单退出时平滑释放资源

## 13. Rich Hyperlink Formatting & Clean Media T.co Stripping

- [x] 13.1 正文尾缀媒体短链清洗：利用正则 `/\s*https:\/\/t\.co\/[a-zA-Z0-9]+$/g` 自动修剪仅作为媒体展示的末尾无意义短链
- [x] 13.2 严格边界外链替换：使用非贪婪正则将正文中的 `https://t.co/xxx` 转换为 `[display_url](expanded_url)` 标准 Markdown 格式，绝不误吞中文字符
- [x] 13.3 数据库存量迁移自愈：`initDb` 自动执行增量事务迁移，利用存量推文的 `urls` 元数据将历史残留 `t.co` 平滑自愈为 Markdown 链接

## 14. Long Content Filtering & Normalized Newlines Pipeline

- [x] 14.1 默认长推文/专栏过滤：抓取链路默认仅保留 Note Tweet（>280字或截断）与 X Article，单句闲聊碎碎念直接过滤；CLI 支持 `--all-tweets` 覆盖
- [x] 14.2 设置抽屉可视化开关：在 `SettingsDrawer.tsx` 中增加「抓取过滤规则」即时开关，支持用户一键切换过滤策略
- [x] 14.3 全链路反转义平滑自愈：在解析、存储、渲染与 Markdown 导出全流程统一部署换行反转义，彻底消灭未经转义的 `\n\n` 字面量字符

## 15. Rich Tweet Markdown Engine & Executive Summary Card

- [x] 15.1 自研原生轻量 AST 渲染组件 `src/renderer/src/components/TweetMarkdown.tsx`，支持 H1~H4 标题、段落行距与中文节次
- [x] 15.2 X Article 专栏专属「⚡ 核心摘要 / 提要」速览卡片：将专栏开头的提要引用块渲染为带浅暖色沉降底色、高亮左边框、闪电徽标与舒适列表行距的高光速览卡片
- [x] 15.3 配图全屏高斯模糊灯箱预览：支持点击图片全屏无损放大预览，支持 ESC 退出与外链打开
- [x] 15.4 编写针对 Markdown 解析器的专属单元测试 `tests/tweet-markdown.test.ts`，验证标题、摘要卡片、列表与链接

## 16. Demand-Driven Video Streaming & Zero Silent Traffic Safeguard

- [x] 16.1 播放器配置收敛为 `preload="none"`：未点击播放前，绝不向推特视频 CDN 发起任何网络请求，实现真正的零静默流量
- [x] 16.2 播放状态安全护栏：在用户未点击播放前（`isPlaying === false`），忽略一切底层 waiting 事件，未播时只展示高清封面与通透大播放按钮【▶】，彻底杜绝未播先转圈
- [x] 16.3 流媒体缓冲状态机与容灾外跳：播放中途卡顿展示优雅缓冲转圈，遇到解码受阻弹出自愈卡片，常驻提供【📋 复制直链】与【🌐 在系统浏览器播放 ↗】
