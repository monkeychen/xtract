# Project: X Following Timeline AI Digest

## 1. 目标与背景
从 X（Twitter）个人的 Following（时间线关注流）自动拉取最新推文，通过本地存储去重与过滤，利用 AI 对关注圈子的核心讨论、要闻资讯进行结构化聚类与早报生成。

## 2. 核心架构与设计决策

### 架构流程
`Fetch (Playwright 无头网络拦截)` -> `Deduplicate & Store (本地 SQLite 去重)` -> `Filter (过滤无效推文)` -> `Summarize (AI 结构化早报)` -> `Output (Markdown 归档)`

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
│   ├── client.py           # X Following 流拉取客户端
│   ├── storage.py          # SQLite 增量存储与去重逻辑
│   ├── summarizer.py       # LLM 早报提炼与生成器
│   └── pipeline.py         # 任务串联与编排入口
├── data/                   # 本地数据存储（Git 忽略）
│   ├── tweets.db           # SQLite 数据库
│   └── raw/                # 原始抓取快照备份（按需归档，保留 30 天）
├── output/                 # 输出结果
│   └── reports/            # 生成的 Markdown 早报（YYYY-MM-DD.md）
└── main.py                 # CLI 入口
```

### 规范约定
- **文件与变量命名**：Python 文件、函数、变量采用 `snake_case`；类名采用 `PascalCase`；常量采用 `UPPER_CASE`。
- **数据保留策略**：
  - `data/tweets.db`：持久化保留推文元数据用于历史去重。
  - `data/raw/`：调试抓取的原始 JSON，按日期命名 `raw_YYYYMMDD_HHMM.json`，清理策略为保留近 30 天。
  - `output/reports/`：早报输出文件命名为 `YYYY-MM-DD.md`。

---

## 4. 运行与验证命令
- 初始化环境：`uv venv && uv pip install -e .`
- 执行全量流水线：`uv run python main.py`
- 仅拉取推文：`uv run python main.py --fetch-only`
- 仅生成今日报告：`uv run python main.py --report-only`
- 在线抓取指定博主推文：`uv run python main.py --user <博主用户名> [--limit N]`
- 本地检索指定博主推文：`uv run python main.py --list [数量] --user <博主用户名>`
- 查看已抓取推文列表：`uv run python main.py --list [数量]`
- 查看单篇推文全文详情：`uv run python main.py --view <tweet_id>`
- 导出已抓取推文为 Markdown 文档：`uv run python main.py --export`
- 运行测试：`uv run pytest`
