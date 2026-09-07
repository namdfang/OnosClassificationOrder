import type { NextConfig } from 'next';

/**
 * Seller Portal (SellerPortal.md). Không Prisma, không server action: mọi dữ liệu đi qua
 * proxy same-origin `app/api/v1/[...path]/route.ts` → NestJS (`API_INTERNAL_URL`).
 * `shared` là mã TS thô của monorepo → phải transpile.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.onospod.com' },
      { protocol: 'https', hostname: '**.digitaloceanspaces.com' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: 'drive.google.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ];
    return [{ source: '/(.*)', headers: common }];
  },
};

export default nextConfig;
