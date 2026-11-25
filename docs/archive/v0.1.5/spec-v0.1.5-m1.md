---
doc: spec
product: v0.1.5
milestone: m1
date: 2026-11-25
status: approved
---

# Xtract M1 技术设计规格：批量导出 Markdown 至指定目录与自动清理打包

> **所属版本**：[PRD-v0.1.5.md](prd-v0.1.5.md)  
> **里程碑**：M1  
> **状态**：✅ 已评审通过（Approved）  
> **配套原型**：[prototype-v0.1.5-m1.html](prototype-v0.1.5-m1.html)

---

## 1. 本里程碑目标与覆盖的 F / AC

重构桌面工作台多选「导出 Markdown」全链路（渲染层弹窗 → Preload/IPC → Pipeline 静默补齐 → Storage 双模式落盘），并补齐本地打包前置自动清理脚本。

- **覆盖功能**：`F6`、`F7`
- **覆盖验收标准**：`AC6.1`、`AC6.2`、`AC6.3`、`AC6.4`、`AC6.5`、`AC6.6`、`AC7.1`、`AC7.2`

---

## 2. 关键功能设计思路

### 2.1 存储层合并导出与缓存复用 (`src/main/storage/index.ts`)
- 新增 `Storage.exportMergedTweetsMarkdown(tweetIds, targetDir, options)`：
  1. 在 `targetDir` 下生成时间戳自包含目录 `xtract_export_YYYY-MM-DD_HHMMSS/`（测试可通过 `bundleName` 指定确定性目录名）；
  2. 顶层输出 `index.md`，结构为：总标题 + 导出时间与图片/视频统计摘要 → `## 目录`（TOC 编号清单，含作者、首行标题与原文链接）→ 按序拼接每篇文章章节（`## N. <标题>` + 元数据 + 清洗后的正文 + 附件区）；
  3. **防跨篇命名冲突**：合并目录内图片统一存放在 `images/`，文件名强制加 `${tweet_id}_` 前缀（`${tweet_id}_${mIdx + 1}_${cleanStem}${ext}`），确保不同推文同名附件不会互相覆盖；
  4. **本地缓存优先复用**：无论是合并模式还是独立目录模式（`exportSingleTweetMarkdown` 指定外部 `outputPath` 时），下载图片或视频前均先检查默认归档目录 `~/Documents/Xtract/articles/{author}/{tweet_id}/` 是否已有同名缓存文件——命中则直接 `fs.copyFileSync` 瞬时拷贝，未命中再发起网络下载；
  5. **视频开关严格受控**：仅当 `downloadVideos` 为 `true`（默认读取 `Config.AUTO_DOWNLOAD_VIDEOS`）时才拷贝或流式下载视频至 `videos/` 并改写相对链接；关闭时不创建空 `videos/` 目录，保留原视频链接。

### 2.2 编排层静默补齐与双模式调度 (`src/main/pipeline/index.ts`)
- 新增 `Pipeline.exportSelectedTweets(request, callbacks)`：
  1. **阶段 1（0%–50%）静默补齐全文**：逐篇读取 SQLite；若 `!tweet || isTweetContentIncomplete(tweet)`，静默调用 `fetchTweetAndStore` 补齐全文并更新本地数据库；单篇网络失败时若本地已有旧内容则降级保留，否则记入 `failed` 数组继续下一篇；
  2. **阶段 2（50%–100%）落盘导出**：
     - `mode === 'merged'`：调用 `storage.exportMergedTweetsMarkdown(readyIds, targetDir, { downloadImages: true, downloadVideos: Config.AUTO_DOWNLOAD_VIDEOS })`，返回 `outputPath = res.bundleDir`；
     - `mode === 'separate'`：逐篇调用 `storage.exportSingleTweetMarkdown(tweetId, { outputPath: path.join(targetDir, `${safeAuthor}_${tweetId}`, 'index.md'), downloadImages: true, downloadVideos: Config.AUTO_DOWNLOAD_VIDEOS })`，返回 `outputPath = targetDir`。

### 2.3 IPC / Preload 流式进度与隔离 (`src/preload/` & `src/main/ipc/index.ts`)
- 新增通道 `IPC_CHANNELS.TWEETS_BATCH_EXPORT = 'tweets:batch-export'`，Preload 暴露 `batchExportTweets(request)`；
- 主进程通过 `STREAM_EVENT` 推送 `stage: 'batch_export'` 进度事件；前端 `reduceStreamEvent` 显式忽略 `stage === 'batch_export'`（与 `video_download` 同理），确保导出进度只驱动弹窗进度条，绝不污染左侧爬虫进度卡片。

### 2.4 打包自动清理脚本 (`scripts/clean-release.ts` & `package.json`)
- 纯 Node `fs.rmSync('release', { recursive: true, force: true })`，递归统计删除前体积并打印释放 MB 数；
- 经 `tsx scripts/clean-release.ts` 执行，彻底避开 Windows cmd / PowerShell 的行内引号转义差异；绑定至 `pack:clean` 及所有 `pack:*` 命令前置。

---

## 3. 数据模型 / 接口定义

```ts
// src/main/types.ts（src/renderer/src/types.ts 同源重导出）
export type BatchExportMode = 'merged' | 'separate';

export interface BatchExportRequest {
  tweetIds: string[];
  targetDir: string;
  mode: BatchExportMode;
}

export interface BatchExportSummary {
  mode: BatchExportMode;
  outputPath: string;
  exportedCount: number;
  failed: Array<{ tweetId: string; error: string }>;
  downloadedImagesCount: number;
  downloadedVideosCount: number;
}
```

- **IPC 通道**：`IPC_CHANNELS.TWEETS_BATCH_EXPORT = 'tweets:batch-export'`
- **StreamEvent 扩展**：`stage` 联合类型新增 `'batch_export'`
- **持久化偏好（Renderer `localStorage`）**：
  - `xtract:studio:exportMode`：`'merged' | 'separate'`（默认 `'merged'`）
  - `xtract:studio:lastExportDir`：上次选定的导出目录路径

---

## 4. 关键决策记录

| 决策项 | 结论 | 为什么（Rationale） | 对用户的影响 | 放弃了什么 |
| :--- | :--- | :--- | :--- | :--- |
| **合并输出采用独立子目录而非裸 `.md` 文件** | 在目标目录下新建 `xtract_export_YYYY-MM-DD_HHMMSS/` 包裹 `index.md` 与 `images/`/`videos/` | 若直接往用户桌面/文档目录散放 `images/` 会污染目标文件夹并与其他导出冲突 | 整个目录自包含，拖进 Obsidian 或打包分享零断图、不弄乱桌面 | 放弃直接输出单文件裸 `.md` 到根目录 |
| **不另设视频下载开关，直接联动「设置」** | 遵循 `Config.AUTO_DOWNLOAD_VIDEOS`，弹窗以状态行透明展示 | 单一事实源，避免两处开关冲突让用户困惑 | 无需每次导出重复决策，同时一眼可见当前视频策略 | 放弃单次导出临时覆盖视频开关 |
| **未选目录点击「开始导出」自动弹选择器** | 校验 `exportTargetDir` 为空时先调用 `selectDirectory()` | 践行「系统承担复杂性，能一步不拆两步」 | 首次使用只需点一次「开始导出」→ 选文件夹即完成 | 放弃禁用按钮逼迫用户先点另一按钮 |
| **优先复用本地归档缓存再联网** | 导出到外部目录前先检查默认 `articles/{author}/{id}/` | 已读过的文章图/视频已在本地，重复下载浪费代理流量与时间 | 秒级导出已缓存文章，零冗余网络请求 | 无明显取舍 |

---

## 5. 测试策略

### 5.1 单元测试（TDD 红 → 绿）
| 编号 | 文件 | 测试内容 | 覆盖 AC | 类型 |
| :--- | :--- | :--- | :--- | :---: |
| UT-1 | `tests/storage.test.ts` | `exportMergedTweetsMarkdown` 生成单一时间戳目录、合并 `index.md`（含双篇文章）、复用本地图片缓存并带 `tweet_id` 前缀改写相对路径；`downloadVideos=false` 不建 `videos/`，`downloadVideos=true` 复用并链接本地视频 | AC6.1, AC6.4 | 单元 |
| UT-2 | `tests/pipeline.test.ts` | `exportSelectedTweets` 对未展开 X Article 自动触发 `fetchTweetThread` 静默补齐、已完整推文不重复请求；分别验证 `merged` 与 `separate`（`{author}_{id}/index.md`）产物 | AC6.3, AC6.4 | 集成 |
| UT-3 | `tests/ipc.test.ts` | 断言 `IPC_CHANNELS.TWEETS_BATCH_EXPORT` 注册且 `xtractApiImplementation.batchExportTweets` 可用；版本号校验更新至 `0.1.5` | AC6.6 | 单元 |
| UT-4 | `pnpm pack:clean` | 实机验证清理历史 `release/` 并汇报释放体积；目录为空时幂等退出 0 | AC7.1, AC7.2 | 集成 |

### 5.2 端到端测试（Playwright 真实浏览器 + 打包 Smoke）
| 编号 | 文件 | 场景 | 覆盖 AC |
| :--- | :--- | :--- | :---: |
| E2E-25 | `tests/gui-workbench.e2e.test.ts` | **Flow 25**：勾选 2 篇文章 → 点击浮动条 `#btn-batch-export` 打开 `#batch-export-dialog` → 校验视频策略状态可见 → 点击 `#btn-select-export-dir` 回填目录 → 切换 `separate` / `merged` → 点击 `#btn-confirm-batch-export` 断言 `batchExportTweets` 参数、`showItemInFolder` 定位路径、弹窗关闭与勾选清空 | AC6.1, AC6.2, AC6.5, AC6.6 |
| SMOKE | `scripts/smoke-packaged.ts` | `pnpm pack:dir` 前置自动清理 `release/`，对真实 `Xtract.app` 验证 `--version = 0.1.5`、`--help`、`--list` 与无参 GUI 存活 | AC7.2 |

---

## 6. Task 拆分与执行记录

| 编号 | 内容 | 覆盖 AC | 依赖 | 状态 | 验证证据 |
| :--- | :--- | :--- | :--- | :---: | :--- |
| T1 | 新增跨平台打包前自动清理脚本 `scripts/clean-release.ts` 并接入 `package.json` | AC7.1, AC7.2 | - | ✅ 完成 | `pnpm pack:clean` 释放 1024.9 MB；`pnpm lint` & `tsc` 0 Error（`a16aeb2`） |
| T2 | 定义批量导出类型与 `IPC_CHANNELS.TWEETS_BATCH_EXPORT` / Preload 契约 | AC6.6 | - | ✅ 完成 | `tests/ipc.test.ts` 10/10 通过（`0042d90`） |
| T3 | 实现 `Storage.exportMergedTweetsMarkdown` 及缓存复用逻辑 | AC6.1, AC6.4 | T2 | ✅ 完成 | `tests/storage.test.ts` 17/17 通过（`0042d90`） |
| T4 | 实现 `Pipeline.exportSelectedTweets`（静默补齐全文 + 双模式调度）与 IPC Handler | AC6.3, AC6.4, AC6.5 | T2, T3 | ✅ 完成 | `tests/pipeline.test.ts` 8/8 通过（`0042d90`） |
| T5 | 实现前端 `BatchExportDialog` 弹窗、`useStudioData` 编排与进度监听 | AC6.1, AC6.2, AC6.5 | T2, T4 | ✅ 完成 | `tests/gui-workbench.e2e.test.ts` Flow 25 通过（`0042d90`） |
| T6 | 升级版本号至 `0.1.5`，全量跑通五道门禁与打包 Smoke | AC6.6, AC7.2 | T1–T5 | ✅ 完成 | `pnpm verify` 全绿：376/376 测试、25/25 E2E、Smoke 4/4（`0.1.5`） |

---

## 7. 界面与 F / AC 映射

对应高保真交互原型：[docs/prototype/prototype-v0.1.5-m1.html](../prototype/prototype-v0.1.5-m1.html)。

| 原型视图 / 控件 | 对应实现组件 / ID | 覆盖 F / AC | 交互与视觉规范 |
| :--- | :--- | :--- | :--- |
| 底部浮动条「导出 Markdown」按钮 | `BatchActionBar` (`#btn-batch-export`) | AC6.1 | 仅在 `checkedIds.size > 0` 时展示 |
| 批量导出配置弹窗容器 | `BatchExportDialog` (`#batch-export-dialog`) | AC6.1 | 宽 460px，暖纸抬升背景 `var(--paper-raised)`，细边框 `var(--line-strong)`，支持 Esc 与遮罩关闭（导出中禁用关闭） |
| 导出结构单选卡片（合并 / 独立） | `#export-mode-merged` / `#export-mode-separate` | AC6.1 | 选中态边框高亮 `var(--ink)` + 底色 `var(--paper)`，默认选中 `merged` |
| 导出位置输入框与目录选择按钮 | `#export-target-dir-input` + `#btn-select-export-dir` | AC6.2 | 只读路径回显 + 系统目录选择按钮，未选时占位提示自动引导 |
| 静默补齐与视频策略状态行 | `#export-video-policy-status` | AC6.3, AC6.4 | 11.5px 弱化字色 `var(--ink-faint)`，动态呈现当前 `AUTO_DOWNLOAD_VIDEOS` 开关状态 |
| 实时进度条与主操作按钮 | `#batch-export-progress` + `#btn-confirm-batch-export` | AC6.5 | 朱砂红进度条 `var(--cinnabar)`，导出中按钮禁用并显示「正在导出...」 |

---

## 8. 验收记录

- **执行时间**：2026-11-25 21:59–22:00 CST
- **验证命令**：`pnpm verify`（`pnpm lint && pnpm test && tsc --noEmit && pnpm build && pnpm pack:dir && pnpm smoke`）
- **验证结果**：
  - `pnpm lint`：✅ **0 Error**（15 条存量 React Hook warning，无新增）
  - `pnpm test`：✅ **29/29 测试文件、376/376 用例通过（100%）**
    - `tests/storage.test.ts`：17/17 通过（含 `test_export_merged_tweets_markdown_creates_single_bundle_dir_with_media_subfolders`）
    - `tests/pipeline.test.ts`：8/8 通过（含 `exportSelectedTweets silently refreshes incomplete articles and supports merged & separate export modes`）
    - `tests/ipc.test.ts`：10/10 通过（含 `TWEETS_BATCH_EXPORT` 契约与 `0.1.5` 版本屏蔽测试）
    - `tests/gui-workbench.e2e.test.ts`：**25/25 Flow 通过**（含 Flow 25 批量导出弹窗端到端验证）
  - `tsc --noEmit` & `pnpm build`：✅ **0 Error**
  - `pnpm pack:dir`：✅ 自动先执行 `pnpm pack:clean` 清理旧 `release/`（释放约 1024.3 MB）后构建 `release/mac-arm64/Xtract.app`
  - `pnpm smoke`：✅ **4/4 通过**（`--version` 输出 `0.1.5`、`--help`、`--list 1`、无参 GUI 存活）
- **遗留问题**：无；已完成评审并整组归档至 `docs/archive/v0.1.5/`。
