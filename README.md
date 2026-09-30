# 🗞️ Xtract - X (Twitter) Intelligence Radar & AI Digest

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12%2B-brightgreen.svg)](https://www.python.org/)

> **基于 Playwright 官方流无损拦截 + SQLite 本地增量去重 + 全网实时热搜雷达 + 国内外多大模型统一调度（双轨认证：API-Key / 账号订阅免Key）的个人情报与深度研报系统。**

---

## 目录
- [1. 核心设计与第一性原理](#1-核心设计与第一性原理)
- [2. 环境依赖与快速安装](#2-环境依赖与快速安装)
- [3. 凭据与多模型配置指南](#3-凭据与多模型配置指南)
  - [3.1 端点 URL 默认解析机制与说明 (`XXXX_BASE_URL`)](#31-端点-url-默认解析机制与说明-xxxx_base_url)
  - [3.2 免查 Cookie 一键登录（最省心）](#32-免查-cookie-一键登录最省心)
- [4. CLI 完整命令参考手册](#4-cli-完整命令参考手册)
  - [4.1 全量流水线（拉取 + 存储 + 生成早报）](#41-全量流水线拉取--存储--生成早报)
  - [4.2 仅抓取推文入库 (`--fetch-only`)](#42-仅抓取推文入库---fetch-only)
  - [4.3 仅离线生成早报 (`--report-only`)](#43-仅离线生成早报---report-only)
  - [4.4 查看已抓取推文列表 (`--list`)](#44-查看已抓取推文列表---list)
  - [4.5 查看/抓取单篇推文并导出 Markdown (`--view`)](#45-查看抓取单篇推文并导出-markdown---view)
  - [4.6 导出推文为 Markdown 归档 (`--export`)](#46-导出推文为-markdown-归档---export)
  - [4.7 获取与检索指定博主推文 (`--user`)](#47-获取与检索指定博主推文---user)
  - [4.8 获取指定 X 列表最新推文 (`--x-list`)](#48-获取指定-x-列表最新推文---x-list)
  - [4.9 关键词/高级语法实时搜索 (`--search`)](#49-关键词高级语法实时搜索---search)
  - [4.10 互动信噪比门槛过滤 (`--min-likes`, `--min-retweets`)](#410-互动信噪比门槛过滤---min-likes---min-retweets)
  - [4.11 交互式免查 Cookie 浏览器登录 (`--login`)](#411-交互式免查-cookie-浏览器登录---login)
  - [4.12 验证账号会话连通性 (`--check-auth`)](#412-验证账号会话连通性---check-auth)
  - [4.13 全网热搜与趋势看板（模式 1：`--trends`）](#413-全网热搜与趋势看板模式-1---trends)
  - [4.14 全自动趋势深度研报（模式 2：`--trends-digest`）](#414-全自动趋势深度研报模式-2---trends-digest)
  - [4.15 多大模型与双轨认证参数 (`--provider`, `--auth-mode`, `--model`)](#415-多大模型与双轨认证参数)
- [5. 典型工作流与使用场景](#5-典型工作流与使用场景)
- [6. 定时任务自动化配置 (Cron / launchd)](#6-定时任务自动化配置-cron--launchd)
- [7. 存储架构与数据目录规范](#7-存储架构与数据目录规范)
- [8. 自动化测试与质量保障](#8-自动化测试与质量保障)
- [9. 常见问题排查 (FAQ)](#9-常见问题排查-faq)
- [10. Vibe Coding 开发复盘与踩坑实录 (`docs/vibe-coding-log.md`)](#10-vibe-coding-开发复盘与踩坑实录)
- [11. 系统工程设计与架构文档 (`docs/`)](#11-系统工程设计与架构文档)
- [12. 开源协议 (License)](#12-开源协议-license)

---

## 1. 核心设计与第一性原理

传统的 Twitter 爬虫或第三方逆向库（如 `twikit`）经常因 X 官方频繁重构前端打包命名（如近期从 `responsive-web` 迁至 `x-web`）而频繁暴毙（抛出 `KEY_BYTE indices` 错误）。

本项目从第一性原理出发，采用**生产级抗脆弱架构**：

1. **官方网络流透明拦截（Playwright Network Interception）**：
   - 驱动真实原生 Chrome 浏览器加载目标页面，在底层协议层监听由 X 官方前端代码合法发出的 GraphQL 响应（`HomeLatestTimeline`、`SearchTimeline` 等）。
   - **对用户的影响**：零逆向成本、完全免疫 X 前端改版；只要你能用浏览器刷推，抓取就 100% 可用。
2. **主动搜索与全网情报侦测**：
   - 突破封闭的关注流白名单，支持关键词与原生高级语法搜索（`min_faves:`、`lang:`、`geocode:`），实时捕获全网热点。
   - **对用户的影响**：不仅能看「关注了谁」，更能主动追踪「全网在讨论什么」。
3. **互动信噪比质检过滤**：
   - 支持设置点赞/转推门槛（`--min-likes`、`--min-retweets`），在数据采集、检索、导出、早报全链路过滤水帖。
   - **对用户的影响**：大幅降低信噪比，快速沉淀高价值情报。
4. **抓取（Fetch）与总结（Summarize）彻底解耦**：
   - 拉取的推文先落库 SQLite 本地数据库去重，再按需送入 LLM 处理。
   - **对用户的影响**：调整早报 Prompt、聚类维度或重新生成简报时，**直接基于本地数据离线秒级完成**，不需要重新请求 X，0 风控、0 额外等待。
5. **SQLite 增量去重**：
   - 定时多次抓取只记录增量，自动按 `tweet_id` 主键去重，杜绝重复推文消耗 LLM Token。
6. **长推与富媒体自动解析**：
   - 自动展开 X 官方的长推（Note Tweet/Articles），保留完整的长文深度内容与外链。
7. **推广推文（广告）自动过滤**：
   - 数据进入数据库前自动剥离所有信息流广告（Promoted Tweets），保证知识库与早报的纯净度。

> 💡 **架构决策与理论推演**：完整的 12 项系统级设计决策（ADR 为什么与对用户的影响）详见项目宪法文档：[GEMINI.md §4](GEMINI.md#4-核心架构与设计决策) 及 [docs/architecture.md](docs/architecture.md)。

---

## 2. 环境依赖与快速安装

项目推荐使用现代化 Python 包管理器 [`uv`](https://docs.astral.sh/uv/)，环境完全隔离在项目内部的 `.venv` 中，不污染系统全局环境。

### 2.1 克隆并进入目录
```bash
git clone https://github.com/monkeychen/xtract.git
cd xtract
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

## 3. 凭据与多模型配置指南

复制配置文件模板：
```bash
cp .env.example .env
```

打开 `.env` 文件，完善以下配置项：

```env
# ==========================================
# 1. X (Twitter) 会话认证凭据
# ==========================================
# 方式 A（推荐交互式登录，免查 Cookie）：
# 运行 uv run python main.py --login 弹出浏览器窗口直接登录并自动保存
# 方式 B（手动填入已有 Cookie）：
X_AUTH_TOKEN=你的auth_token
X_CT0=你的ct0

# ==========================================
# 2. 本地网络代理配置 (国内访问 X 必配)
# ==========================================
HTTP_PROXY=http://127.0.0.1:8118

# ==========================================
# 3. 多大模型调度与双轨认证 (Multi-LLM & Dual-Track Auth)
# ==========================================
# 模型提供商：gemini | openai | deepseek | qwen | qwen-token-plan | zhipu | zhipu-code-plan | minimax | kimi | custom
LLM_PROVIDER=gemini

# 认证模式：
# - account: 账号订阅模式（直接复用 Google Gemini / ChatGPT Plus 网页订阅配额，0 额外 API 费用）
# - api_key: 官方 API Key 计费模式
LLM_AUTH_MODE=account

# 默认调用模型（留空使用提供商官方最佳默认值，全量默认开启深度思考/推理模式与 high 级别）
LLM_MODEL=

# --- 提供商 API Key 配置 (当 LLM_AUTH_MODE=api_key 时生效) ---
GEMINI_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=
DASHSCOPE_API_KEY=   # 阿里通义千问 (普通百炼 sk-，Token Plan 专属套餐 sk-sp- 自动路由)
DASHSCOPE_BASE_URL=
ZHIPUAI_API_KEY=     # 智谱清言 (普通开放平台 zhipu 或 Code Plan 专属套餐 zhipu-code-plan)
ZHIPUAI_BASE_URL=
MINIMAX_API_KEY=     # MiniMax 海螺
MINIMAX_BASE_URL=
MOONSHOT_API_KEY=    # 月之暗面 Kimi
MOONSHOT_BASE_URL=
```

### 3.1 端点 URL 默认解析机制与说明 (`XXXX_BASE_URL`)

> [!TIP]
> **官方端点默认内建，留空自动生效**：`.env` 中的所有 `XXXX_BASE_URL` 均是**可选配置**。只要将其**留空**，系统将 **100% 自动回退至各家厂商官方预设端点**；通常你**只需填写对应的 `XXXX_API_KEY` 即可**。仅当你需要接入**国内自建反向代理、企业内网网关或第三方聚合中转服务**时，才需要显式为 `XXXX_BASE_URL` 赋值。

#### 7 大主流厂商官方预设端点与智能路由对照表

| 厂商 / Provider | 环境变量 Key | 环境变量 Base URL | 官方默认端点（留空自动生效） | 默认模型 (high 思考/推理) | 智能感知与专属特性 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Gemini (`gemini`)** | `GEMINI_API_KEY` | `（内置）` | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.8-flash` | API 模式走官方转换端点；账号模式走本地 `agy`（自动附带 `--effort high`） |
| **OpenAI (`openai`)** | `OPENAI_API_KEY` | `OPENAI_BASE_URL` | `https://api.openai.com/v1` | `gpt-5.6-sol` | 留空走官方直连，支持国内中转网关覆写；兼容 `gpt-5.6` 别名 |
| **深度求索 (`deepseek`)** | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | `deepseek-flash` | 官方统一兼容端点，默认携带 `thinking: {"type": "enabled"}` |
| **阿里千问 (`qwen`)** | `DASHSCOPE_API_KEY` | `DASHSCOPE_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-flash` | **智能感知**：若 Key 为 `sk-sp-` 开头，**无需配置 URL 自动路由至 Token Plan 端点** |
| **阿里千问专属 (`qwen-token-plan`)** | `DASHSCOPE_API_KEY` | `DASHSCOPE_BASE_URL` | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | `qwen3.8-flash` | 个人/团队版 Token Plan 专属端点；支持 `qwen-plus`/`qwen-max` 别名自动平滑映射 |
| **智谱清言 (`zhipu`)** | `ZHIPUAI_API_KEY` | `ZHIPUAI_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.3-flash` | 开放平台标准按量计费端点；默认携带 `reasoning_effort: "high"` |
| **智谱专属 (`zhipu-code-plan`)** | `ZHIPUAI_API_KEY` | `ZHIPUAI_BASE_URL` | `https://open.bigmodel.cn/api/coding/paas/v4` | `glm-5.3-flash` | Coding Plan 套餐专属端点（享受包月额度，避免扣按量余额） |
| **MiniMax (`minimax`)** | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL` | `https://api.minimax.chat/v1` | `MiniMax-M3` | 官方直连端点；默认启用 `thinking: {"type": "enabled"}` 与 `reasoning_split: true` |
| **月之暗面 (`kimi`)** | `MOONSHOT_API_KEY` | `MOONSHOT_BASE_URL` | `https://api.moonshot.cn/v1` | `kimi-k3` | 官方兼容端点；原生全模态推理，默认携带 `reasoning_effort: "high"` |

> 📌 **单一事实源约定**：各大厂商最新主力/长推理/轻量级可选模型清单、Token Plan 计费特性、已下线弃用模型封禁清单统一由 [docs/llm-providers.md](docs/llm-providers.md) 维护。

---

### 3.2 免查 Cookie 一键登录（最省心）
项目支持通过可视化交互式窗口一键捕获合法凭据，**彻底告别手动打开 F12 查 Cookie**：
- **X 账号登录**：`uv run python main.py --login x`（或直接 `main.py --login`）
- **OpenAI / ChatGPT Plus 会话凭据**：`uv run python main.py --login openai`
- **Google Gemini 账号凭据**：`uv run python main.py --login gemini`

---

## 4. CLI 完整命令参考手册

所有命令均支持 `uv run python main.py [选项]` 执行，保证在隔离虚拟环境中运行。

```
usage: main.py [-h] [--login [{x,openai,gemini}]] [--check-auth] [--trends]
               [--trends-digest]
               [-c {tech,all,business,news,entertainment,sports}] [--top N]
               [--provider {gemini,openai,deepseek,qwen,qwen-token-plan,zhipu,zhipu-code-plan,minimax,kimi,custom}]
               [--auth-mode {api_key,account}] [--model MODEL_NAME]
               [--fetch-only] [--report-only] [--user USERNAME]
               [--x-list LIST_ID_OR_URL] [--search QUERY]
               [--search-type {live,top}] [--min-likes N] [--min-retweets N]
               [--limit N] [--list [N]] [--view TWEET_ID]
               [--export-md | --no-export-md] [--export [N]] [-o PATH]
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
  * `--min-likes <N>`：早报推文点赞量筛选门槛（默认 0，低于该门槛的推文不参与早报提炼）。
  * `--min-retweets <N>`：早报推文转推量筛选门槛（默认 0）。
* **使用示例**：
  ```bash
  # 仅基于过去 12 小时内抓取且点赞 >= 50 的高质推文提炼早报
  uv run python main.py --report-only --hours 12 --min-likes 50
  ```
* **终端输出示例**：
  ```text
  🔍 正在从本地数据库检索近 12 小时的推文...
  ℹ️ 找到 86 条相关推文，正在调用 Gemini 模型进行主题聚类与提炼...
  🎉 早报已生成：output/reports/2026-09-10.md
  ```

---

### 4.4 查看已抓取推文列表 (`--list`)
以格式化的交互式富文本表格在终端列出本地数据库中的推文，快速掌握近期抓取动态，并支持按博主和互动量精确过滤。

* **基本语法**：
  ```bash
  # 默认展示最近 20 条
  uv run python main.py --list

  # 指定展示最近 N 条（如展示 50 条）
  uv run python main.py --list 50

  # 按互动门槛筛选（如仅看点赞 >= 500 的爆款推文）
  uv run python main.py --list 20 --min-likes 500
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

系统**默认自动导出为单篇独立 Markdown 文档**（受参数 `--export-md` 控制，默认开启）：
- **作者与推文两级自包含胶囊归档**：默认按 `output/articles/{author_username}/{tweet_id}/article.md` 结构保存，单篇推文所有正文、互动指标、元数据与图片自成一体，方便按作者分类管理或独立迁移至知识库。
- **图片自动隔离下载**：正文及连帖所有图片会自动下载保存在专属 `images/` 子目录下，文档中自动转换为本地相对路径 `![图片](images/...)`，离线阅读或迁移知识库无损展示。
- **视频提供在线直链**：视频不会占用海量带宽下载大体积文件，而是保留高清 MP4 播放与下载链接。
- **完整连帖展开**：若目标推文是作者的多条连帖（Thread），自动合并整理为结构化各章节展开。
- **灵活目录配置**：默认输出至 `output/articles/`，亦可配合 `-o / --output` 指定自定义输出文件或目录。

* **基本语法**：
  ```bash
  # 抓取/查看单篇推文（默认自动导出至 output/articles/<博主>/<推文ID>/article.md 并下载专属配图）
  uv run python main.py --view https://x.com/username/status/2086710313219727862

  # 指定自定义存放目录（文档存入 my_folder/，图片自动存入 my_folder/images/）
  uv run python main.py --view <推文ID或URL> -o my_folder/

  # 指定自定义文件名
  uv run python main.py --view <推文ID或URL> -o custom_notes/article.md

  # 仅在终端查看卡片，不导出 Markdown 也不下载图片
  uv run python main.py --view <推文ID或URL> --no-export-md
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
  🎉 推文已导出为 Markdown 文档: output/articles/miles_mazy/2097871610414067757/article.md
  🖼️ 已同步下载 1 张图片至: output/articles/miles_mazy/2097871610414067757/images
  可在 Markdown 编辑器中直接查阅，文中图片已自动关联本地相对路径。
  ```

---

### 4.6 导出推文为 Markdown 归档 (`--export`)
将本地 SQLite 中已持久化的推文批量导出为一个排版优美的 Markdown 长文档，专为在 VS Code、Obsidian、Typora 等编辑器中沉浸式阅读和沉淀知识库设计。

* **基本语法**：
  ```bash
  # 默认导出最近 200 条至 output/tweets_YYYY-MM-DD.md
  uv run python main.py --export

  # 指定导出条数（如 50 条）
  uv run python main.py --export 50

  # 自定义导出文件路径或目标目录（配合 -o / --output）
  uv run python main.py --export 50 -o my_notes.md
  uv run python main.py --export 100 -o ~/Documents/ObsidianVault/

  # 配合互动指标筛选高价值推文归档（如仅导出点赞 >= 100 的推文）
  uv run python main.py --export 100 --min-likes 100 -o output/high_value.md

  # 抓取时自动连带导出（链式组合）
  uv run python main.py --x-list 1903106960452620743 --limit 10 --export
  uv run python main.py --user elonmusk --limit 10 --export -o output/elon.md
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
  uv run python main.py --user <博主用户名>

  # 配合 --limit 指定抓取条数（如最新 10 条）
  uv run python main.py --user <博主用户名> --limit 10
  ```
* **使用示例**：
  ```bash
  uv run python main.py --user elonmusk --limit 5
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
  uv run python main.py --list --user <博主用户名>

  # 结合条数筛选（如展示最近 10 条）
  uv run python main.py --list 10 --user <博主用户名>
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
  uv run python main.py --x-list https://x.com/i/lists/1838848123456789012

  # 传入纯数字 ID 并指定抓取条数（如最新 10 条）
  uv run python main.py --x-list 1838848123456789012 --limit 10
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
  uv run python main.py --search "DeepSeek"

  # 配合 --limit 指定抓取数量（如抓取 50 条）
  uv run python main.py --search "DeepSeek" --limit 50

  # 切换为「热门 (Top)」排序流（默认是「最新 (Live)」）
  uv run python main.py --search "Claude" --search-type top --limit 20
  ```
* **常用 X 高级搜索语法示例**：
  * **按语言筛选**：`--search "AI agent lang:zh"`（仅搜中文推文）
  * **按互动阈值初筛**：`--search "OpenAI min_faves:500"`（X 官方服务端只返回 500+ 点赞推文）
  * **排除指定词**：`--search "Python -snake -reptile"`（排除特定干扰词）
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
  uv run python main.py --search "Claude" --min-likes 50 --min-retweets 10
  ```
* **2. 本地已存推文查阅过滤 (`--list`)**：
  ```bash
  # 在终端快速查看点赞过千（>= 1000）的爆款推文
  uv run python main.py --list 10 --min-likes 1000

  # 查阅某位博主的高赞推文
  uv run python main.py --list 10 --user elonmusk --min-likes 500
  ```
* **3. 结构化早报生成过滤 (`--report-only` / 默认流水线)**：
  ```bash
  # 早报仅提炼点赞 >= 20 的核心推文，彻底隔绝闲聊噪音
  uv run python main.py --report-only --min-likes 20
  ```
* **4. 批量导出 Markdown 文档过滤 (`--export`)**：
  ```bash
  # 仅导出点赞数 >= 100 的精选推文到知识库
  uv run python main.py --export 50 --min-likes 100 -o output/high_signal_tweets.md
  ```

---

### 4.11 交互式免查 Cookie 浏览器登录 (`--login`)
弹出原生可视化 Chrome 窗口进行交互式登录，系统在后台自动截获并持久化保存 Session 凭据，**彻底告别手动打开开发者工具查 Cookie**：

* **基本语法**：
  ```bash
  # 登录 X (Twitter) 并持久化保存凭据（默认）
  uv run python main.py --login
  uv run python main.py --login x

  # 登录 OpenAI / ChatGPT Plus（用于无 API Key 费用白嫖订阅配额）
  uv run python main.py --login openai

  # 登录 Google Gemini
  uv run python main.py --login gemini
  ```
* **参数选项**：
  * `--timeout <N>`：浏览器登录窗口等待超时阈值（秒，默认 120 秒）。
* **凭据持久化位置**：
  * X 会话：`data/auth_state.json`
  * OpenAI 会话：`data/chatgpt_auth.json`
  * Gemini 会话：`data/gemini_auth.json`

---

### 4.12 验证账号会话连通性 (`--check-auth`)
测试当前 `.env` 或 `data/auth_state.json` 中的凭证和网络代理是否能成功与 X 建立合法会话。

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
  │ 会话来源: data/auth_state.json                                               │
  ╰──────────────────────────────────────────────────────────────────────────────╯
  ```

---

### 4.13 全网热搜与趋势看板（模式 1：`--trends`）
**解决用户「在没有预设关键词」时的信息盲区**。底层直接拦截 X 官方 `ExplorePage` 与 `GenericTimelineById` GraphQL 协议，自动清洗推广广告，以结构化富文本表格呈现当前全网热搜与分类趋势榜单。

* **基本语法**：
  ```bash
  # 查看当前科技/AI领域前 10 大热搜（默认）
  uv run python main.py --trends

  # 指定前 N 名（如 Top 5）
  uv run python main.py --trends --top 5

  # 切换不同分类看板
  uv run python main.py --trends -c all            # 全网综合热榜
  uv run python main.py --trends -c business       # 商业财经
  uv run python main.py --trends -c news           # 全球要闻
  uv run python main.py --trends -c entertainment  # 娱乐影视
  uv run python main.py --trends -c sports         # 体育赛事
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
  uv run python main.py --trends-digest

  # 对全网综合热搜 Top 5 生成研报
  uv run python main.py --trends-digest -c all --top 5

  # 指定使用 DeepSeek 或本地 Google 账号订阅驱动
  uv run python main.py --trends-digest --provider deepseek --auth-mode api_key
  uv run python main.py --trends-digest --provider gemini --auth-mode account

  # 指定时效回溯窗口（例如只看近 24 小时或扩展到近 72 小时，杜绝历史陈旧旧帖）
  uv run python main.py --trends-digest --hours 24
  ```
* **研报产出样例**：
  保存在 `output/reports/trends_YYYY-MM-DD.md`，包含以下模块：
  - **⚡ 热搜雷达速览 (Trending Radar)**：排名、趋势、体量与一句话定性；
  - **🔍 核心热点深度剖析 (Deep Dive)**：突发事件起因、各方争议与多空交锋、高赞爆款原声引用；
  - **💡 趋势启示与选题建议 (Actionable Insights)**：行业研判总结 + 新媒体/技术写作选题推荐。

---

### 4.15 多大模型与双轨认证参数 (`--provider`, `--auth-mode`, `--model`)
任何总结任务（`--report-only`、`--trends-digest` 或默认每日流水线）均支持自由切换 7 大主流厂商大模型与双轨认证机制：

* **支持的 7 大主流厂商与默认主力模型（全部默认开启 High 级深度思考与原生多模态）**：

| 厂商 / Provider | 标识 (`--provider`) | 默认主力模型 | 推荐认证模式 (`--auth-mode`) |
| :--- | :--- | :--- | :--- |
| **Google** | `gemini` (默认) | `gemini-3.8-flash` | `account`（本地 agy，0 API 账单）或 `api_key` |
| **OpenAI** | `openai` / `gpt` | `gpt-5.6-sol` | `account`（ChatGPT Plus 网页会话）或 `api_key` |
| **DeepSeek** | `deepseek` | `deepseek-flash` | `api_key` (V4.1-Flash，1M 上下文) |
| **阿里通义千问** | `qwen` / `qwen-token-plan` | `qwen3.8-flash` | `api_key`（自动感知 `sk-sp-` Token Plan 专属端点） |
| **智谱清言** | `zhipu` / `zhipu-code-plan` | `glm-5.3-flash` | `api_key`（支持 Coding Plan 专属端点） |
| **MiniMax** | `minimax` | `MiniMax-M3` | `api_key`（1M 多模态旗舰，内置思考流） |
| **月之暗面 Kimi** | `kimi` | `kimi-k3` | `api_key`（2.8T 原生全模态推理旗舰） |

> 📌 **完整模型清单与端点约定**：关于长推理备选模型（如 `gemini-3.1-pro`、`qwen3.8-max`）、各厂商专属 Token Plan / Code Plan 配置与下线废弃版本警示，统一详见权威文档：[docs/llm-providers.md](docs/llm-providers.md)。

* **双轨认证模式 (`--auth-mode`)**：
  - `account`：**账号订阅免 Key 模式**（支持 Google Gemini 与 OpenAI ChatGPT Plus，0 额外账单，白嫖月付配额）
  - `api_key`：**官方 API Key 计费模式**（按 Token 计费，高并发首选）
* **指定具体模型 (`--model`)**：
  - 覆盖默认模型（如 `--model deepseek-v4-pro`、`--model qwen3.8-max`、`--model kimi-k3`）
* **使用示例**：
  ```bash
  # 使用 DeepSeek 最新 V4.1-Flash 提炼今日关注流早报
  uv run python main.py --report-only --provider deepseek --auth-mode api_key

  # 使用月之暗面 Kimi 最新旗舰 kimi-k3 生成趋势研报
  uv run python main.py --trends-digest --provider kimi --auth-mode api_key

  # 使用阿里 Qwen-Max 旗舰推理模型提炼早报
  uv run python main.py --report-only --provider qwen --model qwen-max

  # 使用用户已订阅的 Google 账号配额生成趋势研报（0 额外费用）
  uv run python main.py --trends-digest --provider gemini --auth-mode account

  # 使用 OpenAI ChatGPT Plus 网页配额生成早报
  uv run python main.py --report-only --provider openai --auth-mode account
  ```

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
# 每天 8:30 自动抓取并生成早报（请将 /path/to/xtract 替换为你的项目绝对路径）
30 8 * * * cd /path/to/xtract && $(which uv) run python main.py >> data/cron.log 2>&1
```

### 方案 2：macOS 原生 `launchd`（Mac 推荐，支持休眠唤醒补跑）
在 `~/Library/LaunchAgents/com.xtract.digest.plist` 创建文件：
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.xtract.digest</string>
    <key>WorkingDirectory</key>
    <string>/path/to/xtract</string>
    <key>ProgramArguments</key>
    <array>
        <!-- 请使用 `which uv` 查得的绝对路径，例如 /usr/local/bin/uv 或 ~/.local/bin/uv -->
        <string>/usr/local/bin/uv</string>
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
    <string>/path/to/xtract/data/cron.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/xtract/data/cron.log</string>
</dict>
</plist>
```
加载任务：
```bash
launchctl load ~/Library/LaunchAgents/com.xtract.digest.plist
```

---

## 7. 存储架构与数据目录规范

项目严格遵守结构分层与安全规范（完整规范与清理策略参见 [GEMINI.md §5](GEMINI.md#5-目录与命名规范)）：

```
xtract/                     # 项目根目录
├── GEMINI.md               # 项目宪法与架构约束（AI 核心规范）
├── README.md               # 本项目全量使用指南与操作手册
├── docs/                   # 正式工程设计与架构文档
│   ├── architecture.md     # 系统总体架构设计 (HLD)
│   ├── detailed_design.md  # 详细设计与核心机制 (LLD)
│   ├── llm-providers.md    # 各大模型版本、端点与参数约定（高频变动，单一事实源）
│   └── vibe-coding-log.md  # Vibe Coding 全周期复盘与踩坑实录
├── pyproject.toml          # uv 依赖管理
├── .env.example            # 环境变量配置模板
├── .env                    # 敏感会话凭据与代理（Git 忽略）
├── src/                    # 核心模块
│   ├── __init__.py
│   ├── config.py           # 集中配置管理
│   ├── client.py           # Playwright 无头官方流拦截器
│   ├── storage.py          # SQLite 增量存储与 Markdown 导出
│   ├── auth.py             # 交互式浏览器登录与凭证自动捕获
│   ├── llm/                # 统一多大模型驱动层
│   │   ├── __init__.py
│   │   ├── base.py         # 抽象基类与通用 Message / 多模态
│   │   ├── factory.py      # 提供商调度工厂
│   │   ├── openai_compat.py# OpenAI 协议驱动 (DeepSeek/Qwen/Zhipu/MiniMax/OpenAI)
│   │   ├── gemini_account.py# Gemini 账号免 Key 驱动 (agy / OAuth)
│   │   └── chatgpt_account.py# OpenAI Plus 账号驱动
│   ├── summarizer.py       # 结构化聚类分析与趋势研报提炼器
│   └── pipeline.py         # 流水线编排中枢
├── data/                   # 本地持久化数据（Git 忽略）
│   ├── tweets.db           # SQLite 数据库（存储去重推文元数据）
│   ├── auth_state.json     # X 登录凭据
│   ├── chatgpt_auth.json   # ChatGPT Plus 会话凭据
│   ├── gemini_auth.json    # Gemini 会话凭据
│   └── raw/                # 原始 JSON 快照备份（灾备，保留 30 天）
├── output/                 # 输出结果
│   ├── reports/            # 生成的 Markdown 早报与趋势研报（YYYY-MM-DD.md / trends_YYYY-MM-DD.md）
│   └── articles/           # 单篇推文/专栏长文作者归档胶囊目录
│       └── {author_username}/ # 第一层：按博主/作者归档 (如 miles_mazy, karpathy)
│           └── {tweet_id}/    # 第二层：单篇推文/长文独立资产包（自包含）
│               ├── article.md # 包含正文、互动指标与元数据的完整 Markdown
│               └── images/    # 该文章专属配图（Markdown 相对路径引用 images/）
├── tests/                  # 自动化单元测试集
└── main.py                 # 统一 CLI 入口
```

### SQLite 数据表结构 (`tweets`)

> 📌 **单一事实源约定**：完整的 DDL 结构、字段约束与索引定义统一以 [`docs/detailed_design.md §3.1`](docs/detailed_design.md#31-sqlite-数据库表设计-datatweetsdb) 及 [`src/storage.py`](src/storage.py) 为准。

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `tweet_id` | `TEXT PRIMARY KEY` | 推文唯一 ID（去重核心主键） |
| `author_id` / `author_username` | `TEXT` | 作者数值 ID 与 Handle（`@screen_name`） |
| `author_name` | `TEXT` | 博主昵称展示名 |
| `text` | `TEXT` | 完整正文（自动展开 Note Tweet 与 Articles 专栏长文） |
| `created_at` | `TEXT` | 发布时间戳（UTC） |
| `is_retweet` / `retweeted_text` | `INTEGER` / `TEXT` | 是否为转推及原文正文 |
| `is_quote` / `quoted_text` | `INTEGER` / `TEXT` | 是否为引用推文及原文正文 |
| `like_count` / `retweet_count` | `INTEGER` | 点赞与转发互动数据 |
| `reply_count` / `view_count` | `INTEGER` | 回复数与浏览曝光量 |
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

---

## 10. Vibe Coding 开发复盘与踩坑实录

本项目采用全流程 AI 结对协同（Vibe Coding / Pair Programming）模式开发，并在生产演进中攻克了多项高危反爬封控、协议脱敏、长思维链推理流式传输及多厂商专属端点适配难题。

完整的开发演进历程、第一性原理思考、真实踩坑记录与解决方案详见专属复盘文档：
👉 **[docs/vibe-coding-log.md](docs/vibe-coding-log.md)**

---

## 11. 系统工程设计与架构文档

为了满足工业级系统的可维护性与二次开发扩展需求，本项目输出了完备的系统级设计与机制文档：

- **[系统总体架构设计文档 (HLD)](docs/architecture.md)**：包含 5 层物理架构拓扑、全网趋势研报与推文离线归档的端到端数据流时序、技术选型矩阵、防封控安全与网络智能旁路设计。
- **[系统详细设计与核心机制文档 (LLD)](docs/detailed_design.md)**：包含核心 UML 类图、接口契约、GraphQL 拦截与防抖状态机、免查 Token 会话捕获流程、时效性双重过滤算法、SSE 长思维链流式调度及厂商专属端点配置字典。

---

## 12. 开源协议 (License)

本项目采用 [Apache-2.0 许可证](LICENSE) 开源。

欢迎自由使用、分发与修改。商业使用与二次开发请保留原作者版权声明及免责声明。



