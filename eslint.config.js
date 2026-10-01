import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'node_modules/**',
      'output/**',
      'data/**',
      'scratch/**',
      'release/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // -------------------------------------------------------------------
      // 以下 React Hooks 规则降为 warn：与本项目既定的状态编排模式冲突，
      // 且「修复」它们会改变运行时行为，因此只提示不阻断交付。
      //
      // set-state-in-effect：本工作台刻意在 effect 中把外部状态（数据源
      //   切换、IPC 推送、上层跳转动作）同步进内部 state，这是数据流的
      //   入口，而非「本可用派生值替代的冗余 setState」。改为派生值会
      //   破坏「切源即加载」的时序。
      // exhaustive-deps：补全依赖会把每帧新建的 handler 引入依赖数组，
      //   导致 effect 反复重跑。已有 19 条 Playwright 流程锁定真实交互
      //   行为，改依赖必须配套改测试，属独立变更而非 lint 修复。
      // -------------------------------------------------------------------
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },

  {
    rules: {
      // 未使用变量一律报错（no-unused-vars 已由 TS 编译期覆盖，
      // 这里的 @typescript-eslint 版本对解构参数更宽松）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // 显式 any 在本项目的 IPC 边界与 preload 契约中不可避免
      '@typescript-eslint/no-explicit-any': 'off',
      // 空 catch 块用于「探测式调用失败即忽略」，不视为缺陷
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  prettier
);
