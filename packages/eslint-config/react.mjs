import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import base from './base.mjs';

/**
 * Config cho frontend React + Vite + Ant Design.
 * Import order theo quy ước CLAUDE.md: react/third-party → constants → store → services → components → utils.
 */
export default tseslint.config(
  ...base,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',

      // Thứ tự import theo CLAUDE.md (autofix bằng lint:fix)
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^\\u0000'],
            ['^react', '^\\w', '^@\\w'],
            ['^@/constants'],
            ['^@/store'],
            ['^@/services'],
            ['^@/components'],
            ['^@/utils'],
            ['^@/'],
            ['^\\.'],
            ['^.+\\.css$', '^.+\\.scss$'],
          ],
        },
      ],
    },
  },
);
