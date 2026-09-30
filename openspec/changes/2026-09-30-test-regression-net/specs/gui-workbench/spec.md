# Spec Delta

## ADDED Requirements

### Requirement: 工作台核心业务逻辑的可测性契约 (Testable Business Logic Contract)
工作台（`StudioView`）中的多分支业务规则 MUST 以可独立单元测试的纯函数形式承载，禁止以内联 IIFE、内联闭包或在 JSX 表达式中重复书写的形式实现。同一业务判定在列表视图与详情视图中出现时，MUST 收敛为单一函数实现，两处仅允许在展示层（标签文案与样式）存在差异。

#### Scenario: 推文分类判定的单一实现原则
- **WHEN** 系统需要判定一条推文是否属于「专栏文章 (X Article)」或「长推文 (Note Tweet)」
- **THEN** 该判定 MUST 由单一纯函数 `classifyTweet` 承载，并在列表视图与详情视图中共同调用
- **AND** 该函数 MUST 独立计算 `isArticle` 与 `isLong` 两个布尔值（而非互斥短路），互斥的展示优先级由调用方负责
- **AND** 禁止在 JSX 中重复书写专栏/长推文的判定表达式

#### Scenario: 数据源到查询参数的映射可单测
- **WHEN** 系统依据当前数据源（关注流 / 全网搜索 / 博主追踪 / X 列表）构造本地查询条件
- **THEN** 该映射 MUST 由纯函数 `buildQueryOptions` 承载，并 MUST 满足以下契约：
  - `search` 数据源的 `sourceType` MUST 为 `'all'`（全库检索），**严禁**为 `'search'`；
  - `user` 数据源的博主名 MUST 剥离 `@` 前缀；
  - 四种数据源在输入为空串或纯空白时，MUST 将对应查询参数归一化为 `undefined` 而非空串；
  - `loadLocalTweets` 的显式可选参数（`queryParam` / `userParam` / `listIdParam`）MUST 优先于组件 state 中的同名值。

#### Scenario: 流式进度归约不依赖闭包隐式状态
- **WHEN** 系统接收主进程推送的抓取流式事件（普通进度 / 完成 / 失败三态）
- **THEN** 进度归约逻辑 MUST 由纯函数 `reduceStreamEvent(prev, event, fallbackSource)` 承载，`fallbackSource` MUST 作为显式入参传入
- **AND** 当 `prev` 为 `null` 时收到 `error` 或 `done` 事件，该函数 MUST 返回 `null`（与重构前行为一致）
- **AND** 当 `prev.source` 已存在时 MUST 优先于 `fallbackSource`

#### Scenario: 媒体提取的非视频硬约束
- **WHEN** 系统提取推文的展示媒体（视频 URL、封面、图集）
- **THEN** 提取逻辑 MUST 由纯函数 `extractMedia` 承载
- **AND** 当推文**不是**视频推文时，返回的 `posterUrl` MUST 为 `undefined`，且其首张配图 MUST 保留在 `displayImages` 中，严禁因封面提取逻辑将真实配图排挤掉
- **AND** 当推文是视频推文且成功提取到 `posterUrl` 时，该封面 MUST 从 `displayImages` 中剔除

#### Scenario: 抓取前置守卫与入参计算可单测
- **WHEN** 用户在任一数据源下触发抓取
- **THEN** 抓取的条数分页计算（`computePages`）、精准单推文 ID 提取（`extractTweetIdFromQuery`）、列表 ID 解析（`resolveListId`）、抓取目标合法性校验（`validateCrawlTarget`）MUST 各自为独立纯函数
- **AND** 当目标校验不通过时，系统 MUST 通过 toast 明确提示用户所需输入，且 MUST NOT 触发任何后端抓取请求

#### Scenario: 内存过滤与日期格式化的确定性
- **WHEN** 系统对本地已加载推文执行关键词内存过滤，或渲染推文的绝对时间
- **THEN** 过滤 MUST 由 `filterTweetsByKeyword` 承载，空或纯空白关键词 MUST 短路返回原数组引用，且 MUST 对正文、作者昵称、作者用户名三字段做大小写不敏感匹配
- **AND** 日期格式化 MUST 由 `formatTweetDate` 承载，日期无效时 MUST 回退返回原始字符串而不得渲染空白

## MODIFIED Requirements

<!-- 本变更不修改任何既有 requirement 的行为契约；所有抽取均为行为等价重构。 -->
