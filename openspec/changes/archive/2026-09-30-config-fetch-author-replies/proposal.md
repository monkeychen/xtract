# Proposal

## Why

在当前系统中，通过单推抓取（如 GUI 详情面板异步同步、CLI `--view` 查看命令）抓取指定推文时，底层 `fetchTweetThread` 默认会将该推文下作者自己的追评与 Thread 连续回复全量一并拉取并存入数据库与归档。但在多数情报阅读与单篇归档场景下，用户只关注目标推文的核心正文；自动拉取大量追评不仅会拉长抓取等待耗时、冲刷推文列表，且会在本地生成多篇冗余篇章。

为了将控制权完整交付用户，系统需要将「是否抓取该作者追评/追加评论」做成全局受控项：
1. **GUI 模式**：在设置中心提供直观的卡片式开关，**默认处于关闭状态（即默认仅抓取推文本体，不抓取作者追评）**；
2. **CLI 模式**：提供命令行控制选项（`--author-replies` / `--no-author-replies`），默认同样遵循全局关闭配置，但允许终端用户及自动化 Agent 显式按需覆盖。

## What Changes

- **配置模型扩展**：
  - 在 `AppConfig` 与全局配置中新增 `fetchAuthorReplies: boolean` 配置项，默认值为 `false`；
  - 环境变量与本地配置支持 `FETCH_AUTHOR_REPLIES`，实现跨会话持久化与容器化注入。
- **设置中心交互 (Settings Drawer)**：
  - 在「抓取与内容过滤」分区新增「抓取作者追评与追加回复 (Author Replies & Thread)」卡片开关；
  - 默认展示为关闭（OFF）；用户可一键切换并即时保存生效。
- **CLI 命令行控制选项扩展**：
  - 在 CLI 顶层命令行解析器中新增对作者追评的控制选项：
    - `--author-replies`：查看或同步单篇推文时，抓取作者本人的追加评论/推文串（Thread Replies）；
    - `--no-author-replies`：查看或同步单篇推文时，强制不抓取作者的追加评论（仅保留推文本体）；
  - 优先级严格遵循：`CLI 参数 > 环境变量 (FETCH_AUTHOR_REPLIES) > 本地 config.json > 默认值 (false)`；
  - 缓存自愈：当用户在 CLI 模式下显式传入 `--author-replies`，若本地推文此前仅抓取了本体，系统自动判定为内容不完整并主动发起网络请求补全追评。
- **单推抓取与落库流水线约束**：
  - `fetchTweetThread` 与 `fetchTweetAndStore` 联动读取生效的 `fetchAuthorReplies` 控制选项：
    - 处于 `false`（默认）时：严格仅保留并入库与目标 `tweet_id` 完全匹配的主推文，过滤掉下方所有作者追评；
    - 处于 `true` 时：保留该作者针对该推文发表的后续追加评论（Thread 回复）。
- **单篇推文 Markdown 导出自愈**：
  - `exportSingleTweetMarkdown` 在 `fetchAuthorReplies=false` 时仅导出单篇主推文正文，消除多余的「### 篇章 2/3...」拼接碎片。

## Capabilities

### New Capabilities
<!-- 无新增顶级 capability，复用既有 gui-workbench 能力树 -->

### Modified Capabilities
- `gui-workbench`: 扩展「推文全文与 X Article 万字长文同步及竞态防护」、「全局设置抽屉」以及「CLI 双模参数控制」，新增针对单推抓取时作者追评/追加回复的配置项、CLI 命令行参数与抓取过滤规范。

## Impact

- **CLI 命令行引擎 (`src/main/index.ts`)**：新增 `--author-replies` 与 `--no-author-replies` 选项注册与解析，并结合本地缓存状态自愈触发完整抓取；
- **设置中心 UI (`src/renderer/src/components/SettingsDrawer.tsx`)**：新增抓取作者追评卡片式开关控件与状态联动；
- **配置持久化 (`src/main/config.ts`)**：新增 `FETCH_AUTHOR_REPLIES` 属性，默认 `false`；
- **IPC 通信 (`src/preload/index.ts`, `src/main/ipc/index.ts`)**：`AppConfigView` 与 `updateConfig` 新增 `fetchAuthorReplies` 字段契约；
- **抓取与存储链路 (`src/main/client/index.ts`, `src/main/pipeline/index.ts`, `src/main/storage/index.ts`)**：支持按控制选项过滤作者追评推文。
