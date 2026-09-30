# LLM Providers — 模型版本与端点约定

> 本文档记录各大模型提供商的当前可用版本、默认参数与端点配置。
> 模型版本随厂商迭代频繁变更，因此独立于项目宪法 `GEMINI.md` 维护。

## 通用约定

- **全量默认开启推理/思考模式与多模态支持**，推理等级默认 `high`。
- 所有 `*_BASE_URL` 环境变量默认留空，系统自动使用官方标准端点；仅在自建反代、企业网关或第三方中转时才需显式填写。
- **禁止使用已下线的历史废弃模型版本**（如 `deepseek-chat` / `deepseek-reasoner`、`moonshot-v1` / `kimi-latest`）。

---

## 7 大主流模型 2026 最新版本

### Google Gemini

| 定位 | 模型 ID | 说明 |
|---|---|---|
| **默认主力** | `gemini-3.8-flash` | 高智商超高速，全模态，`--effort high` / `thinking_level: HIGH` |
| 长推理 | `gemini-3.1-pro` | 复杂推理场景 |
| 轻量 | `gemini-2.5-flash` | 低延迟轻量任务 |

- 账号订阅通道走本地 `agy`。

### OpenAI GPT

| 定位 | 模型 ID | 说明 |
|---|---|---|
| **默认主力** | `gpt-5.6-sol` | GPT-5.6 Sol 旗舰全模态推理，默认 `reasoning_effort: "high"`，兼容 `gpt-5.6` 别名 |

- 账号通道走 ChatGPT Plus 会话。

### DeepSeek

| 定位 | 模型 ID | 说明 |
|---|---|---|
| **默认主力** | `deepseek-flash` | DeepSeek-V4.1-Flash，1M 上下文多模态，默认 `thinking: {"type": "enabled"}` + `reasoning_effort: "high"` |
| 高阶 | `deepseek-v4-pro` | 复杂推理 |

> [!CAUTION]
> **禁止使用已下线的 `deepseek-chat` / `deepseek-reasoner`**。

### 阿里通义千问 Qwen

| 定位 | 模型 ID | 说明 |
|---|---|---|
| **默认主力** | `qwen3.8-flash` | 原生全模态推理，默认 `enable_thinking: true` + `reasoning_effort: "high"` |
| 旗舰 | `qwen3.8-max` | 最强能力 |
| 平衡 | `qwen3.7-plus` | 速度与能力平衡 |

**双端点：**
- 普通按量：`https://dashscope.aliyuncs.com/compatible-mode/v1`（Key 为 `sk-` 开头）
- Token Plan 专属：`https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`（Key 为 `sk-sp-` 开头，系统自动识别或指定 `--provider qwen-token-plan`）

### 智谱清言 Zhipu

| 定位 | 模型 ID | 说明 |
|---|---|---|
| **默认主力** | `glm-5.3-flash` | 原生多模态高吞吐，默认 `thinking: {"type": "enabled"}` + `reasoning_effort: "high"` |
| 旗舰 | `glm-5.3` | 复杂工程 |
| 极速 | `glm-5.3-flashx` | 最低延迟 |

**双端点：**
- 普通开放平台：`https://open.bigmodel.cn/api/paas/v4`（`--provider zhipu`）
- Coding Plan 专属：`https://open.bigmodel.cn/api/coding/paas/v4`（`ZHIPUAI_BASE_URL` 或 `--provider zhipu-code-plan`）

### MiniMax

| 定位 | 模型 ID | 说明 |
|---|---|---|
| **默认主力** | `MiniMax-M3` | 1M 多模态旗舰，默认 `thinking: {"type": "enabled"}` + `reasoning_split: true` |
| 极速 | `MiniMax-M2.7-highspeed` | 低延迟 |

### 月之暗面 Kimi

| 定位 | 模型 ID | 说明 |
|---|---|---|
| **默认主力** | `kimi-k3` | 2.8T 参数 1M 上下文旗舰，原生全模态推理，默认 `reasoning_effort: "high"` |
| 代码 | `kimi-k2.7-code` | 代码专长 |

> [!CAUTION]
> **禁止使用已下线的 `moonshot-v1` 及 `kimi-latest`**。
