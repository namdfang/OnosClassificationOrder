module.exports = {
  '*.ts': ['eslint --cache --fix'],
  '*.*': ['cspell --cache --no-summary --no-progress  --no-must-find-files '],
  // '{!(package)*.json,*.code-snippets,.!(browserslist)*rc}': [
  //   'pnpm lint:prettier --parser json',
  // ],
  // 'package.json': ['pnpm lint:prettier'],
  // '*.md': ['pnpm lint:markdownlint', 'pnpm lint:prettier'],
};
