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

echo "→ Pulling latest code..."
git pull origin main

echo "→ Installing deps..."
pnpm install --frozen-lockfile

echo "→ Building shared (DTO)..."
pnpm --filter shared build

echo "→ Building API..."
pnpm build:api

echo "→ Building Web..."
pnpm build:web

echo "→ Reloading API (PM2)..."
cd apps/api
NODE_ENV=production pm2 reload ecosystem.config.cjs --update-env
pm2 save >/dev/null

echo "→ Deploying Web static files..."
rm -rf "$WEB_DIR"/*
cp -r "$REPO_DIR"/apps/web/dist-prod/* "$WEB_DIR"/

echo "✅ Deploy complete — commit $(git -C "$REPO_DIR" rev-parse --short HEAD)"
