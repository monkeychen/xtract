# Spec Delta

## ADDED Requirements

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
- **THEN** 界面在「抓取与内容过滤」区域清晰展示「抓取作者追评与追加回复 (Author Replies & Thread)」卡片开关，默认显示为关闭（OFF）；用户点击切换时，配置即时保存至本地配置文件与运行时状态，后续单推抓取立即生效

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
