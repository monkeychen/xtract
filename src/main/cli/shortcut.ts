/**
 * 「创建命令行快捷方式」：平台差异纯函数 + 跨平台编排
 *
 * 回归背景：dmg 安装用户没有 pnpm，此前只能手工 sudo ln -sf 才能用 CLI。
 * 该功能由设置页一键触发，在生产态（打包安装后）于 ~/bin 下创建 xtract 命令入口：
 *   - macOS：符号链接 → Xtract.app 内的可执行文件；PATH 写入 shell rc（zsh/bash）
 *   - Windows：.cmd shim 脚本（符号链接需要管理员权限，shim 是 npm/pip 的业界做法）；
 *     PATH 写入注册表用户环境（PowerShell [Environment]）
 *
 * 所有 IO 均通过 deps 注入（homeDir / runPowerShell / isPackaged），编排可测。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { CliShortcutResult } from '../../preload/index.js';

export type { CliShortcutResult };

export interface ShortcutSpec {
  binDir: string;
  linkPath: string;
  targetPath: string;
  /** darwin 专用：PATH 修复的目标 rc 文件；null 表示无法识别 shell，不自动改写 */
  rcFile: string | null;
  /** darwin: export 语句；win32: 需要加入用户 PATH 的目录 */
  pathEntry: string;
  /** win32 专用：shim 脚本内容 */
  shimContent?: string;
}

export interface ShortcutDeps {
  platform: NodeJS.Platform;
  execPath: string;
  homeDir: string;
  /** 仅打包安装版可用；开发态 execPath 指向 electron 二进制，链接无意义 */
  isPackaged: boolean;
  /** darwin 依据 $SHELL 选择 rc 文件 */
  shell: string;
  /** win32 专用：执行 PowerShell 修改用户 PATH（真实实现调 powershell.exe） */
  runPowerShell: (script: string) => Promise<void>;
}

const RC_ENTRY = 'export PATH="$HOME/bin:$PATH"  # Added by Xtract CLI shortcut';

/** 平台差异纯函数：给出软链/shim 路径、目标与 PATH 修复方案；不支持的平台返回 null */
export function getShortcutSpec(input: {
  platform: 'darwin' | 'win32' | 'other';
  execPath: string;
  homeDir: string;
  shell?: string;
}): ShortcutSpec | null {
  if (input.platform === 'darwin') {
    // 固定 posix 语义：符号链接与 shell rc 的路径永远按 macOS 约定解释，
    // 与生成 spec 的运行平台无关（Windows CI 上同样可测 darwin 行为）
    const binDir = path.posix.join(input.homeDir, 'bin');
    const shell = (input.shell || '').toLowerCase();
    const rcFile = shell.includes('zsh')
      ? path.posix.join(input.homeDir, '.zshrc')
      : shell.includes('bash')
      ? path.posix.join(input.homeDir, '.bashrc')
      : null;
    return {
      binDir,
      linkPath: path.posix.join(binDir, 'xtract'),
      targetPath: input.execPath,
      rcFile,
      pathEntry: RC_ENTRY,
    };
  }

  if (input.platform === 'win32') {
    // 固定用 win32 语义拼接：spec 可能在任意平台的测试/工具链中生成
    const binDir = path.win32.join(input.homeDir, 'bin');
    return {
      binDir,
      linkPath: path.win32.join(binDir, 'xtract.cmd'),
      targetPath: input.execPath,
      rcFile: null,
      pathEntry: binDir,
      shimContent: buildCmdShim(input.execPath),
    };
  }

  return null;
}

/** Windows .cmd shim：符号链接在 Windows 需要管理员权限/开发者模式，cmd 脚本是标准替代 */
export function buildCmdShim(targetPath: string): string {
  return `@echo off\r\n"${targetPath}" %*\r\n`;
}

/** rc 文件是否需要追加 PATH：已含 ~ 写法、$HOME 写法或展开绝对路径时视为已配置（rc 内容恒为 posix 风格） */
export function rcNeedsPathFix(rcContent: string, homeDir: string): boolean {
  return (
    !rcContent.includes('$HOME/bin') && !rcContent.includes('~/bin') && !rcContent.includes(path.posix.join(homeDir, 'bin'))
  );
}

export async function createCliShortcut(deps: ShortcutDeps): Promise<CliShortcutResult> {
  if (!deps.isPackaged) {
    return {
      ok: false,
      pathFixed: false,
      message: '当前为开发态运行，仅安装版（dmg 安装后的应用）支持创建命令行快捷方式。',
    };
  }

  const platformKey = deps.platform === 'darwin' || deps.platform === 'win32' ? deps.platform : 'other';
  const spec = getShortcutSpec({
    platform: platformKey,
    execPath: deps.execPath,
    homeDir: deps.homeDir,
    shell: deps.shell,
  });

  if (!spec) {
    return { ok: false, pathFixed: false, message: `当前平台（${deps.platform}）暂不支持创建命令行快捷方式。` };
  }

  fs.mkdirSync(spec.binDir, { recursive: true });

  // 1. 创建命令入口（软链 / shim），已存在时幂等或报冲突。
  //    注意必须用 lstat 判断存在性：existsSync 对「指向不存在目标的软链」返回 false，
  //    会导致悬空链接场景下 symlink 报 EEXIST。
  let alreadyExists = false;
  const existingStat = fs.lstatSync(spec.linkPath, { throwIfNoEntry: false });
  if (existingStat) {
    const sameTarget =
      deps.platform === 'darwin'
        ? existingStat.isSymbolicLink() && fs.readlinkSync(spec.linkPath) === spec.targetPath
        : existingStat.isFile() && fs.readFileSync(spec.linkPath, 'utf-8') === spec.shimContent;
    if (!sameTarget) {
      return {
        ok: false,
        pathFixed: false,
        linkPath: spec.linkPath,
        message: `${spec.linkPath} 已被其他程序占用，为避免覆盖请手动处理后重试。`,
      };
    }
    alreadyExists = true;
  } else if (deps.platform === 'darwin') {
    fs.symlinkSync(spec.targetPath, spec.linkPath);
  } else {
    fs.writeFileSync(spec.linkPath, spec.shimContent!, 'utf-8');
  }

  // 2. PATH 修复
  let pathFixed = false;
  let pathHint: string | undefined;

  if (deps.platform === 'darwin') {
    if (!spec.rcFile) {
      pathHint = `未能识别受支持的 shell（当前仅自动配置 zsh/bash）。请手动将 ~/bin 加入 PATH，例如在 shell 配置中加入：${spec.pathEntry}`;
    } else if (fs.existsSync(spec.rcFile)) {
      const content = fs.readFileSync(spec.rcFile, 'utf-8');
      if (rcNeedsPathFix(content, deps.homeDir)) {
        fs.appendFileSync(spec.rcFile, `\n${spec.pathEntry}\n`, 'utf-8');
        pathFixed = true;
      }
    } else {
      fs.writeFileSync(spec.rcFile, `# Created by Xtract\n${spec.pathEntry}\n`, 'utf-8');
      pathFixed = true;
    }
  } else {
    // win32：注册表用户 PATH。%USERPROFILE% 在 SetEnvironmentVariable 中不展开，必须传实际路径
    const script =
      `$p=[Environment]::GetEnvironmentVariable('Path','User');` +
      `if($p -eq $null){[Environment]::SetEnvironmentVariable('Path','${spec.pathEntry}','User')}` +
      `elseif($p -notlike '*${spec.pathEntry}*'){[Environment]::SetEnvironmentVariable('Path',$p+';${spec.pathEntry}','User')}`;
    try {
      await deps.runPowerShell(script);
      pathFixed = true;
    } catch {
      pathHint = `已创建 xtract.cmd，但写入用户 PATH 失败。请手动将 ${spec.binDir} 加入「环境变量 → 用户变量 → Path」。`;
    }
  }

  // 3. 面向用户的状态汇总（反馈引导行动：告知下一步——新开终端生效）
  const parts: string[] = [];
  if (alreadyExists) {
    parts.push(`命令已存在：${spec.linkPath}（指向正确，无需重复创建）`);
  } else {
    parts.push(`已创建命令：${spec.linkPath}`);
  }
  if (pathFixed) {
    parts.push(deps.platform === 'darwin' ? `PATH 已写入 ${spec.rcFile}` : '已将命令目录加入用户 PATH');
  }
  if (pathHint) {
    parts.push(pathHint);
  }
  parts.push('新开一个终端窗口即可使用 xtract 命令。');

  return {
    ok: true,
    linkPath: spec.linkPath,
    targetPath: spec.targetPath,
    pathFixed,
    pathHint,
    alreadyExists,
    message: parts.join('；'),
  };
}

/** 生产态真实 PowerShell 执行器（win32 专用） */
export function runPowerShellForReal(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 15_000 },
      (err) => (err ? reject(err) : resolve())
    );
  });
}
