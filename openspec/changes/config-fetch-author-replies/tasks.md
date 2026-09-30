# Tasks

## 1. 配置模型与数据持久化

- [x] 1.1 在 `src/main/config.ts` 的 `AppConfig` 接口中新增 `fetchAuthorReplies: boolean` 字段，设置默认值为 `false`，并支持读取 `process.env.FETCH_AUTHOR_REPLIES`，验证加载默认配置返回 `fetchAuthorReplies: false`
- [x] 1.2 在 `src/preload/index.ts` 的 `AppConfigView` 与 IPC 类型定义中增加 `fetchAuthorReplies: boolean`，验证类型定义完整对齐

## 2. CLI 命令行控制选项与缓存自愈

- [x] 2.1 在 `src/main/index.ts` 中注册 `--author-replies` 与 `--no-author-replies` 选项，清晰标注帮助说明，验证 `pnpm dev:cli -- --help` 正确输出两个选项
- [x] 2.2 实现 CLI 模式参数优先级解析逻辑（`CLI 选项 > 环境变量 > 配置文件 > 默认 false`）
- [x] 2.3 在 CLI `--view <id>` 执行流中增加缓存自愈检测：当用户传入 `--author-replies` 但本地尚未抓取追评时，主动触发网络抓取以补全推文串并持久化

## 3. 设置中心 UI 交互实现

- [x] 3.1 在 `src/renderer/src/components/SettingsDrawer.tsx` 的「抓取与内容过滤」卡片组中新增「抓取作者追评与追加回复 (Author Replies & Thread)」卡片式开关控件，文案清晰阐明默认仅抓取主推文本体
- [x] 3.2 绑定 Switch 状态与 `onUpdateConfig({ fetchAuthorReplies: nextVal })` 回调，验证前端操作时配置即时更新且重新打开抽屉能读取最新状态

## 4. 客户端抓取与流水线过滤

- [x] 4.1 扩展 `src/main/client/index.ts` 中的 `fetchTweetThread`，支持 `options?: { fetchAuthorReplies?: boolean; timeout?: number }` 参数；当为 `false`（默认）时严格过滤掉作者追评推文，仅返回与目标 ID 匹配的主推文
- [x] 4.2 在 `src/main/pipeline/index.ts` 中的 `fetchTweetAndStore` 中接入生效的 `fetchAuthorReplies`，确保默认情况下不将多余追评写入 SQLite 数据库
- [x] 4.3 调整 `src/main/storage/index.ts` 中的 `exportSingleTweetMarkdown` 逻辑：当未开启抓取追评且本地无追评时，仅以单篇主推文正文生成 `index.md`，杜绝冗余 `### 篇章 2/3...` 碎片拼接

## 5. 全量自动化测试与三道质量门禁验证

- [x] 5.1 编写并运行单元与集成测试（覆盖 CLI 选项解析、配置默认值、推文过滤逻辑），运行 `pnpm test` 确保 100% 通过（0 Failed）
- [x] 5.2 运行静态类型安全校验：`npx tsc --noEmit`，确保无类型错误（0 Error）
- [x] 5.3 运行前端与应用生产构建：`npx vite build`，确保生产打包 0 Error / 0 Warning
