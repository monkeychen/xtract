# Proposal

## Why

`StudioView.tsx` 单文件已达 2525 行，内含 29 个 `useState`、7 个 `useEffect`、6 个重复的 250ms 防抖 handler 与 21 个闭包 handler，**零自定义 hook**。当前测试网存在结构性空洞：

- 12 个测试文件、93 个用例中，触及 `StudioView` 的仅 `studio-list-formatter.test.ts` 的 4 个纯函数（`getTweetListDisplayTitle` / `extractTweetTitleAndSnippet` / `formatRelativeTime` / `formatCount`）；
- `isVideoUrl` / `isTweetVideo` / `renderFormattedTweetText` / `TweetVideoPlayer` **零单测覆盖**；
- 承载全部业务分支的内联逻辑——数据源查询构造、抓取分支树、流式进度归约、媒体提取、推文分类、内存过滤——**无一条单元测试**；
- 现有 11 个 Playwright Flow 只覆盖"点击后 DOM 长什么样"，**从未触发过任何一次真实 `handleCrawl`**，`#crawl-progress-card` 在整个测试套件中从未出现过。

后果是：即将进行的组件拆分重构**没有任何回归护栏**。`loadLocalTweets` 中 `search` 源使用 `sourceType='all'`（而非 `'search'`）这类易错细节，靠人眼无法在 29 个 state 之间守住。

## What Changes

本变更**只建测试护栏与必要的可测性重构，不改变任何用户可见行为**。

- **补齐既有导出函数的测试缺口**：`isVideoUrl` / `isTweetVideo` 全矩阵；`formatRelativeTime` 的 `刚刚`/`昨天`/`N天前`/`M-D`/无效日期五个未测分支；`formatCount` 的 `undefined`/999/1000000 边界；`extractTweetTitleAndSnippet` 的逗号断句、40 字截断、120 字摘要截断三条路径。
- **将内联业务逻辑抽为导出纯函数**（行为等价重构，由测试锁定）：
  - `classifyTweet(tweet)` — 消除列表视图（1780-1818）与详情视图（1912-1947）中**重复两遍的专栏/长推文判定**；
  - `extractMedia(tweet)` — 抽离 2162-2176 的媒体 IIFE，保留「非视频推文 posterUrl 必须为 undefined」这一已被注释强调的硬约束；
  - `filterTweetsByKeyword(tweets, keyword)` — 抽离 1223-1231 的内存过滤；
  - `buildQueryOptions(...)` — 抽离 729-746 的四分支数据源→查询映射；
  - `reduceStreamEvent(prev, event, fallbackSource)` — 抽离 653-691 的流式进度归约，消除对闭包 `dataSource` 的隐式依赖；
  - `formatTweetDate(iso)` — 抽离 1955-1962 的日期 IIFE。
- **抽离抓取守卫与入参计算**：`computePages(limit)`、`extractTweetIdFromQuery(q)`、`resolveListId(listId)`、`validateCrawlTarget(source, ...)`，使 `handleCrawl`（885-1053）的分支树可被单测。
- **扩展 Playwright E2E**（现有 11 个 Flow 保持不变，追加新 Flow）：首次触发真实 `handleCrawl` 四分支并断言 IPC 入参、覆盖空关键词/空博主/空列表三条 toast 守卫、覆盖 `#crawl-progress-card` 三态、`#btn-load-more` 三种文案、Escape 键关闭四类浮层、四种空态文案。

## Non-goals（明确不做）

- **不引入 React Testing Library / jsdom / happy-dom**。本项目组件组合简单（列表 + 详情），无虚拟列表、无表单库、无路由；重构后的新组件结构尚未确定，此时配置 `render()` 测试基建属本末倒置。待重构启动、需要为新组件写测试时再引入。
- **不补 `data-testid` / `role` / `aria-*` 无障碍钩子**。应与重构同时进行，避免重复劳动。
- **不修复探索过程中发现的现存缺陷**（详见下方"已知缺陷"）。测试护栏与缺陷修复是两件事，混在一起会污染回归基线。

## 已知缺陷（本次记录，不修复不固化）

以下问题在建立测试网时被探明。它们**不得被写成"期望行为"的测试用例**固化：

| # | 缺陷 | 位置 | 说明 |
|---|---|---|---|
| 1 | `allChecked` 用集合大小相等判断全选 | 1233 | `checkedIds.size === filteredTweets.length`；`streamFilter` 过滤后集合大小不等会误判为"未全选"。正确语义应为"可见项是否均被选中" |
| 2 | `handleBatchExport` 为假实现 | 1153-1156 | 仅弹 toast 并清空选择，未调用任何 API |
| 3 | 切换数据源不重置 `deleteConfirmOpen` | 793-807 | 单删弹窗开启时切源，`selectedTweet` 已换，弹窗确认将删除**新**推文 |
| 4 | `localStorage.setItem('xtract_last_user_handle')` 为死写入 | 826 | 全项目零处读取 |
| 5 | `limit` state 为死代码 | 562 | `setLimit` 从未被调用 |
| 6 | `getTweetListDisplayTitle` 的 `matchSentence` 分支永不可达 | 421-424 | 408-419 处只要 `lines.length > 0` 即 return |
| 7 | `exportPath` 渲染处 fallback 缺兜底 | 2046 | 无 `\|\| 'tweet'`，`author_username` 为空时产出 `output/undefined/...`，与 853/1169 不一致 |
| 8 | `SettingsDrawer` 硬编码假凭据 | 23 | `apiKey` 初始值 `'AIzaSyDummyKeyForPrototype12345'`；另有 `api.ts` 的 `MOCK_TWEETS` / `MOCK_REPORTS` / `MOCK_TRENDS` 与 `App.tsx` 写死的 `@cza55008` / `127.0.0.1:7890`，与工程宪法红线第 3 条冲突 |

处理方式：对缺陷 1、2、3，补测试时以 `it.todo()` 标注并写明期望语义，不写会通过当前实现的断言；缺陷 4-7 记录在本文档即可；缺陷 8 另立变更处理。

## Capabilities

### New Capabilities
<!-- 无 -->

### Modified Capabilities
- `gui-workbench`: 新增「工作台内联业务逻辑可测性契约」要求，明确核心交互逻辑必须以可单测的纯函数形式承载，禁止以 IIFE 或内联闭包形式实现多分支业务规则。

## Impact

- **`src/renderer/src/views/StudioView.tsx`**：新增 10 个导出纯函数，替换 6 处内联实现与 1 处重复判定；净行数预期小幅下降，行为不变。
- **`tests/`**：新增 `studio-logic.test.ts`（纯函数单测）、`studio-crawl.test.ts`（抓取守卫与入参单测）；扩展 `gui-workbench.e2e.test.ts`（追加 Flow 12+，现有 Flow 1-11 不改）。
- **无生产行为变更**，无配置项变更，无 IPC 契约变更，无数据库结构变更。
