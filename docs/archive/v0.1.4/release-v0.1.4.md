---
doc_type: release
version: v0.1.4
status: approved
date: 2026-11-25
---

# Xtract v0.1.4 发版说明（热修复）

## 1. 版本内容摘要

`v0.1.4` 彻底根治 `v0.1.3` 在 X 新版前端 `x-web` 下的两大真机体验缺陷：**消除同步 X Article 时弹出外部浏览器窗口的问题**（改为纯 HTTP SSR 秒级直取），以及**修复关注流、X 列表、博主、搜索与热搜在无头模式下全部报 HTTP 403 的故障**（全面切换为 Electron 内置隐藏窗口 + 兼容 `x-web` 新版时间线字段）。

---

## 2. 变更记录

### Changed
- **单推 / X Article 同步升级为纯 HTTP SSR 直取优先**：不启动任何浏览器进程、零弹窗，实测单篇专栏同步耗时从 6–12 秒降至 **0.7–1.2 秒**，并自动一次性捕获内嵌推文与视频直链。
- **全量时间线与热搜切换为 Electron 内置隐藏窗口（`BrowserWindow({ show: false })` + CDP 网络流拦截）**：在桌面端 GUI 与打包态 CLI 中直接复用 Electron 原生隐藏窗口（零外部 Chrome 进程、零弹窗、默认静音），彻底解决 X 新版 `x-web` 拒绝 `HeadlessChrome`（HTTP 403）的问题。

### Fixed
- 修复关注流、X 列表、博主追踪、全网搜索与热搜触发 `net::ERR_HTTP_RESPONSE_CODE_FAILURE`（HTTP 403）导致无法拉取的严重故障。
- 修复 `parseTimelineInstructions` 与 `extractTimelineInstructions` 在 X 新版 `x-web` 时间线载荷下的 0 命中问题，全面兼容 `__typename` / `entry_id` / `content.content` / `module_items` / `TimelinePinEntry` 与 `list_by_rest_id_v2` / `user_result_by_screen_name` / `search_by_raw_query` 首屏 SSR HTML。
- 修复 `fetchListTimeline` 误将 `list_by_rest_id_v2` 首段元信息分片判定为「列表不存在」的缺陷。
- 修复纯转发帖（`RT @xxx: ...`）因携带他人 `/i/article/` 链接而被误判为 X Article 的问题，前后端统一排除纯转发壳。

### Removed
- 移除单推同步中遇 403 自动弹出可见 Chrome 窗口的临时回退逻辑。

---

## 3. 交付物清单与获取方式

- macOS (Apple Silicon)：`Xtract-0.1.4-arm64.dmg`（`pnpm pack:mac` 或 GitHub Releases）
- Windows (x64)：`Xtract-Setup-0.1.4.exe`（`pnpm pack:win` 或 GitHub Releases）

---

## 4. 验收汇总

### 4.1 真实 Electron 环境全链路零弹窗冒烟实测
- **单篇 X Article 同步**（`xaiwind/2124724609358631007`）：✅ 纯 HTTP SSR 零弹窗，8,102 字 / 15 图
- **关注流抓取**（`--fetch-only --limit 20`）：✅ Electron 隐藏窗口零弹窗，拉取 20 条
- **X 列表抓取**（`2100985900734062922`，`--limit 20`）：✅ Electron 隐藏窗口 + SSR 零弹窗，拉取 20 条
- **全网搜索**（`--search "AI" --limit 10`）：✅ Electron 隐藏窗口 + SSR 零弹窗，拉取 10 条
- **博主追踪**（`--user xaiwind --limit 5`）：✅ Electron 隐藏窗口零弹窗，拉取 5 条

### 4.2 五道自动化质量门禁（`pnpm verify` @ `0.1.4`）
- `pnpm lint`：✅ 0 Error
- `pnpm test`：✅ **29/29 测试文件、362/362 测试用例通过**（含 21/21 GUI E2E Flow）
- `tsc --noEmit` & `pnpm build`：✅ 0 Error
- `pnpm pack:dir && pnpm smoke`：✅ **4/4 通过**（`Xtract --version` 输出 `0.1.4`）

---

## 5. 已知问题与后续规划

- 纯 Node 开发态 CLI（`pnpm dev:cli`）不在 Electron 内运行时仍使用 Playwright；建议终端日常使用安装版 `xtract` 快捷命令（运行在 Electron 单运行时内，享受零弹窗隐藏窗口与 0 外部浏览器依赖）。
