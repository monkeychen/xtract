# Proposal

## Why

两处已确认的缺口：

1. **GUI / CLI 能力不对齐**：GUI 工作台支持勾选多篇推文「批量删除」「批量导出为 Page Bundle」，而 CLI 的 `--delete` 只接受单个 ID、`--export` 只能按条数导出清单文档。同一二进制双模运行的架构承诺下，CLI 使用者（含 Agent 管道）无法完成 GUI 已有的批量操作。
2. **打包态零验证覆盖**：CLI/GUI 模式判定依赖 argv 结构，开发态测试（277 用例）全部通过也拦不住「打包后 argv 少一层脚本路径」的形态差异——历史上已真实发生过 dmg 用户完全进不了 CLI 的 P0 缺陷（e7c1318 修复）。门禁必须对真实产物启动验证。

## What Changes

1. **CLI 批量删除**：`--delete` 升级为可选变参 `[tweetIds...]`——可传多个 ID/URL（空格或逗号分隔、自动去重清洗），复用既有 dry-run 预览 / `-y` 确认 / 级联清理链路；单 ID 与纯筛选条件用法完全向后兼容。
2. **CLI 批量导出**：新增 `--export-ids <tweetIds...>`，逐篇生成自包含 Page Bundle（`output/{author}/{tweet_id}/index.md` + 配图），本地缺失的推文先尝试在线抓取（与 GUI 勾选批量导出行为一致）。逐条容错：单篇失败仅记入 `failed`，不中断批次；全部失败退出码 1。不支持 `-o`（每篇独立目录，路径会冲突），报错引导单篇用 `--view <ID> -o`。
3. **打包 Smoke 门禁**：新增 `scripts/smoke-packaged.ts` + `pnpm pack:dir` / `pnpm smoke` 脚本，纳入 `pnpm verify`（第 5 道门禁）。对真实 `Xtract.app` 产物验证三种启动形态：无参 GUI 进程存活、`--version`/`--help` 输出正确、`--list` 打包态读 SQLite。全部子进程注入隔离的 `XTRACT_STORAGE_ROOT` 临时目录，绝不触碰用户真实数据。

## Non-goals

- 不新增按 ID 批量导出的 `-o` 路径定制（单篇需求由 `--view` 覆盖）。
- Smoke 门禁仅覆盖 macOS（项目当前只发布 mac 产物）；非 darwin 平台脚本自动跳过并 exit 0。

## Impact

- `src/main/cli/argv.ts`：新增 `normalizeTweetIdInputs()` 纯函数；
- `src/main/pipeline/index.ts`：新增 `exportTweetsByIds()`（依赖注入可测）与 `BatchExportResult` 类型；
- `src/main/index.ts`：`--delete` 变参化、新增 `--export-ids` 分支；
- `scripts/smoke-packaged.ts`（新建）、`package.json`（pack:dir / smoke / verify 链路）；
- 测试：`tests/cli-batch.test.ts`（10 例，先红后绿）；
- 文档：README 速查表（并修正 `--export <推文ID>` 的既有错误）、cli-reference.md（§4.6-4.7、§4.17）、CLAUDE.md 门禁章节升级为五道。
