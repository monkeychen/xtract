---
doc: spec
product: v0.1.3
milestone: m2
date: 2026-11-24
status: approved
---

# Xtract M2 技术设计规格：全形态推文视频解析与本地流式下载闭环

> **所属版本**：[v0.1.3 PRD](../prd/v0.1.3.md)  
> **里程碑**：M2  
> **状态**：✅ 已评审通过（Approved）

---

## 1. 本里程碑目标与覆盖的 F / AC

本里程碑打通短推、长推（Note Tweet）与 X Article 专栏（含内嵌视频推文卡片）的全形态视频解析、纯 Node.js 流式本地下载、Page Bundle 自包含归档、受控本地视频离线播放协议（支持 `Range` 拖动）以及 GUI / CLI 双模下载体验。

- **覆盖功能**：`F1`、`F2`、`F3`、`F4`
- **覆盖验收标准**：`AC1.1`–`AC1.4`、`AC2.1`–`AC2.4`、`AC3.1`–`AC3.4`、`AC4.1`–`AC4.2`

---

## 2. 关键功能设计思路

### 2.1 全形态视频解析与结构化 Markdown 标记 (`parser.ts`、`client/index.ts`、`logic.ts`)
1. **短推 / 长推 / 转推 / 引用推文多视频提取**：
   - `parseTweetResult` 保持提取全部 `video` / `animated_gif` 的最高码率 MP4 与对应封面图写入 `media_urls`（首个写入 `video_url` / `video_poster`）。
   - 前端 `extractMedia(tweet)` 升级返回 `videos: TweetVideoItem[]`（`{ url: string; posterUrl?: string }`），按视频 URL 中的媒体 ID（`/(?:amplify_video|ext_tw_video|tweet_video)(?:_thumb)?\/(\d+)/`）精准配对各视频封面；同时保留原有 `isVideo` / `videoUrl` / `posterUrl` 字段向下兼容，并坚守「非视频推文 `posterUrl` 恒为 `undefined`」的硬约束。
2. **X Article 内嵌推文卡片 & 原生视频还原**：
   - 经真实探针（样本 `2124098048842473619`）验证，专栏中嵌入的 5 条 `TWEET` 实体通过 `TweetResultsByRestIds` 返回，每条携带 1080p/4K MP4 视频与封面图。
   - `formatArticleContent` 渲染 `TWEET` 实体时，提取 `tweetInfo` 中的全部视频及其配对封面，在引用卡片内输出合法的 CommonMark 视频标记行：
     ```markdown
     > 🎬 [视频](https://video.twimg.com/...mp4 "poster=https://pbs.twimg.com/...jpg")
     ```
     （无封面时省略 title，输出 `> 🎬 [视频](https://video.twimg.com/...mp4)`），并将视频与封面 URL 聚合写入返回值的 `mediaUrls`。
   - 同时防御性解析 `articleResult.media_entities` 中可能存在的原生视频实体（`ApiVideo` / `ApiGif` / `media_info.variants` / `media_info.video_info.variants`），在 `atomic` block 处输出 `🎬 [视频](<mp4Url> "poster=<posterUrl>")`。
   - `XClient.fetchTweetThread` 升级等待策略：从主推文提取 `expectedArticleTweetIds` 集合；若收到主推文时尚未收齐全部内嵌推文，在最多 6 秒窗口内（第 2 秒、第 4 秒轻滚 1200px 触发懒加载）等待 `TweetResultsByRestIds` 补齐，收齐即刻退出。
3. **正文内联渲染与底部去重**：
   - `TweetMarkdown.tsx` 识别独立行或引用块内的 `🎬 [视频](url)` 标记，就地渲染 `TweetVideoPlayer`；
   - `TweetDetailPane.tsx` 渲染底部媒体区时，自动过滤掉已在正文 Markdown 中内联渲染过的视频 URL 及其封面图，避免文章末尾重复堆叠播放器。

### 2.2 纯 Node.js 流式视频下载引擎 (`src/main/storage/video-downloader.ts`)
独立模块封装，严格遵守单运行时红线（零外部 `yt-dlp`/`ffmpeg`/Python 进程）：
1. **确定性、幂等文件名映射 `buildVideoFilename(videoUrl)`**：
   - 命中 X 媒体 ID 正则 `/(?:amplify_video|ext_tw_video|tweet_video)\/(\d+)/` → `<mediaId>_<cleanStem>.mp4`（如 `2121343472368074752_rdmP3hbqzNGNuPrj.mp4`）；
   - 否则取 `<cleanStem>_<sha1_8>.mp4`；
   - 落盘目录固定为 `path.join(bundleDir, 'videos', filename)`。
   - **优势**：顺序无关、全局不冲突、无需额外 SQLite 映射表——无论 GUI 单点下载第 3 个视频还是 CLI 批量下载全部视频，路径 100% 一致，幂等判断只需检查目标文件存在且 `size > 0`。
2. **流式落盘与防损坏 `downloadVideoStream(options)`**：
   - 显式代理支持：只要 `Config.HTTP_PROXY` 存在即通过 `undici.ProxyAgent` 挂载（修复主进程 Node fetch 不走 Electron session 代理的坑），并注入 `Referer: https://x.com/`、`Origin: https://x.com`；
   - 先写临时文件 `${destPath}.part`，通过 `res.body.getReader()` + `fs.createWriteStream` 背压流式写入，内存占用恒定；
   - 150ms 节流回调 `onProgress({ downloadedBytes, totalBytes, percent })`；
   - 写入完毕校验 `bytes > 0` 后 `fs.renameSync(partPath, destPath)` 原子生效；
   - 支持 `AbortSignal` 取消下载，任何取消/超时/HTTP 非 2xx/IO 异常立即关闭流并删除 `.part` 残片，返回可读中文错误信息。
3. **下载任务控制器**：
   - 主进程维护 `activeDownloads: Map<string, AbortController>`（以 `videoUrl` 为 key），并发点击同一视频自动去重，取消请求即时中止网络流并清理残片。

### 2.3 Page Bundle `index.md` 同步与级联删除一致性 (`src/main/storage/index.ts`)
- `exportSingleTweetMarkdown` 新增参数 `downloadVideos?: boolean`（默认读取 `Config.AUTO_DOWNLOAD_VIDEOS`），返回：
  ```ts
  { filePath: string; downloadedImagesCount: number; downloadedVideosCount: number; downloadedVideos: string[] }
  ```
- **本地视频自动关联**：
  - 若 `downloadVideos === true`，依次流式下载该推文（含文章内嵌推文）的所有视频至 `videos/`；
  - 无论 `downloadVideos` 为 `true` 还是 `false`，生成 `index.md` 时都会自动检测 `videos/` 目录中**已落盘**的本地视频：
    - 若正文包含 `🎬 [视频](<remoteUrl>...)`，将对应行增强为 `🎬 [本地视频](videos/<file>.mp4)（[原视频链接](<remoteUrl>)）`；
    - 底部媒体附件区同理，已下载的视频输出 `- 🎥 [本地视频](videos/<file>.mp4)（[原视频链接](<remoteUrl>)）`，未下载的输出 `- 🎥 [视频/音频流](<remoteUrl>)`。
- **级联删除闭环**：现有 `Storage.deleteTweets` 已按 `fs.rmSync(bundleDir, { recursive: true, force: true })` 删除 `articles/{author}/{tweet_id}/`，天然连同 `videos/` 全部清理。

### 2.4 受控本地视频协议 `xtract-media://` (`src/main/media-protocol.ts`)
为满足 `contextIsolation: true` 安全沙箱下的本地离线秒播与进度条拖动：
- 启动前注册特权协议：`protocol.registerSchemesAsPrivileged([{ scheme: 'xtract-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])`。
- URL 映射：`buildLocalMediaUrl(articlesDir, absFilePath)` → `xtract-media://articles/<encodedRelPath>`。
- 请求处理 `handleMediaProtocolRequest(request, articlesDir)`：
  1. **路径穿越防护**：解析相对路径并 `path.resolve(articlesDir, rel)`，校验严格位于 `path.resolve(articlesDir) + path.sep` 内且扩展名在允许白名单内，非法路径返回 `403`；
  2. **HTTP Range 支持**：解析 `Range: bytes=start-end`，返回 `206 Partial Content` + `Content-Range` + `Accept-Ranges: bytes` + Node 文件分段流；无 `Range` 返回 `200 OK`；越界返回 `416`。

### 2.5 IPC 契约、GUI 交互与 CLI 对齐
- **IPC 新增通道**（`src/preload/channels.ts`）：
  - `VIDEO_DOWNLOAD: 'video:download'`
  - `VIDEO_DOWNLOAD_CANCEL: 'video:download-cancel'`
  - `VIDEO_STATUS: 'video:status'`
- **进度事件**：复用 `STREAM_EVENT`，新增 `stage: 'video_download'`，在 `meta` 中携带 `{ tweetId, videoUrl, downloadedBytes, totalBytes, percent, status: 'downloading' | 'done' | 'canceled' | 'error', localPath?, mediaUrl?, error? }`。
- **配置项**：新增 `AUTO_DOWNLOAD_VIDEOS`（默认 `false`），`AppConfigView.autoDownloadVideos: boolean`，设置抽屉新增对应开关 + `InfoTip`。
- **CLI 选项**（`src/main/index.ts`）：
  - `--download-videos` / `--no-download-videos`（优先级：CLI 参数 > `Config.AUTO_DOWNLOAD_VIDEOS` > `false`）；
  - 适用于 `--view <tweetId|url>` 与 `--export-ids <ids...>`，`--json` 输出同步包含 `downloadedVideos: string[]`。

---

## 3. 数据模型 / 接口定义

### 3.1 视频媒体与下载状态类型 (`src/main/types.ts` & `src/preload/index.ts`)
```ts
export interface TweetVideoItem {
  url: string;
  posterUrl?: string;
}

export interface LocalVideoStatus {
  downloaded: boolean;
  localPath?: string;
  mediaUrl?: string;
  sizeBytes?: number;
}

export interface VideoDownloadResult {
  success: boolean;
  videoUrl: string;
  localPath?: string;
  mediaUrl?: string;
  sizeBytes?: number;
  alreadyExisted?: boolean;
  canceled?: boolean;
  error?: string;
}
```

### 3.2 `XtractAPI` 增量契约 (`src/preload/index.ts`)
```ts
export interface XtractAPI {
  // ...既有方法保留
  downloadVideo: (params: {
    tweetId: string;
    authorUsername: string;
    videoUrl: string;
  }) => Promise<VideoDownloadResult>;
  cancelVideoDownload: (videoUrl: string) => Promise<{ canceled: boolean }>;
  getVideoStatus: (params: {
    tweetId: string;
    authorUsername: string;
    videoUrls: string[];
  }) => Promise<Record<string, LocalVideoStatus>>;
}
```

### 3.3 `AppConfigView` 增量字段
```ts
export interface AppConfigView {
  // ...既有字段保留
  autoDownloadVideos: boolean;
}
```

---

## 4. 关键决策记录

| 决策点 | 选定方案 | 为什么这么选 | 对用户的影响 | 放弃了什么 |
| :--- | :--- | :--- | :--- | :--- |
| **本地视频命名策略** | 基于 X 媒体 ID / URL 短哈希确定性命名（`<mediaId>_<stem>.mp4`） | 顺序无关、单点下载与批量导出路径 100% 一致，无需新增 SQLite 表维护映射 | 重复点击秒级幂等；删除推文无孤儿残留；Finder 内清晰可辨 | 放弃按序号 `1.mp4 / 2.mp4` 命名（单点下载第 3 个视频会与批量导出序号不一致） |
| **文章内嵌视频 Markdown 语法** | 标准 CommonMark 链接 + 可选 title：`🎬 [视频](url "poster=...")` | 任何外部 Markdown 工具都能正常可读渲染，不暴露丑陋 HTML 注释，又能保留封面给 Xtract 播放器 | 导出的 `index.md` 在 Obsidian/Typora 干净整洁，在 Xtract 内原生播放 | 放弃自定义 HTML `<video>` 裸标签（会被多处清洗且影响 Markdown 纯净性） |
| **本地离线播放方案** | 受控自定义协议 `xtract-media://` + HTTP Range `206` | `file://` 在 Vite dev (`http://localhost:5173`) 下会被同源安全策略拦截且缺乏目录沙箱隔离 | 开发态与打包态一致可用，支持离线秒开与自由拖动进度条，杜绝路径穿越 | 放弃放宽 `webSecurity: false` 或直接暴露 `file://` |
| **主进程下载代理处理** | 只要 `Config.HTTP_PROXY` 存在就显式挂载 `undici.ProxyAgent` | Electron 主进程内 Node `fetch` 不继承 Chromium session 代理，必须显式走 `ProxyAgent` | 无论 CLI 还是 GUI 桌面端，代理环境下都能稳定高速直连 `video.twimg.com` | 放弃依赖 Electron `net.fetch`（无法在纯 Node CLI / 单测环境复用同一套流式下载器） |
| **单点下载后同步 `index.md`** | 导出函数自动探测 `videos/` 已落盘文件并重写链接 | 单点下载视频后自动刷新归档索引，同时不会触发下载同篇其余未点击的视频 | 随时打开 `index.md` 都与本地已下视频保持一致 | 放弃手工正则修补 `index.md` 导致格式漂移 |

---

## 5. 测试策略

### 5.1 单元测试与集成测试清单（TDD 红阶段基准）
| 编号 | 测试文件 | 类型 | 测试用例点 | 覆盖 AC |
| :--- | :--- | :---: | :--- | :---: |
| UT-1 | `tests/article-embedded-cards.test.ts` | 单元 | `formatArticleContent` 对含视频的嵌入 `TWEET` 卡片输出 `🎬 [视频](url "poster=...")` 并把视频和封面收录到 `mediaUrls`；支持多视频嵌入推文及文章原生视频 `media_entities` | AC1.2 |
| UT-2 | `tests/studio-logic.test.ts` | 单元 | `extractMedia` 返回完整 `videos` 数组并按媒体 ID 精准配对封面；`extractInlineVideoUrls` 提取正文内联视频用于底部去重；非视频推文仍保持 `posterUrl === undefined` | AC1.1 |
| UT-3 | `tests/tweet-markdown.test.ts` | 单元 | `TweetMarkdown` 识别独立行与引用块中的 `🎬 [视频](url "poster=...")` 并就地渲染 `TweetVideoPlayer` | AC1.3 |
| UT-4 | `tests/video-downloader.test.ts` | 单元/集成 | 起真实本地 HTTP 模拟视频服务器：验证流式写入 `.part` → 原子重命名 `.mp4`、进度回调递增至 100%、幂等跳过已存在文件、`AbortSignal` 取消并清理 `.part`、HTTP 404/500 报错且清理 `.part` | AC2.1, AC2.2, AC2.4 |
| UT-5 | `tests/storage.test.ts` | 集成 | `exportSingleTweetMarkdown({ downloadVideos: true })` 下载视频至 `videos/` 并更新 `index.md` 为本地相对路径+保留原链；`downloadVideos: false` 时对已落盘视频仍自动关联；`deleteTweets` 级联清理 `videos/` 目录 | AC2.2, AC2.3 |
| UT-6 | `tests/media-protocol.test.ts` | 单元 | `resolveSafeMediaFilePath` 放行 `articlesDir` 内 `.mp4` 并拒绝 `../` 路径穿越与非法后缀；`parseByteRange` 正确计算单区间/开放区间/越界区间；`handleMediaProtocolRequest` 返回 `206 Partial Content` 字节片段与 `200 OK` | AC3.1 |
| UT-7 | `tests/ipc.test.ts` | 集成 | `IPC_CHANNELS` 含新视频通道；`VIDEO_STATUS` 返回本地落盘状态；`VIDEO_DOWNLOAD` 触发下载、推送进度事件、返回 `localPath` 与 `mediaUrl` 并同步更新 `index.md`；`CONFIG_GET`/`CONFIG_UPDATE` 支持 `autoDownloadVideos` | AC3.2, AC3.3, AC3.4 |
| UT-8 | `tests/cli-argv.test.ts` | 单元 | `resolveCliDownloadVideos` 优先级：`--download-videos` / `--no-download-videos` > `AUTO_DOWNLOAD_VIDEOS` > `false` | AC4.1 |

### 5.2 端到端与真机验证场景
| 编号 | 场景 | 验证内容 | 覆盖 AC |
| :--- | :--- | :--- | :---: |
| E2E-1 | GUI 播放器三态下载与取消 (`tests/gui-workbench.e2e.test.ts`) | 选中含视频推文 → 显示「下载视频」按钮 → 点击触发下载并接收进度事件展示百分比与取消按钮 → 完成后切换为「已下载 · 访达定位」与「本地离线」微标，`<video>` `src` 切换为本地 `mediaUrl` → 点击访达定位调用 `showItemInFolder` | AC3.2, AC3.3 |
| E2E-2 | GUI 文章内嵌视频渲染与设置开关 (`tests/gui-workbench.e2e.test.ts`) | 选中含内嵌视频推文的 X Article → 正文内就地渲染多个 `TweetVideoPlayer` → 设置抽屉中「导出归档时自动下载视频」默认关闭、可切换并保存 | AC1.3, AC3.4 |
| E2E-3 | CLI `--view --download-videos --json` (`tests/e2e.test.ts` + 真实样本 `2124098048842473619`) | 真机跑 `2124098048842473619` 抓取与视频下载验证：捕获全部 5 条内嵌视频推文，实际从 `video.twimg.com` 流式下载 MP4 落盘至 Page Bundle `videos/` 且文件非空可读、`index.md` 链接正确 | AC1.4, AC4.1, AC4.2 |

---

## 6. Task 拆分

| 编号 | 内容 | 覆盖 AC | 依赖 | 状态 |
| :--- | :--- | :--- | :--- | :---: |
| **T2.1** | 全形态视频解析增强：`formatArticleContent` 内嵌推文/原生视频标记、`fetchTweetThread` 补齐等待窗口、`extractMedia` 多视频与正文去重纯函数（TDD） | AC1.1, AC1.2 | 无 | ✅ 完成（`article-embedded-cards` 7/7 + `studio-logic` 59/59 pass, 0 err） |
| **T2.2** | 纯 Node.js 流式视频下载器（`video-downloader.ts`）+ `Storage.exportSingleTweetMarkdown` 视频落盘/自动关联 `index.md` + 级联删除回归（TDD） | AC2.1–AC2.4 | T2.1 | ✅ 完成（`video-downloader` 5/5 + `storage` 13/13 pass, 0 err） |
| **T2.3** | 受控本地媒体协议 `xtract-media://`（路径安全校验 + HTTP Range `206`）与 Electron 主进程注册（TDD） | AC3.1 | T2.2 | ✅ 完成（`media-protocol.test.ts` 3/3 pass, `eslint` 0 err, `tsc` 0 err） |
| **T2.4** | IPC 通道（`VIDEO_DOWNLOAD` / `VIDEO_DOWNLOAD_CANCEL` / `VIDEO_STATUS` + `AUTO_DOWNLOAD_VIDEOS` 配置）与 Preload/Renderer API 契约（TDD） | AC3.2–AC3.4 | T2.2, T2.3 | ✅ 完成（`ipc.test.ts` 10/10 pass, `eslint` 0 err, `tsc` 0 err） |
| **T2.5** | GUI 播放器三态下载交互（`TweetVideoPlayer`）、文章内联视频渲染（`TweetMarkdown` + `TweetDetailPane`）、设置自动下载开关（`SettingsDrawer`）与 GUI E2E（TDD） | AC1.1, AC1.3, AC3.2–AC3.4 | T2.1, T2.4 | ✅ 完成（`tweet-markdown` 7/7 + `gui-workbench.e2e` 21/21 pass, `eslint` 0 err, `tsc` 0 err） |
| **T2.6** | CLI `--download-videos` / `--no-download-videos` 支持（`--view` & `--export-ids`）、`x-web` SSR 文章抓取兼容与 3 篇真实 X Article 真机验证、`pnpm verify` 全量验收（TDD） | AC1.4, AC4.1, AC4.2 | T2.2–T2.5 | ✅ 完成（`pnpm verify` 5/5 门禁，357/357 tests, Smoke 4/4） |

---

## 7. 界面与 F / AC 映射

对应高保真原型文件：[prototype-v0.1.3-m2.html](../prototype/prototype-v0.1.3-m2.html)

### 7.1 界面元素与 AC 映射
| 原型区块 | 控件与 ID / class | 对应 F / AC | 交互说明 |
| :--- | :--- | :--- | :--- |
| 视频播放器底栏 — 未下载态 | 主操作按钮 `.video-download-btn`（「⬇️ 下载视频」）、辅助按钮「复制直链 / 浏览器 / 原帖」 | F3 / AC3.2 | 点击立即发起主进程流式下载，按钮切入下载中态 |
| 视频播放器底栏 — 下载中态 | 纤细进度条 `.video-download-progress` + 实时文案（`下载中 42% · 12.4 / 29.5 MB`）+ `[✕ 取消]` 按钮 `.video-cancel-btn` | F2 / AC2.1, F3 / AC3.2 | 接收 IPC 进度事件平滑更新；点击取消中断流并恢复未下载态 |
| 视频播放器底栏 — 已下载态 | 绿玉色微标 `.badge-ok`（「本地离线」+ 体积）+ `[✓ 已下载 · 访达定位]` 按钮 `.video-reveal-btn` | F3 / AC3.2, AC3.3 | `<video>` 自动切换至 `xtract-media://` 本地源离线秒播；点击在系统文件管理器高亮该 `.mp4` |
| 视频播放器底栏 — 下载失败态 | 暖琥珀/朱砂错误反馈条 + `[🔄 重试下载]` 按钮 | F2 / AC2.4 | 明确告知错误原因，一键重试，不静默失败 |
| X Article 专栏正文区 | 嵌入推文引用卡片内的就地 `TweetVideoPlayer` | F1 / AC1.2, AC1.3 | 每个含视频的内嵌推文卡片各自独立播放与下载，文章底部不重复渲染 |
| 设置抽屉 → 「抓取过滤规则」 | 新增卡片「导出归档时自动下载视频」 + `InfoTip` + `#auto-download-videos-toggle` 开关 | F3 / AC3.4 | 默认关闭；开启后导出 Page Bundle 自动顺带下载视频 |

### 7.2 视觉规范（对齐 `src/renderer/src/index.css`）
- **配色令牌**：沿用暖纸墨色朱砂体系——进度条填充与「下载视频」主强调态使用 `--cinnabar: #b5462f` / `--cinnabar-wash: #f6e7df`；「本地离线」微标与「已下载」态使用 `--jade: #3f6b51` / `--jade-wash: #e6efe7`；错误提示条使用 `--cinnabar-wash` 与 `--cinnabar`。
- **布局与克制**：下载进度条高 `3px` 贴合于视频画面与底栏交界处，不占额外高度；按钮统一高度 `28px`、`font-size: 12px`；设置开关说明一律收纳于 `InfoTip`。

---

## 8. 验收记录

> **验收日期**：2026-11-24
> **门禁命令**：`pnpm verify`（`pnpm lint && pnpm test && tsc --noEmit && pnpm build && pnpm pack:dir && pnpm smoke`）
> **验收结果**：✅ 五道门禁 100% 通过，3 篇真实线上 X Article 实测验证通过，待人工审批进入 `v0.1.3` 发布阶段。

### 8.1 五道质量门禁实测结果
| 门禁 | 执行命令 | 实测结果 |
| :--- | :--- | :--- |
| 1. 代码风格 | `pnpm lint` | ✅ 0 Error（仅存量 react-hooks warning） |
| 2. 自动化测试 | `pnpm test` | ✅ **28/28 测试文件、357/357 用例全部通过**（含 21/21 GUI E2E Flow） |
| 3. 静态类型 | `tsc --noEmit` | ✅ 0 Error |
| 4. 生产构建 | `pnpm build` | ✅ Renderer (136ms) + Main (32ms) + Preload (6ms) 0 Error |
| 5. 打包产物 Smoke | `pnpm pack:dir && pnpm smoke` | ✅ 4/4 通过（`--version`、`--help`、`--list` 打包态 SQLite、无参 GUI 存活） |

### 8.2 三篇真实 X Article 真机验证记录（沙箱隔离，已全部清理）
1. **`https://x.com/AdrianPunk115/status/2124098048842473619`**（内嵌 5 条视频推文，共 17 个内联视频）
   - 解析完整捕获 5/5 嵌入推文与 17/17 视频标记；
   - 经代理 `http://127.0.0.1:8118` 真机流式下载 3 段代表性视频（0.14 MB / 55.85 MB 1080p / 99.90 MB 4K），全部通过 MP4 `ftyp` 文件头校验，`index.md` 写入 3 条相对路径链接，级联删除确认连带清空 `videos/` 目录。
2. **`https://x.com/xaiwind/status/2124724609358631007`**（X 新版 `x-web` TanStack Router SSR 专栏，无视频）
   - 触发无头 403 自动切换可见 Chrome 窗口，6.0s 抓取全文（8,102 字、9 段 `MARKDOWN` 代码块、15 张图）；
   - 3.6s 完成 Page Bundle 导出与 15 张图片本地化，`index.md` 全部重写为相对路径。
3. **`https://x.com/dashiAIxz/status/2124087160907403401`**（X 新版 `x-web` SSR 专栏 + 9 个原生 `ApiVideo` + 1 条内嵌 10 分钟 4K 推文视频）
   - 6.5s 抓取全文（8,253 字、5 段代码块、16 张配图、10 个视频全部识别）；
   - 9 个原生 `ApiVideo`（0.56–4.47 MB）与 26 张图 100% 落盘并通过 `ftyp` 校验；第 10 个 10 分钟 4K 视频实测流式写入 712+ MB 时暴露了原 10 分钟固定总时长超时缺陷，已立即升级为「60 秒无字节到达空闲超时」并补充回归测试 `UT-4f`。

### 8.3 AC 验收矩阵（AC1.1–AC4.2）
| AC | 验收结论 | 证据 |
| :--- | :---: | :--- |
| AC1.1–AC1.4（全形态视频解析与去重） | ✅ | `tests/article-embedded-cards.test.ts` (10/10) + `tests/studio-logic.test.ts` (59/59) + 3 篇真机样本 |
| AC2.1–AC2.4（流式下载、Page Bundle 归档、级联删除、容错清理） | ✅ | `tests/video-downloader.test.ts` (7/7，含代理与空闲超时回归) + `tests/storage.test.ts` (13/13) |
| AC3.1–AC3.4（`xtract-media://` Range 206 离线播放、播放器三态、自动下载开关） | ✅ | `tests/media-protocol.test.ts` (3/3) + `tests/ipc.test.ts` (10/10) + `tests/gui-workbench.e2e.test.ts` Flow 20 & 21 |
| AC4.1–AC4.2（CLI `--download-videos` / `--no-download-videos` 与 JSON 输出） | ✅ | `tests/cli-argv.test.ts` + `tests/cli-batch.test.ts` + `tests/e2e.test.ts` (8/8) |
