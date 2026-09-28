import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildElectron } from './build.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  process.stderr.write('🚀 正在启动 Xtract 桌面应用开发环境...\n');

  // 1. 编译主进程与预加载脚本
  await buildElectron();

  // 2. 启动 Vite 前端渲染服务
  const server = await createServer({
    configFile: path.resolve(projectRoot, 'vite.config.ts'),
    server: {
      port: 5173,
      strictPort: true,
    },
  });
  await server.listen();
  const devServerUrl = server.resolvedUrls?.local[0] || 'http://localhost:5173/';
  process.stderr.write(`⚡ Vite 渲染进程服务已就绪: ${devServerUrl}\n`);
  process.stderr.write('🖥️ 正在弹出原生 Electron GUI 桌面视窗...\n');

  // 3. 呼出 Electron 原生视窗
  const electronProcess = spawn(String(electron), ['dist-electron/main/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl,
    },
    stdio: 'inherit',
  });

  electronProcess.on('close', async (code) => {
    process.stderr.write('\n👋 Electron 桌面窗口已关闭，正在清理开发服务...\n');
    await server.close();
    process.exit(code || 0);
  });

  process.on('SIGINT', async () => {
    electronProcess.kill('SIGINT');
    await server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start dev environment:', err);
  process.exit(1);
});
