# Xtract CLI 完整命令参考手册

> 本文档由 `README.md` 下沉，涵盖全部命令行参数、用法示例与典型工作流场景。
> 项目总览与快速开始见 [README](../README.md)。

---

## 4. CLI 完整命令参考手册

开发态通过 `pnpm dev:cli -- [选项]` 执行，打包后直接运行 `xtract [选项]` 即可。

```
Usage: xtract [options]

Production-grade X (Twitter) intelligence radar & AI digest.

Options:
  -V, --version                         output the version number
  --check-auth                          验证 X Cookie 凭证或本地会话是否有效
  --trends                              查看全网热门趋势榜单看板
  --trends-digest                       全自动趋势研报（抓取热榜、主动挖掘代表性讨论并生成研报）
  --fetch-only                          仅抓取 Following 推文并存入本地 SQLite，不生成总结
  --report-only                         仅根据本地已有推文生成今日早报，不发起网络请求
  --search <query>                      按关键词或高级语法搜索推文
  --search-type <type>                  搜索结果类型：live (实时最新) 或 top (热门) (default: "live")
  --user <username>                     指定博主用户名进行针对性抓取或本地检索
  --x-list <listId>                     指定 X 列表 ID 或 URL，抓取该列表的最新推文
  --list [limit]                        查看已抓取推文列表 (默认 20 条)
  --view <tweetId>                      查看指定 ID 或 URL 的推文全文详情，并默认导出为独立 Markdown 文档
  --no-export-md                        查看单篇推文时关闭自动导出 Markdown
  --delete [tweetId]                    删除已获取的推文/文章（同时清理数据库记录及本地文件）
  --since <date>                        起始日期过滤 (YYYY-MM-DD)
  --until <date>                        截止日期过滤 (YYYY-MM-DD)
  --older-than <duration>               早于指定时长的推文 (例如 30d, 48h, 7d)
  --dry-run                             演练预览模式，仅展示待删除列表，不执行真实删除
  -y, --yes                             跳过删除确认提示直接执行
  --export [limit]                      将已抓取的推文导出为结构化 Markdown 文档
  -o, --output <path>                   自定义导出 Markdown 文件的路径或目标目录
  -c, --category <category>             趋势分类主题 (tech, all, business, news, entertainment, sports) (default: "tech")
  --top <n>                             趋势榜单展示或研报挖掘的前 N 个热点话题 (default: "10")
  --hours <hours>                       统计与研报回溯时间窗口（小时） (default: "24")
  --pages <n>                           本次抓取的页数
  --limit <n>                           限制获取或展示的推文条数 (default: "20")
  --min-likes <n>                       最低点赞门槛过滤 (default: "0")
  --min-retweets <n>                    最低转发门槛过滤 (default: "0")
  --timeout <seconds>                   网络请求与页面加载超时时间（秒）
  --provider <provider>                 指定大模型提供商
  --auth-mode <mode>                    指定大模型认证模式 (api_key, account)
  --model <modelName>                   指定具体的模型名称 (覆盖默认配置)
  --json                                以纯 JSON 格式输出结果至 stdout（面向 Agent 与终端管道）
  -h, --help                            display help for command
```

### 4.1 全量流水线（拉取 + 存储 + 生成早报）
一键执行端到端闭环任务：自动挂载监听器打开 X Following 时间线 ➔ 增量拉取最新推文 ➔ 本地 SQLite 去重入库 ➔ 备份原始快照 ➔ 调用大模型生成结构化早报 ➔ 输出 Markdown 归档。

* **基本语法**：
  ```bash
  pnpm dev:cli
  ```
* **可选参数组合**：
  ```bash
  # 抓取 5 页推文，回溯过去 12 小时内容生成早报
  pnpm dev:cli -- --pages 5 --hours 12
  ```
* **输出成果**：
  生成的 Markdown 早报保存在 `output/reports/YYYY-MM-DD.md`。

---

### 4.2 仅抓取推文入库 (`--fetch-only`)
只进行网络拦截与本地落库，**不触发 LLM 总结**。适合用于高频定时采集、数据积累，或在不消耗 Token 的情况下备份推文。

* **基本语法**：
  ```bash
  pnpm dev:cli -- --fetch-only
  ```
* **参数选项**：
  * `--pages <N>`：抓取页数（默认读取 `.env` 中的 `FETCH_MAX_PAGES`，通常 1 页约 25~35 条）。
  * `--timeout <N>`：单步操作超时时间（秒，默认 60 秒）。
* **使用示例**：
  ```bash
  # 抓取 3 页推文
  pnpm dev:cli -- --fetch-only --pages 3
  ```
* **终端输出示例**：
  ```text
  ⏳ 开始从 X (Following 时间线) 抓取推文，计划拉取 3 页...
  🌐 正在打开 x.com/home 并挂载网络监听器（超时阈值: 60 秒）...
  ⏳ 正在等待时间线导航就绪...
  📌 切换至「正在关注 (Following)」时间线...
  📜 正在向下滚动加载第 2 页推文...
  📜 正在向下滚动加载第 3 页推文...
  ✓ 成功拉取到 120 条推文
  ✓ 本地库更新完毕：新增入库 120 条，跳过重复 0 条 (库内总计 148 条)
  ```

---

### 4.3 仅离线生成早报 (`--report-only`)
**纯离线运行**，不发起任何推特网络请求。直接从本地 SQLite 数据库中提取指定时间段的推文，调用大模型进行主题聚类并生成早报。

* **基本语法**：
  ```bash
  pnpm dev:cli -- --report-only
  ```
* **参数选项**：
  * `--hours <N>`：早报统计回溯时间窗口（默认近 24 小时）。
  * `--min-likes <N>`：早报推文点赞量筛选门槛（默认 0，低于该门槛的推文不参与早报提炼）。
  * `--min-retweets <N>`：早报推文转推量筛选门槛（默认 0）。
* **使用示例**：
  ```bash
  # 仅基于过去 12 小时内抓取且点赞 >= 50 的高质推文提炼早报
  pnpm dev:cli -- --report-only --hours 12 --min-likes 50
  ```
* **终端输出示例**：
  ```text
  🔍 正在从本地数据库检索近 12 小时的推文...
  ℹ️ 找到 86 条相关推文，正在调用大模型进行主题聚类与提炼...
  🎉 早报已生成：output/reports/2026-09-10.md
  ```

---

### 4.4 查看已抓取推文列表 (`--list`)
以格式化的交互式富文本表格在终端列出本地数据库中的推文，快速掌握近期抓取动态，并支持按博主和互动量精确过滤。

* **基本语法**：
  ```bash
  # 默认展示最近 20 条
  pnpm dev:cli -- --list

  # 指定展示最近 N 条（如展示 50 条）
  pnpm dev:cli -- --list 50

  # 按互动门槛筛选（如仅看点赞 >= 500 的爆款推文）
  pnpm dev:cli -- --list 20 --min-likes 500
  ```
* **展示字段**：
  * `#`：序号
  * `作者`：博主昵称与 `@handle`
  * `推文摘要`：清晰排版的正文前 75 字
  * `互动`：点赞数（❤️）与转发数（🔁）
  * `推文 ID`：唯一标识，用于配合 `--view` 查看全文
* **终端输出示例**：
  ```text
                           X Following 时间线推文列表 (库内共 148 条，展示最近 5 条)
  ┏━━━━┳━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━┓
  ┃  # ┃ 作者                 ┃ 推文摘要                            ┃ 互动指标 ┃ 推文 ID             ┃
  ┣━━━━╋━━━━━━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╋━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━┫
  ┃  1 ┃ 无颜                 ┃ 全球50个短信接码平台集合，前几个最… ┃  ❤️ 1629 ┃ 2097833682442784801 ┃
  ┃    ┃ @WY_mask             ┃ SMS-Activate：https://t.co/Tu9SpYd… ┃   🔁 407 ┃                     ┃
  ┣━━━━╋━━━━━━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╋━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━┫
  ┃  2 ┃ Vox                  ┃ Codex tip: A cost-efficient Luna +  ┃  ❤️ 1764 ┃ 2097814698204832116 ┃
  ┃    ┃ @Voxyz_ai            ┃ Sol agent tree, orchestrated by…    ┃   🔁 115 ┃                     ┃
  ┗━━━━┻━━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━┛
  ```

---

### 4.5 查看/抓取单篇推文并导出 Markdown (`--view`)
支持传入**推文 ID** 或 **X 原文链接**。如果本地数据库已有则秒级展示；如果本地未检索到，系统会**自动从 X 在线实时抓取**、解析其连帖 Thread 并落库保存后展示。

系统**默认自动导出为单篇独立 Markdown 文档**（受参数 `--no-export-md` 控制）：
- **Page Bundle 自包含归档**：默认自动落盘为 `output/{author}/{tweet_id}/index.md`，正文及连帖所有图片下载保存在同级 `images/` 子目录，正文相对引用 `images/...`，完全自包含，随处移动不丢图。
- **视频提供在线直链**：视频保留高清 MP4 播放与下载链接，不占用海量本地存储。
- **完整连帖展开**：若目标推文是作者的多条连帖（Thread），自动合并整理为结构化各章节展开。
- **长专栏 X Article 无损提取**：自动还原富文本排版、标题层级、引用块及内联图表。
- **灵活目录配置**：默认输出至 `output/{author}/{tweet_id}/`，可配合 `-o / --output` 指定存放目录或自定义文件名。

* **基本语法**：
  ```bash
  # 抓取/查看单篇推文（默认自动导出 Page Bundle Markdown 并下载图片至 output/{author}/{tweet_id}/images/）
  pnpm dev:cli -- --view https://x.com/username/status/2086710313219727862

  # 指定自定义存放目录
  pnpm dev:cli -- --view <推文ID或URL> -o my_folder/

  # 指定自定义文件名
  pnpm dev:cli -- --view <推文ID或URL> -o custom_notes/article.md

  # 仅在终端查看卡片，不导出 Markdown 也不下载图片
  pnpm dev:cli -- --view <推文ID或URL> --no-export-md
  ```
* **终端输出示例**：
  ```text
  ╭─────────────────────── 推文详情: 2097871610414067757 ────────────────────────╮
  │ 作者: Miles Ma (@miles_mazy)                                                 │
  │ 发布时间: Thu Sep 10 02:15:43 +0000 2026                                     │
  │ 原文链接: https://x.com/miles_mazy/status/2097871610414067757                │
  │ 互动数据: ❤️ 赞: 26  |  🔁 转发: 0  |  💬 回复: 36  |  👁️ 浏览: 4877         │
  │ ────────────────────────────────────────────────────────────                 │
  │ 正文:                                                                        │
  │ 19K 了🎉🎉 冲 2W！！                                                         │
  │                                                                              │
  │ 今天写篇啥文章好？大家来评论区许愿吧🤣 https://t.co/KucU7AdasM               │
  │                                                                              │
  │ 🖼️ 媒体附件:                                                                 │
  │   - https://pbs.twimg.com/media/HR0i8iNaUAAYrrW.jpg                          │
  ╰──────────────────────────────────────────────────────────────────────────────╯
  💾 正在导出单篇推文 Markdown 文档并下载图片资源...
  🎉 推文已导出为 Markdown 文档: output/miles_mazy/2097871610414067757/index.md
  🖼️ 已同步下载 1 张图片至: output/miles_mazy/2097871610414067757/images
  可在 Markdown 编辑器中直接查阅，文中图片已自动关联本地相对路径。
  ```

---

### 4.6 导出推文为 Markdown 归档 (`--export`)
将本地 SQLite 中已持久化的推文批量导出为一个排版优美的 Markdown 长文档，专为在 VS Code、Obsidian、Typora 等编辑器中沉浸式阅读和沉淀知识库设计。

* **基本语法**：
  ```bash
  # 默认导出最近 200 条至 output/tweets_YYYY-MM-DD.md
  pnpm dev:cli -- --export

  # 指定导出条数（如 50 条）
  pnpm dev:cli -- --export 50

  # 自定义导出文件路径或目标目录（配合 -o / --output）
  pnpm dev:cli -- --export 50 -o my_notes.md
  pnpm dev:cli -- --export 100 -o ~/Documents/ObsidianVault/

  # 配合互动指标筛选高价值推文归档（如仅导出点赞 >= 100 的推文）
  pnpm dev:cli -- --export 100 --min-likes 100 -o output/high_value.md

  # 抓取时自动连带导出（链式组合）
  pnpm dev:cli -- --x-list 1903106960452620743 --limit 10 --export
  pnpm dev:cli -- --user elonmusk --limit 10 --export -o output/elon.md
  ```
* **参数选项**：
  * `--min-likes <N>`：按点赞量门槛过滤导出推文。
  * `--min-retweets <N>`：按转推量门槛过滤导出推文。
* **导出文件路径**：
  * 默认路径：`output/tweets_YYYY-MM-DD.md`
  * 自定义路径：通过 `-o` / `--output` 指定的具体文件路径或目录。
* **Markdown 特性**：
  * 每篇推文附带可点击的原作者主页直达链接与原文链接。
  * 包含点赞/转推/浏览等核心量化指标。
  * 自动呈现引述（Quote Tweet）与转推（Retweet）关联原文。
  * 提取并格式化推文内包含的外部超链接与图片附件。

---

### 4.7 获取与检索指定博主推文 (`--user`)
专门针对某位高价值博主（如行业大佬、研究机构、核心关注人），定向获取或快速检索其近期推文。系统提供**在线实时抓取**与**离线秒级检索**双模式：

#### 模式 A：在线实时抓取博主主页推文
驱动 Playwright 打开该博主主页（`x.com/<username>`），透明拦截官方 `UserOriginalsTimeline` GraphQL 接口，获取该博主最新原创帖子并增量落库 SQLite。
* **基本语法**：
  ```bash
  # 在线抓取指定博主最新 20 条推文（默认）
  pnpm dev:cli -- --user <博主用户名>

  # 配合 --limit 指定抓取条数（如最新 10 条）
  pnpm dev:cli -- --user <博主用户名> --limit 10
  ```
* **使用示例**：
  ```bash
  pnpm dev:cli -- --user elonmusk --limit 5
  ```
* **终端输出示例**：
  ```text
  ⏳ 开始抓取博主 @elonmusk 的最新推文（目标 5 篇）...
  🌐 正在打开博主主页 https://x.com/elonmusk 并监听推文流（超时阈值: 60 秒）...
  ✓ 成功拉取到 5 条 @elonmusk 的推文
  ✓ 本地库更新完毕：新增入库 5 条，跳过重复 0 条 (库内总计 151 条)
                                     博主 @elonmusk 最新推文 (共拉取 5 条)        
  ┏━━━━┳━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━┓
  ┃  # ┃ 作者                 ┃ 推文摘要                            ┃ 互动指标 ┃ 推文 ID             ┃
  ┣━━━━╋━━━━━━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╋━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━┫
  ┃  1 ┃ Elon Musk            ┃ Play video games or be dumb! Those  ┃  ❤️ 68   ┃ 2097834512345678901 ┃
  ┃    ┃ @elonmusk            ┃ are your only 2 choices 😂          ┃   🔁 7   ┃                     ┃
  ┗━━━━┻━━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━┛
  ```

#### 模式 B：本地离线瞬时检索（0 延迟、0 流量、0 请求）
如果该博主推文已在平常抓取 Following 流或先前定向抓取时落入本地 SQLite 数据库，无需发起任何网络请求，直接瞬时检索并以富文本表格展示。
* **基本语法**：
  ```bash
  # 从本地库筛选该博主最近 20 条推文
  pnpm dev:cli -- --list --user <博主用户名>

  # 结合条数筛选（如展示最近 10 条）
  pnpm dev:cli -- --list 10 --user <博主用户名>
  ```

---

### 4.8 获取指定 X 列表最新推文 (`--x-list`)
用于跟踪特定主题的精选推文池（如「独立开发者」、「AI 专家」等 X Lists）。系统支持直接传入列表的完整 URL 或纯数字 List ID 进行精准无损拉取，并增量持久化到本地 SQLite。

* **为什么需要传入列表 URL 或数字 ID**：
  * **为什么**：X 平台的列表没有全局唯一的文本别名（全网任何人均可创建同名为「独立开发者」的公开或私密列表），官方 GraphQL 寻址和网页路由均完全基于数字 ID（如 `https://x.com/i/lists/1838848123456789012`）。
  * **对用户的影响**：精准定位，避免模糊重名导致拉取到无关内容；不管是自己创建的私有列表，还是关注他人的公开精选列表，只要能访问即可 100% 稳定抓取。
* **基本语法**：
  ```bash
  # 抓取列表最新 20 条推文（支持传入完整 URL 或纯数字 ID）
  pnpm dev:cli -- --x-list https://x.com/i/lists/1838848123456789012

  # 传入纯数字 ID 并指定抓取条数（如最新 10 条）
  pnpm dev:cli -- --x-list 1838848123456789012 --limit 10
  ```
* **参数选项**：
  * `--limit <N>`：抓取推文条数（默认 20 条，按需向下滚动翻页）。
  * `--timeout <N>`：超时阈值（秒，默认 60 秒）。
* **如何获取 X 列表的链接 / ID**：
  * **电脑端**：在 X 页面左侧点击「列表 (Lists)」-> 点击进入该列表 -> 直接复制浏览器地址栏的 URL（即包含一串数字的链接）。
  * **手机端**：进入该列表 -> 点击右上角「分享」图标 -> 选择「复制链接」。

---

### 4.9 关键词/高级语法实时搜索 (`--search`)
支持全网关键词与原生高级语法主动侦测，驱动原生浏览器访问 X 搜索页面并监听底层 `SearchTimeline` GraphQL 接口，自动解析推文与富媒体并增量持久化落库。

* **基本语法**：
  ```bash
  # 实时搜索包含 "DeepSeek" 的最新推文（默认抓取最新 20 条，按时间倒序）
  pnpm dev:cli -- --search "DeepSeek"

  # 配合 --limit 指定抓取数量（如抓取 50 条）
  pnpm dev:cli -- --search "DeepSeek" --limit 50

  # 切换为「热门 (Top)」排序流（默认是「最新 (Live)」）
  pnpm dev:cli -- --search "Claude" --search-type top --limit 20
  ```
* **常用 X 高级搜索语法示例**：
  * **按语言筛选**：`--search "AI agent lang:zh"`（仅搜中文推文）
  * **按互动阈值初筛**：`--search "OpenAI min_faves:500"`（X 官方服务端只返回 500+ 点赞推文）
  * **排除指定词**：`--search "AI -crypto -airdrop"`（排除特定干扰词）
  * **指定来源用户**：`--search "release from:sama"`（搜索特定用户发布的关键词）
* **参数选项**：
  * `--search-type {live,top}`：搜索流排序类型，`live` 为最新实时（默认），`top` 为全网热门。
  * `--limit <N>`：抓取推文数量上限（默认 20 条）。
  * `--min-likes <N>`：抓取时本地入库的点赞数门槛（低于该数值的推文将被就地丢弃）。
  * `--min-retweets <N>`：抓取时本地入库的转推数门槛。
  * `--timeout <N>`：页面加载与监听超时时间（秒，默认 60 秒）。

---

### 4.10 互动信噪比门槛过滤 (`--min-likes`, `--min-retweets`)
推特海量信息流中充斥大量低质水帖、自言自语或噪音。通过设置点赞数（`--min-likes`）与转发数（`--min-retweets`）阈值，可在**数据抓取、本地查阅、早报生成、Markdown 导出**全流程实现高价值情报过滤：

* **1. 在搜索抓取时过滤（入库前初筛）**：
  ```bash
  # 抓取并只入库点赞 >= 50、转推 >= 10 的高价值推文
  pnpm dev:cli -- --search "Claude" --min-likes 50 --min-retweets 10
  ```
* **2. 本地已存推文查阅过滤 (`--list`)**：
  ```bash
  # 在终端快速查看点赞过千（>= 1000）的爆款推文
  pnpm dev:cli -- --list 10 --min-likes 1000

  # 查阅某位博主的高赞推文
  pnpm dev:cli -- --list 10 --user elonmusk --min-likes 500
  ```
* **3. 结构化早报生成过滤 (`--report-only` / 默认流水线)**：
  ```bash
  # 早报仅提炼点赞 >= 20 的核心推文，彻底隔绝闲聊噪音
  pnpm dev:cli -- --report-only --min-likes 20
  ```
* **4. 批量导出 Markdown 文档过滤 (`--export`)**：
  ```bash
  # 仅导出点赞数 >= 100 的精选推文到知识库
  pnpm dev:cli -- --export 50 --min-likes 100 -o output/high_signal_tweets.md
  ```

---

### 4.11 ~~交互式免查 Cookie 浏览器登录 (`--login`)~~（已移除）

> **该命令已下线。** 实测证明：X 会对自动化浏览器的登录动作持续限流，在用户尚未输入
> 任何凭据时即返回「我们已临时限制你的登录」。与 X 的 bot 检测对抗不具备可持续性。
>
> **替代方案**：在桌面端「设置 → X 账号 → 从 Chrome 读取登录态」一键导入。
> 登录动作由你在自己的 Chrome 中完成，应用只读取既有会话。详见
> [configuration.md](configuration.md#32-从浏览器读取登录态最省心)。

---

### 4.12 验证账号会话连通性 (`--check-auth`)
测试当前 `.env` 或 `data/auth_state.json` 中的凭证和网络代理是否能成功与 X 建立合法会话。

* **基本语法**：
  ```bash
  pnpm dev:cli -- --check-auth
  ```
* **终端输出示例**：
  ```text
  🔍 正在验证 X 登录状态与 Cookie 有效性...
  ╭────────────────────────────── X Session Status ──────────────────────────────╮
  │ 认证成功！                                                                   │
  │ 状态: 会话有效                                                               │
  │ 信息: X User (logged_in)                                                     │
  │ 代理配置: http://127.0.0.1:8118                                              │
  │ 会话来源: data/auth_state.json                                               │
  ╰──────────────────────────────────────────────────────────────────────────────╯
  ```

---

### 4.13 全网热搜与趋势看板（模式 1：`--trends`）
**解决用户「在没有预设关键词」时的信息盲区**。底层直接拦截 X 官方 `ExplorePage` 与 `GenericTimelineById` GraphQL 协议，自动清洗推广广告，以结构化富文本表格呈现当前全网热搜与分类趋势榜单。

* **基本语法**：
  ```bash
  # 查看当前科技/AI领域前 10 大热搜（默认）
  pnpm dev:cli -- --trends

  # 指定前 N 名（如 Top 5）
  pnpm dev:cli -- --trends --top 5

  # 切换不同分类看板
  pnpm dev:cli -- --trends -c all            # 全网综合热榜
  pnpm dev:cli -- --trends -c business       # 商业财经
  pnpm dev:cli -- --trends -c news           # 全球要闻
  pnpm dev:cli -- --trends -c entertainment  # 娱乐影视
  pnpm dev:cli -- --trends -c sports         # 体育赛事
  ```
* **终端展示效果**：
  ```text
                                🔥 X 全网实时热搜榜单 - 科技/AI (Top 5)           
  ┏━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
  ┃  # ┃ 趋势话题 / 热点                        ┃ 所属分类           ┃ 热度指标 ┃ 推荐检索 Query             ┃
  ┡━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
  │  1 │ Alibaba Releases Qwen-Image-2.1        │ General            │ 高热度   │ Alibaba Releases Qwen...   │
  │  2 │ XGEN Labs Persistent World Simulation  │ General            │ 高热度   │ XGEN Labs Prototype...     │
  │  3 │ DeepSeek Open Source Infrastructure    │ Artificial Intell… │ 85K 讨论 │ DeepSeek Infrastructure    │
  └────┴────────────────────────────────────────┴────────────────────┴──────────┴────────────────────────────┘
  ```

---

### 4.14 全自动趋势深度研报（模式 2：`--trends-digest`）
**从「热搜榜单」到「深度分析研报」的全自动闭环**：
1. 自动截获当前分类下的热门趋势；
2. **AI 智能提炼核心搜索词**：由大模型自动将长新闻长句/冗长标题提炼为 2~4 个高命中推特发帖实体词，大幅提升命中率与推文丰富度；
3. **安全串行抓取与防风控节流**：坚决避免多线程并发对 X 账号引发的 429 限制或风控，串行搜索并保持温和的人性化停顿；
4. **全量 High 级长推理与原生 SSE 流式传输**：大模型思考过程与正文输出以 SSE 流式回传，彻底杜绝网关超时断开，输出兼具**客观事实还原、多方对立争议、爆款原声引用与新媒体选题建议**的深度研报；
5. 归档至 `output/reports/trends_YYYY-MM-DD.md`。

* **基本语法**：
  ```bash
  # 对科技热榜 Top 3 生成深度全自动研报（默认）
  pnpm dev:cli -- --trends-digest

  # 对全网综合热搜 Top 5 生成研报
  pnpm dev:cli -- --trends-digest -c all --top 5

  # 指定使用 DeepSeek 或本地 Google 账号订阅驱动
  pnpm dev:cli -- --trends-digest --provider deepseek --auth-mode api_key
  pnpm dev:cli -- --trends-digest --provider gemini --auth-mode account

  # 指定时效回溯窗口（例如只看近 24 小时或扩展到近 72 小时，杜绝历史陈旧旧帖）
  pnpm dev:cli -- --trends-digest --hours 24
  ```
* **研报产出样例**：
  保存在 `output/reports/trends_YYYY-MM-DD.md`，包含以下模块：
  - **⚡ 热搜雷达速览 (Trending Radar)**：排名、趋势、体量与一句话定性；
  - **🔍 核心热点深度剖析 (Deep Dive)**：突发事件起因、各方争议与多空交锋、高赞爆款原声引用；
  - **💡 趋势启示与选题建议 (Actionable Insights)**：行业研判总结 + 新媒体/技术写作选题推荐。

---

### 4.15 多大模型与双轨认证参数 (`--provider`, `--auth-mode`, `--model`)
任何总结任务（`--report-only`、`--trends-digest` 或默认每日流水线）均支持自由切换 7 大主流厂商大模型与双轨认证机制：

* **支持的 7 大主流厂商 (`--provider`) 与 2026 最新官方模型（全量默认启用深度思考/推理模式与多模态，等级为 high）**：
  1. **Google (`gemini`)**：
     - 最新主力：`gemini-3.8-flash`（默认，极速与高阶智能兼备，全模态，`--effort high` / `thinking_level: HIGH`）、`gemini-3.1-pro`（长推理）、`gemini-2.5-flash`
     - 认证支持：账号订阅免 Key 模式（走本地 `agy`，0 API 账单）或官方 API Key
  2. **OpenAI (`openai` / `gpt`)**：
     - 最新主力：`gpt-5.6-sol`（默认，GPT-5.6 Sol 旗舰全模态推理，默认 `reasoning_effort: "high"`，亦兼容 `gpt-5.6` 别名）、`gpt-4o`、`o3-mini`、`o1`
     - 认证支持：官方 API Key 模式（账号订阅免 Key 通道需在设置中配置）
  3. **DeepSeek (`deepseek`)**：
     - 最新主力：`deepseek-flash`（默认，最新 DeepSeek-V4.1-Flash，1M 超长上下文，原生多模态，默认携带 `thinking: {"type": "enabled"}` 与 `reasoning_effort: "high"`）、`deepseek-v4-pro`
     - ⚠️ **模型升级警示**：旧版 `deepseek-chat` 与 `deepseek-reasoner` 别名已于 2026 年 7 月正式下线停运，系统已全面切至 `deepseek-flash`
  4. **阿里通义千问 (`qwen` / `qwen-token-plan`)**：
     - 最新主力：`qwen3.8-flash`（默认，原生全模态推理，默认携带 `enable_thinking: true` 与 `reasoning_effort: "high"`）、`qwen3.8-max`（旗舰推理）、`qwen3.7-plus`
     - **普通按量端点**：`https://dashscope.aliyuncs.com/compatible-mode/v1`（Key 为 `sk-` 开头）
     - **Token Plan 专属端点**：`https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
       - *智能感知*：若 API Key 为 `sk-sp-` 开头，系统自动切换至 Token Plan 端点；亦可显式指定 `--provider qwen-token-plan` 或配置 `DASHSCOPE_BASE_URL`
  5. **智谱清言 (`zhipu` / `zhipu-code-plan`)**：
     - 最新主力：`glm-5.3-flash`（默认，1M 上下文原生多模态主力高吞吐，默认携带 `thinking: {"type": "enabled"}` 与 `reasoning_effort: "high"`）、`glm-5.3`（旗舰复杂软件工程与智能体长程任务）、`glm-5.3-flashx`（极速版）
     - **普通开放平台端点**：`https://open.bigmodel.cn/api/paas/v4`（指定 `--provider zhipu`）
     - **Coding Plan 专属端点**：`https://open.bigmodel.cn/api/coding/paas/v4`（指定 `--provider zhipu-code-plan`）
       - *享用套餐额度*：配置 `ZHIPUAI_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4` 或指定 `--provider zhipu-code-plan`，避免消耗普通按量余额
     - **深度思考机制**：默认注入 `thinking: {"type": "enabled"}` 与 `reasoning_effort: "high"`
  6. **MiniMax (`minimax`)**：
     - 最新主力：`MiniMax-M3`（默认，最新原生多模态 1M 旗舰，默认启用 `thinking: {"type": "enabled"}` 与 `reasoning_split: true`）、`MiniMax-M2.7-highspeed`
     - 接入方式：MiniMax 开放平台 API (`api.minimax.chat/v1`)
  7. **月之暗面 Kimi (`kimi`)**：
     - 最新主力：`kimi-k3`（默认，2.8万亿参数 100万 Token 原生全模态推理旗舰，默认携带 `reasoning_effort: "high"`）、`kimi-k2.7-code`
     - ⚠️ **模型升级警示**：旧版 `moonshot-v1` 系列（8k/32k/128k）及 `kimi-latest` 已下线停运，官方要求全量使用 `kimi-k3`
* **双轨认证模式 (`--auth-mode`)**：
  - `account`：**账号订阅免 Key 模式**（支持 Google Gemini 与 OpenAI ChatGPT Plus，0 额外账单，白嫖月付配额）
  - `api_key`：**官方 API Key 计费模式**（按 Token 计费，高并发首选）
* **指定具体模型 (`--model`)**：
  - 覆盖默认模型（如 `--model deepseek-v4-pro`、`--model qwen-max`、`--model kimi-k3`、`--model gpt-4o`）
* **使用示例**：
  ```bash
  # 使用 DeepSeek 最新 V4.1-Flash 提炼今日关注流早报
  pnpm dev:cli -- --report-only --provider deepseek --auth-mode api_key

  # 使用月之暗面 Kimi 最新旗舰 kimi-k3 生成趋势研报
  pnpm dev:cli -- --trends-digest --provider kimi --auth-mode api_key

  # 使用阿里 Qwen-Max 旗舰推理模型提炼早报
  pnpm dev:cli -- --report-only --provider qwen --model qwen-max

  # 使用用户已订阅的 Google 账号配额生成趋势研报（0 额外费用）
  pnpm dev:cli -- --trends-digest --provider gemini --auth-mode account

  # 使用 OpenAI ChatGPT Plus 网页配额生成早报
  pnpm dev:cli -- --report-only --provider openai --auth-mode account
  ```

---

### 4.16 级联删除推文与本地文件 (`--delete`)
支持按单篇推文 ID/URL、指定博主用户名、日期范围（`--since` / `--until`）或留存时长（`--older-than`）执行删除。
该操作保证 SQLite 数据库与本地文件强一致级联清理：同步物理删除对应推文的 `output/{author}/{tweet_id}/` 目录，若作者目录为空则顺带修剪空目录。

* **基本语法**：
  ```bash
  # 按单篇推文 ID 或 URL 删除
  pnpm dev:cli -- --delete 2094624092015992854 -y
  pnpm dev:cli -- --delete https://x.com/dotey/status/2094624092015992854 -y

  # 按博主批量删除推文及本地目录
  pnpm dev:cli -- --delete --user dotey -y

  # 按日期范围删除（支持 UTC 格式或 YYYY-MM-DD）
  pnpm dev:cli -- --delete --since 2026-09-01 --until 2026-09-15 -y

  # 按过期时长清理（如删除 30 天前的内容）
  pnpm dev:cli -- --delete --older-than 30d -y

  # 演练预览（仅查看将删除的推文与本地文件，不执行实际删除）
  pnpm dev:cli -- --delete --user dotey --dry-run
  ```
* **防误删保护**：
  * 要求至少提供一项筛选条件（ID/URL、`--user`、`--since`/`--until` 或 `--older-than`），禁止无条件全量清空；
  * 支持 `--dry-run` 预览演练机制；
  * 脚本化或免确认执行需带 `-y / --yes`。

---

## 5. 典型工作流与使用场景

### 场景 A：日常全自动情报早报（最常用）
每天早上起床或开工前，一键拉取最新推文并生成今日简报：
```bash
pnpm dev:cli
```
阅读生成的 `output/reports/YYYY-MM-DD.md`，3 分钟通览关注圈全貌。

### 场景 B：高频采集 + 傍晚集中提炼
为了覆盖全天完整动态，建议上午和下午仅抓取入库（不跑 LLM）：
```bash
# 上午 11:00 执行仅拉取：
pnpm dev:cli -- --fetch-only --pages 3

# 下午 17:00 执行仅拉取：
pnpm dev:cli -- --fetch-only --pages 3

# 晚上 20:00 集中基于过去 12 小时的数据生成一份全天汇总：
pnpm dev:cli -- --report-only --hours 12
```

### 场景 C：早报 Prompt 调优与格式重构
当你需要调整早报生成的 Prompt 风格或分类维度时，修改 `src/main/pipeline/` 中的相关模板后：
```bash
# 直接离线重跑，几秒内出结果，0 风险 0 成本
pnpm dev:cli -- --report-only
```

### 场景 D：沉浸式浏览原始推文素材
不希望看 AI 总结，只想在本地编辑器里像看书一样划重点或归档到 Obsidian：
```bash
pnpm dev:cli -- --export 300
```
直接在编辑器打开 `output/tweets_YYYY-MM-DD.md` 划线做笔记。

---
