# design-worker — build từ ROOT monorepo:
#   docker build -f apps/design-worker/Dockerfile -t design-worker .
# (docker-compose.yml trong thư mục này đã set context đúng, chỉ cần `docker compose up -d --build`)

FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@8.12.1 --activate
WORKDIR /repo
COPY . .
# Chỉ install deps của worker + shared (tránh kéo cả api/web vào image).
RUN pnpm install --frozen-lockfile --filter design-worker --filter shared
RUN pnpm --filter shared build && pnpm --filter design-worker build
# Gom node_modules production đã resolve symlink cho runtime.
RUN pnpm --filter design-worker deploy --prod /out

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
COPY --from=build /repo/apps/design-worker/dist /app/dist
# Thư mục tạm xử lý file lớn (mount tmpfs/NVMe nếu muốn).
RUN mkdir -p /tmp/design-worker
CMD ["node", "dist/index.js"]
