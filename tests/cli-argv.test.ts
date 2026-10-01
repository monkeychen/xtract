import { describe, it, expect } from 'vitest';
import { resolveUserArgs, isCliMode, resolveVersion } from '../src/main/cli/argv.js';

/**
 * CLI / GUI 模式判定
 *
 * 回归背景：原实现用 `process.argv.length > 2` 判断。该判断在开发态恰好成立，
 * 但 Electron 打包后 argv 少一层脚本路径（[Xtract, --list] 长度为 2），
 * 导致 dmg 用户的 CLI 完全无法进入——所有开发态验证都覆盖不到这个形态。
 */
describe('resolveUserArgs / isCliMode（三种运行形态）', () => {
  const NODE = { isElectron: false, isDefaultApp: false };
  const ELECTRON_DEV = { isElectron: true, isDefaultApp: true };
  const ELECTRON_PACKED = { isElectron: true, isDefaultApp: false };

  it('纯 Node：剥离 node 与脚本两段', () => {
    expect(resolveUserArgs(['node', 'index.ts', '--list', '20'], NODE)).toEqual(['--list', '20']);
  });

  it('Electron 开发态：剥离 electron 与脚本两段', () => {
    expect(resolveUserArgs(['electron', 'index.js', '--search', 'AI'], ELECTRON_DEV)).toEqual(['--search', 'AI']);
  });

  it('Electron 打包态：只剥离可执行文件一段（这是修复的核心）', () => {
    expect(resolveUserArgs(['Xtract', '--search', 'AI'], ELECTRON_PACKED)).toEqual(['--search', 'AI']);
  });

  it('打包态单参数必须被识别为 CLI（修复前会被误判为 GUI）', () => {
    expect(isCliMode(['Xtract', '--help'], ELECTRON_PACKED)).toBe(true);
    expect(isCliMode(['Xtract', '--version'], ELECTRON_PACKED)).toBe(true);
  });

  it('无参数时进入 GUI', () => {
    expect(isCliMode(['Xtract'], ELECTRON_PACKED)).toBe(false);
    expect(isCliMode(['node', 'index.ts'], NODE)).toBe(false);
    expect(isCliMode(['electron', 'index.js'], ELECTRON_DEV)).toBe(false);
  });

  it('忽略 macOS 注入的 -psn_ 进程序列号参数', () => {
    // Finder/Dock 启动会带 -psn_0_12345，不能因此误判为 CLI 模式
    expect(resolveUserArgs(['Xtract', '-psn_0_12345'], ELECTRON_PACKED)).toEqual([]);
    expect(isCliMode(['Xtract', '-psn_0_12345'], ELECTRON_PACKED)).toBe(false);
    expect(resolveUserArgs(['Xtract', '-psn_0_12345', '--list'], ELECTRON_PACKED)).toEqual(['--list']);
  });

  it('忽略 Electron/Chromium 运行时调试开关（非用户命令，不得拽进 CLI）', () => {
    // CDP 调试与 Playwright Electron 驱动会注入这些开关；误判为用户参数
    // 会进 CLI 模式并以 unknown option 报错退出，GUI 完全无法启动
    expect(resolveUserArgs(['Xtract', '--remote-debugging-port=9222'], ELECTRON_PACKED)).toEqual([]);
    expect(resolveUserArgs(['Xtract', '--remote-debugging-pipe'], ELECTRON_PACKED)).toEqual([]);
    expect(resolveUserArgs(['Xtract', '--inspect=9229'], ELECTRON_PACKED)).toEqual([]);
    expect(isCliMode(['Xtract', '--remote-debugging-port=9222'], ELECTRON_PACKED)).toBe(false);
    expect(resolveUserArgs(['Xtract', '--remote-allow-origins=*', '--list'], ELECTRON_PACKED)).toEqual(['--list']);
  });

  it('忽略裸 -- 分隔符', () => {
    expect(resolveUserArgs(['Xtract', '--'], ELECTRON_PACKED)).toEqual([]);
    expect(resolveUserArgs(['node', 'index.ts', '--', '--list'], NODE)).toEqual(['--list']);
  });

  it('保留用户参数中的 --key=value 形式', () => {
    expect(resolveUserArgs(['Xtract', '--search=AI', '--limit=5'], ELECTRON_PACKED)).toEqual([
      '--search=AI',
      '--limit=5',
    ]);
  });

  it('Electron 运行时若 defaultApp 为 undefined 也应按打包态处理', () => {
    const undefinedDefault = { isElectron: true, isDefaultApp: undefined as unknown as boolean };
    expect(resolveUserArgs(['Xtract', '--list'], undefinedDefault)).toEqual(['--list']);
  });
});

describe('resolveVersion', () => {
  it('应优先使用 Electron 应用版本', () => {
    expect(resolveVersion(() => '0.1.0', () => '9.9.9')).toBe('0.1.0');
  });

  it('Electron 不可用时回退到 package.json', () => {
    expect(resolveVersion(() => null, () => '0.1.0')).toBe('0.1.0');
  });

  it('读取抛异常时应回退而非崩溃', () => {
    expect(
      resolveVersion(
        () => {
          throw new Error('no electron');
        },
        () => '0.1.0'
      )
    ).toBe('0.1.0');
  });

  it('两者都不可用时返回占位而非 undefined', () => {
    expect(resolveVersion(() => null, () => null)).toBe('0.0.0');
  });

  it('空白字符串不应被当作有效版本', () => {
    expect(resolveVersion(() => '   ', () => '0.1.0')).toBe('0.1.0');
  });
});
