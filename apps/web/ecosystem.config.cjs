// Cấu hình pm2 cho FE dev local: chạy vite dev server (có HMR) như 1 process nền,
// song song với `apps/api/ecosystem.config.cjs`.
//
//   cd apps/web && pm2 start ecosystem.config.cjs
//
// Vite là ESM-only, mà pm2 fork mode nạp script bằng `require()` → sẽ vỡ nếu trỏ
// thẳng `script` vào `vite.js`. Vì vậy ở đây spawn hẳn binary `node` với
// `interpreter: 'none'`, để node tự xử lý ESM như khi gõ tay ngoài terminal.

const port = process.env.WEB_PORT || 5173;

module.exports = [
  {
    name: process.env.WEB_APP_NAME || 'onos-web',
    script: 'node',
    args: `./node_modules/vite/bin/vite.js --host --strictPort --port ${port}`,
    interpreter: 'none',
    cwd: __dirname,
    // KHÔNG bật watch của pm2 — vite đã có HMR riêng, pm2 watch sẽ restart cả
    // process mỗi lần sửa file và giết luôn HMR.
    watch: false,
    autorestart: true,
    max_memory_restart: '4G',
  },
];
