# Capability Spec: X Article 内嵌推文卡片与分割线解析

## Delta Requirements

### Requirement: formatArticleContent 实体支持扩展
- 系统必须能够识别 Draft.js `atomic` block 引用的 `DIVIDER` 类型实体，并将其转换为 Markdown 水平分割线 `---`。
- 系统必须能够识别 Draft.js `atomic` block 引用的 `TWEET` 类型实体。
- 当提供被引用推文详情时，系统必须将其渲染为包含作者、日期、正文与链接的 Markdown 引用卡片。
- 当未提供推文详情时，系统必须优雅降级为 Markdown 链接卡片 `> 🔗 **引用推文**: [<url>](<url>)`，严禁忽略丢弃。

### Requirement: 嗅探器捕获 TweetResultsByRestIds
- `XClient` 必须识别并解析 `TweetResultsByRestIds` 响应中的推文数组。
- 捕获的推文应支持注入到 Article 的内容渲染过程中，以生成完整的推文卡片。
