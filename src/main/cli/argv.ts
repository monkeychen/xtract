/**
 * CLI / GUI 模式判定的纯函数
 *
 * 存在的原因：Electron 打包前后 argv 结构不同，用「数组长度」判断在开发态
 * 恰好正确、打包后必然失效——dmg 用户根本进不了 CLI。
 */

export interface ArgvContext {
  /** 是否运行在 Electron 运行时内（GUI 与打包后的 CLI 都满足） */
  isElectron: boolean;
  /** Electron 开发态为 true；打包后为 undefined。可据此判断 argv 是否含脚本路径 */
  isDefaultApp: boolean;
}

/** macOS 从 Finder / Dock 启动时会注入的进程序列号参数，必须忽略 */
function isNoiseArg(arg: string): boolean {
  return arg === '--' || arg.startsWith('-psn_');
}

/**
 * 从 process.argv 中提取用户实际传入的参数。
 *
 * 三种运行形态的 argv 布局：
 *   纯 Node  (tsx src/main/index.ts --list)  : [node, script, --list]      → 偏移 2
 *   Electron 开发态 (electron index.js --list): [electron, index.js, --list] → 偏移 2
 *   Electron 打包态 (Xtract --list)           : [Xtract, --list]            → 偏移 1
 *
 * Electron 官方约定：打包后 `process.defaultApp` 为 undefined，
 * 开发态（以 `electron <script>` 启动）为 true，可据此可靠区分。
 */
export function resolveUserArgs(argv: string[], ctx: ArgvContext): string[] {
  const hasScriptSlot = !ctx.isElectron || ctx.isDefaultApp;
  const userArgs = hasScriptSlot ? argv.slice(2) : argv.slice(1);
  return userArgs.filter((a) => !isNoiseArg(a));
}

/**
 * 由解析出的用户参数判断应进入 CLI 还是 GUI。
 * 规则：除噪声参数外只要有任何一个实参，就是 CLI 模式。
 */
export function isCliMode(argv: string[], ctx: ArgvContext): boolean {
  return resolveUserArgs(argv, ctx).length > 0;
}

/** 从当前运行时读取版本号，优先级：Electron 应用版本 → package.json */
export function resolveVersion(readAppVersion: () => string | null, readPkgVersion: () => string | null): string {
  try {
    const v = readAppVersion();
    if (v && v.trim()) return v.trim();
  } catch {
    /* 非 Electron 运行时，继续回退 */
  }
  try {
    const v = readPkgVersion();
    if (v && v.trim()) return v.trim();
  } catch {
    /* 读取失败 */
  }
  return '0.0.0';
}
