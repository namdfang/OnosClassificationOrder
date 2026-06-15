// cspell:disable
module.exports = {
  env: {
    browser: true,
  },
  // Configuration for Typescript files
  plugins: ['@typescript-eslint', 'unused-imports', 'tailwindcss', 'simple-import-sort'],
  extends: ['plugin:tailwindcss/recommended', 'airbnb-base', 'airbnb-typescript', 'plugin:prettier/recommended'],
  rules: {
    'newline-before-return': 'error',
    'no-underscore-dangle': ['error'],
    'no-param-reassign': ['error', { props: false }],

    '@typescript-eslint/comma-dangle': 'off', // Avoid conflict rule between Eslint and Prettier
    '@typescript-eslint/consistent-type-imports': 'error', // Ensure `import type` is used when it's necessary
    'import/prefer-default-export': 'off', // Named export is easier to refactor automatically
    'tailwindcss/classnames-order': [
      'error',
      {
        officialSorting: false,
      },
    ], // Follow the same ordering as the official plugin `prettier-plugin-tailwindcss`
    'simple-import-sort/imports': 'error', // Import configuration for `eslint-plugin-simple-import-sort`
    'simple-import-sort/exports': 'error', // Export configuration for `eslint-plugin-simple-import-sort`
    '@typescript-eslint/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

    // Teb
    'import/no-unresolved': [
      'error',
      {
        ignore: ['@/*'],
      },
    ],
    'import/no-extraneous-dependencies': 'off',
    'tailwindcss/no-custom-classname': 'off',

    // Backend also
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'default',
        format: ['camelCase', 'PascalCase', 'snake_case', 'UPPER_CASE'],
        filter: {
          regex: '^_.*$',
          match: false,
        },
      },
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        filter: {
          regex: '^_id$',
          match: false,
        },
      },
      {
        selector: 'interface',
        format: ['PascalCase'],
        // prefix: ['I'],
      },
      {
        selector: 'typeLike',
        format: ['PascalCase'],
      },
      {
        selector: 'memberLike',
        modifiers: ['private'],
        format: ['camelCase'],
        leadingUnderscore: 'forbid',
      },
      {
        selector: 'variable',
        types: ['boolean'],
        format: ['PascalCase'],
        prefix: ['is', 'should', 'has', 'can', 'did', 'will'],
      },
      {
        selector: 'property',
        format: null,
      },
    ],
  },
  ignorePatterns: ['**/*.mjs', '**/*.cjs', '**/*.js'],
  overrides: [
    // Configuration for React files
    {
      files: ['**/*.tsx'],
      plugins: ['react'],
      parserOptions: {
        // project: './tsconfig.json',
      },
      rules: {
        'import/extensions': [
          'error',
          'ignorePackages',
          {
            js: 'never',
            jsx: 'never',
            ts: 'never',
            tsx: 'never',
            '': 'never',
          },
        ], // Avoid missing file extension errors when using '@/' alias

        'react/destructuring-assignment': 'off', // Vscode doesn't support automatically destructuring, it's a pain to add a new variable
        'react/require-default-props': 'off', // Allow non-defined react props as undefined
        'react/jsx-props-no-spreading': 'off', // _app.tsx uses spread operator and also, react-hook-form
      },
    },
    // Configuration for Astro
    {
      files: ['**/*.astro'],
      parser: 'astro-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        // project: './tsconfig.json',
        extraFileExtensions: ['.astro'],
      },
      rules: {
        'import/extensions': [
          'error',
          'ignorePackages',
          {
            js: 'never',
            jsx: 'never',
            ts: 'never',
            tsx: 'never',
            '': 'never',
          },
        ], // Avoid missing file extension errors in .astro files

        'react/jsx-filename-extension': [1, { extensions: ['.astro'] }], // Accept jsx in astro files
        'consistent-return': 'off',
      },
      globals: {
        Astro: 'readonly',
      },
    },
    // Configuration for Svelte
    {
      files: ['**/*.svelte'],
      plugins: ['eslint-plugin-svelte'],
      extends: ['plugin:svelte/recommended'],
      parser: 'svelte-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        // project: './tsconfig.json',
        extraFileExtensions: ['.svelte'],
      },
      rules: {
        'import/extensions': [
          'error',
          'ignorePackages',
          {
            ts: 'never',
            '': 'never',
          },
        ],

        'import/no-mutable-exports': 'off',
      },
    },
  ],
};
