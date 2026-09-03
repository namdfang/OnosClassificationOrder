#!/bin/bash
#
# deploy.sh — onosfactory: pull + build + reload PM2 + swap FE static
#
# Usage:
#   ./deploy.sh            deploy origin/main (mặc định)
#   ./deploy.sh <nhánh>    deploy một nhánh khác (dùng khi main có commit chưa muốn lên)
#   ./deploy.sh --rollback lùi về bản deploy trước
#   ./deploy.sh --status   xem đang chạy commit nào, có bản nào lùi về được
#
# Setup lần đầu:  chmod +x deploy.sh
#
set -e

REPO_DIR=/var/www/onosfactory/current
# nginx đọc thẳng thư mục này (xem `root` trong /etc/nginx/sites-enabled/onosfactory).
WEB_DIR="$REPO_DIR/apps/web/dist-prod"
# Bản web trước đó, giữ lại để lùi khi bản mới hỏng.
WEB_PREV="$REPO_DIR/apps/web/.dist-prod-prev"
# Commit đang chạy trước lần deploy này — cơ sở cho --rollback.
STATE_FILE="$REPO_DIR/.deploy-previous-commit"
# Gốc API: trả 200 khi Nest đã dựng xong route, không cần token và không chạm
# dữ liệu. Cố ý KHÔNG dùng một endpoint nghiệp vụ nào làm health check — làm vậy
# là mỗi lần deploy lại gọi vào đường đi thật của hệ thống.
HEALTH_URL="http://127.0.0.1:3007/api/v1"

cd "$REPO_DIR"

# Gói Zalo (@zero-126/*) nằm ở registry riêng; `.npmrc` gốc repo đọc token từ
# biến GHCR_TOKEN. Shell không tương tác (ssh, cron) không nạp ~/.bashrc nên
# nạp thẳng ở đây — thiếu token là pnpm trả 401 giữa chừng.
[ -f /root/.onos-ghcr.env ] && . /root/.onos-ghcr.env

# ─── --status ────────────────────────────────────────────────────────
if [ "$1" = "--status" ]; then
  echo "Đang chạy : $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"
  echo "Deploy lúc: $(git log -1 --format='%ad' --date=format:'%d/%m/%Y %H:%M')"
  if [ -f "$STATE_FILE" ]; then
    prev=$(cat "$STATE_FILE")
    echo "Lùi về được: $(git rev-parse --short "$prev") — $(git log -1 --format='%s' "$prev")"
  else
    echo "Lùi về được: (chưa có — lần deploy tới sẽ ghi lại)"
  fi
  [ -d "$WEB_PREV" ] && echo "Web bản trước: có" || echo "Web bản trước: chưa có"
  exit 0
fi

# ─── --rollback ──────────────────────────────────────────────────────
#
# Lùi bằng cách checkout lại commit cũ rồi build lại, KHÔNG phải chỉ đổi thư
# mục web: bản web cũ mà chạy với API mới thì hai bên lệch DTO, lỗi ra còn khó
# hiểu hơn cả sự cố ban đầu.
if [ "$1" = "--rollback" ]; then
  [ -f "$STATE_FILE" ] || { echo "✗ Chưa có bản nào để lùi về."; exit 1; }
  prev=$(cat "$STATE_FILE")
  echo "→ Lùi về $(git rev-parse --short "$prev") — $(git log -1 --format='%s' "$prev")"
  git reset --hard "$prev"
  # `yes |`: khi tập registry đổi (lần đầu có @zero-126), pnpm HỎI "xoá node_modules
# cài lại?" — chạy không tương tác nó THOÁT 0 MÀ KHÔNG CÀI GÌ, build tiếp với deps
# thiếu và API sập lúc khởi động (sự cố 03/09/2026). Trả lời sẵn rồi kiểm lại.
yes | pnpm install --frozen-lockfile
# Giải từ THƯ MỤC apps/api, không phải gốc repo: pnpm cài theo kiểu cô lập nên
# gói chỉ nằm ở `apps/api/node_modules`, gốc repo không thấy nó.
node -e "require.resolve('@zero-126/zalo-sdk/next', { paths: ['$REPO_DIR/apps/api'] })" 2>/dev/null \
  || { echo "✗ Thiếu gói @zero-126/zalo-sdk sau khi cài — kiểm tra GHCR_TOKEN (/root/.onos-ghcr.env)."; exit 1; }
  pnpm --filter shared build
  pnpm build:api
  (cd apps/api && NODE_ENV=production pm2 restart ecosystem.config.cjs --update-env && pm2 save >/dev/null)
  # Web: nếu còn bản trước thì dùng lại luôn cho nhanh, không thì build lại.
  if [ -d "$WEB_PREV" ]; then
    rm -rf "$WEB_DIR" && mv "$WEB_PREV" "$WEB_DIR"
    echo "  → Web: dùng lại bản đã lưu"
  else
    NODE_HEAP_MB=4536 pnpm build:web
  fi
  echo "✅ Đã lùi về $(git rev-parse --short HEAD)"
  exit 0
fi

BRANCH="${1:-main}"

# ─── Ghi lại commit đang chạy TRƯỚC khi đụng vào gì ──────────────────
git rev-parse HEAD > "$STATE_FILE"
echo "→ Bản đang chạy (để lùi nếu cần): $(git rev-parse --short HEAD)"

echo "→ Kéo code mới từ origin/$BRANCH (reset --hard để local change không chặn)..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "  → Sắp deploy: $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"

echo "→ Cài dependencies..."
# `yes |`: khi tập registry đổi (lần đầu có @zero-126), pnpm HỎI "xoá node_modules
# cài lại?" — chạy không tương tác nó THOÁT 0 MÀ KHÔNG CÀI GÌ, build tiếp với deps
# thiếu và API sập lúc khởi động (sự cố 03/09/2026). Trả lời sẵn rồi kiểm lại.
yes | pnpm install --frozen-lockfile
# Giải từ THƯ MỤC apps/api, không phải gốc repo: pnpm cài theo kiểu cô lập nên
# gói chỉ nằm ở `apps/api/node_modules`, gốc repo không thấy nó.
node -e "require.resolve('@zero-126/zalo-sdk/next', { paths: ['$REPO_DIR/apps/api'] })" 2>/dev/null \
  || { echo "✗ Thiếu gói @zero-126/zalo-sdk sau khi cài — kiểm tra GHCR_TOKEN (/root/.onos-ghcr.env)."; exit 1; }

echo "→ Build shared (DTO)..."
pnpm --filter shared build

echo "→ Build API..."
pnpm build:api

# ⚠️ Reload API NGAY sau khi build API xong, TRƯỚC bước build:web (dễ OOM trên
# server RAM thấp). Nếu build:web fail thì API vẫn đã được cập nhật — tránh tình
# trạng dist-prod có code mới nhưng process vẫn chạy code cũ.
echo "→ Reload API (PM2)..."
(cd apps/api && NODE_ENV=production pm2 restart ecosystem.config.cjs --update-env && pm2 save >/dev/null)

# ─── Kiểm tra API sống lại ───────────────────────────────────────────
#
# Không có bước này thì API chết sau restart mà script vẫn in "✅ thành công",
# và người deploy tưởng xong việc — chỉ biết khi có người dùng báo lỗi.
echo "→ Kiểm tra API..."
ok=0
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || echo 000)
  if [ "$code" = "200" ]; then ok=1; echo "  → API trả 200 sau ${i}0 giây"; break; fi
  sleep 10
done
if [ "$ok" != "1" ]; then
  echo ""
  echo "✗ API KHÔNG phản hồi sau 200 giây. Web CHƯA bị thay đổi — trang cũ vẫn đang chạy."
  echo "  Xem log:  pm2 logs onosfactory-api --err --lines 50"
  echo "  Lùi lại:  ./deploy.sh --rollback"
  exit 1
fi

# ─── Build web, giữ trang cũ sống suốt quá trình ─────────────────────
#
# `pnpm build:web` chạy: vite build → **rimraf ./dist-prod** → mkdir → cp.
# Mà nginx đọc thẳng `dist-prod`. Nghĩa là bản thân lệnh build tự tay xoá thư
# mục đang phục vụ rồi vài giây sau mới chép lại — người dùng vào đúng lúc đó
# gặp trang trắng. Đây là gốc của khoảng gián đoạn, không phải bước copy.
#
# Cách vòng qua: cất bản đang chạy đi trước, để build làm gì thì làm, xong mới
# tráo bằng `mv` (gần như tức thời). Bản cất được dùng luôn làm đường lùi.
echo "→ Cất bản web đang chạy (vừa để lùi, vừa để trang không trắng lúc build)..."
rm -rf "$WEB_PREV"
[ -d "$WEB_DIR" ] && cp -r "$WEB_DIR" "$WEB_PREV"

echo "→ Build Web (heap cap để tránh OOM trên server RAM thấp; swap qua /swapfile)..."
NODE_HEAP_MB=4536 pnpm build:web

# Build hỏng giữa chừng → `dist-prod` rỗng hoặc thiếu file. Trả lại bản cũ ngay
# thay vì để trang hỏng nằm đó chờ người phát hiện.
if [ ! -f "$WEB_DIR/index.html" ]; then
  echo "✗ Build web KHÔNG ra index.html — trả lại bản cũ."
  rm -rf "$WEB_DIR"
  [ -d "$WEB_PREV" ] && cp -r "$WEB_PREV" "$WEB_DIR"
  echo "  API đã ở bản mới, web giữ bản cũ. Chạy ./deploy.sh --rollback để đồng bộ lại."
  exit 1
fi

echo ""
echo "✅ Deploy xong — $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"
echo "   Lùi lại nếu cần:  ./deploy.sh --rollback"
