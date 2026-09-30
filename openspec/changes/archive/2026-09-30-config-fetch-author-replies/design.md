# Design

## Context

在 Xtract 中，单篇推文详情拉取主要用于两个场景：
1. **GUI 场景**：用户在工作台推文详情面板中查看单推或长文时自动触发的深度同步；
2. **CLI 场景**：高阶用户或终端 Agent 通过 `xtract --view <id|url>` 抓取推文并导出 Markdown。

当前底层的 `fetchTweetThread`（位于 `src/main/client/index.ts`）拦截推特官方 GraphQL `TweetDetail` 流，会默认将该推文作者自身后续发表的所有追评（Thread Replies）一并捕获，并通过 `fetchTweetAndStore`（位于 `src/main/pipeline/index.ts`）全部持久化到 SQLite 数据库中。
在多数场景下，用户只希望获取单篇推文的独立内容，自动拉取追评不仅会导致推特抓取时间变长、使推文列表被同作者多条碎推文冲刷，还会在导出的 Markdown 文件中生成多篇章拼接。因此，必须在 GUI 设置中心和 CLI 命令行中同时提供完整对等的控制机制。参见 [proposal.md](file:///Users/chenzhian/workspace/ai/xtract/openspec/changes/config-fetch-author-replies/proposal.md)。

## Goals / Non-Goals

**Goals:**
- 在应用配置（`AppConfig`）中增加 `fetchAuthorReplies: boolean`，默认值为 `false`。
- 在 GUI 设置抽屉（`SettingsDrawer`）的「抓取与内容过滤」分区新增卡片式切换开关，支持即时持久化与热更新。
- 在 CLI 命令行顶层增加完整的控制选项：`--author-replies`（强制拉取作者追评）与 `--no-author-replies`（强制仅保留推文本体）。
- 确立参数覆盖优先级：`CLI 显式参数 > 环境变量 FETCH_AUTHOR_REPLIES > 配置文件 config.json > 默认值 false`。
- CLI 缓存自愈：当用户显式传递 `--author-replies`，而本地数据库推文未包含追评推文时，智能判定为需要补充抓取，主动发起网络嗅探补全追评。
- 在数据抓取与入库流水线（`fetchTweetThread` / `fetchTweetAndStore`）中植入过滤规则：在默认关闭时严格仅保留与目标 `tweet_id` 完全一致的主推文，杜绝作者追评推文写入数据库；在开启时才放行作者 Thread 连续追评。
- 在单篇推文 Markdown 导出（`exportSingleTweetMarkdown`）中联动该控制选项，保持导出的 `index.md` 结构自洽。
- 全量自动化测试、静态类型校验与生产构建 100% 验收通过。

**Non-Goals:**
- 不支持抓取非推文作者的第三方其他用户的评论/互动内容（推特第三方水军/评论信噪比极低，仅针对作者本人 Thread 连续追评做开关）。
- 不改变全网趋势、Following 关注流和关键词搜索等批量流式抓取的现有逻辑，该配置仅对单推详情抓取生效。

## Decisions

### 1. 配置字段规范与默认值
- **决策**：在 `AppConfig` 顶层增加 `fetchAuthorReplies: boolean`，系统环境变量映射为 `FETCH_AUTHOR_REPLIES`，默认值严格设为 `false`。
- **理由**：遵循用户第一性原理与体验原则。推特大部分单推信息阅读场景不需要追评，默认关闭能将抓取耗时降低数倍，避免推文列表被冲刷；与已有的 `filterLongTweetsOnly` 平级并列，结构简洁清晰。

### 2. CLI 命令行参数设计与选项契约
- **决策**：在 `src/main/index.ts` 中通过 Commander.js 注册：
  ```typescript
  .option('--author-replies', '查看或同步推文时，抓取作者自己的追加评论/推文串 (Thread Replies)')
  .option('--no-author-replies', '查看或同步推文时，不抓取作者的追加评论（仅保留推文本体）')
  ```
- **参数解析与优先级**：
  ```typescript
  let fetchAuthorReplies = Config.FETCH_AUTHOR_REPLIES ?? false;
  if (options.authorReplies !== undefined) {
    fetchAuthorReplies = Boolean(options.authorReplies);
  }
  ```
- **CLI 缓存自愈机制**：
  当用户执行 `xtract --view <tweetId> --author-replies` 时，系统查询本地推文后，除了检查 `isTweetContentIncomplete(tweet)` 之外，还检查本地是否存在与该推文关联的 Thread 追评（通过 `storage.getThreadTweets(tweet)`）。若用户显式指定了 `--author-replies`，但本地并无追评记录，系统应主动触发 `pipeline.fetchTweetAndStore(tweetId, { fetchAuthorReplies: true })` 进行实时补全，杜绝用户传了参数却依然输出单推旧缓存的困惑。

### 3. 早期过滤与流水线拦截
- **决策**：在 `fetchTweetThread` 内部或 `fetchTweetAndStore` 接收端进行早期过滤。
  - 函数签名扩展：`fetchTweetThread(tweetId: string, options?: { fetchAuthorReplies?: boolean; timeout?: number })`。
  - 当 `options?.fetchAuthorReplies`（默认继承生效配置）为 `false` 时，从官方响应中解析出推文列表后，立即执行 `tweets.filter(t => t.tweet_id === targetId)`，仅返回目标主推文。
- **理由**：早期过滤不仅阻断了追评写入本地 SQLite，杜绝了多余推文污染推文列表，还能避免不必要的媒体下载与处理。

### 4. 设置抽屉 (SettingsDrawer) 交互与视觉设计
- **决策**：在 `SettingsDrawer.tsx` 的「抓取与内容过滤」分区新增卡片式配置项：
  - 标签：`抓取作者追评与追加回复 (Author Replies & Thread)`
  - 辅助说明：`单篇推文抓取时，是否一并拉取作者本人在下方发表的连续追评/推文串（默认关闭，仅抓取推文本体）`
  - 控件：iOS 风格切换 Switch 按钮，默认渲染为 OFF（灰色），点击切换为 ON（青绿色），即时触发 `onUpdateConfig({ fetchAuthorReplies: nextVal })`。

### 5. 单篇 Markdown 导出适配
- **决策**：`exportSingleTweetMarkdown` 在执行时检查配置或关联推文。当作者追评未开启且未抓取时，强制仅以单篇主推文正文生成 `index.md`，不拼接 `### 篇章 2...`。

## Risks / Trade-offs

- **[Risk] 用户在 CLI 模式下未传 `--author-replies` 时无法看到追评**
  - → **Mitigation**: 在 CLI 帮助说明与 `--view` 命令的终端输出中，打印提示信息（例如：`ℹ️ 当前未开启作者追评抓取，若需拉取完整推文串可使用 --author-replies 选项`）。
- **[Risk] 旧版本已存在的本地配置文件无此字段**
  - → **Mitigation**: `config.ts` 在加载时严格使用 `fetchAuthorReplies: parsed.fetchAuthorReplies ?? false` 进行兜底合并，保证老用户平滑升级。
- **[Risk] CLI 显式参数与 GUI 配置文件状态冲突**
  - → **Mitigation**: 严格遵守 `CLI 显式参数 > 环境变量 > 配置文件 > 默认值` 的单一可信源机制，CLI 运行时的显式参数仅影响当前 CLI 进程，不静默修改 `config.json`。

## Migration Plan

1. 无破坏性变更：新字段仅在内存和 `config.json` 中扩展，不修改 SQLite schema。
2. 现有数据库中的历史数据保持不变，后续新增抓取立即应用新过滤规则。
