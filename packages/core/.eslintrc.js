module.exports = {
  root: true,
  extends: ['custom'],
  overrides: [
    {
      files: ['**/*.ts'],
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
  ],
};
