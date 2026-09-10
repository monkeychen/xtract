# 🗞️ X (Twitter) Following Timeline AI Digest

> **基于 Playwright 官方流无损拦截 + SQLite 本地增量去重 + Gemini AI 结构化提炼的个人时间线情报早报系统。**

---

## 目录
- [1. 核心设计与第一性原理](#1-核心设计与第一性原理)
- [2. 环境依赖与快速安装](#2-环境依赖与快速安装)
- [3. 凭据与网络配置指南](#3-凭据与网络配置指南)
- [4. CLI 完整命令参考手册](#4-cli-完整命令参考手册)
  - [4.1 全量流水线（拉取 + 存储 + 生成早报）](#41-全量流水线拉取--存储--生成早报)
  - [4.2 仅抓取推文入库 (`--fetch-only`)](#42-仅抓取推文入库---fetch-only)
  - [4.3 仅离线生成早报 (`--report-only`)](#43-仅离线生成早报---report-only)
  - [4.4 查看已抓取推文列表 (`--list`)](#44-查看已抓取推文列表---list)
  - [4.5 查看单篇推文全文详情 (`--view`)](#45-查看单篇推文全文详情---view)
  - [4.6 导出推文为 Markdown 归档 (`--export`)](#46-导出推文为-markdown-归档---export)
  - [4.7 验证账号会话连通性 (`--check-auth`)](#47-验证账号会话连通性---check-auth)
  - [4.8 交互式浏览器登录 (`--login`)](#48-交互式浏览器登录---login)
- [5. 典型工作流与使用场景](#5-典型工作流与使用场景)
- [6. 定时任务自动化配置 (Cron / launchd)](#6-定时任务自动化配置-cron--launchd)
- [7. 存储架构与数据目录规范](#7-存储架构与数据目录规范)
- [8. 自动化测试与质量保障](#8-自动化测试与质量保障)
- [9. 常见问题排查 (FAQ)](#9-常见问题排查-faq)

---

## 1. 核心设计与第一性原理

传统的 Twitter 爬虫或第三方逆向库（如 `twikit`）经常因 X 官方频繁重构前端打包命名（如近期从 `responsive-web` 迁至 `x-web`）而频繁暴毙（抛出 `KEY_BYTE indices` 错误）。

本项目从第一性原理出发，采用**生产级抗脆弱架构**：

1. **官方网络流透明拦截（Playwright Network Interception）**：
   - 驱动真实原生 Chrome 浏览器加载 `x.com/home`，在底层协议层监听由 X 官方前端代码合法发出的 GraphQL 响应（`HomeLatestTimeline`）。
   - **对用户的影响**：零逆向成本、完全免疫 X 前端改版；只要你能用浏览器刷推，抓取就 100% 可用。
2. **抓取（Fetch）与总结（Summarize）彻底解耦**：
   - 拉取的推文先落库 SQLite 本地数据库去重，再按需送入 LLM 处理。
   - **对用户的影响**：调整早报 Prompt、聚类维度或重新生成简报时，**直接基于本地数据离线秒级完成**，不需要重新请求 X，0 风控、0 额外等待。
3. **SQLite 增量去重**：
   - 定时多次抓取只记录增量，自动按 `tweet_id` 主键去重，杜绝重复推文消耗 LLM Token。
4. **长推与富媒体自动解析**：
   - 自动展开 X 官方的长推（Note Tweet/Articles），保留完整的长文深度内容与外链。
5. **推广推文（广告）自动过滤**：
   - 数据进入数据库前自动剥离所有信息流广告（Promoted Tweets），保证知识库与早报的纯净度。

---

## 2. 环境依赖与快速安装

项目推荐使用现代化 Python 包管理器 [`uv`](https://docs.astral.sh/uv/)，环境完全隔离在项目内部的 `.venv` 中，不污染系统全局环境。

### 2.1 克隆并进入目录
```bash
cd /Users/chenzhian/lab/x
```

### 2.2 创建虚拟环境并同步依赖
```bash
# 1. 创建独立 Python 虚拟环境
uv venv

# 2. 安装全部锁定依赖
uv pip install -r requirements.txt

# 3. 安装 Playwright 专用的 Chromium 内核
uv run playwright install chromium
```

---

## 3. 凭据与网络配置指南

复制配置文件模板：
```bash
cp .env.example .env
```

打开 `.env` 文件，完善以下配置项：

```env
# ==========================================
# 1. X (Twitter) 会话认证凭据
# ==========================================
X_AUTH_TOKEN=你的auth_token
X_CT0=你的ct0

# ==========================================
# 2. 本地网络代理配置 (国内访问 X 必配)
# ==========================================
HTTP_PROXY=http://127.0.0.1:8118

# ==========================================
# 3. LLM 智能提炼配置 (Google Gemini)
# ==========================================
GEMINI_API_KEY=你的gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# ==========================================
# 4. 抓取行为控制
# ==========================================
FETCH_MAX_PAGES=3
FETCH_TIMEOUT=60
```

### 如何在 20 秒内获取 `auth_token` 与 `ct0`？
你在日常使用的 Chrome / Edge 浏览器中已处于登录状态，直接复用其合法凭证即可，**完全无需在脚本中重新输入账号密码**：
1. 打开已登录的 [x.com](https://x.com)；
2. 按快捷键 `Cmd + Option + I`（Mac）或 `F12` 打开开发者工具；
3. 切换到顶部 **Application（应用）** 标签页；
4. 左侧菜单展开 **Storage（存储）** ➔ **Cookies** ➔ 点击 **`https://x.com`**；
5. 在中间表格找到以下两项并双击复制其 **Value（值）**：
   - `auth_token`：一串 40 位的哈希字符串，填入 `X_AUTH_TOKEN`
   - `ct0`：CSRF 校验值，填入 `X_CT0`

---

## 4. CLI 完整命令参考手册

所有命令均支持 `uv run python main.py [选项]` 执行，保证在隔离虚拟环境中运行。

```
usage: main.py [-h] [--login] [--check-auth] [--fetch-only] [--report-only]
               [--list [N]] [--view TWEET_ID] [--export [N]]
               [--pages PAGES] [--hours HOURS] [--timeout TIMEOUT]
```

### 4.1 全量流水线（拉取 + 存储 + 生成早报）
一键执行端到端闭环任务：自动挂载监听器打开 X Following 时间线 ➔ 增量拉取最新推文 ➔ 本地 SQLite 去重入库 ➔ 备份原始快照 ➔ 调用 Gemini 生成结构化早报 ➔ 输出 Markdown 归档。

* **基本语法**：
  ```bash
  uv run python main.py
  ```
* **可选参数组合**：
  ```bash
  # 抓取 5 页推文，回溯过去 12 小时内容生成早报
  uv run python main.py --pages 5 --hours 12
  ```
* **输出成果**：
  生成的 Markdown 早报保存在 `output/reports/YYYY-MM-DD.md`。

---

### 4.2 仅抓取推文入库 (`--fetch-only`)
只进行网络拦截与本地落库，**不触发 LLM 总结**。适合用于高频定时采集、数据积累，或在不消耗 Token 的情况下备份推文。

* **基本语法**：
  ```bash
  uv run python main.py --fetch-only
  ```
* **参数选项**：
  * `--pages <N>`：抓取页数（默认读取 `.env` 中的 `FETCH_MAX_PAGES`，通常 1 页约 25~35 条）。
  * `--timeout <N>`：单步操作超时时间（秒，默认 60 秒）。
* **使用示例**：
  ```bash
  # 抓取 3 页推文
  uv run python main.py --fetch-only --pages 3
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
**纯离线运行**，不发起任何推特网络请求。直接从本地 SQLite 数据库中提取指定时间段的推文，调用 Gemini 进行主题聚类并生成早报。

* **基本语法**：
  ```bash
  uv run python main.py --report-only
  ```
* **参数选项**：
  * `--hours <N>`：早报统计回溯时间窗口（默认近 24 小时）。
* **使用示例**：
  ```bash
  # 仅基于过去 12 小时内抓取的推文重新提炼早报
  uv run python main.py --report-only --hours 12
  ```
* **终端输出示例**：
  ```text
  🔍 正在从本地数据库检索近 12 小时的推文...
  ℹ️ 找到 86 条相关推文，正在调用 Gemini 模型进行主题聚类与提炼...
  🎉 早报已生成：/Users/chenzhian/lab/x/output/reports/2026-09-10.md
  ```

---

### 4.4 查看已抓取推文列表 (`--list`)
以格式化的交互式富文本表格在终端列出本地数据库中的推文，快速掌握近期抓取动态。

* **基本语法**：
  ```bash
  # 默认展示最近 20 条
  uv run python main.py --list

  # 指定展示最近 N 条（如展示 50 条）
  uv run python main.py --list 50
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

### 4.5 查看单篇推文全文详情 (`--view`)
当你在列表或早报中发现某条高价值推文时，可通过该命令在终端调出单篇推文的完整卡片面板。

* **基本语法**：
  ```bash
  uv run python main.py --view <TWEET_ID>
  ```
* **使用示例**：
  ```bash
  uv run python main.py --view 2097814698204832116
  ```
* **终端输出示例**：
  ```text
  ╭─────────────────────── 推文详情: 2097814698204832116 ────────────────────────╮
  │ 作者: Vox (@Voxyz_ai)                                                        │
  │ 发布时间: Wed Sep 09 22:29:34 +0000 2026                                     │
  │ 原文链接: https://x.com/Voxyz_ai/status/2097814698204832116                  │
  │ 互动数据: ❤️ 赞: 1764  |  🔁 转发: 115  |  💬 回复: 85  |  👁️ 浏览: 150847   │
  │ ────────────────────────────────────────────────────────────                 │
  │ 正文:                                                                        │
  │ Codex tip: A cost-efficient Luna + Sol agent tree, orchestrated by Astra.    │
  │                                                                              │
  │ Effort levels chosen by weighing DeepSWE’s pass rates, average cost per      │
  │ task, and agent steps. Hand this to Codex to set it up 👇                    │
  │ https://t.co/1s0YC8zkps                                                      │
  │                                                                              │
  │ 🖼️ 媒体附件:                                                                 │
  │   - https://pbs.twimg.com/media/HRzuKfFa0AA3OV0.png                          │
  ╰──────────────────────────────────────────────────────────────────────────────╯
  ```

---

### 4.6 导出推文为 Markdown 归档 (`--export`)
将本地 SQLite 中已持久化的推文批量导出为一个排版优美的 Markdown 长文档，专为在 VS Code、Obsidian、Typora 等编辑器中沉浸式阅读和沉淀知识库设计。

* **基本语法**：
  ```bash
  # 默认导出最近 200 条
  uv run python main.py --export

  # 指定导出最近 N 条（如 500 条）
  uv run python main.py --export 500
  ```
* **导出文件路径**：
  `output/tweets_YYYY-MM-DD.md`
* **Markdown 特性**：
  * 每篇推文附带可点击的原作者主页直达链接与原文链接。
  * 包含点赞/转推/浏览等核心量化指标。
  * 自动呈现引述（Quote Tweet）与转推（Retweet）关联原文。
  * 提取并格式化推文内包含的外部超链接与图片附件。

---

### 4.7 验证账号会话连通性 (`--check-auth`)
测试当前 `.env` 中的凭证和网络代理是否能成功与 X 建立合法会话。

* **基本语法**：
  ```bash
  uv run python main.py --check-auth
  ```
* **终端输出示例**：
  ```text
  🔍 正在验证 X 登录状态与 Cookie 有效性...
  ╭────────────────────────────── X Session Status ──────────────────────────────╮
  │ 认证成功！                                                                   │
  │ 状态: 会话有效                                                               │
  │ 信息: X User (logged_in)                                                     │
  │ 代理配置: http://127.0.0.1:8118                                              │
  ╰──────────────────────────────────────────────────────────────────────────────╯
  ```

---

### 4.8 交互式浏览器登录 (`--login`)
弹出原生 Chrome 窗口进行免查 Cookie 交互式登录。一旦检测到登录成功，自动提取 Session 并保存至 `data/auth_state.json`。

* **基本语法**：
  ```bash
  uv run python main.py --login
  ```
* **参数选项**：
  * `--timeout <N>`：窗口加载超时阈值（秒，默认 60 秒，若网络卡顿可指定 `--timeout 90`）。
* **使用示例**：
  ```bash
  uv run python main.py --login --timeout 90
  ```
*(注：由于 X 官方对全新无缓存环境登录有严格风控，如遇「登录被限制」，请使用常规浏览器登录并通过 [第 3 节](#3-凭据与网络配置指南) 直接复制 Cookie 填入 `.env`，最快最稳)*

---

## 5. 典型工作流与使用场景

### 场景 A：日常全自动情报早报（最常用）
每天早上起床或开工前，一键拉取最新推文并生成今日简报：
```bash
uv run python main.py
```
阅读生成的 `output/reports/YYYY-MM-DD.md`，3 分钟通览关注圈全貌。

### 场景 B：高频采集 + 傍晚集中提炼
为了覆盖全天完整动态，建议上午和下午仅抓取入库（不跑 LLM）：
```bash
# 上午 11:00 执行仅拉取：
uv run python main.py --fetch-only --pages 3

# 下午 17:00 执行仅拉取：
uv run python main.py --fetch-only --pages 3

# 晚上 20:00 集中基于过去 12 小时的数据生成一份全天汇总：
uv run python main.py --report-only --hours 12
```

### 场景 C：早报 Prompt 调优与格式重构
当你需要调整早报生成的 Prompt 风格或分类维度时，修改 `src/summarizer.py` 后：
```bash
# 直接离线重跑，几秒内出结果，0 风险 0 成本
uv run python main.py --report-only
```

### 场景 D：沉浸式浏览原始推文素材
不希望看 AI 总结，只想在本地编辑器里像看书一样划重点或归档到 Obsidian：
```bash
uv run python main.py --export 300
```
直接在编辑器打开 `output/tweets_YYYY-MM-DD.md` 划线做笔记。

---

## 6. 定时任务自动化配置 (Cron / launchd)

通过系统级定时任务，实现每日全自动抓取与早报生成。

### 方案 1：Linux / macOS `crontab`（最简单）
在终端运行 `crontab -e`，添加定时规则（以每天早晨 8:30 执行为例）：

```cron
# 每天 8:30 自动抓取并生成早报
30 8 * * * cd /Users/chenzhian/lab/x && /Users/chenzhian/.local/bin/uv run python main.py >> data/cron.log 2>&1
```

### 方案 2：macOS 原生 `launchd`（Mac 推荐，支持休眠唤醒补跑）
在 `~/Library/LaunchAgents/com.x.digest.plist` 创建文件：
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.x.digest</string>
    <key>WorkingDirectory</key>
    <string>/Users/chenzhian/lab/x</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/chenzhian/.local/bin/uv</string>
        <string>run</string>
        <string>python</string>
        <string>main.py</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>30</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/chenzhian/lab/x/data/cron.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/chenzhian/lab/x/data/cron.log</string>
</dict>
</plist>
```
加载任务：
```bash
launchctl load ~/Library/LaunchAgents/com.x.digest.plist
```

---

## 7. 存储架构与数据目录规范

项目严格遵守结构分层与安全规范：

```
/Users/chenzhian/lab/x/
├── GEMINI.md               # 项目架构约束与设计记录
├── README.md               # 本项目全量使用指南
├── pyproject.toml          # uv 依赖管理
├── .env                    # 敏感会话凭据与代理（Git 忽略）
├── src/                    # 核心模块
│   ├── config.py           # 集中配置管理
│   ├── client.py           # Playwright 无头官方流拦截器
│   ├── storage.py          # SQLite 增量存储与 Markdown 导出
│   ├── summarizer.py       # Gemini 结构化聚类分析器
│   └── pipeline.py         # 流水线编排中枢
├── data/                   # 本地持久化数据（Git 忽略）
│   ├── tweets.db           # SQLite 数据库（存储去重推文元数据）
│   └── raw/                # 原始 JSON 快照备份（灾备，保留 30 天）
├── output/                 # 输出结果
│   ├── reports/            # 生成的 Markdown 早报（YYYY-MM-DD.md）
│   └── tweets_YYYY-MM-DD.md# 导出的全量推文归档清单
├── tests/                  # 自动化单元测试集
└── main.py                 # 统一 CLI 入口
```

### SQLite 数据表结构 (`tweets`)
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `tweet_id` | `TEXT PRIMARY KEY` | 推文唯一 ID（去重核心键） |
| `author_name` | `TEXT` | 博主昵称 |
| `author_username` | `TEXT` | 博主 Handle（`@screen_name`） |
| `text` | `TEXT` | 完整正文（自动展开 Note Tweet 长文） |
| `created_at` | `TEXT` | 发布时间戳 |
| `is_retweet` / `is_quote` | `INTEGER` | 是否为转推 / 引用推文 |
| `retweeted_text` / `quoted_text` | `TEXT` | 转推或引用的原文内容 |
| `like_count` / `retweet_count` | `INTEGER` | 点赞与转发互动数据 |
| `view_count` | `INTEGER` | 浏览曝光量 |
| `urls` / `media_urls` | `TEXT (JSON)` | 提取的外部链接与媒体附件数组 |
| `fetched_at` | `TEXT` | 采集入库的 ISO 时间戳 |

---

## 8. 自动化测试与质量保障

项目配备了严格的自动化测试用例，覆盖 SQLite 去重机制、数据分页切片、GraphQL 节点解析与字段提取：

```bash
uv run pytest
```

---

## 9. 常见问题排查 (FAQ)

### Q1: 抓取时提示 `TimeoutError` 或加载超时？
- **排查步骤**：
  1. 确认代理工具（如 Clash / Surge / MonoProxy）处于运行状态；
  2. 检查 `.env` 中的 `HTTP_PROXY` 是否正确（如 `http://127.0.0.1:8118`）；
  3. 如果代理节点速度较慢，运行时显式增加超时宽容度：`--timeout 90`。

### Q2: 提示「会话失效（被重定向至登录页）」？
- **原因**：X 网页端的 `auth_token` 通常具有数月有效期，但在你在浏览器中主动点击「退出登录」或更改密码时会立即失效。
- **解决**：在日常 Chrome 中重新复制最新的 `auth_token` 与 `ct0` 替换 `.env` 中的对应值即可。

### Q3: 为什么抓取到的推文中没有看到推广广告？
- **设计特性**：系统在解析 GraphQL 响应时，已自动基于 `entryId` 特征将带有 `promoted-tweet` 的广告全部剥离，仅保留你关注的博主的真实内容。
