---
doc: release
product: v0.1.5
milestone: -
date: 2026-11-25
status: reviewing
---

# Xtract v0.1.5 发版说明

## 1. 版本内容摘要

`v0.1.5` 重构了桌面工作台多选「批量导出 Markdown」链路：支持导出至用户指定的任意目录、自由选择「合并为单一自包含目录」或「按篇独立目录」，导出前自动静默补齐缺全文的推文并复用本地媒体缓存，视频下载严格遵循设置中的开关；同时新增本地打包前自动清理 `release/` 历史产物的跨平台机制。

---

## 2. 变更记录

### Added
- **批量导出 Markdown 配置弹窗与双模式导出（F6）**：
  - 勾选多篇文章后点击浮动条「导出 Markdown」，可自由指定目标目录（记忆上次目录，未选时自动拉起目录选择器）；
  - **合并为单一目录（`merged`）**：生成 `{目标目录}/xtract_export_YYYY-MM-DD_HHMMSS/`，内含带目录索引（TOC）的 1 份合并 `index.md` 与统一 `images/`（文件名加 `tweet_id` 前缀防冲突）及按开关 `videos/` 素材子目录；
  - **按篇独立目录（`separate`）**：在目标目录下扁平生成 `{作者}_{ID}/index.md` + `images/` + 可选 `videos/`；
  - 导出前对缺失或未展开的 X Article / Note Tweet 自动静默补齐全文，图片/视频优先复用本地归档缓存，视频是否下载遵循设置中的 `AUTO_DOWNLOAD_VIDEOS` 开关，全程流式展示逐篇进度，完成后自动高亮定位目录。
- **本地打包前自动清理历史产物（F7）**：
  - 新增 `scripts/clean-release.ts`（`pnpm pack:clean`），`pack:mac` / `pack:win` / `pack:all` / `pack:dir` 全部前置自动清理旧版 `release/` 文件并汇报释放体积。

---

## 3. 交付物清单与获取方式

- macOS (Apple Silicon)：`Xtract-0.1.5-arm64.dmg`（`pnpm pack:mac` 或 GitHub Releases）
- Windows (x64)：`Xtract-Setup-0.1.5.exe`（`pnpm pack:win` 或 GitHub Releases）

---

## 4. 验收汇总

详见 [spec-v0.1.5-m1.md §8 验收记录](../spec/spec-v0.1.5-m1.md#8-验收记录)：
- `pnpm lint` / `tsc --noEmit` / `pnpm build`：✅ 0 Error
- `pnpm test`：✅ **29/29 测试文件、376/376 用例通过**（含 **25/25 GUI E2E Flow**）
- `pnpm pack:dir && pnpm smoke`：✅ 前置清理历史 `release/` 后打包，Smoke **4/4 通过**（`--version` 输出 `0.1.5`）

### 交付检查单
- [x] 全量自动化测试通过（单元 + 集成 + E2E，含回归）
- [ ] PRD / Spec / Prototype / Release 经人类评审通过（`status: approved`）
- [ ] git 打 tag `v0.1.5` 并推送触发双平台发版
- [ ] 本版全部文档（PRD / spec / prototype / release）整组归档至 `docs/archive/v0.1.5/`

---

## 5. 已知问题与下版建议 Backlog

- 若后续有需求，可考虑支持 CLI 侧 `--export-ids --merged -o <dir>` 与 GUI 合并导出保持双模一致。
