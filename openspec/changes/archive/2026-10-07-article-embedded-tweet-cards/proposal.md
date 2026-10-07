# Proposal: X Article 专栏内嵌推文卡片与分割线解析与富化

## Why
在抓取 X Article 长文专栏（例如 `https://x.com/HytidelLegend/status/2107337614772842894`）时，当前版本解析遗漏了 Draft.js 数据模型中的 `TWEET` 与 `DIVIDER` 实体。导致专栏内嵌的推荐推文卡片与段落分割线被完全忽略丢弃，正文仅剩下空标题，严重损坏了长文情报的完整性。

同时，Twitter 官方 Web 端在渲染含有内嵌推文的专栏时，会异步发出 `TweetResultsByRestIds` 批量查询获取这些推文的完整内容与互动数据。当前客户端的响应监听器未识别数组形态的 `tweetResult`，导致未能收集这些推文。

## What
1. **Draft.js 解析层**：
   - 识别 `atomic` block 中的 `TWEET` 与 `DIVIDER` 实体；
   - `DIVIDER` 渲染为 Markdown 水平线 `---`；
   - `TWEET` 支持接收外部推文详情字典（`embeddedTweets`），渲染为包含作者、发布时间、推文完整正文与原文链接的 Markdown 引用卡片块；若无详情则优雅降级为原推链接卡片，杜绝信息丢失。
2. **嗅探与流水线层**：
   - `XClient` 响应监听器识别 `/graphql/.../TweetResultsByRestIds`，提取数组中全部推文并存入推文集合；
   - 在抓取包含专栏的单推页面时，利用捕获到的内嵌推文丰富该专栏正文，同时将内嵌推文一并增量入库去重。

## Impact
- 用户抓取或阅读类似精选汇总类 X Article 时，内嵌的所有推文内容与链接 100% 完整保留；
- 本地库与 Page Bundle Markdown 具备更高信息完整度与排版美感。
