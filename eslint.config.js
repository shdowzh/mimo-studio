import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'release/**',
      'node_modules/**',
      '*.cjs',        // electron 主进程 CJS 文件暂不纳入 TS lint
    ],
  },

  // 基础 JS 推荐
  js.configs.recommended,

  // TS 推荐类型检查（宽松模式，逐步收紧）
  ...tseslint.configs.recommended,

  // React Hooks + Refresh
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // 降级 react-hooks error → warn，避免 block 构建
      ...Object.fromEntries(
        Object.entries(reactHooks.configs.recommended.rules).map(([k, v]) => [k, v === 'error' ? 'warn' : v])
      ),
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Prettier 关闭冲突规则（必须放最后）
  prettier,

  // 项目级宽松规则（0 测试 / 0 lint 的项目不能一步拉到 strict）
  {
    rules: {
      // 先只开 warn，不 block 构建
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
)
