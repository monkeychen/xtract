# Xtract 凭据与多模型配置指南

> 本文档由 `README.md` 下沉，说明 X 会话凭据、网络代理与各模型厂商认证的完整配置方式。
> 项目总览与快速开始见 [README](../README.md)。

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

---

### 3.2 从浏览器读取登录态（最省心）

> 原 `--login` 自动化登录命令已下线：X 会对自动化浏览器的登录动作持续限流，
> 在用户输入任何凭据前即拦截。该对抗不具备可持续性。

**推荐做法**：先在日常 Chrome 中登录 `x.com`，再在桌面端
「设置 → X 账号 → **从 Chrome 读取登录态**」一键导入。

- 登录动作 100% 由你在真实浏览器中完成，应用不执行任何自动化登录；
- 导入的是**完整会话**（含 `kdt` 设备指纹、`cf_clearance` Cloudflare 凭证），
  而非仅 `auth_token` + `ct0`——这些字段都参与 X 的风控判定；
- 无需打开开发者工具手工复制；
- **仅 macOS 可用**。其他平台请使用下方的 `.env` 手工填入通道。

导入成功后，凭据写入 `<storageRoot>/config.env` 并注入项目的持久化浏览器 profile，
之后所有抓取直接复用，不会再次失效。

---
