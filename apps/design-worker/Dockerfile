# design-worker — build từ ROOT monorepo (docker-compose.yml đã set context đúng):
#   cd apps/design-worker && docker compose up -d --build
#
# 1 stage duy nhất — cố tình KHÔNG dùng `pnpm deploy` (bug ENOENT unlink với
# workspace trên pnpm 8). Image ~1.5GB, đổi lấy build ổn định.

FROM node:20-slim
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /repo
COPY . .
# Chỉ install deps của worker + shared (tránh kéo cả api/web vào image).
# --prod=false vì cần typescript/tsup (devDeps) để build ngay dưới.
RUN pnpm install --frozen-lockfile --prod=false --filter design-worker --filter shared
RUN pnpm --filter shared build && pnpm --filter design-worker build
# Thư mục tạm xử lý file lớn (compose mount tmpfs đè lên).
RUN mkdir -p /tmp/design-worker
CMD ["node", "apps/design-worker/dist/index.js"]
