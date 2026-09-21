# Project: X Following Timeline & Search AI Digest

## 1. 目标与背景
从 X（Twitter）个人的 Following（时间线关注流）、指定 Lists（列表）、特定博主、全网热门趋势（Explore Trends）以及关键词高级搜索（Search Timeline）中自动拉取最新实时推文，通过本地 SQLite 存储去重与互动指标信噪比过滤，利用国内外多大模型（双轨认证：API-Key / 账号订阅免Key）对核心讨论、要闻资讯与全网突发热点进行结构化聚类与研报生成。

## 2. 核心架构与设计决策

### 架构流程
`Fetch (Following / List / User / Search / Trends Playwright 拦截)` -> `Deduplicate & Store (SQLite 去重与元数据落库)` -> `Filter (互动门槛与无效过滤)` -> `Summarize (多模型统一调度)` -> `Output (Markdown 归档与图片隔离保存)`

### 设计决策说明
1. **采用 Playwright 监听官方网络流替代第三方逆向库（如 twikit）**：
   - **为什么**：X 官方频繁重构前端打包结构（如近期从 `responsive-web` 迁至 `x-web`），导致第三方逆向库频繁因反爬签名计算崩溃（`Couldn't get KEY_BYTE indices`）。而真实浏览器运行官方 JS 永远合法。
   - **对用户的影响**：零维护、防封抗风控、永不因 X 改版报废；抓取稳定性从「玩具级」提升到「生产级」。
2. **解耦「抓取」与「总结」**：
   - **为什么**：X 接口有频率限制和反爬风险，而 Prompt / 早报格式经常需要调整迭代。
   - **对用户的影响**：拉取后的推文全量落库；调整总结模板或重新生成报告时，无需重复请求 X，秒级响应且零风控风险。
3. **SQLite 本地增量去重**：
   - **为什么**：定时拉取必然存在大量重复推文，按 `tweet_id` 主键入库，只抓增量。
   - **对用户的影响**：节省 LLM Token 成本，早报只呈现最新内容，不出现车轱辘话。
4. **凭证隔离与双模式会话持久化**：
   - **为什么**：支持 `.env` 填入 `auth_token`/`ct0`，或通过 `--login` 交互式登录持久化保存 `auth_state.json`。
   - **对用户的影响**：高敏感凭据不入代码库；支持免手工查 Cookie 一键登录。
5. **主动关键词高级搜索监控（Search Timeline）**：
   - **为什么**：Following 与 List 属于封闭白名单，无法监控圈外未关注用户的突发热点。拦截官方 `SearchTimeline` 支持 `min_faves:`、`lang:` 等高级语法。
   - **对用户的影响**：从「被动阅读关注流」升级为「主动追踪全网特定技术/商业主题情报」。
6. **互动信噪比门槛过滤（Engagement Filtering）**：
   - **为什么**：推特信息流充斥水帖、闲聊与低质灌水。按 `min_likes` / `min_retweets` 在采集、查阅、早报生成中过滤。
   - **对用户的影响**：大幅提升早报质量与阅读效率，专注高价值讨论。
7. **全网热搜与趋势雷达（Explore Trends Discovery）**：
   - **为什么**：解决用户在不知道关键词前置条件时的「信息盲区」。支持分类看板与全自动研报（默认 `tech`，开放 `all`, `business`, `news`, `entertainment`, `sports` 等全分类）。
   - **对用户的影响**：实现「从未知到已知」的情报闭环；零输入全自动发现热点并生成研报。
8. **统一多大模型驱动与双轨认证（Unified LLM & Dual-Track Auth）**：
   - **为什么**：打破单一 Gemini 绑定，支持国内外 7 大主流大模型（Google Gemini, OpenAI GPT, DeepSeek, 阿里通义千问 Qwen, 智谱清言 GLM, MiniMax, 月之暗面 Kimi）；同时支持 API Key 计费与账号认证模式（走用户已订阅的 Google / ChatGPT Plus 配额）。
   - **对用户的影响**：零额外 API 账单（直接白嫖月付订阅）；主流模型选择自由度最大化，杜绝使用已停运的历史废弃版本（如 deepseek-chat/reasoner、moonshot-v1 等）。
9. **交互式免查 Token 登录 UI（Interactive Browser Login）**：
   - **为什么**：让用户在浏览器开发者工具查 Token 极度违背体验准则。
   - **对用户的影响**：统一使用 `main.py --login [x|openai|gemini]`，弹出浏览器完成登录后系统自动截获并持久化保存凭据，免去任何手动查找复制。

### 7 大主流模型 2026 最新版本与文档约定
- **Google Gemini**：主力 `gemini-3.8-flash`（高智商超高速），推理 `gemini-3.1-pro`，轻量 `gemini-2.5-flash`。账号订阅通道走本地 `agy`。
- **OpenAI GPT**：主力 `gpt-4o`，轻量 `gpt-4o-mini`，推理 `o3-mini` / `o1`。账号通道走 ChatGPT Plus 会话。
- **DeepSeek**：主力 `deepseek-flash`（DeepSeek-V4.1-Flash，1M上下文多模态），高阶 `deepseek-v4-pro`。通过 `thinking` 参数动态控制思考链。（**禁止使用已下线的 `deepseek-chat` / `deepseek-reasoner`**）。
- **阿里通义千问 Qwen**：主力 `qwen-plus`，旗舰 `qwen-max`（映射 Qwen3.8-Max），极速 `qwen-turbo`。
  - 普通按量端点：`https://dashscope.aliyuncs.com/compatible-mode/v1`（Key 为 `sk-` 开头）
  - **Token Plan 专属端点**：`https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`（Key 为 `sk-sp-` 开头，系统自动识别或指定 `--provider qwen-token-plan`）
- **智谱 GLM**：主力 `glm-5.3`（旗舰复杂软件工程与智能体长程任务），原生多模态 `glm-5.3-flash`（1M上下文高吞吐），极速 `glm-5.3-flashx`。
  - 普通开放平台端点：`https://open.bigmodel.cn/api/paas/v4`
  - **Coding Plan 专属端点**：`https://open.bigmodel.cn/api/coding/paas/v4`（支持通过 `ZHIPUAI_BASE_URL` 或指定 `--provider glm-code-plan` 接入以享受套餐额度）
  - 深度思考：GLM-5 系列原生强制启用深度思考，请求自动携带 `thinking: {"type": "enabled"}`。
- **MiniMax**：主力 `MiniMax-M3`（1M多模态旗舰），极速 `MiniMax-M2.7-highspeed`，经典 `MiniMax-Text-01`。
- **月之暗面 Kimi**：主力 `kimi-k3`（2.8T参数1M上下文旗舰），代码 `kimi-k2.7-code`。（**禁止使用已下线的 `moonshot-v1` 及 `kimi-latest`**）。

---

## 3. 目录与命名规范

```
/Users/chenzhian/lab/x/
├── GEMINI.md               # 项目规范与架构约定（本文件）
├── pyproject.toml          # uv 项目与依赖配置
├── .env.example            # 环境变量模板
├── .gitignore              # Git 忽略配置
├── src/                    # 核心业务逻辑
│   ├── __init__.py
│   ├── config.py           # 环境变量与配置加载
│   ├── client.py           # X Following / Search / Trends 流拉取客户端
│   ├── storage.py          # SQLite 增量存储与去重逻辑
│   ├── auth.py             # 交互式浏览器登录与凭证自动捕获
│   ├── llm/                # 统一多大模型驱动层
│   │   ├── __init__.py
│   │   ├── base.py         # 抽象基类与通用 Message
│   │   ├── factory.py      # 提供商调度工厂
│   │   ├── openai_compat.py# OpenAI 协议驱动 (DeepSeek/Qwen/Zhipu/MiniMax/OpenAI)
│   │   ├── gemini_account.py# Gemini 账号免 Key 驱动 (agy / OAuth)
│   │   └── chatgpt_account.py# OpenAI Plus 账号驱动
│   ├── summarizer.py       # 早报与趋势研报提炼器
│   └── pipeline.py         # 任务串联与编排入口
├── data/                   # 本地数据存储（Git 忽略）
│   ├── tweets.db           # SQLite 数据库
│   ├── auth_state.json     # X 登录凭据
│   ├── chatgpt_auth.json   # ChatGPT Plus 会话凭据
│   ├── gemini_auth.json    # Gemini 会话凭据
│   └── raw/                # 原始抓取快照备份（保留 30 天）
├── output/                 # 输出结果
│   └── reports/            # 生成的 Markdown 早报（YYYY-MM-DD.md）
└── main.py                 # CLI 入口
```

### 规范约定
- **文件与变量命名**：Python 文件、函数、变量采用 `snake_case`；类名采用 `PascalCase`；常量采用 `UPPER_CASE`。
- **数据保留策略**：
  - `data/tweets.db`：持久化保留推文元数据用于历史去重。
  - `data/raw/`：调试抓取的原始 JSON，按日期命名 `raw_YYYYMMDD_HHMM.json`，清理策略为保留近 30 天。
  - `output/reports/`：早报输出文件命名为 `YYYY-MM-DD.md`，趋势研报命名为 `trends_YYYY-MM-DD.md`。

---

## 4. 运行与验证命令
- 初始化环境：`uv venv && uv pip install -e .`
- 执行全量流水线：`uv run python main.py`
- 仅拉取推文：`uv run python main.py --fetch-only`
- 仅生成今日报告：`uv run python main.py --report-only [--hours N] [--min-likes N] [--provider X] [--auth-mode Y]`
- 关键词与高级语法搜索：`uv run python main.py --search "<关键词或语法>" [--search-type live|top] [--limit N] [--min-likes N]`
- 查看全网趋势榜单（模式1）：`uv run python main.py --trends [--category tech|all|business|news|entertainment|sports] [--top N]`
- 全自动趋势研报（模式2）：`uv run python main.py --trends-digest [--category tech|all|business|news] [--top N] [--provider X] [--auth-mode Y]`
- 交互式浏览器登录：`uv run python main.py --login [x|openai|gemini]`
- 在线抓取指定博主推文：`uv run python main.py --user <博主用户名> [--limit N]`
- 抓取指定 X 列表最新推文：`uv run python main.py --x-list <列表ID或URL> [--limit N]`
- 本地检索已存推文：`uv run python main.py --list [数量] [--user <博主>] [--min-likes N] [--min-retweets N]`
- 查看/在线抓取单篇推文或连帖并导出 Markdown（含图片回传）：`uv run python main.py --view <推文ID或URL> [-o 目标路径] [--no-export-md]`
- 导出已抓取推文为全局 Markdown 文档：`uv run python main.py --export [数量] [-o 目标路径] [--min-likes N]`
- 运行测试：`uv run pytest`

