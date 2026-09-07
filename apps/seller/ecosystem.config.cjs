/**
 * PM2 cho Seller Portal (production) — SellerPortal.md §8 / Deployment-Ubuntu-VPS.md §8.
 * `next start` KHÔNG đọc `.env.development`; đọc `.env.production` + `.env` ở cwd nên
 * đặt `API_INTERNAL_URL`, `NEXT_PUBLIC_*` trong `apps/seller/.env.production` (không commit).
 * Khởi động: (cd apps/seller && pm2 restart ecosystem.config.cjs --update-env)
 */
module.exports = [
  {
    name: 'onosfactory-seller',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3017',
    cwd: __dirname,
    instances: 1,
    max_memory_restart: '1G',
    env: { NODE_ENV: 'production', PORT: '3017' },
  },
];
