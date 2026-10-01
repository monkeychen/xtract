# Tasks

## 1. 核心编排层（TDD）

- [x] 1.1 `tests/cli-shortcut.test.ts` 先行红灯：平台 spec、cmd shim、rc 幂等判定、真实 fs 编排、PowerShell stub
- [x] 1.2 `getShortcutSpec`：darwin 软链 spec（$SHELL → .zshrc/.bashrc/null）；win32 shim spec（`path.win32` 确定性拼接）；其余平台 null
- [x] 1.3 `createCliShortcut`：开发态拒绝 → mkdir → 创建入口（lstat 存在性判断，existsSync 对悬空软链返回 false 的陷阱）→ PATH 修复 → 中文状态汇总
- [x] 1.4 win32 PowerShell script：`GetEnvironmentVariable('Path','User')` + `-notlike` 幂等 + 失败降级 pathHint
- [x] 1.5 19/19 全绿

## 2. IPC / preload / 渲染层

- [x] 2.1 `CLI_CREATE_SHORTCUT` 通道 + `CliShortcutResult` 类型（preload 为契约单一来源）
- [x] 2.2 IPC handler 组装 deps（`app.isPackaged` / `process.execPath` / `os.homedir()` / `$SHELL`）
- [x] 2.3 SettingsDrawer「命令行」区块：按钮 + InfoTip + 常驻状态反馈；api.ts 方法

## 3. 验证

- [x] 3.1 E2E Flow 19：mock 桥 → 设置抽屉点击 → 反馈渲染断言（19 Flows 全绿）
- [x] 3.2 生产态实机验证：CDP 驱动打包产物真实点击（HOME 沙箱化），断言软链指向真实 exe、.zshrc PATH 写入、UI 反馈
- [x] 3.3 `pnpm verify` 五道门禁全绿

## 4. 文档

- [x] 4.1 README / cli-reference 安装用户章节：引导设置页一键创建，保留完整路径方式
- [x] 4.2 PRD §4.7.5 门禁描述修正为五道（上轮遗漏）+ 新增 §4.7.6
