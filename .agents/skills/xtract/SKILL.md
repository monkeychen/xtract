---
name: xtract
description: |
  Xtract（X / Twitter 高信噪比情报雷达与结构化研报系统）的 CLI 使用与 Agent 自动化调用指南。
  支持单推深度抓取（长文展开、连帖 Thread 合并、追评提取、图片本地化 Page Bundle 导出）、
  定向博主时间线追踪、全网关键词与高级语法检索、全网热门趋势榜单与 AI 深度研报生成、
  本地推文库检索、按 ID 批量归档与级联清理——面向 Agent 自动化管道设计，stdout 输出纯 JSON。
  当用户要「抓取/分析这条推文」「总结推特热点/热搜」「调研 Twitter 上的某个话题」「追踪某博主最新动态」
  「按关键词搜索推特高质内容」「查看本地已抓取的推特库」「批量导出推文 Markdown」「清理本地推文」时使用。
  排障与配置：用户数据目录在 `~/Documents/Xtract/`（含 SQLite 数据库、Page Bundle 文章与早报），凭据配置在 `config.env`。
---

# Xtract 使用指南（Agent 版）

Xtract 是 GUI + Headless CLI 同一二进制双模运行的桌面应用：无参启动呼出 GUI 情报工作台，带参命中命令行白名单时直接进入 Headless CLI。

## 0. CLI 通信契约

* **输出隔离**：必须附加 `--json` 参数。**stdout 输出纯 JSON 数据**，**stderr 输出诊断与进度日志**。
* **退出码规范**：
  * `0`：成功执行完成。
  * `1`：业务或网络失败（如未登录、单推抓取失败、速率限制）。
  * `2`：命令行参数解析错误。
* **数据目录**：默认所有数据、数据库、导出的文章与研报均存储在 `~/Documents/Xtract/`：
  * `data/tweets.db`：推文本地 SQLite 数据库；
  * `articles/{author}/{tweet_id}/index.md`：自包含 Page Bundle 单推归档（配图下载至同级 `images/`）；
  * `reports/`：AI 自动提炼的每日早报与全网趋势深度研报；
  * `config.env`：本地持久化配置（大模型端点 API Key、代理设置等）。

---

## 1. 运行时入口自适应探测

在执行任何命令前，Agent 应按以下优先级探测当前可用的可执行命令（赋值给变量 `XT`）：

```bash
# 探测优先级：系统 PATH 软链/shim ➔ macOS App 安装路径 ➔ 源码开发态
if command -v xtract >/dev/null 2>&1; then
  XT="xtract"
elif [ -f "/Applications/Xtract.app/Contents/MacOS/Xtract" ]; then
  XT="/Applications/Xtract.app/Contents/MacOS/Xtract"
else
  # 源码工程根目录下开发态运行
  XT="pnpm dev:cli --"
fi
```

探测完成后，所有命令通过 `$XT <options> --json` 形式发起。

---

## 2. 核心能力与场景速查

| 任务场景 | 推荐命令 | 说明 |
| :--- | :--- | :--- |
| **凭证状态自检** | `$XT --check-auth --json` | 检查 X 登录态是否有效，抓取网络数据前先自检 |
| **单推深度抓取/阅读** | `$XT --view <URL\|ID> --json` | 抓取长文、连帖、媒体，默认导出 Page Bundle Markdown |
| **抓取单推含作者追评** | `$XT --view <URL\|ID> --author-replies --json` | 深度展开作者在评论区追加的补充长推串 |
| **单推不导出 Markdown** | `$XT --view <URL\|ID> --no-export-md --json` | 仅获取推文结构化 JSON，不下载图片与写磁盘 |
| **定向博主追踪** | `$XT --user <handle> --limit 20 --json` | 抓取指定博主主页最新推文（支持 20/50/100） |
| **全网实时搜索** | `$XT --search "<query>" --search-type live --min-likes 50 --json` | 搜索最新高信噪比推文，建议搭配 `--min-likes` 过滤 |
| **全网热门趋势榜** | `$XT --trends --category tech --top 10 --json` | 抓取指定分类（tech/all/business 等）热点话题榜单 |
| **AI 趋势深度研报** | `$XT --trends-digest --hours 24 --top 10 --json` | 自动挖掘热点代表性讨论并调用大模型生成研报 |
| **检索本地推文库** | `$XT --list 20 [--min-likes 50] [--user <handle>] --json` | 离线查看本地 SQLite 已抓取的推文列表 |
| **批量导出推文归档** | `$XT --export-ids <ID1> <ID2>... --json` | 批量将推文导出为独立的 Page Bundle 目录结构 |
| **级联删除演练预览** | `$XT --delete <ID1> <ID2>... --dry-run --json` | 安全预览拟从 SQLite 和磁盘清理的文件与目录 |
| **级联物理删除** | `$XT --delete <ID1> <ID2>... -y --json` | 永久物理删除数据库记录及对应 Page Bundle 文件 |

---

## 3. 典型任务工作流

### 3.1 深度阅读并解析单篇推文

当用户提供一个推文链接（例如 `https://x.com/username/status/1234567890`）并要求分析时：

```bash
$XT --view "https://x.com/username/status/1234567890" --author-replies --json
```

**stdout 返回结构**：
```json
{
  "tweet": {
    "id": "1234567890",
    "text": "推文正文...",
    "full_text": "完整展开的长文正文或 X Article 万字专栏...",
    "author_name": "博主昵称",
    "author_username": "username",
    "created_at": "Wed Oct 14 01:23:45 +0000 2026",
    "likes_count": 1280,
    "retweets_count": 340,
    "replies_count": 56,
    "views_count": 45000,
    "media_urls": ["https://pbs.twimg.com/media/...jpg"],
    "video_variants": [{ "bitrate": 2176000, "url": "https://video.twimg.com/..." }],
    "is_thread": true,
    "thread_tweets": [ ... ]
  },
  "exportedMarkdown": "/Users/xxx/Documents/Xtract/articles/username/1234567890/index.md"
}
```

Agent 可直接读取 `tweet.full_text` 进行提炼总结，若需引用本地图片或文件，`exportedMarkdown` 即为完整落盘路径。

### 3.2 调研特定技术或热点主题

针对某个主题（如 `DeepSeek`、`Claude 3.7`）进行全网情报挖掘：

```bash
# 抓取近 20 条点赞高于 50 的实时推文
$XT --search "Claude 3.7" --search-type live --limit 20 --min-likes 50 --json
```

**stdout 返回结构**：
包含推文对象的 JSON 数组 `[ { "id": "...", "text": "...", "likes_count": ... }, ... ]`。

### 3.3 追踪特定博主动态

跟踪某位核心创作者或专家的近期内容：

```bash
$XT --user "sama" --limit 20 --json
```

### 3.4 全网趋势雷达与主题研报

获取实时热门榜单并生成 24 小时 AI 研报：

```bash
# 1. 查看科技类热榜 TOP 10
$XT --trends --category tech --top 10 --json

# 2. 触发端到端趋势深度研报（全自动挖掘 + 聚类 + LLM 总结）
$XT --trends-digest --category tech --hours 24 --json
```

研报将自动落盘至 `~/Documents/Xtract/reports/trends_YYYY-MM-DD.md`。

### 3.5 级联物理清理数据

当需要清理某篇或某些已抓取的低价值推文时，遵循安全原则：

```bash
# 1. 演练预览（dry-run）
$XT --delete 1234567890 --dry-run --json

# 2. 确认无误后执行删除（必须带 -y 跳过交互式确认）
$XT --delete 1234567890 -y --json
```

---

## 4. Agent 调用红线与防坑指南

1. **绝对不要忽略 `--json`**：如果不加 `--json`，Xtract 默认输出带有 ANSI 颜色与表格边框的人类可读终端格式，会导致 JSON 解析器抛错。
2. **凭据失效识别**：
   * 如果返回 `{"error": "...", "code": "AUTH_REQUIRED"}` 或网络 403/404，说明本地尚未登录 X 或会话 Cookie 已过期。
   * **不要死循环重试**，应立即友好提示用户打开 Xtract 桌面端（GUI）或在设置中心导入/更新 X Cookie 凭证。
3. **推文 ID 自动规整**：
   * 参数既支持传入纯数字推文 ID（`2108490720906793005`），也支持直接传入完整推文 URL（`https://x.com/username/status/2108490720906793005`），CLI 内部会自动提取数字 ID。
4. **信噪比门槛保护**：
   * 在使用 `--search` 或 `--list` 时，优先附带 `--min-likes 50` 或更高阈值，过滤垃圾与营销推文，为用户节约上下文窗口和 Token。
5. **并发与频控控制**：
   * X 平台存在针对 GraphQL 接口的频率限制（Rate Limit）。Agent 避免在同一时间并行发起多个抓取进程，应按顺序串行执行。
