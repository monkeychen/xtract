# gui-workbench Specification

## Purpose

提供 Xtract 原生桌面图形工作台交互界面，以统一聚焦的「XTRACT 情报工作台」为核心，覆盖多源推文精读与信噪比过滤、推特视频免落盘按需流式播放、原生 Markdown 专栏级排版（Executive Summary 卡片）、全流严格条数约束与长文过滤、真实级联物理清理、以及全局设置抽屉与模型深度推理控制。

## Requirements

### Requirement: 多源推文工作台与信噪比过滤
系统 MUST 提供支持时间线关注流、关键词搜索、特定博主与 X Lists 列表的多源 Master-Detail 工作台，支持按获取来源及信噪比过滤、严格时间倒序排序、精准分页加载与真实批量级联物理删除。

#### Scenario: 首次获取来源固定与去重原则 (First-crawl Source Invariance)
- **WHEN** 系统从不同数据源（关注流 following、全网搜索 search、博主专栏 user、X 列表 list）抓取推文落库
- **THEN** 每篇推文落库时 MUST 记录其来源标识 `source_type`，且该标识以**第一次抓取入库时的来源为准**；后续若在其他数据源中再次抓取到该推文，系统 MUST 判定为主键重复而直接忽略，绝不能覆盖或篡改其初始 `source_type`

#### Scenario: 按数据源隔离与意图优先检索 (Intent-First Multi-Source Retrieval)
- **WHEN** 用户在工作台顶部切换数据源（关注流、全网搜索、博主追踪、X 列表）
- **THEN** 系统 MUST 依据用户当前交互意图调度检索策略：
  1. **全网搜索**：输入框 MUST 默认绝对为空；为空时相当于不添加任何关键词过滤条件，直接展示本地全库所有已抓取推文；用户输入关键词时，系统 MUST 针对正文、作者昵称与用户名对本地全库执行全文模糊检索，不受任何来源类型限制；
  2. **博主追踪**：输入框 MUST 默认绝对为空；输入具体博主用户名时，系统 MUST 彻底放开来源壁垒，跨关注流、列表和搜索聚合该博主在本地全库的所有推文；
  3. **关注流**：系统呈现 `following` 与 `legacy` 推文，且支持在顶部输入框进行本地数据库级实时全文过滤；
  4. **X 列表**：系统 MUST 严格依据当前选中的 `list_id` 执行物理分区过滤，各列表间数据严格隔离，互不混杂。

#### Scenario: ISO-8601 物理时间绝对倒序 (Strict Chronological Ordering via ISO-8601)
- **WHEN** 推文数据入库、清洗或加载推文列表
- **THEN** 系统 MUST 将推特原生 RFC2822 日期全量标准化解析为标准 ISO-8601 格式字符串（`YYYY-MM-DDTHH:mm:ss.sssZ`），确保 `created_at DESC` 在数据库索引与展示层面达到 100% 物理时间单调倒序，彻底杜绝因星期英文首字母 ASCII 码差异导致的排序错乱。

#### Scenario: 多列表物理 list_id 隔离 (Physical List Isolation)
- **WHEN** 用户在「X 列表」数据源下切换不同的监控列表
- **THEN** 系统 MUST 基于 SQLite 中的 `list_id` 字段执行精准过滤，确保当前列表仅呈现归属于该 `list_id` 的推文，彻底杜绝不同列表推文相互串扰。

#### Scenario: 真实推文总数统计与消除伪造硬编码
- **WHEN** 工作台加载推文列表或切换过滤条件（数据源、点赞门槛、关键词）
- **THEN** 列表底部的推文总数统计 MUST 实时反映本地 SQLite 库中符合当前过滤条件的实际推文总数（通过动态 `COUNT(*)` 查询），彻底禁止出现预置或写死的伪造数字（如 88 篇）

#### Scenario: 条件保全式增量加载更多 (Condition-preserving Load More)
- **WHEN** 用户点击列表底部的「加载更多」按钮
- **THEN** 系统 MUST 携带当前激活的数据源及全部筛选条件（`source_type`、`minLikes`、关键词或博主名）并按当前列表已呈现条数作为 `offset` 增量加载历史推文，追加至列表尾部；若已无更多推文，按钮与卡片状态 MUST 明确呈现「已加载全部 X 篇推文」并禁用重复请求；若无数据则展示友好空状态，禁止出现无任何加载却谎称完成的假状态

#### Scenario: 多选批量真实物理级联删除 (Multi-select Physical Cascade Deletion)
- **WHEN** 用户勾选多篇推文并在浮动操作条点击「批量删除」，并在二次确认弹窗中确认
- **THEN** 系统 MUST 真实调用后端 `deleteTweets` 接口，执行原子级联清理：物理删除 SQLite 中对应的多条推文记录，同时从磁盘物理删除对应推文的 `output/{author}/{tweet_id}/` Page Bundle 目录（含 `index.md` 与配图 `images/`）；删除成功后即时从前端列表移除、清除选中态并刷新总数统计

#### Scenario: Page Bundle 离线无损研读
- **WHEN** 用户在左侧点击任一条推文
- **THEN** 右侧详情区展开完整全文、本地离线高清配图，并提供「本地文件」按钮

#### Scenario: 浮动批量导出 Markdown
- **WHEN** 用户勾选左侧推文流中的一条或多条推文复选框
- **THEN** 界面底部中央自动浮起批量操作条（.selbar），点击「导出 Markdown」将选中推文导出至 output 目录

#### Scenario: 级联物理清理与安全确认
- **WHEN** 用户对某篇推文点击「删除」
- **THEN** 系统弹出安全确认弹窗，明确说明将彻底删除本地磁盘文件及数据库记录，用户确认后原子清理

### Requirement: 推特视频免落盘流式播放与按需零静默流量策略
系统 MUST 在详情面板提供推特视频免落盘在线播放能力，采用零静默流量策略，未播放前绝不提前消耗网络带宽或触发过早转圈，并在播放时支持代理穿透与双轨容灾外跳。

#### Scenario: 按需零静默流量与消除未播转圈
- **WHEN** 推文包含视频且详情面板渲染该推文
- **THEN** 视频播放器 MUST 配置 `preload="none"`，在用户主动点击播放前完全不向推特视频 CDN 发起任何网络请求；未播放前界面 MUST 安静展示高清视频封面（Poster）与居中大播放按钮（▶），绝不展示缓冲转圈动画

#### Scenario: 播放状态机与中途卡顿缓冲
- **WHEN** 用户主动点击大播放按钮触发播放
- **THEN** 系统进入播放态；若遇到流媒体建立连接或中途网络卡顿，系统展示优雅的「流媒体连接缓冲中...」指示器；流媒体数据到达后自动消失开始顺畅播放

#### Scenario: 会话级代理穿透与防盗链伪装
- **WHEN** 客户端请求推特视频流媒体（`*.twimg.com`）
- **THEN** Electron 主进程自动挂载会话代理，并在请求头中注入官方 `Referer: https://x.com/` 与 `Origin: https://x.com`，攻克 CDN 防盗链

#### Scenario: 播放容灾与系统浏览器一键直达
- **WHEN** 视频解码受阻或网络出现错误
- **THEN** 播放器弹出错误自愈卡片，并提供常驻的【📋 复制直链】与【🌐 在系统浏览器播放 ↗】快捷按钮，一键调起 Safari / Chrome 高速播放

### Requirement: 推文详情原生 Markdown 渲染与 X Article 专栏专属排版
系统 MUST 在详情面板提供自研原生 `TweetMarkdown` 引擎，解析标题、段落、中文章节、列表、图片全屏灯箱与外链，并为 X Article 专栏提供沉浸式核心摘要速览卡片。

#### Scenario: X Article 专栏专属「⚡ 核心摘要 / 提要」速览卡片
- **WHEN** 推文正文包含以 `> **核心摘要 / 提要**:` 开头的引用块
- **THEN** 系统将其自动解析为独立的高光速览卡片（Executive Summary Card），采用浅暖色沉降底色、高亮左强调边框、闪电徽标（⚡）与列表项舒适间距，使用户一眼获取专栏核心精髓

#### Scenario: 报刊级标题层级与中文节次
- **WHEN** 推文正文包含 `# ` 标题或「一、趋势低吸」类中文章节
- **THEN** 系统将 H1 渲染为 22px 衬线专栏大标题、H2 渲染为章节标题，并自动增强中文章节段落标题，彻底消除纯文本 `pre-wrap` 造成的双重换行与裸露符号

#### Scenario: 配图全屏高斯模糊灯箱预览
- **WHEN** 用户点击推文正文中的内联配图
- **THEN** 系统瞬间呼出全屏高斯模糊遮罩的大图灯箱，支持 ESC 键或点击遮罩关闭，并提供复制与外链打开按钮

#### Scenario: 链接语义化还原与系统浏览器外跳
- **WHEN** 推文包含 Markdown 链接 `[label](url)` 或裸 URL
- **THEN** 链接渲染为带 `↗` 标识的超链接，点击直接调起系统默认浏览器打开，彻底阻断纯文本短链的语义丢失

### Requirement: 全流抓取严格数量约束与提前终止 (Limit Contract & Early Stop)
系统 MUST 在关注流、全网搜索、博主追踪、X 列表全链路遵循精准数量约束契约，一旦向下滚动满足数量立即提前退出。

#### Scenario: 滚动早停与精准条数入库
- **WHEN** 用户在工作台选择抓取目标数量（如 20 篇）并触发抓取
- **THEN** 抓取引擎在向下滚动加载循环中，一旦捕获推文数量达到目标数量，立即提前 break 中断滚动，入库条数与前端展示 100% 契合所选配额，杜绝单次响应过度下发导致的列表冲刷

### Requirement: 长推文/专栏文章默认抓取过滤与物理换行规整
系统 MUST 默认仅抓取长推文（Note Tweet）与专栏文章（X Article），杜绝单句水帖碎片冲刷列表，并在全链路彻底自愈 `\n\n` 字面量字符。

#### Scenario: 默认过滤普通短推文
- **WHEN** 系统执行推文抓取且未开启 `--all-tweets`
- **THEN** 系统仅将字符数 > 280、被官方截断的长推文或 X Article 专栏入库；短于 280 字且无截断的单句短推文自动过滤；设置抽屉提供一键开关控制

#### Scenario: 换行符 `\n\n` 字面量平滑自愈
- **WHEN** 推文正文包含 `\n\n` 字面量转义字符
- **THEN** 系统在解析、存储、渲染与 Markdown 导出全流程自动执行平滑替换，还原真实的段落换行

### Requirement: 模型深度推理开关与强度分级
系统 MUST 在全局设置抽屉中提供大模型深度推理（Reasoning / Thinking）的开关，并允许在开启时设置轻量、标准、深度三级推理强度。

#### Scenario: 关闭深度推理模式
- **WHEN** 用户在设置抽屉中将「深度思考」开关切换为 OFF
- **THEN** 思考深度选择器自动收起，系统在调度大模型生成研报时注入非推理参数，跳过长思维链推演以实现秒级快速响应

#### Scenario: 开启深度推理并配置强度级别
- **WHEN** 用户将「深度思考」开关切换为 ON 并选择「深度」
- **THEN** 系统持久化该配置，后续研报生成时自动激活完整长 CoT 推演，并在研报视窗通过 Thinking Block 实时展示思考过程与耗时

### Requirement: 全局设置与原生免 Cookie 捕获
系统 MUST 在全局常驻抽屉中提供 X 官方账号会话管理、国内外 7 大主流模型配置、专属算力端点自动路由与网络代理设置。

#### Scenario: 免 Cookie 弹窗登录捕获
- **WHEN** 用户点击设置抽屉中的「重新登录」按钮
- **THEN** 系统拉起原生隔离会话窗口供用户登录 X，成功后秒级自动截获 auth_token 与 ct0 并持久化落盘

#### Scenario: 专属套餐端点自动识别
- **WHEN** 用户选择阿里通义千问或智谱清言并输入专属套餐密钥（如 sk-sp-）
- **THEN** 系统自动识别并切换至 Token Plan 或 Coding Plan 专用高吞吐端点

### Requirement: 历史存量推文（Legacy）兼容展示与防死锁晋级机制
系统 MUST 将旧版本引入 `source_type` 之前入库的历史推文明确标识为 `legacy` 存量状态，在关注流与博主定向查询中平滑向下兼容展示；且在用户新抓取命中时支持首次明确来源认领与晋级，杜绝重抓死锁。

#### Scenario: 历史存量推文向下兼容呈现
- **GIVEN** 本地数据库存在来源标识为 `legacy` 的存量推文
- **WHEN** 用户在「关注流」下浏览
- **THEN** 系统应同时呈现 `following` 与 `legacy` 推文，确保历史时间线连贯
- **WHEN** 用户在「博主追踪」中输入具体的博主用户名（如 `@karpathy`）
- **THEN** 系统应同时呈现该作者的 `user` 与 `legacy` 存量推文，立即可见历史入库内容

#### Scenario: 历史存量推文的明确来源认领与晋级 (Legacy Promotion)
- **GIVEN** 某推文在本地数据库中的 `source_type` 状态为 `legacy`
- **WHEN** 用户在带有明确数据源的新入口（如「博主追踪」）重新抓取该推文
- **THEN** 系统检测到其当前为 `legacy` 状态，应将其 `source_type` 晋级更新为当前明确来源（如 `user`），解除历史模糊归属，后续不再作为 `legacy` 泛化展示
- **THEN** 对于已经拥有正式来源（`following` / `search` / `user` / `list`）的推文，严格保持首次入库来源不变，跳过重复

### Requirement: 推文全文与 X Article 万字长文同步及竞态防护
系统 MUST 自动识别推特长推文（Note Tweet）与 X 原生万字长文（X Article，`x.com/i/article/...`），支持自动/手动同步拉取完整全文与高清多媒体，并在异步详情加载过程中引入严格的请求防竞态守卫。

#### Scenario: X Article 万字深度长文自动识别与同步
- **WHEN** 用户点击包含 `x.com/i/article/...` 链接或被官方标记为长文的推文
- **THEN** 推文流项突出呈现「📰 深度长文」专属徽标；右侧详情区自动识别并调度长文抓取器拉取多达上万字的完整文章正文与内嵌图片，完整呈现在离线阅读器中并导出 Page Bundle

#### Scenario: 推文切换异步请求防竞态守卫 (Race Condition Guard)
- **WHEN** 用户快速在左侧推文列表连续点击推文 A 与推文 B
- **THEN** 系统前端 MUST 借助 `activeTweetIdRef` 守卫进行状态隔离校验，推文 A 的异步数据返回时若当前聚焦已变更为推文 B，系统 MUST 自动丢弃推文 A 的回调结果，彻底防止详情面板被旧请求错误覆盖

### Requirement: macOS 原生窗口生命周期管理
系统 MUST 遵循 macOS 桌面应用交互惯例，点击红叉关闭按钮时隐藏窗口而非退出应用，点击 Dock 图标时瞬间无感唤起。

#### Scenario: 窗口关闭隐藏与 Dock 唤起
- **WHEN** macOS 用户点击应用主窗口左上角的关闭红叉按钮
- **THEN** 系统拦截 `close` 事件并调用 `win.hide()`，应用保持常驻运行且不销毁 Chromium 实例与 IPC 状态；当用户再次点击 macOS Dock 栏图标时，系统触发 `app.on('activate')` 瞬间无感恢复主视窗并置顶

### Requirement: 单推抓取作者追评控制与设置项 (Author Replies Fetch Configuration)
系统 MUST 提供单篇推文抓取时针对作者追加回复/追评（Thread Replies）的过滤控制，在全局设置抽屉中提供可视化配置项，在 CLI 命令行模式下提供双向控制选项，默认均处于关闭状态（即默认仅抓取主推文本体，不抓取作者自己的追加评论）。

#### Scenario: 默认配置下不抓取作者追评
- **GIVEN** 系统 `fetchAuthorReplies` 配置为默认值 `false`
- **WHEN** 用户通过 GUI 详情面板同步、URL 穿透或 CLI 默认查看单篇推文详情
- **THEN** 系统在拉取推文数据后 MUST 严格过滤掉下方属于该作者的所有追加回复/追评，仅保留与目标 `tweet_id` 完全匹配的主推文，杜绝冗余篇章落库冲刷推文列表

#### Scenario: GUI 设置抽屉显式开启追评抓取
- **GIVEN** 用户在 GUI 设置抽屉将 `fetchAuthorReplies` 配置项切换为 `true`
- **WHEN** 系统抓取该推文详情并检测到作者在下方发表的 Thread 追评
- **THEN** 系统 MUST 将该作者针对该推文发表的连续回复一并拉取并持久化，供用户研读完整推文串

#### Scenario: 设置抽屉可视化开关与持久化
- **WHEN** 用户打开设置抽屉（Settings Drawer）
- **THEN** 界面在「抓取过滤规则」区域清晰展示「抓取作者追评与追加回复」卡片开关，默认显示为关闭（OFF）；用户点击切换时，配置即时保存至本地配置文件与运行时状态，后续单推抓取立即生效

#### Scenario: CLI 模式命令行参数显式控制与覆盖
- **WHEN** 用户在终端通过 CLI 命令（如 `xtract --view <id>`）查看或抓取推文
- **THEN** CLI MUST 支持以下选项：
  - `--author-replies`：强制开启抓取作者追加评论/推文串（Thread Replies）；
  - `--no-author-replies`：强制关闭抓取作者追加评论（仅保留主推文本体）；
- **AND** 命令行参数优先级 MUST 高于本地 `config.json` 与环境变量设置

#### Scenario: CLI 模式下开启追评时的缓存自愈
- **GIVEN** 本地数据库已存在单推记录，但该记录此前在未开启追评时抓取（无追评篇章）
- **WHEN** 用户在 CLI 执行 `xtract --view <id> --author-replies`
- **THEN** 系统 MUST 判定本地缓存不完整，主动重新发起网络请求抓取该推文及作者追评，更新本地数据库与 Markdown 导出

#### Scenario: 单推 Markdown 导出篇章自愈
- **WHEN** 系统导出单篇推文 Markdown（`exportSingleTweetMarkdown`）
- **THEN** 若未开启作者追评抓取，导出的 `index.md` 仅包含单篇主推文正文，消除多余的 `### 篇章 2/3...` 碎片；若显式开启追评抓取，则按篇章完整组织

