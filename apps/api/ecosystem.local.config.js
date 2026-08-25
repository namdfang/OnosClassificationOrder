// Cấu hình pm2 cho BE dev local — CHỈ dùng khi dev, prod vẫn dùng
// `ecosystem.config.cjs`.
//
//   cd apps/api && pm2 start ecosystem.local.config.js
//
// Khác bản prod ở chỗ: prod chạy `start.js` (nạp `dist-prod/main.js` đã build
// sẵn) nên sửa `.ts` không có tác dụng cho tới khi build lại tay. Bản local này
// chạy thẳng `nest start -b swc -w` — swc biên dịch tăng dần trong bộ nhớ rồi
// tự chạy lại, không cần `pnpm build`, không đụng tới `dist-prod`.
//
// Đây đúng là compiler + config của `nest build -b swc` mà prod đang dùng
// (Nest CLI đọc `paths` trong tsconfig và đẩy sang swc), nên alias `@/`,
// `@shared/`, `@core/` phân giải y hệt bản prod.
//
// Spawn thẳng binary `node` với `interpreter: 'none'` thay vì để pm2 tự nạp
// script: pm2 fork mode nạp script bằng `require()`, còn ở đây cần Nest CLI
// chạy như tiến trình độc lập để nó tự quản tiến trình con mà nó restart.
//
// Vá `@nestjs/cli` (pnpm patch → `patches/@nestjs__cli@10.1.11.patch`): Nest CLI
// spawn tiến trình chạy app bằng `shell: true` mà KHÔNG đặt `windowsHide`
// (`actions/start.action.js`). pm2 spawn tiến trình con với `detached` +
// `windowsHide` nên Nest CLI không có console nào; `cmd.exe` do nó đẻ ra vì thế
// được Windows cấp console MỚI — bật một cửa sổ đen mỗi lần swc biên dịch lại.
// Bản vá chỉ thêm `windowsHide: true` vào đúng lời gọi spawn đó.
// KHÔNG đổi thành `shell: false`: `processArgs` có phần tử
// '-r source-map-support/register' chứa dấu cách, chỉ chạy đúng khi qua shell.
// Nâng phiên bản @nestjs/cli thì phải tạo lại bản vá bằng `pnpm patch`.

module.exports = [
  {
    name: process.env.APP_NAME_LOCAL || 'onos-api-local',
    script: 'node',
    args: ['./node_modules/@nestjs/cli/bin/nest.js', 'start', '-b', 'swc', '-w'],
    interpreter: 'none',
    // Bắt buộc: `src/main.ts` gọi dotenv theo cwd, chạy sai thư mục là thoát
    // ngay với "NODE_ENV must be defined".
    cwd: __dirname,
    // KHÔNG bật watch của pm2 — Nest CLI đã canh file rồi, bật cả hai sẽ restart
    // chồng nhau giữa lúc đang biên dịch.
    watch: false,
    autorestart: true,
    max_memory_restart: '5G',
    // Cho Nest CLI kịp hạ tiến trình con trước khi pm2 SIGKILL, tránh sót node
    // mồ côi giữ cổng 3007.
    kill_timeout: 5000,
    env: {
      NODE_ENV: 'development',
    },
  },
];
