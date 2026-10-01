# Technical Design

> 本文档定义 StudioView 可测性重构的**确切函数契约**与**测试用例清单**。所有契约均为现有实现的**行为等价提取**，不含任何行为变更。

## 1. 设计原则

1. **纯函数优先**：能从组件体中无损抽出、且无 React 依赖的业务逻辑，一律抽为顶层导出纯函数。
2. **行为等价**：抽取前后对相同输入 MUST 产生完全相同的输出。抽取由测试锁定——先写测试锁住当前行为，再替换调用点。
3. **不碰有缺陷的行为**：`allChecked`、`handleBatchExport`、切源重置矩阵**本次不抽不测**，避免把缺陷写成受保护的基线。
4. **不引入新依赖**：继续使用零 UI 依赖的 vitest + Playwright 技术栈。

## 2. 抽取清单与契约

### 2.1 `classifyTweet(tweet: Partial<Tweet>): TweetClassification`

**来源**：`StudioView.tsx` 1780-1818（列表）与 1912-1947（详情）中**完全重复的**专栏/长推文判定段。

**契约**：
```ts
interface TweetClassification {
  isArticle: boolean;   // 专栏文章：is_article || urls 含 /i/article/\d+/ || text 含该模式 || text 以 '# ' 开头
  isLong: boolean;      // 长推文：is_note_tweet || text.length > 280 || text 结尾匹配 /…\s*https:\/\/t\.co\/\S+$/i
}
```
**关键语义**：`isArticle` 与 `isLong` 在 UI 上是 `if/else` 关系（`isArticle ? 📰专栏 : (isLong ? 📝长推 : null)`），但函数本身 MUST 同时独立计算二者，**互斥关系由调用方负责**——否则无法单测。

**测试用例**：
| 输入 | isArticle | isLong |
|---|---|---|
| `is_article: true` | true | false |
| `urls: ['https://x.com/i/article/1234567']` | true | false |
| `text: '详见 https://twitter.com/i/article/999'` | true | false |
| `text: '# 标题\n正文'` | true | false |
| `is_note_tweet: true` | false | true |
| `text` 长度 281 | false | true |
| `text: '正文…\nhttps://t.co/abc123'` | false | true |
| `text` 长度 280 的普通文本 | false | false |
| 空对象 `{}` | false | false |
| `is_article: true` **且** 长度 281 | true | true |

### 2.2 `extractMedia(tweet: Partial<Tweet>): TweetMedia`

**来源**：`StudioView.tsx` 2162-2176 的内联 IIFE。

**契约**：
```ts
interface TweetMedia {
  isVideo: boolean;
  videoUrl?: string;
  posterUrl?: string;      // 非视频推文 MUST 为 undefined（硬约束）
  displayImages: string[]; // 已剔除视频 URL；视频推文额外剔除 posterUrl
}
```
**posterUrl 三级 fallback**（仅当 `isVideo` 为真）：`video_poster` → `media_urls` 中含 `ext_tw_video_thumb` 或 `video_thumb` 者 → `media_urls` 中首个非视频 URL → `undefined`。

**测试用例**：视频推文取 `video_url`；视频仅存于 `media_urls` 时 `videoUrl` 从数组内提取；poster 三级 fallback 逐级命中；**非视频推文 `posterUrl` MUST 为 `undefined` 且首张配图 MUST 出现在 `displayImages`**；视频推文的 poster 从 `displayImages` 中剔除；`media_urls` 为空时 `displayImages` 为 `[]`。

### 2.3 `filterTweetsByKeyword(tweets: Tweet[], keyword: string): Tweet[]`

**来源**：`StudioView.tsx` 1223-1231。

**契约**：空/纯空白 keyword 返回**原数组引用**（短路）；否则对 `text` / `author_name` / `author_username` 三字段做大小写不敏感的 `includes` 匹配，命中任一即保留。

**测试用例**：空串短路；纯空白短路；仅 text 命中；仅 author_name 命中；仅 author_username 命中；大小写不敏感（`KARPATHY` vs `karpathy`）；三字段均未命中；三字段全为 `undefined` 的推文不报错。

### 2.4 `buildQueryOptions(source, params): Pick<TweetQueryOptions, 'sourceType'|'query'|'user'|'listId'>`

**来源**：`StudioView.tsx` 729-746。

**契约**：
```ts
interface BuildQueryParams {
  streamFilter: string;
  searchQuery: string;
  userHandle: string;
  selectedList: string;   // 可能是 'custom' 哨兵值
  customListId: string;
  queryParam?: string;    // 显式覆盖，undefined 表示不覆盖
  userParam?: string;
  listIdParam?: string;
}
function buildQueryOptions(
  source: 'following' | 'search' | 'user' | 'lists',
  params: BuildQueryParams
): { sourceType: TweetQueryOptions['sourceType']; query?: string; user?: string; listId?: string }
```

**映射表**：

| source | sourceType | query | user | listId |
|---|---|---|---|---|
| `following` | `'following'` | `streamFilter.trim() \|\| undefined` | — | — |
| `search` | **`'all'`** | `searchQuery.trim() \|\| undefined` | — | — |
| `user` | `'user'` | — | `userHandle.trim().replace(/^@/,'') \|\| undefined` | — |
| `lists` | `'list'` | — | — | `(selectedList==='custom' ? customListId : selectedList).trim() \|\| undefined` |

**高危点**：`search` 的 `sourceType` 是 `'all'`（全库检索），**不是** `'search'`。这是最易在重构中改错的细节，必须有独立断言。

**优先级规则**：当对应参数 `queryParam` / `userParam` / `listIdParam` 不为 `undefined` 时覆盖 state 值（`loadLocalTweets` 的可选参数语义）。

**测试用例**：四分支的 `sourceType` 映射各一条；`search` 源断言 `sourceType === 'all'`；user 源剥离 `@` 前缀；四分支的空串 → `undefined`；`listIdParam` 覆盖 `selectedList`；`custom` 哨兵值走 `customListId`。

### 2.5 `reduceStreamEvent(prev, event, fallbackSource): CrawlProgress | null`

**来源**：`StudioView.tsx` 653-691（`api.onStreamEvent` 回调）。

**契约**（三态）：
- `event.stage === 'error'`：`prev` 为 null 时返回 `null`；否则 `{...prev, stage:'抓取失败', detail: event.text || '发生未知错误', percent:100, error: event.text}`
- `event.stage === 'done'`：`prev` 为 null 时返回 `null`；否则 `{...prev, stage:'抓取完成', detail: event.text || '已完成落库去重', percent:100, completed:true}`
- 其他：`{ active:true, source: prev?.source || fallbackSource, title: prev?.title || '正在抓取推文数据', stage: event.text || '正在处理...', detail: \`进度: ${event.progress || 50}%\`, percent: event.progress || 50 }`

**关键设计收益**：原实现依赖闭包中的 `dataSource`，导致 `useEffect` 依赖数组必须为 `[dataSource]`、每次切源都要 unsubscribe/resubscribe。改为显式传入 `fallbackSource` 后，**该耦合在纯函数层面消失**。`useEffect` 仍保留 `[dataSource]` 依赖以维持 `fallbackSource` 的正确性（`CLAUDE.md` 红线第 4 条：E2E 必须覆盖跨进程与用户交互契约）。

**测试用例**：error/done/普通三态各一条；`prev=null` 时 error/done 返回 `null`；`prev.source` 优先于 `fallbackSource`；`event.text` 缺失时的默认文案；`event.progress` 缺失时默认 50；`percent` 与 `detail` 文案一致性。

### 2.6 `formatTweetDate(iso: string): string`

**来源**：`StudioView.tsx` 1955-1962 的 IIFE。

**契约**：`new Date(iso)` 无效或抛异常时返回**原字符串**；否则返回 `toLocaleString('zh-CN', { hour12: false })`。

**测试用例**：合法 ISO 字符串；空字符串；非法日期字符串 `'not-a-date'`（回退原串）；能被 `new Date()` 解析但 `toLocaleString` 抛异常的情形由 try/catch 覆盖（以 mock 验证）。函数签名不接受 `undefined`，调用方（`selectedTweet.created_at`）需自行保证非空。

### 2.7 抓取守卫与入参计算

| 函数 | 契约 | 测试用例 |
|---|---|---|
| `computePages(limit: number): number` | `Math.max(1, Math.ceil(limit / 20))` | 20→1；50→3；100→5；0→1；1→1 |
| `extractTweetIdFromQuery(q: string): string \| undefined` | 匹配 `status/(\d{5,})` 或 `^(\d{5,})$` | `https://x.com/a/status/1234567890`→`1234567890`；`1234567890`→自身；`hello world`→undefined；4 位数 `1234`→undefined |
| `resolveListId(raw: string): string` | `raw.match(/(\d{5,})/) ? match[1] : raw` | 纯 ID；`https://x.com/i/lists/1234567890`；无数字的字符串原样返回 |
| `validateCrawlTarget(source, target): { ok: true } \| { ok: false; message: string }` | **仅对 `search` 与 `user` 两个源做校验**：`search` 的 `target.trim()` 为空 → `请输入要搜索的关键词`；`user` 的 `target.trim().replace(/^@/,'')` 为空 → `请输入要追踪的博主用户名（如 @username）`。`following` 与 `lists` 源 MUST 恒返回 `{ ok: true }`（列表 ID 的校验在 `handleCrawl` 内由 `resolveListId` 前的空值分支单独处理，不并入本函数） | 两个守卫的触发与不触发；`following`/`lists` 恒 ok；`user` 传 `@` 前缀字符串判为有效 |

## 3. Playwright E2E 扩展

现有 Flow 1-11 **不修改**（保持既有断言有效）。新增 Flow 12-18：

| Flow | 内容 | 关键断言 |
|---|---|---|
| 12 | 抓取守卫 | search 空词点击 → toast `请输入要搜索的关键词`；user 空 handle → `请输入要追踪的博主用户名（如 @username）`；两者均**不触发**任何 fetch API |
| 13 | 抓取入参（following） | 先通过下拉菜单将 `crawlLimit` 显式设为 50（`crawlLimit` 默认值为 20，直接断言易与默认值混淆），再点击 `🔄 抓取最新` → `fetchFollowing` 被调用且入参为 `{ pages: Math.ceil(50/20) === 3, limit: 50 }` |
| 14 | 抓取入参（search） | 填词后抓取 → `searchTweets` 收到 `{query, limit, minLikes}` |
| 15 | 抓取入参（user/lists） | `fetchUser` 收到剥离 `@` 的 handle；`fetchList` 收到从 URL 解析出的纯数字 listId |
| 16 | 流式进度卡片 | 触发抓取 → `#crawl-progress-card` 出现；模拟 `done` 事件 → 文案含 `抓取完成`；模拟 `error` → 含 `抓取失败` |
| 17 | 加载更多三态 | 有更多数据 → `⬇️ 加载更早的 50 条历史推文`；加载中 → `⏳ 正在加载...`；到底 → `✓ 已是全部推文` 且禁用 |
| 18 | 空态与 Escape | 四种数据源各自的空态文案；按 Escape 关闭下拉菜单 / 灯箱 / 单删弹窗 / 批删弹窗 |

**mock 扩展**：现有 `addInitScript` 需新增 `fetchFollowing` / `searchTweets` / `fetchUser` / `fetchList` 的调用记录数组与可控返回值，以及 `onStreamEvent` 的事件发射钩子。

## 4. 测试文件结构

```
tests/
├── studio-list-formatter.test.ts      (扩展：补 isVideoUrl/isTweetVideo/formatRelativeTime/formatCount/extractTweetTitleAndSnippet 缺口)
├── studio-logic.test.ts               (新建：classifyTweet / extractMedia / filterTweetsByKeyword / buildQueryOptions / reduceStreamEvent / formatTweetDate)
├── studio-crawl.test.ts               (新建：computePages / extractTweetIdFromQuery / resolveListId / validateCrawlTarget)
└── gui-workbench.e2e.test.ts          (扩展：Flow 12-18；Flow 1-11 保持不变)
```

## 5. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 抽取过程引入行为漂移 | 每个纯函数先写测试锁住当前行为（Red），再替换调用点（Green），最后跑全量 E2E 确认 DOM 行为未变 |
| `reduceStreamEvent` 抽取改变流式进度表现 | 契约中显式规定 `prev === null` 时 error/done 返回 `null`（与原实现一致）；Flow 16 覆盖 |
| E2E 的 `waitForTimeout` 式等待不稳定 | 新增 Flow 统一改用 `expect(locator).toHaveText/toBeVisible` 自动重试等待，不引入固定 sleep |
| 补测试时误将现存缺陷写成期望行为 | 见 proposal「已知缺陷」表；缺陷 1/2/3 一律 `it.todo()` 标注期望语义 |

## 6. 门禁验证

交付前必须全绿：
1. `pnpm test` — 0 Failed
2. `npx tsc --noEmit` — 0 Error
3. `npx vite build` — 0 Error / 0 Warning
