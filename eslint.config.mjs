// Soát mã: chỉ bật các luật bắt LỖI THẬT (dùng hook sai, promise bỏ rơi kiểu sai, biến không dùng…), không soát kiểu trình bày.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dev-dist/**', '**/node_modules/**', 'supabase/functions/**', '**/android/**', '**/ios/**', 'playwright-report/**', 'test-results/**'] },
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    extends: [tseslint.configs.base],
    plugins: { 'react-hooks': reactHooks },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-self-assign': 'error',
      'no-unsafe-optional-chaining': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
);
