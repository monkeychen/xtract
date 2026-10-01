# Tasks

> 严格遵循 Red-Green-Refactor：每个纯函数**先写测试并确认红灯**，再抽取实现，最后替换调用点并跑全量 E2E 确认行为未变。

## 1. 补齐既有导出函数的测试缺口

- [x] 1.1 扩展 `tests/studio-list-formatter.test.ts`：`isVideoUrl` 全矩阵（空值 / `.mp4` / `.m3u8` / `video.twimg.com` / 大写 URL / 普通图片 URL）
- [x] 1.2 同文件补 `isTweetVideo`：有 `video_url`、`media_urls` 含视频、纯图文、空对象
- [x] 1.3 同文件补 `formatRelativeTime` 五个未测分支：`刚刚`(<60s) / `昨天`(<2d) / `N天前`(<7d) / `M-D` 兜底 / 无效日期走 `dateStr.slice(0,10)`
- [x] 1.4 同文件补 `formatCount` 边界：`undefined`→`'0'`、`0`→`'0'`、`999`→`'999'`、`1000`→`'1.0K'`、`999999`→`'1000.0K'`、`1000000`→`'1.0M'`
- [x] 1.5 同文件补 `extractTweetTitleAndSnippet` 三条未测路径：逗号断句分支、40 字标题截断 + `...`、120 字 snippet 截断
- [x] 1.6 运行 `pnpm test` 确认 1.1-1.5 全部**直接转绿**（这些函数已存在，测试是纯补充；若红灯说明用例写错，需修正用例而非改实现）

## 2. 抽取 `classifyTweet` 并消除重复判定

- [x] 2.1 在 `src/renderer/src/views/StudioView.tsx` 新建 `tests/studio-logic.test.ts`，为 `classifyTweet` 编写 design.md §2.1 的 10 条用例，运行确认**红灯**（函数尚不存在）
- [x] 2.2 在 `StudioView.tsx` 实现并导出 `classifyTweet` 与 `TweetClassification` 接口，确认测试转绿
- [x] 2.3 将列表视图 1780-1818 替换为 `classifyTweet(tweet)` 调用
- [x] 2.4 将详情视图 1912-1947 替换为 `classifyTweet(selectedTweet)` 调用，保持两处各自的标签文案与样式不变
- [x] 2.5 确认两处判定逻辑**物理上只剩一份**，运行 `pnpm test` 全绿

## 3. 抽取 `extractMedia`

- [x] 3.1 为 `extractMedia` 编写 design.md §2.2 的全部用例（含「非视频推文 posterUrl MUST 为 undefined 且首图 MUST 保留」硬约束），运行确认**红灯**
- [x] 3.2 实现并导出 `extractMedia` 与 `TweetMedia` 接口，确认转绿
- [x] 3.3 将 2162-2176 的内联 IIFE 替换为 `const { isVideo, videoUrl, posterUrl, displayImages } = extractMedia(selectedTweet)`，保留 2164 行关于 posterUrl 硬约束的注释
- [x] 3.4 运行 `pnpm test` 与现有 Flow 8/9（视频推文 + 图文推文 + 灯箱）确认行为未变

## 4. 抽取 `filterTweetsByKeyword`

- [x] 4.1 编写 design.md §2.3 的 7 条用例（含空/纯空白短路、大小写不敏感、三字段均 undefined），确认**红灯**
- [x] 4.2 实现并导出，确认转绿
- [x] 4.3 将 1223-1231 替换为 `const filteredTweets = filterTweetsByKeyword(tweets, streamFilter)`
- [x] 4.4 **不修改** 1233 行的 `allChecked`（已知缺陷 1，本次不动）

## 5. 抽取 `buildQueryOptions`

- [x] 5.1 编写 design.md §2.4 的四分支映射用例，**必须包含 `search` 源断言 `sourceType === 'all'` 而非 `'search'`**，确认**红灯**
- [x] 5.2 实现并导出 `buildQueryOptions` 与其参数类型，确认转绿
- [x] 5.3 将 729-746 的四分支 if/else 替换为单次 `buildQueryOptions` 调用，保留 `loadLocalTweets` 的 `queryParam` / `userParam` / `listIdParam` 可选覆盖语义
- [x] 5.4 确认 `api.listTweets` 与 `api.countTweets` 的入参组装（747-763）未受影响，运行现有 Flow 2 全绿

## 6. 抽取 `reduceStreamEvent`

- [x] 6.1 编写 design.md §2.5 的三态用例（含 `prev === null` 返回 null、prev.source 优先、默认文案、默认 50 进度），确认**红灯**
- [x] 6.2 实现并导出 `reduceStreamEvent`，确认转绿
- [x] 6.3 将 653-691 的 `onStreamEvent` 回调改为 `setCrawlProgress((prev) => reduceStreamEvent(prev, event, dataSource))`，**保留 `useEffect` 的 `[dataSource]` 依赖数组**以维持 `fallbackSource` 正确性
- [x] 6.4 运行现有 E2E 确认流式订阅与取消订阅行为未变

## 7. 抽取 `formatTweetDate`

- [x] 7.1 编写 design.md §2.6 的 4 条用例（合法 ISO / 空串 / 非法日期 / 抛异常兜底），确认**红灯**
- [x] 7.2 实现并导出，确认转绿
- [x] 7.3 将 1955-1962 的 IIFE 替换为 `formatTweetDate(selectedTweet.created_at)`

## 8. 抽取抓取守卫与入参计算

- [x] 8.1 新建 `tests/studio-crawl.test.ts`，为 `computePages` / `extractTweetIdFromQuery` / `resolveListId` / `validateCrawlTarget` 编写 design.md §2.7 用例，确认**红灯**
- [x] 8.2 实现并导出四个函数，确认转绿
- [x] 8.3 将 `handleCrawl`（885-1053）中的 pages 计算、精准单推文分支（944）、list ID 解析（970）、两条空守卫替换为上述函数调用
- [x] 8.4 保留 list 自动入库逻辑（986-996）与三处 `clearTimeout(progressTimer)` 不变

## 9. 扩展 Playwright E2E

- [x] 9.1 扩展 `tests/gui-workbench.e2e.test.ts` 的 `addInitScript`：新增 `fetchFollowing` / `searchTweets` / `fetchUser` / `fetchList` 的调用记录与可控返回值，新增 `onStreamEvent` 事件发射钩子
- [x] 9.2 追加 Flow 12：抓取空守卫 toast，断言两条守卫均不触发 fetch
- [x] 9.3 追加 Flow 13/14/15：四分支抓取的 IPC 入参断言（`pages`、`limit`、`minLikes`、剥离 `@` 的 handle、从 URL 解析的 listId）
- [x] 9.4 追加 Flow 16：`#crawl-progress-card` 的出现、done/error 三态文案
- [x] 9.5 追加 Flow 17：`#btn-load-more` 的三种文案与禁用态
- [x] 9.6 追加 Flow 18：四种数据源空态文案 + Escape 关闭四类浮层
- [x] 9.7 新增 Flow 统一使用 `waitUntil` 轮询 + Locator 原生 `waitFor` 实现等待与断言；仅在等待 250ms 输入防抖生效处保留显式 `waitForTimeout(500)`（防抖结束无外部可观测信号），其余断言不依赖固定 sleep
- [x] 9.8 确认 Flow 1-11 的既有断言全部仍然通过

## 10. 已知缺陷登记（不修复不固化）

- [x] 10.1 为 `allChecked` 集合语义、批量导出假实现、切源不重置删除弹窗三项编写 `it.todo()`，注释写明**期望语义**而非当前行为
- [x] 10.2 在 `tests/` 中不新增任何会固化已知缺陷的断言

## 11. 质量门禁验证

- [x] 11.1 `pnpm test` — 0 Failed
- [x] 11.2 `npx tsc --noEmit` — 0 Error
- [x] 11.3 `npx vite build` — 0 Error / 0 Warning
- [x] 11.4 人工复核 `git diff` 确认无用户可见行为变更
