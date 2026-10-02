# Tasks

## 1. Windows 打包

- [x] 1.1 探针：mac 上 cross-build 出 `Xtract.exe`；发现默认取宿主 arch（arm64，无 SQLite prebuild），必须显式 x64
- [x] 1.2 `npmRebuild: false`（prebuilds 直用，node-gyp 不支持交叉编译）
- [x] 1.3 win target 落地（NSIS/x64/icon 自动转换），本地 `pack:win` 产出与 CI 同规格 exe

## 2. CI 双平台

- [x] 2.1 `release.yml`：tag 触发矩阵（macos/windows）+ Release 汇聚 + workflow_dispatch 演练
- [x] 2.2 六轮迭代验证全绿；期间修复 CLI 显式控制流（process.exit 失效）、跨平台测试适配、E2E 属地化等真实缺陷
- [x] 2.3 v0.1.0 正式发布：tag → 双平台全绿 → Release 挂 `Xtract-0.1.0-arm64.dmg` + `Xtract-Setup-0.1.0.exe`

## 3. 本地打包命令

- [x] 3.1 `pack:mac` / `pack:win` / `pack:all`（替代 build:app），实跑验证双产物
- [x] 3.2 修正 pack:all 的 arch 并集陷阱（不传 arch，交给 yml）

## 4. 文档

- [x] 4.1 operations.md §10：发版流程 / 本地打包 / 关键配置备忘 / 发版前演练
- [x] 4.2 README 下载章节、PRD 平台矩阵
