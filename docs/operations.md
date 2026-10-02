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

## 10. 发版流程 (Release Process)

v0.1.0 起为双平台发布（macOS arm64 DMG + Windows x64 NSIS），由 GitHub Actions 矩阵构建。

### 标准流程

1. **确认门禁本地全绿**：`pnpm verify`（五道门禁，含打包 smoke）；
2. **提交并推送 main**；
3. **打 tag 并推送**：`git tag v0.1.0 && git push origin v0.1.0`；
4. **CI 自动执行**（`.github/workflows/release.yml`）：
   - `macos-latest` 与 `windows-latest` 两个 job 各自跑：全量测试 → tsc → build → electron-builder → 打包 smoke；
   - 两平台全绿后 `release` job 自动创建 GitHub Release，挂载 `*.dmg` 与 `*.exe`；
5. **人工验收**（CI 覆盖不到的部分）：
   - macOS：安装 DMG → 设置页「从 Chrome 读取登录态」→「创建命令行快捷方式」→ 新终端执行 `xtract --list`；
   - Windows：安装 Setup → 设置页「手动填入 Cookie」→「创建命令行快捷方式」→ 新开 PowerShell 执行 `xtract --list`（验证 shim 与用户 PATH 注册表生效）。

### 本地打包（不发版也可出安装包）

| 命令 | 产物 |
| :--- | :--- |
| `pnpm pack:mac` | 仅 macOS：`release/Xtract-<版本>-arm64.dmg` |
| `pnpm pack:win` | 仅 Windows：`release/Xtract-Setup-<版本>.exe` |
| `pnpm pack:all` | 双平台一次出齐（产物同上两个） |
| `pnpm pack:dir` | macOS 目录包（免安装器，`pnpm verify` 门禁内部使用） |

- 所有命令都会先执行 `pnpm build`（vite 产物 + Electron 主进程/预加载编译）再调用 electron-builder；
- 平台与架构以 `electron-builder.yml` 的 target 配置为准（mac=arm64 DMG、win=x64 NSIS），**组合命令不要再传 `--x64/--arm64`**——CLI 的 arch 参数与 yml 配置是「并集」而非覆盖，同传会打出多余的 x64 DMG 与无 SQLite prebuild 的 win32-arm64 目标；
- 本地打出的 Windows exe 与 CI 产物同规格，但**无法在 macOS 上运行验证**——运行时验证以 CI 的打包 smoke 与真机人工验收为准；
- 产物仅供自用/测试；对外分发一律走 tag 触发的 CI Release（保证与 smoke 门禁绑定）。

### 关键配置备忘

- **双平台产物同源于 `win-unpacked/` 与 `mac-arm64/Xtract.app/`**，打包 smoke 对这两个目录的可执行文件做真实启动验证；
- **`npmRebuild` 必须为 `false`**：better-sqlite3 v13 自带全平台 prebuilds，开启会触发 node-gyp 交叉编译并失败；
- **Windows 产物必须显式 `--x64`**：mac 上 cross-build 默认取宿主架构 arm64，而 prebuilds 没有 win32-arm64；
- **macOS 图标用 `.icns`、Windows 由 `build/icon.png`（≥256px）自动转换 `.ico`**；
- 未代码签名：mac Gatekeeper「右键 → 打开」，Windows SmartScreen「更多信息 → 仍要运行」，安装文档需说明。

### 发版前演练

不推 tag 也可验证流水线：GitHub → Actions → Release → Run workflow（`workflow_dispatch`），两平台构建与 smoke 全绿后再打正式 tag。
