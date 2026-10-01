/**
 * 打包后 Smoke Test：对 electron-builder 产物直接做真实启动验证（macOS / Windows）。
 *
 * 回归背景：CLI 进 GUI 的模式判定依赖 argv 结构，开发态测试全部通过也拦不住
 * 「打包后 argv 少一层脚本路径」这类形态差异——只有对真实产物启动才能发现。
 *
 * 覆盖三种启动形态：
 *   1. 无参           → GUI 进程必须存活（不得误入 CLI、不得崩溃退出）
 *   2. --version/--help → 正确输出版本号与选项清单
 *   3. --list          → 打包态读取 SQLite 成功
 *
 * 按当前运行平台自动探测对应产物：
 *   darwin → release/mac[-arm64]/Xtract.app/Contents/MacOS/Xtract
 *   win32  → release/win-unpacked/Xtract.exe（NSIS 安装包产出的同源解包目录）
 *
 * 所有子进程均注入隔离的 XTRACT_STORAGE_ROOT 临时目录，绝不触碰用户真实数据。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

interface RunResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function findPackagedBinary(): string | null {
  const candidates =
    process.platform === 'win32'
      ? ['release/win-unpacked/Xtract.exe']
      : ['release/mac-arm64/Xtract.app/Contents/MacOS/Xtract', 'release/mac/Xtract.app/Contents/MacOS/Xtract'];
  for (const rel of candidates) {
    const abs = path.join(projectRoot, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/** 产物缺失时给出与当前平台匹配的构建指引 */
function packagingHint(): string {
  return process.platform === 'win32' ? 'pnpm exec electron-builder --win --publish never' : 'pnpm pack:dir';
}

function makeIsolatedRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xtract-smoke-'));
}

function runBinary(binary: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env,
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`超时 (${timeoutMs}ms): ${args.join(' ') || '(无参)'}\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

/** 无参启动 GUI：等待宽限期后确认进程仍存活，再优雅终止 */
function checkGuiLaunch(binary: string, env: NodeJS.ProcessEnv, graceMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(binary, [], {
      env,
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));

    const exitedEarly = new Promise<RunResult>((res) => {
      child.on('close', (code, signal) => res({ code, signal, stdout, stderr }));
      child.on('error', (err) => res({ code: -1, signal: null, stdout, stderr: String(err) }));
    });

    const timer = setTimeout(async () => {
      if (child.exitCode !== null || child.signalCode) {
        const r = await exitedEarly;
        reject(new Error(`GUI 进程在 ${graceMs}ms 内退出 (code=${r.code}, signal=${r.signal})\nstdout: ${r.stdout}\nstderr: ${r.stderr}`));
        return;
      }
      // 仍存活 → 终止并等待退出，防止遗留僵尸进程
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000);
      child.on('close', () => clearTimeout(killTimer));
      resolve(stderr.trim() || '(进程存活，无 stderr)');
    }, graceMs);

    exitedEarly.then((r) => {
      if (child.exitCode !== null || child.signalCode) {
        clearTimeout(timer);
        // 3 秒内退出即视为失败——GUI 不应自行退出
        reject(new Error(`GUI 进程提前退出 (code=${r.code}, signal=${r.signal})\nstdout: ${r.stdout}\nstderr: ${r.stderr}`));
      }
    });
  });
}

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? '✅' : '❌'} ${name}\n   ${detail.split('\n').join('\n   ')}\n`);
}

async function main(): Promise<void> {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    process.stdout.write(`⏭️ 平台暂未支持打包 smoke (platform=${process.platform})\n`);
    process.exit(0);
  }

  const pkgVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')).version;
  const binary = findPackagedBinary();
  if (!binary) {
    process.stdout.write(`❌ 未找到打包产物，请先执行: ${packagingHint()}\n`);
    process.exit(1);
  }
  process.stdout.write(`🧪 打包 Smoke Test [${process.platform}] → ${binary}\n`);

  const env = { ...process.env };
  delete env.VITE_DEV_SERVER_URL;
  const isolatedRoot = makeIsolatedRoot();
  const isolatedEnv = { ...env, XTRACT_STORAGE_ROOT: isolatedRoot };

  try {
    // 形态 2a：--version
    try {
      const r = await runBinary(binary, ['--version'], isolatedEnv, 30_000);
      const ok = r.code === 0 && r.stdout.includes(pkgVersion);
      record('--version', ok, `exit=${r.code} stdout=${r.stdout.trim() || '(空)'}`);
    } catch (e: any) {
      record('--version', false, String(e?.message || e));
    }

    // 形态 2b：--help（含新增批量选项，防止选项定义与实际产物脱节）
    try {
      const r = await runBinary(binary, ['--help'], isolatedEnv, 30_000);
      const ok = r.code === 0 && r.stdout.includes('--list') && r.stdout.includes('--export-ids');
      record('--help', ok, `exit=${r.code} 含 --list=${r.stdout.includes('--list')} 含 --export-ids=${r.stdout.includes('--export-ids')}`);
    } catch (e: any) {
      record('--help', false, String(e?.message || e));
    }

    // 形态 3：--list 打包态读 SQLite（隔离临时库 → 首次为空库提示）
    try {
      const r = await runBinary(binary, ['--list', '1'], isolatedEnv, 60_000);
      const ok = r.code === 0;
      record('--list 1 (打包态读 SQLite)', ok, `exit=${r.code} stdout=${r.stdout.trim().split('\n')[0] || '(空)'} stderr=${r.stderr.trim().split('\n')[0] || '(空)'}`);
    } catch (e: any) {
      record('--list 1 (打包态读 SQLite)', false, String(e?.message || e));
    }

    // 形态 1：无参 → GUI 存活
    try {
      const detail = await checkGuiLaunch(binary, isolatedEnv, 5000);
      record('无参启动 GUI', true, detail);
    } catch (e: any) {
      record('无参启动 GUI', false, String(e?.message || e));
    }
  } finally {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(
    failed.length === 0
      ? `\n🎉 打包 Smoke 全部通过 (${results.length}/${results.length})\n`
      : `\n💥 ${failed.length}/${results.length} 项失败\n`
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
