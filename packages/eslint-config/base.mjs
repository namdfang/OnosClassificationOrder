import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Config nền dùng chung cho mọi workspace (TypeScript, không type-check).
 * - eslint:recommended + typescript-eslint recommended
 * - simple-import-sort: sắp xếp import/export tự động (autofix)
 * - unused-imports: tự xóa import thừa (autofix), cảnh báo biến không dùng
 * - eslint-config-prettier đặt CUỐI để tắt mọi rule xung đột format (format do Prettier lo)
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': [
        'warn',
        { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // TypeScript tự kiểm soát undefined identifiers — no-undef chỉ gây false positive
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: { 'no-undef': 'off' },
  },
  {
    // File config JS (tailwind.config.js, lint-staged.config.js...) chạy trong Node, cho phép CommonJS require
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
);
