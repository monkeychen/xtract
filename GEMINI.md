# Project: X Following Timeline AI Digest

## 1. 目标与背景
从 X（Twitter）个人的 Following（时间线关注流）自动拉取最新推文，通过本地存储去重与过滤，利用 AI 对关注圈子的核心讨论、要闻资讯进行结构化聚类与早报生成。

## 2. 核心架构与设计决策

### 架构流程
`Fetch (抓取)` -> `Deduplicate & Store (本地 SQLite 去重)` -> `Filter (过滤无效推文)` -> `Summarize (AI 结构化早报)` -> `Output (Markdown 归档)`

### 设计决策说明
1. **解耦「抓取」与「总结」**：
   - **为什么**：X 接口有频率限制和反爬风险，而 Prompt / 早报格式经常需要调整迭代。
   - **对用户的影响**：拉取后的推文全量落库；调整总结模板或重新生成报告时，无需重复请求 X，秒级响应且零风控风险。
2. **SQLite 本地增量去重**：
   - **为什么**：定时拉取必然存在大量重复推文，按 `tweet_id` 主键入库，只抓增量。
   - **对用户的影响**：节省 LLM Token 成本，早报只呈现最新内容，不出现车轱辘话。
3. **凭证隔离**：
   - **为什么**：`auth_token` 和 `ct0` 属于高敏感会话凭证。
   - **对用户的影响**：敏感凭据保存在 `.env`，纳入 `.gitignore`，代码库安全开源或同步。

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
- 运行测试：`uv run pytest`
