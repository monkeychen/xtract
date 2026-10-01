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
    // 慢环境（CI runner 冷启动、Windows 文件系统）下默认 5s 会误杀重 IO 用例：
    // 真实发生过 storage 级联删除、locale 首次格式化在 windows-latest 上超时
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // CI runner 上 E2E（真实 Vite+Chrome）与重 IO 用例并行抢 2 核 CPU，偶发超时；
    // 平台语义类失败是确定性的（不会被 retry 掩盖），环境噪声由 retry 吸收
    retry: process.env.CI ? 2 : 0,
  },
});
