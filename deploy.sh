#!/bin/bash
#
# deploy.sh — onosfactory: pull + build + reload PM2 + sync FE static
#
# Usage:  ./deploy.sh
# Setup lần đầu:  chmod +x deploy.sh
#
set -e

REPO_DIR=/var/www/onosfactory/current
WEB_DIR=/var/www/onosfactory-web

cd "$REPO_DIR"

echo "→ Pulling latest code (reset --hard để tránh local change chặn pull)..."
git fetch origin main
git reset --hard origin/main
echo "  → Deploying commit: $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"

echo "→ Installing deps..."
pnpm install --frozen-lockfile

echo "→ Building shared (DTO)..."
pnpm --filter shared build

echo "→ Building API..."
pnpm build:api

# ⚠️ Reload API NGAY sau khi build API xong, TRƯỚC bước build:web (dễ OOM trên
# server RAM thấp). Nếu build:web fail thì API vẫn đã được cập nhật — tránh tình
# trạng dist-prod có code mới nhưng process vẫn chạy code cũ.
echo "→ Reloading API (PM2)..."
cd apps/api
NODE_ENV=production pm2 restart ecosystem.config.cjs --update-env
pm2 save >/dev/null
cd "$REPO_DIR"

echo "→ Building Web (heap cap 1536MB để tránh OS-OOM trên server RAM thấp; swap đã setup 1 lần qua /swapfile)..."
NODE_HEAP_MB=4536 pnpm build:web

echo "→ Deploying Web static files..."
rm -rf "$WEB_DIR"/*
cp -r "$REPO_DIR"/apps/web/dist-prod/* "$WEB_DIR"/

echo "✅ Deploy complete — commit $(git -C "$REPO_DIR" rev-parse --short HEAD)"
