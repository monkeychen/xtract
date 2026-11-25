---
doc_type: release
version: v0.1.5
status: approved
date: 2026-11-25
---

# Xtract v0.1.5 发版说明

## 1. 版本内容摘要

`v0.1.5` 围绕**「多选批量导出 Markdown 至指定目录」**重构了工作台批量导出链路，并集成打包前自动清理历史产物脚本：用户多选推文后，可自由选择导出目录及**「合并为单一目录」**或**「按篇独立目录」**两种结构，导出前自动静默补齐未展开的全文，图片与视频优先复用本地缓存且视频下载严格遵循设置中的开关。

---

## 2. 变更记录

### Added
- **批量导出 Markdown 配置弹窗与双模式导出**：
  - 支持选择任意目标文件夹（记忆上次导出路径，未选时点击导出自动拉起目录选择器）；
  - **合并为单一目录（`merged`）**：生成 `{目标目录}/xtract_export_YYYY-MM-DD_HHMMSS/`，内含带目录索引（TOC）的 1 份合并 `index.md` 与统一 `images/`（及按设置开关的 `videos/`）素材子目录，文件名带 `tweet_id` 前缀杜绝跨篇重名冲突；
  - **按篇独立目录（`separate`）**：在目标文件夹下扁平生成 `{作者}_{ID}/index.md` + `images/` + 可选 `videos/`；
  - 导出前对缺失或未展开的 X Article / Note Tweet **自动静默补齐全文**；图片与视频优先复用本地默认归档缓存（零重复流量）；视频是否下载严格遵循设置中「导出时自动下载视频」开关；全程通过 `STREAM_EVENT` 实时展示逐篇导出进度，完成后自动在系统文件管理器中高亮定位产物目录。
- **本地打包前自动清理历史产物**：新增跨平台脚本 `scripts/clean-release.ts`（`pnpm pack:clean`），`pack:mac` / `pack:win` / `pack:all` / `pack:dir` 全部前置自动清理 `release/` 历史包体，避免旧版 DMG/EXE 堆积占用磁盘空间。

---

## 3. 交付物清单

- macOS (Apple Silicon)：`Xtract-0.1.5-arm64.dmg`（`pnpm pack:mac` 或 GitHub Releases）
- Windows (x64)：`Xtract-Setup-0.1.5.exe`（`pnpm pack:win` 或 GitHub Releases）

---

## 4. 验收汇总（`pnpm verify` @ `0.1.5`）

- `pnpm lint`：✅ 0 Error
- `pnpm test`：✅ **29/29 测试文件、376/376 测试用例通过**（含 **25/25 GUI E2E Flow**）
- `tsc --noEmit` & `pnpm build`：✅ 0 Error
- `pnpm pack:dir && pnpm smoke`：✅ **4/4 通过**（`Xtract --version` 输出 `0.1.5`）
