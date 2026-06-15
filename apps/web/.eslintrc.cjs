module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ['airbnb', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12,
    sourceType: 'module',
  },
  plugins: ['react', 'prettier', '@typescript-eslint'],
  rules: {
    'newline-before-return': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    'prettier/prettier': [
      'error',
      {
        endOfLine: 'auto',
      },
    ],
    'import/extensions': 'off',
    'import/no-unresolved': [
      'error',
      {
        ignore: ['@/*'],
      },
    ],
    // 'import/extensions': [
    //   'error',
    //   'ignorePackages',
    //   {
    //     js: 'never',
    //     jsx: 'never',
    //     ts: 'never',
    //     tsx: 'never',
    //   },
    // ],
    camelcase: 'off',
    'no-console': 'off',
    'no-plusplus': 'off',
    'no-unused-vars': 'warn',
    'import/prefer-default-export': 'off',
    'no-shadow': 'off',
    'no-nested-ternary': 'off',
    'no-use-before-define': 'off',
    'no-param-reassign': 'off',
    'no-return-assign': 'off',
    // eqeqeq: 'off',
    'no-restricted-syntax': 'off',
    'prefer-destructuring': 'off',
    'no-unused-expressions': 'warn',
    radix: 'off',
    'no-underscore-dangle': 'off',
    'react/jsx-filename-extension': [1, { extensions: ['.js', '.jsx', '.ts', '.tsx'] }],
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/jsx-no-useless-fragment': 'off',
    'react/no-array-index-key': 'off',
    'react/require-default-props': 'off',
    'react/no-unstable-nested-components': 'warn',
    'react/forbid-prop-types': 'warn',
    'react/no-unescaped-entities': 'off',
    'react/function-component-definition': 'off',

    'jsx-a11y/click-events-have-key-events': 'off',
    'jsx-a11y/no-static-element-interactions': 'off',
    'jsx-a11y/no-noninteractive-element-interactions': 'off',
    'jsx-a11y/label-has-associated-control': 'off',
    'jsx-a11y/alt-text': 'off',

    '@typescript-eslint/explicit-module-boundary-types': 'off', // You might want to enable this later
    '@typescript-eslint/no-explicit-any': 'off', // You might want to enable this later
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
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/'],
      },
    },
  },
};
