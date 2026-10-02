# Proposal

> 事后补记（2026-10-02 归档时回填）：该增量在发版执行中直接落地，归档时补建规范文档。

## Why

v0.1.0 为首个双平台发布版本（用户决策：Windows 随 v0.1.0 首发），但此前只有 macOS 的本地打包能力，且所有质量门禁只在本机运行——「开发态全绿、打包态失效」的形态差异缺陷（dmg 用户进不了 CLI）正是这一盲区的真实产物。

## What Changes

- **electron-builder 增加 win target**（NSIS，x64，`build/icon.png` 自动转 ico）；`npmRebuild: false`——better-sqlite3 v13 自带全平台 prebuilds，开启会触发 node-gyp 交叉编译并失败（探针实测）；
- **smoke 脚本平台化**：按运行平台自动探测产物（`win-unpacked/Xtract.exe` / `mac-arm64/Xtract.app`），同一门禁双平台可用；
- **GitHub Actions 双平台矩阵**（`release.yml`）：tag 触发 → 每平台全量测试/tsc/build/electron-builder/smoke → Release 汇聚双产物；`workflow_dispatch` 供演练；公有仓库免费；
- **E2E 属地化**：GUI E2E 依赖真实本地 Vite+Chrome+代理，CI 自动排除（用户明确要求），CI 为纯单元/集成门禁；
- **本地打包命令**：`pack:mac` / `pack:win` / `pack:all`（替代语义模糊的 `build:app`）。注意 CLI 的 arch 参数与 yml target 配置是「并集」，组合命令不得再传 `--x64/--arm64`。

## 附带修复（CI 首轮即抓到的真实缺陷）

1. `process.exit` 在 CI 的 Electron 环境不立即生效，`--version` 输出后掉进 default 分支执行抓取流水线 → CLI 全面改为显式控制流（`exitOverride` + 统一 `finish`）；
2. darwin 路径拼接改用 `path.posix`（与 win32 分支对称），跨平台可测；
3. Windows 下 SQLite 句柄延迟释放（EPERM）、`execFile('pnpm')` 需 `cmd /c` 中转、`/tmp` 字面量解析到盘符根等跨平台测试适配。

## Impact

- `.github/workflows/release.yml`（新建）、`electron-builder.yml`、`scripts/smoke-packaged.ts`、`package.json`（pack 系列 + packageManager 锁定）；
- 文档：`docs/operations.md` §10（发版流程 + 本地打包 + 关键配置备忘）、README 下载章节、产品规格增量记录于 `docs/prd/v0.1.1.md` §4（发布管线）；
- v0.1.0 已按此管线发布（tag → 双平台构建 → Release 挂 DMG+EXE）。
