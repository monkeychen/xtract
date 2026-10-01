import { describe, it, expect } from 'vitest';
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

describe('getShortcutSpec（平台差异纯函数）', () => {
  it('darwin：软链到 ~/bin/xtract，zsh 对应 ~/.zshrc', () => {
    const spec = getShortcutSpec({ platform: 'darwin', execPath: MAC_EXE, homeDir: '/Users/a', shell: '/bin/zsh' });
    expect(spec).not.toBeNull();
    expect(spec!.linkPath).toBe('/Users/a/bin/xtract');
    expect(spec!.targetPath).toBe(MAC_EXE);
    expect(spec!.rcFile).toBe('/Users/a/.zshrc');
    expect(spec!.pathEntry).toContain('export PATH="$HOME/bin:$PATH"');
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
    const home = tmpHome();
    const res = await createCliShortcut(makeDeps({ isPackaged: false }, home));
    expect(res.ok).toBe(false);
    expect(res.message).toContain('安装版');
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('成功创建软链并写入 PATH 到 ~/.zshrc', async () => {
    const home = tmpHome();
    const res = await createCliShortcut(makeDeps({}, home));
    expect(res.ok).toBe(true);
    const link = path.join(home, 'bin', 'xtract');
    // 软链 target 在测试机未必存在，必须用 lstat（不追踪目标）断言存在性
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe(MAC_EXE);
    const rc = fs.readFileSync(path.join(home, '.zshrc'), 'utf-8');
    expect(rc).toContain('export PATH="$HOME/bin:$PATH"');
    expect(res.pathFixed).toBe(true);
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('重复点击应幂等（alreadyExists 且不重复追加 rc）', async () => {
    const home = tmpHome();
    await createCliShortcut(makeDeps({}, home));
    const res2 = await createCliShortcut(makeDeps({}, home));
    expect(res2.ok).toBe(true);
    expect(res2.alreadyExists).toBe(true);
    expect(res2.pathFixed).toBe(false);
    const rc = fs.readFileSync(path.join(home, '.zshrc'), 'utf-8');
    expect(rc.match(/HOME\/bin/g)?.length).toBe(1);
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('链接已被其他目标占用时应报冲突而非覆盖', async () => {
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

  it('rc 已含 PATH 条目时不再追加（pathFixed=false）', async () => {
    const home = tmpHome();
    fs.writeFileSync(path.join(home, '.zshrc'), 'export PATH="$HOME/bin:$PATH"\n');
    const res = await createCliShortcut(makeDeps({}, home));
    expect(res.ok).toBe(true);
    expect(res.pathFixed).toBe(false);
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('未知 shell 不自动改写，返回手动指引 hint', async () => {
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
