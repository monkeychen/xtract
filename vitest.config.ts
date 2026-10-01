import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    root: path.resolve(__dirname),
    include: ['tests/**/*.test.ts'],
    // E2E（真实 Vite+Chrome+代理环境）只在本地跑；CI 是纯单元/集成门禁
    exclude: process.env.CI ? ['tests/gui-workbench.e2e.test.ts'] : [],
    // 慢环境（CI runner 冷启动、Windows 文件系统）下默认 5s 会误杀重 IO 用例：
    // 真实发生过 storage 级联删除、locale 首次格式化在 windows-latest 上超时
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
