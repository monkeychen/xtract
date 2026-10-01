# Xtract 运维手册：定时任务、存储架构与常见问题

> 本文档由 `README.md` 下沉，面向部署与日常运维场景。
> 项目总览与快速开始见 [README](../README.md)。

---

## 6. 定时任务自动化配置 (Cron / launchd)

通过系统级定时任务，实现每日全自动抓取与早报生成。

### 方案 1：Linux / macOS `crontab`（最简单）
在终端运行 `crontab -e`，添加定时规则（以每天早晨 8:30 执行为例）：

```cron
# 每天 8:30 自动抓取并生成早报（请将 /path/to/xtract 替换为你的项目绝对路径）
30 8 * * * cd /path/to/xtract && pnpm dev:cli >> data/cron.log 2>&1
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
        <!-- 请使用 `which pnpm` 查得的绝对路径，例如 /usr/local/bin/pnpm 或 ~/.nvm/versions/node/v22.21.1/bin/pnpm -->
        <string>/usr/local/bin/pnpm</string>
        <string>dev:cli</string>
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

项目严格遵守结构分层与安全规范：

```
xtract/
├── GEMINI.md               # 项目规范与架构约定
├── LICENSE                 # Apache-2.0 开源协议
├── README.md               # 项目产品指南与使用手册
├── package.json            # Node.js 项目配置与构建脚本
├── pnpm-lock.yaml          # pnpm 依赖锁定
├── tsconfig.json           # TypeScript 全局配置
├── electron-builder.yml    # 跨平台安装包构建配置
├── docs/                   # 正式工程设计与架构文档
│   ├── architecture.md     # 系统总体架构设计 (HLD)
│   ├── detailed_design.md  # 详细设计与核心机制 (LLD)
│   └── vibe-coding-log.md  # 项目全周期复盘与踩坑设计日志
├── src/
│   ├── main/               # Electron 主进程 & CLI 核心引擎
│   │   ├── index.ts        # 双模入口分发器 (无参启动 GUI / 有参进入 CLI)
│   │   ├── config.ts       # 配置加载与持久化
│   │   ├── client/         # Playwright 拦截与推特官方流嗅探
│   │   ├── storage/        # better-sqlite3 存储与 Markdown 导出
│   │   ├── llm/            # 7 大主流大模型统一驱动与 SSE 流式长推理
│   │   └── pipeline/       # 全生命周期流水线 (Trends/Search/Digest 编排)
│   ├── preload/            # 安全隔离桥梁 (ContextBridge)
│   │   └── index.ts        # 强类型 IPC 通信接口
│   └── renderer/           # GUI 渲染进程前端 (SPA)
│       ├── index.html      # 主视窗入口
│       └── src/            # 界面视图组件 (趋势雷达/监控信箱/搜索/阅读器/设置)
├── data/                   # 本地数据持久化（Git 忽略）
│   ├── tweets.db           # SQLite 数据库
│   └── auth_state.json     # X 登录持久化凭据
└── output/                 # 输出结果
    ├── reports/            # 导出的 Markdown 研报（YYYY-MM-DD.md / trends_YYYY-MM-DD.md）
    └── {author}/           # 按博主与文章 ID 组织的自包含单篇推文包 (Page Bundle)
        └── {tweet_id}/     # 单篇推文独立归档目录
            ├── index.md    # 推文全文 Markdown 文档（图片直接相对引用 images/...）
            └── images/     # 该推文专属的本地配图文件夹
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
