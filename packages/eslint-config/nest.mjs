import globals from 'globals';
import tseslint from 'typescript-eslint';

import base from './base.mjs';

/**
 * Config cho backend NestJS + Fastify (type-checked).
 * Workspace dùng config này PHẢI khai báo trong eslint.config.mjs của mình:
 *   languageOptions.parserOptions.project + tsconfigRootDir
 */
export default tseslint.config(
  ...base,
  ...tseslint.configs.recommendedTypeCheckedOnly,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Codebase dùng nhiều dữ liệu động từ Mongoose/Fastify — các rule no-unsafe-* quá ồn
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      // Mongoose ObjectId stringify qua String(...) là pattern hợp lệ trong codebase
      '@typescript-eslint/no-base-to-string': 'off',

      // Backend bắt buộc dùng Winston logger, không dùng console
      'no-console': 'warn',

      // Cấm gọi .save() trực tiếp trên document (quy ước repo pattern của dự án)
      'no-restricted-properties': [
        'error',
        {
          property: 'save',
          message: 'Direct usage of .save() is prohibited. Please use repository methods instead.',
        },
      ],
    },
  },
  {
    // File JS thuần (config, script) không tham gia type-check
    files: ['**/*.{js,cjs,mjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
);
