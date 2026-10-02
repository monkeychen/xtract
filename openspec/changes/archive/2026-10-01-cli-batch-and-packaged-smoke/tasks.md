# Tasks

## 1. CLI 批量能力（TDD）

- [x] 1.1 新建 `tests/cli-batch.test.ts`：`normalizeTweetIdInputs`（逗号分隔/URL 提取/去重/噪声过滤）与 `Pipeline.exportTweetsByIds`（本地直出/缺失先抓/逐条容错/空输入），确认**红灯**（10/10 failed）
- [x] 1.2 `src/main/cli/argv.ts` 实现 `normalizeTweetIdInputs()`，转绿
- [x] 1.3 `src/main/pipeline/index.ts` 实现 `exportTweetsByIds()` 与 `BatchExportResult` 类型
- [x] 1.4 `src/main/index.ts`：`--delete [tweetIds...]` 变参化，多 ID 走 `deleteTweets({ tweetIds })`，保留 dry-run / `-y` / 筛选条件兼容
- [x] 1.5 `src/main/index.ts`：新增 `--export-ids` 分支（拒绝 `-o`、全失败退出码 1、`--json` 输出 exported/failed）
- [x] 1.6 隔离数据目录下真实功能验证 7 项：批量 dry-run / 批量删除 / 列表复核 / Page Bundle 落盘 / 部分失败续跑 / 全失败退出码 / `-o` 拒绝（scratch/verify_cli_batch.ts，全部通过）

## 2. 打包 Smoke 门禁

- [x] 2.1 新建 `scripts/smoke-packaged.ts`：定位产物二进制、注入隔离 `XTRACT_STORAGE_ROOT`、四种检查（无参 GUI 存活 / --version / --help 含新选项 / --list 读 SQLite）、超时与 SIGTERM→SIGKILL 清理
- [x] 2.2 `package.json` 新增 `pack:dir`（electron-builder --dir，免 DMG 步骤）与 `smoke` 脚本
- [x] 2.3 `verify` 链路升级：`vite build` → `pnpm build`（补齐 Electron 编译）+ `pack:dir && smoke`
- [x] 2.4 **反向验证 smoke 有效性**：对旧产物运行 smoke，确认精确抓到 `--export-ids` 缺失（1/4 failed）；重打包后 4/4 全绿

## 3. 文档

- [x] 3.1 `docs/cli-reference.md`：help 块同步、§4.7 新增 `--export-ids`、§4.17 增补批量删除语法、§4.8 起顺延重编号
- [x] 3.2 `README.md`：速查表增补批量命令，**修正既有错误** `--export <推文ID>`（--export 接条数不接 ID）；门禁章节同步五道
- [x] 3.3 `GEMINI.md`（宪法）：§5 门禁升级为五道，记录第 5 道门禁存在的原因
