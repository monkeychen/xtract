---
doc_type: release
version: v0.1.3
status: draft
date: 2026-11-24
---

# Xtract v0.1.3 发版说明

## 1. 版本内容摘要

`v0.1.3` 围绕高信噪比情报沉淀交付两大核心能力：**全形态推特视频本地下载与离线秒播**（覆盖短推、长推、X Article 原生视频及专栏内嵌视频推文），以及**拉取内容类型可配置**（设置中心与 CLI 均支持短推 / 长推 / X Article 多选，默认聚焦高价值 X Article）。同时顺手完成 X 新版 `x-web` TanStack Router SSR 专栏抓取适配，保障最新线上长文 100% 完整导出。

---

## 2. 变更记录

### Added
- **全形态视频本地下载与离线播放**：
  - 桌面端视频播放器新增三态下载控件（下载中进度条与取消、已下载「本地离线」微标与「访达定位」、失败重试提示），已落盘视频自动经受控 `xtract-media://` 协议（支持 HTTP `Range 206` 拖动进度条）离线秒播；
  - X Article 专栏正文中内嵌推文卡片视频与文章原生 `ApiVideo` 均就地渲染为独立播放器，文章底部自动去重不重复展示；
  - 纯 Node.js 流式下载落盘至自包含 Page Bundle `articles/{author}/{tweet_id}/videos/<mediaId>_<stem>.mp4`，自动重写 `index.md` 本地相对路径并随级联删除一并清理；
  - 设置中心新增「导出归档时自动下载视频」开关（`AUTO_DOWNLOAD_VIDEOS`，默认关闭）；CLI `--view` 与 `--export-ids` 新增 `--download-videos` / `--no-download-videos` 参数，并在 `--json` 输出中返回 `downloadedVideos` 明细。
- **拉取内容类型可配置（默认仅 X Article）**：
  - 设置中心「抓取过滤规则」新增多选芯片组（X Article / 长推文 / 短推文，至少保留一项），默认仅勾选「X Article」；
  - CLI 批量抓取命令（Following / `--user` / `--x-list` / `--search`）新增 `--content-types <types>`（严格校验合法值）与 `--all-tweets` 快捷别名；单推同步（`--view`）与趋势研报（`--trends-digest`）不受该过滤影响。
- **X 新版前端 `x-web` SSR 专栏适配**：
  - 支持从 TanStack Router SSR 首屏 HTML 中提取并合并分片 `tweet_result_by_rest_id` 载荷，全面兼容 `snake_case` 字段（`entity_map`、`entity_ranges`、`media_items`、`cover_media_results`、`MARKDOWN` 代码块、`ApiVideo` `bit_rate` 排序、`counts` / `details` / `media_entities2`）；
  - 单推抓取遇无头模式 HTTP 403 时自动提示并回退至可见 Chrome 窗口完成内容获取。

### Changed
- 批量抓取默认过滤策略从「长推文 + 专栏（`ONLY_LONG_TWEETS=true`）」升级为「默认仅拉取 X Article（`FETCH_CONTENT_TYPES=article`）」，旧配置自动平滑迁移。
- 视频流式下载超时策略由固定总时长升级为「60 秒无字节到达空闲超时」，避免大体积 4K 长视频在持续稳定下载时被误中断。

### Fixed
- 修复 Node 24 全局 `fetch`（内置 undici v7）与项目依赖 `undici` v8 `ProxyAgent` 版本冲突导致的 `TypeError: invalid onRequestStart method`，`downloadVideoStream` 与 `downloadImage` 均改为同源导入 `undici.fetch`。
- 修复单推同步将完整推文 URL 改写为 `/i/status/<id>` 引起的额外跳转，优先保留原作者路径 URL。

### Removed
- 无破坏性移除（旧配置项 `ONLY_LONG_TWEETS` 保留只读兼容映射）。

---

## 3. 交付物清单与获取方式

- **源码构建与校验**：
  - `pnpm verify`：一键串行执行 Lint、357 项测试、TypeScript 校验、生产构建与打包产物 Smoke 验证。
- **本地安装包构建**：
  - macOS (Apple Silicon)：`pnpm pack:mac` → 产出 `release/Xtract-0.1.3-arm64.dmg`
  - Windows (x64)：`pnpm pack:win` → 产出 `release/Xtract-Setup-0.1.3.exe`
- **双模运行方式**：
  - 无参启动：打开 Electron 桌面情报工作台；
  - 带参启动：进入 Headless CLI（应用内「设置 → 命令行 → 创建命令行快捷方式」即可注册 `xtract` 命令）。

---

## 4. 验收汇总

| 里程碑 | 范围 | Spec 与验收记录 | 验收状态 |
| :--- | :--- | :--- | :---: |
| **M1** | 拉取内容类型可配置（F5 / AC5.1–AC5.5） | [`spec-v0.1.3-m1.md`](../spec/spec-v0.1.3-m1.md) §8 | ✅ 人工确认通过 |
| **M2** | 全形态视频本地下载、离线播放、CLI 与 `x-web` SSR 适配（F1–F4 / AC1.1–AC4.2） | [`spec-v0.1.3-m2.md`](../spec/spec-v0.1.3-m2.md) §8 | ✅ 人工确认通过 |

- **全量最终质量门禁（`pnpm verify` @ `0.1.3`）**：
  - 代码风格（`pnpm lint`）：0 Error
  - 自动化测试（`pnpm test`）：**28/28 测试文件、357/357 用例 100% 通过**（含 21/21 Playwright 真实浏览器 GUI E2E Flow）
  - 静态类型（`tsc --noEmit`）：0 Error
  - 生产构建（`pnpm build`）：0 Error
  - 打包产物 Smoke（`pnpm pack:dir && pnpm smoke`）：**4/4 通过**（`Xtract --version` 输出 `0.1.3`）

---

## 5. 已知问题与下版建议 Backlog

- **已记录的技术限制**：
  - X 新版 `x-web` 对无头模式的单推访问返回 403 时，Xtract 会自动弹出短暂可见 Chrome 窗口完成读取后立即关闭（属于平台侧限制下的透明回退，不做反爬绕过）；
  - 极少数仅提供 HLS（`.m3u8`）无 MP4 变体的直播流视频暂不落盘（纯单运行时不引入 `ffmpeg`），仍支持浏览器打开观看。
- **下版建议（v0.2.0 方向）**：
  - 本地向量语义知识库（Local RAG）检索已归档 X Article 与推文；
  - 后台定时巡检与系统原生通知；
  - Astro 博客与微信百宝箱（`wx-kit`）跨平台联动。
