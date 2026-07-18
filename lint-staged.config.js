module.exports = {
  // ESLint 9 chạy từ root cần flag để tìm eslint.config.mjs theo vị trí file (per-workspace)
  '*.{ts,tsx}': ['eslint --flag v10_config_lookup_from_file --cache --fix'],
  '*.*': ['cspell --cache --no-summary --no-progress  --no-must-find-files'],
};
