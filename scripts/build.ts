import { build } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

export async function buildElectron() {
  process.stderr.write('⚡ [1/2] 正在编译 Electron 主进程 (Main Process)...\n');
  await build({
    configFile: false,
    build: {
      ssr: true,
      lib: {
        entry: path.resolve(projectRoot, 'src/main/index.ts'),
        formats: ['es'],
        fileName: () => 'index.js',
      },
      outDir: path.resolve(projectRoot, 'dist-electron/main'),
      emptyOutDir: false,
      rollupOptions: {
        external: [
          'electron',
          'better-sqlite3',
          'playwright-core',
          'dotenv',
          'commander',
          'undici',
          'node:path',
          'node:fs',
          'node:child_process',
          'node:url',
        ],
      },
    },
  });

  process.stderr.write('⚡ [2/2] 正在编译 Electron 预加载脚本 (Preload Script)...\n');
  await build({
    configFile: false,
    build: {
      ssr: true,
      lib: {
        entry: path.resolve(projectRoot, 'src/preload/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.cjs',
      },
      outDir: path.resolve(projectRoot, 'dist-electron/preload'),
      emptyOutDir: false,
      rollupOptions: {
        external: ['electron'],
      },
    },
  });

  process.stderr.write('✓ Electron 主进程与预加载脚本编译完成！\n');
}

// If executed directly
if (process.argv[1] && process.argv[1].endsWith('build.ts')) {
  buildElectron().catch((err) => {
    console.error('Electron build failed:', err);
    process.exit(1);
  });
}
