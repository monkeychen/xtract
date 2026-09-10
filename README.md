# X Following Timeline AI Digest 🗞️

自动抓取 X（Twitter）个人的 Following（时间线关注流）推文，通过本地 SQLite 数据库去重存储，并利用 Gemini AI 生成结构化的每日情报简报。

---

## 特性亮点
1. **真实关注流 (Following Timeline)**：抓取按时间倒序的关注者推文，而非算法强推的 For You。
2. **增量去重存储**：基于 SQLite 本地去重，重复抓取只存新增推文，杜绝重复消耗 AI Token。
3. **抓取与总结解耦**：
   - 支持仅拉取推文（离线存储备查）。
   - 支持纯离线重新生成早报，随时调整 Prompt，零 X 风控风险。
4. **高质量情报简报**：针对 AI 开发者、独立创作者定制的 Prompt，按「核心速览 -> 话题聚类 -> 深度长推 -> 灵感便签」提炼高密度洞察。

---

## 快速上手

### 1. 配置凭证
复制配置模板并创建 `.env`：
```bash
cp .env.example .env
```

在浏览器（Chrome/Edge）打开已登录的 [x.com](https://x.com)：
1. 按 `F12` 打开开发者工具，切换到 **Application（应用）** -> **Cookies** -> `https://x.com`。
2. 找到并复制以下两项值填入 `.env`：
   - `auth_token` -> `X_AUTH_TOKEN`
   - `ct0` -> `X_CT0`
3. 填入你的 Google Gemini API Key：
   - `GEMINI_API_KEY`

### 2. 校验账号认证状态
```bash
uv run python main.py --check-auth
```

### 3. 一键执行全量流水线（拉取 + 存储 + 生成早报）
```bash
uv run python main.py
```
生成的早报将自动存放在 `output/reports/YYYY-MM-DD.md`。

---

## 常用指令

```bash
# 1. 仅拉取最新推文（默认拉取 3 页约 60 条）
uv run python main.py --fetch-only

# 2. 仅抓取指定页数（如拉取 5 页）
uv run python main.py --fetch-only --pages 5

# 3. 仅根据本地已有推文生成今日早报（不发网络请求）
uv run python main.py --report-only

# 4. 指定回溯过去 12 小时的推文生成早报
uv run python main.py --report-only --hours 12

# 5. 运行自动化测试
uv run pytest
```

---

## 定时任务（Cron）
如需每天早上 8:30 自动抓取并生成早报，可通过 `crontab -e` 配置：
```cron
30 8 * * * cd /Users/chenzhian/lab/x && /Users/chenzhian/.local/bin/uv run python main.py >> data/cron.log 2>&1
```
