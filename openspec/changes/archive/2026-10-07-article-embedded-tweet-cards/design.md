# Design: X Article 嵌入推文卡片与分割线实体解析

## 1. Draft.js 数据模型映射

X Article 的 GraphQL 数据结构中：
`article_results.result.content_state` 包含：
- `blocks`: 顺序排列的段落对象 `{ type, text, entityRanges: [{ key: number }] }`
- `entityMap`: 实体对象数组 `[{ key: string, value: { type: string, data: any } }]`

### 实体类型映射：
1. **`IMAGE`** (`data.mediaItems[0].mediaId`):
   映射至 `media_entities` 获取真实图片 URL，输出 `![图片](<url>)`。
2. **`DIVIDER`**:
   输出 `\n---\n`。
3. **`TWEET`**:
   `data` 结构为 `{ tweetId: string, url: string }`。
   - 若提供 `embeddedTweets: Map<string, Partial<Tweet>>` 且命中 `tweetId`：
     ```markdown
     > 💬 **作者名** (@username) · 日期
     > 
     > 推文完整正文（支持多行引用前缀 `> `）
     > 
     > 🔗 [原文链接](https://x.com/...)
     ```
   - 若未提供或未命中：
     ```markdown
     > 🔗 **引用推文**: [原文链接](<url>)
     ```

## 2. 嗅探层适配与推文富化

1. **响应监听识别**：
   在 `src/main/client/index.ts` 中拦截响应时，若 URL 命中 `TweetResultsByRestIds`，其 JSON 为：
   `data.data.tweetResult: Array<{ result: any }>`。
   遍历该数组，利用 `parseTweetResult(item.result)` 解析推文，加入 `capturedTweets`。
2. **富化流程**：
   - 当主推文包含 Article，且其 entityMap 中存在 `TWEET` 类型的实体时，如果在等待窗口内捕获到了 `TweetResultsByRestIds`（或缓存库中已存在），以该批推文为上下文，调用 `formatArticleContent(articleResult, embeddedTweetsMap)` 重新格式化并更新主推文的 `text`。
   - 所有被捕获的嵌入推文一并进入 SQLite 增量存储。

## 3. 边界处理与容错
- 实体缺失兜底：若 `url` 缺失则根据 `tweetId` 构造 `https://x.com/i/status/${tweetId}`；
- 格式化安全：嵌入推文正文内的物理换行符规范清洗，每行均添加 `> ` 块引用前缀，避免破坏 Markdown 布局；
- 幂等性：同一推文多次解析结果一致，本地已有的推文通过主键唯一去重。
