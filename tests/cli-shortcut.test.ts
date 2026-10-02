import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getShortcutSpec,
  buildCmdShim,
  rcNeedsPathFix,
  createCliShortcut,
  type ShortcutDeps,
} from '../src/main/cli/shortcut.js';

/**
 * 设置页「创建命令行快捷方式」
 *
 * 回归背景：dmg 安装用户没有 pnpm，此前需要手工 sudo ln -sf 才能用 CLI。
 * 该功能在 ~/bin 下创建 xtract 命令入口，且必须在生产态（打包安装后）可用；
 * macOS 用符号链接 + shell rc 追加 PATH，Windows 用 .cmd shim + 用户 PATH 注册表。
 */

const MAC_EXE = '/Applications/Xtract.app/Contents/MacOS/Xtract';
const WIN_EXE = 'C:\\Program Files\\Xtract\\Xtract.exe';

function makeDeps(overrides: Partial<ShortcutDeps>, homeDir: string): ShortcutDeps {
  return {
    platform: 'darwin',
    execPath: MAC_EXE,
    homeDir,
    isPackaged: true,
    shell: '/bin/zsh',
    runPowerShell: async () => {},
    ...overrides,
  };
}

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xtract-shortcut-'));
}

// darwin 符号链接编排依赖 POSIX symlink 特权，Windows（尤其无开发者模式的 CI）无法模拟；
// 这些行为只会在 macOS 上真实发生，标记为 mac 专属
const itMacOnly = process.platform === 'win32' ? it.skip : it;

describe('getShortcutSpec（平台差异纯函数）', () => {
  it('darwin：shim 脚本到 ~/bin/xtract，zsh 对应 ~/.zshrc', () => {
    const spec = getShortcutSpec({ platform: 'darwin', execPath: MAC_EXE, homeDir: '/Users/a', shell: '/bin/zsh' });
    expect(spec).not.toBeNull();
    expect(spec!.linkPath).toBe('/Users/a/bin/xtract');
    expect(spec!.targetPath).toBe(MAC_EXE);
    expect(spec!.rcFile).toBe('/Users/a/.zshrc');
    expect(spec!.pathEntry).toContain('export PATH="$HOME/bin:$PATH"');
    // macOS 也用 shim 而非符号链接：软链启动时 Electron 按软链目录定位 Helper.app，
    // 会 FATAL "Unable to find helper app" 并刷屏 GPU/network service 错误（真机实测）
    expect(spec!.shimContent).toContain('#!/bin/bash');
    expect(spec!.shimContent).toContain(`exec "${MAC_EXE}" "$@"`);
  });

  it('darwin：bash 对应 ~/.bashrc，未知 shell 返回 null rcFile（不自动改写）', () => {
    expect(getShortcutSpec({ platform: 'darwin', execPath: MAC_EXE, homeDir: '/h', shell: '/bin/bash' })!.rcFile).toBe(
      '/h/.bashrc'
    );
    expect(getShortcutSpec({ platform: 'darwin', execPath: MAC_EXE, homeDir: '/h', shell: '/usr/bin/fish' })!.rcFile).toBeNull();
    expect(getShortcutSpec({ platform: 'darwin', execPath: MAC_EXE, homeDir: '/h', shell: '' })!.rcFile).toBeNull();
  });

  it('win32：.cmd shim 到 ~/bin/xtract.cmd，无 rcFile', () => {
    const spec = getShortcutSpec({ platform: 'win32', execPath: WIN_EXE, homeDir: 'C:\\Users\\a', shell: '' });
    expect(spec).not.toBeNull();
    expect(spec!.linkPath).toBe(path.win32.join('C:\\Users\\a', 'bin', 'xtract.cmd'));
    expect(spec!.rcFile).toBeNull();
    expect(spec!.pathEntry).toBe('C:\\Users\\a\\bin');
  });

  it('win32 shim 内容：引号包裹目标路径并透传全部参数', () => {
    const shim = buildCmdShim(WIN_EXE);
    expect(shim).toContain('@echo off');
    expect(shim).toContain(`"${WIN_EXE}" %*`);
  });

  it('其余平台不支持（返回 null）', () => {
    expect(getShortcutSpec({ platform: 'other', execPath: '/usr/bin/x', homeDir: '/h', shell: '' })).toBeNull();
  });
});

describe('rcNeedsPathFix（幂等判定）', () => {
  it('空文件需要修复', () => {
    expect(rcNeedsPathFix('', '/Users/a')).toBe(true);
  });

  it('已含 $HOME/bin 写法则不需要', () => {
    expect(rcNeedsPathFix('export PATH="$HOME/bin:$PATH"\n', '/Users/a')).toBe(false);
  });

  it('已含展开后的绝对路径也不需要', () => {
    expect(rcNeedsPathFix('export PATH="/Users/a/bin:$PATH"\n', '/Users/a')).toBe(false);
    expect(rcNeedsPathFix('export PATH=~/bin:$PATH\n', '/Users/a')).toBe(false);
  });

  it('无关内容的 rc 需要修复', () => {
    expect(rcNeedsPathFix('export EDITOR=vim\n', '/Users/a')).toBe(true);
  });
});

describe('createCliShortcut（darwin 编排，真实 fs + 临时目录）', () => {
  it('开发态应拒绝并提示仅安装版可用', async () => {
    // 不涉及 symlink，全平台可跑
    const home = tmpHome();
    const res = await createCliShortcut(makeDeps({ isPackaged: false }, home));
    expect(res.ok).toBe(false);
    expect(res.message).toContain('安装版');
    fs.rmSync(home, { recursive: true, force: true });
  });

  itMacOnly('成功创建可执行 shim 并写入 PATH 到 ~/.zshrc', async () => {
    const home = tmpHome();
    const res = await createCliShortcut(makeDeps({}, home));
    expect(res.ok).toBe(true);
    const entry = path.join(home, 'bin', 'xtract');
    // shim 是普通可执行脚本（绝不能是符号链接，否则 Electron 找不到 Helper.app）
    expect(fs.lstatSync(entry).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(entry, 'utf-8')).toContain(`exec "${MAC_EXE}" "$@"`);
    // POSIX 可执行位
    expect(fs.statSync(entry).mode & 0o111).toBeTruthy();
    const rc = fs.readFileSync(path.join(home, '.zshrc'), 'utf-8');
    expect(rc).toContain('export PATH="$HOME/bin:$PATH"');
    expect(res.pathFixed).toBe(true);
    fs.rmSync(home, { recursive: true, force: true });
  });

  itMacOnly('旧版符号链接应自动迁移为 shim（升级兼容）', async () => {
    const home = tmpHome();
    const bin = path.join(home, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.symlinkSync(MAC_EXE, path.join(bin, 'xtract'));
    const res = await createCliShortcut(makeDeps({}, home));
    expect(res.ok).toBe(true);
    expect(res.migrated).toBe(true);
    const entry = path.join(bin, 'xtract');
    expect(fs.lstatSync(entry).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(entry, 'utf-8')).toContain(`exec "${MAC_EXE}" "$@"`);
    fs.rmSync(home, { recursive: true, force: true });
  });

  itMacOnly('重复点击应幂等（alreadyExists 且不重复追加 rc）', async () => {
    const home = tmpHome();
    await createCliShortcut(makeDeps({}, home));
    const entry = path.join(home, 'bin', 'xtract');
    const before = fs.readFileSync(entry, 'utf-8');
    const res2 = await createCliShortcut(makeDeps({}, home));
    expect(res2.ok).toBe(true);
    expect(res2.alreadyExists).toBe(true);
    expect(res2.migrated).toBeUndefined();
    expect(res2.pathFixed).toBe(false);
    expect(fs.readFileSync(entry, 'utf-8')).toBe(before);
    const rc = fs.readFileSync(path.join(home, '.zshrc'), 'utf-8');
    expect(rc.match(/HOME\/bin/g)?.length).toBe(1);
    fs.rmSync(home, { recursive: true, force: true });
  });

  itMacOnly('链接已被其他目标占用时应报冲突而非覆盖', async () => {
    const home = tmpHome();
    const bin = path.join(home, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.symlinkSync('/usr/bin/other-tool', path.join(bin, 'xtract'));
    const res = await createCliShortcut(makeDeps({}, home));
    expect(res.ok).toBe(false);
    expect(res.message).toContain('xtract');
    expect(fs.readlinkSync(path.join(bin, 'xtract'))).toBe('/usr/bin/other-tool');
    fs.rmSync(home, { recursive: true, force: true });
  });

  itMacOnly('rc 已含 PATH 条目时不再追加（pathFixed=false）', async () => {
    const home = tmpHome();
    fs.writeFileSync(path.join(home, '.zshrc'), 'export PATH="$HOME/bin:$PATH"\n');
    const res = await createCliShortcut(makeDeps({}, home));
    expect(res.ok).toBe(true);
    expect(res.pathFixed).toBe(false);
    fs.rmSync(home, { recursive: true, force: true });
  });

  itMacOnly('未知 shell 不自动改写，返回手动指引 hint', async () => {
    const home = tmpHome();
    const res = await createCliShortcut(makeDeps({ shell: '/usr/bin/fish' }, home));
    expect(res.ok).toBe(true);
    expect(res.pathFixed).toBe(false);
    expect(res.pathHint).toBeTruthy();
    expect(fs.existsSync(path.join(home, '.zshrc'))).toBe(false);
    fs.rmSync(home, { recursive: true, force: true });
  });
});

describe('createCliShortcut（win32 编排，PowerShell 注入 stub）', () => {
  const scripts: string[] = [];

  // darwin 上 path.win32.join 会把 posix 临时路径转成「反斜杠相对路径」，
  // fs 写入会落在项目根下的字面量目录——测试结束后必须清理，否则污染仓库
  afterAll(() => {
    for (const name of fs.readdirSync(process.cwd())) {
      if (name.startsWith('\\') && name.includes('xtract-shortcut')) {
        fs.rmSync(path.join(process.cwd(), name), { recursive: true, force: true });
      }
    }
  });

  function winDeps(home: string, failPowerShell = false): ShortcutDeps {
    return makeDeps(
      {
        platform: 'win32',
        execPath: WIN_EXE,
        shell: '',
        runPowerShell: async (script) => {
          if (failPowerShell) throw new Error('powershell not found');
          scripts.push(script);
        },
      },
      home
    );
  }

  it('成功创建 .cmd shim 并调用 PowerShell 写用户 PATH', async () => {
    scripts.length = 0;
    const home = tmpHome();
    const res = await createCliShortcut(winDeps(home));
    expect(res.ok).toBe(true);
    const shimPath = path.win32.join(home, 'bin', 'xtract.cmd');
    expect(fs.existsSync(shimPath)).toBe(true);
    expect(fs.readFileSync(shimPath, 'utf-8')).toContain(`"${WIN_EXE}" %*`);
    expect(res.pathFixed).toBe(true);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain(path.win32.join(home, 'bin'));
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('PowerShell 失败不应影响 shim 创建，仅降级为手动指引', async () => {
    const home = tmpHome();
    const res = await createCliShortcut(winDeps(home, true));
    expect(res.ok).toBe(true);
    expect(res.pathFixed).toBe(false);
    expect(res.pathHint).toBeTruthy();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('重复点击幂等：shim 已存在且内容一致时报 alreadyExists 且不重写', async () => {
    scripts.length = 0;
    const home = tmpHome();
    await createCliShortcut(winDeps(home));
    const shimPath = path.win32.join(home, 'bin', 'xtract.cmd');
    const before = fs.readFileSync(shimPath, 'utf-8');
    const res2 = await createCliShortcut(winDeps(home));
    expect(res2.ok).toBe(true);
    expect(res2.alreadyExists).toBe(true);
    // PATH 修复自身幂等（脚本内置 -notlike 判断），重复执行无害，故不限制调用次数
    expect(fs.readFileSync(shimPath, 'utf-8')).toBe(before);
    fs.rmSync(home, { recursive: true, force: true });
  });
});

describe('createCliShortcut（平台不支持）', () => {
  it('linux 应返回不支持提示', async () => {
    const home = tmpHome();
    const res = await createCliShortcut(makeDeps({ platform: 'linux', execPath: '/usr/bin/x' }, home));
    expect(res.ok).toBe(false);
    expect(res.message).toContain('不支持');
    fs.rmSync(home, { recursive: true, force: true });
  });
});
