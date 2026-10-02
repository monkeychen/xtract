# Proposal

## Why

dmg 安装用户没有 pnpm/Node，此前用 CLI 只能敲完整路径或手工 `sudo ln -sf`（README 引导），门槛高且非首次使用体验差。设置页需要一键「创建命令行快捷方式」，且**必须在生产态（打包安装后）真实可用**，macOS 与 Windows 按各自平台惯例实现。

## What Changes

- **新增 `src/main/cli/shortcut.ts`**：平台差异纯函数（`getShortcutSpec` / `buildCmdShim` / `rcNeedsPathFix`）+ 跨平台编排（`createCliShortcut`）：
  - macOS：`~/bin/xtract` bash shim（`exec` 指向 `process.execPath`）+ PATH 条目自动写入 shell rc（`$SHELL` 识别 zsh/bash，其余降级为手动指引）。**变更记录（真机验收后）**：原实现为符号链接，实测软链启动会让 Electron 按软链目录定位 Helper.app 而 FATAL 刷屏，已改为 shim 并支持旧软链自动迁移；
  - Windows：`~/bin/xtract.cmd` shim（`@echo off` + 引号路径 + `%*`）；用户 PATH 经 PowerShell `[Environment]::SetEnvironmentVariable` 写注册表（`%USERPROFILE%` 不展开，必须传实际路径）；
  - 幂等：已存在且指向正确 → `alreadyExists`；被占用 → 报冲突不覆盖；PATH 条目已存在不重复追加；
  - 仅安装版可用（`app.isPackaged`），开发态明确提示。
- **IPC `cli:create-shortcut`**：main 组装 deps（`process.execPath` / `os.homedir()` / `app.isPackaged` / `$SHELL`）调用编排层。
- **设置抽屉新增「命令行」区块**：创建按钮 + `i` 图标说明 + 常驻状态反馈（宪法：状态类信息是反馈不是说明）。
- **存在性判断必须用 `lstat`**：`fs.existsSync` 对「指向不存在目标的软链」返回 false，悬空链接场景会 EEXIST——探针实测踩中。

## Non-goals

- 不新增 CLI 侧创建快捷方式的命令（该功能的受众正是图形界面用户）。
- Windows 打包配置暂不加入 electron-builder（当前仅发布 mac 产物），但代码分支与测试就绪，Windows 构建启用后即生效。

## Impact

- 主进程：`src/main/cli/shortcut.ts`（新建）；`src/main/ipc/index.ts` 注册 handler。
- preload：`channels.ts` + `index.ts`（`CliShortcutResult` 契约单一来源，main 侧 re-export）。
- 渲染层：`SettingsDrawer.tsx` 新区块；`services/api.ts` 新方法。
- 测试：`tests/cli-shortcut.test.ts`（19 例：平台 spec、shim 内容、幂等判定、真实 fs + 临时 home 编排、PowerShell 注入 stub、开发态/不支持平台拒绝）；E2E Flow 19（mock 桥反馈渲染）。
- 实机验证：`scratch/verify_shortcut_packaged.mjs` 经 CDP 驱动**真实打包产物**点击真实按钮走真实 IPC（`HOME` 指向临时目录使软链落沙箱）。
- 文档：README / cli-reference 安装用户章节改为引导一键创建；PRD §4.7.5 门禁修正为五道 + 新增 §4.7.6。
