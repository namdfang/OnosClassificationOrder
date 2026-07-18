import nest from '@printsel/eslint-config/nest';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-prod/**',
      'logs/**',
      'docker/**',
      'scripts/**',
      'start.js',
      'ecosystem.config.cjs',
      'rspack.config.js',
      'lint-staged.config.js',
    ],
  },
  ...nest,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
