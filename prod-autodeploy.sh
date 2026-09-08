#!/usr/bin/env bash
#
# prod-autodeploy.sh — máy prod tự ra bản mới khi `main` đổi, NHƯNG chỉ sau khi
# GitHub Actions đã xanh cho đúng commit đó.
#
# Vì sao làm kiểu kéo (prod tự hỏi GitHub) thay vì đẩy (Actions ssh vào prod):
#  - Repo đang public nên `check-runs` đọc được KHÔNG cần khoá, không phải cất
#    secret nào ở GitHub, không phải mở cổng SSH cho dải IP của runner, và không
#    cần quyền admin repo (hiện tài khoản dùng để thao tác chỉ có quyền push).
#  - Cùng khuôn với `dev-autopull.sh` bên máy dev, một cách nghĩ cho cả hai.
#
# Kỷ luật an toàn:
#  1. **Chỉ deploy commit đã xanh.** Chưa chạy xong thì đợi lượt sau; đỏ thì bỏ
#     hẳn commit đó và ghi log (không có chuyện "chắc không sao đâu").
#  2. **Tự lùi khi health check hỏng** — `deploy.sh` đã cất commit cũ để lùi.
#  3. **Một lượt một lúc** (`flock`); build web/seller mất vài phút.
#  4. **Công tắc tạm dừng**: `touch /var/www/onosfactory/DEPLOY_PAUSE` là ngừng
#     tự động ngay, gỡ file đi thì chạy lại. Dùng khi đang có sự cố.
#
# Cài trên MÁY PROD (không phải máy dev):
#   ./prod-autodeploy.sh --install
#   systemctl disable --now onos-prod-autodeploy.timer      # tắt
#   tail -50 /var/log/onos-prod-autodeploy.log              # xem lịch sử
set -u

REPO_DIR="${ONOS_PROD_REPO_DIR:-/var/www/onosfactory/current}"
BRANCH="${ONOS_PROD_BRANCH:-main}"
GH_REPO="${ONOS_GH_REPO:-namdfang/OnosClassificationOrder}"
LOG="${ONOS_PROD_DEPLOY_LOG:-/var/log/onos-prod-autodeploy.log}"
PAUSE_FILE="${ONOS_DEPLOY_PAUSE:-/var/www/onosfactory/DEPLOY_PAUSE}"
LOCK=/var/lock/onos-prod-autodeploy.lock
INSTALLED=/usr/local/bin/onos-prod-autodeploy

log() { echo "$(date '+%d/%m %H:%M:%S') $*" >>"$LOG"; }

# Báo Telegram nếu prod có sẵn cấu hình bot (dùng lại env của app, không thêm biến mới).
notify() {
  local env_file="$REPO_DIR/apps/api/.env"
  [ -f "$env_file" ] || return 0
  local token chat
  token=$(grep -m1 '^TELEGRAM_BOT_TOKEN=' "$env_file" | cut -d= -f2- | tr -d '"')
  chat=$(grep -m1 '^TELEGRAM_NOTIFICATION_CHANNEL_ID=' "$env_file" | cut -d= -f2- | tr -d '"')
  [ -n "$token" ] && [ -n "$chat" ] || return 0
  curl -s -m 10 -o /dev/null -X POST "https://api.telegram.org/bot${token}/sendMessage" \
    --data-urlencode "chat_id=${chat}" --data-urlencode "text=$1" || true
}

# ─── --install ───────────────────────────────────────────────────────
if [ "${1:-}" = "--install" ]; then
  install -m 755 "$0" "$INSTALLED"
  cat >/etc/systemd/system/onos-prod-autodeploy.service <<UNIT
[Unit]
Description=OnosFactory PROD tu deploy khi nhanh $BRANCH xanh tren CI
After=network-online.target

[Service]
Type=oneshot
Environment=ONOS_PROD_REPO_DIR=$REPO_DIR
Environment=ONOS_PROD_BRANCH=$BRANCH
Environment=ONOS_GH_REPO=$GH_REPO
ExecStart=$INSTALLED
TimeoutStartSec=1800
UNIT
  cat >/etc/systemd/system/onos-prod-autodeploy.timer <<'UNIT'
[Unit]
Description=Kiem tra nhanh main moi 2 phut

[Timer]
OnBootSec=5min
OnUnitActiveSec=2min
AccuracySec=20s

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now onos-prod-autodeploy.timer
  echo "Đã bật. Cây: $REPO_DIR · nhánh: $BRANCH · log: $LOG"
  echo "Tạm dừng bất cứ lúc nào: touch $PAUSE_FILE"
  exit 0
fi

# ─── một lượt ────────────────────────────────────────────────────────
exec 9>"$LOCK"
flock -n 9 || exit 0

[ -f "$PAUSE_FILE" ] && exit 0
cd "$REPO_DIR" || { log "LỖI: không vào được $REPO_DIR"; exit 1; }

[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || { log "BỎ QUA: prod đang ở nhánh khác '$BRANCH'"; exit 0; }
git fetch --quiet origin "$BRANCH" || { log "LỖI: fetch hỏng"; exit 1; }

local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$BRANCH")
[ "$local_sha" = "$remote_sha" ] && exit 0

# Đã thử commit này rồi mà CI đỏ thì thôi, khỏi hỏi lại mỗi 2 phút.
SKIP_FILE="/var/lib/onos-prod-autodeploy.skip"
grep -qx "$remote_sha" "$SKIP_FILE" 2>/dev/null && exit 0

# ─── Cổng CI ─────────────────────────────────────────────────────────
# Repo public nên đọc check-runs không cần khoá. Chưa có lượt chạy nào (workflow
# vừa thêm, hoặc Actions đang tắt) thì CỐ Ý không deploy — thà đứng yên còn hơn
# ra bản không ai kiểm.
api="https://api.github.com/repos/$GH_REPO/commits/$remote_sha/check-runs"
runs=$(curl -s -m 20 -H 'Accept: application/vnd.github+json' "$api")
total=$(echo "$runs" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("total_count",0))' 2>/dev/null || echo 0)
if [ "$total" = "0" ]; then
  log "ĐỢI: $(git rev-parse --short "$remote_sha") chưa thấy lượt kiểm nào trên GitHub Actions"
  exit 0
fi
state=$(echo "$runs" | python3 -c '
import json, sys
runs = json.load(sys.stdin)["check_runs"]
ok = ("success", "neutral", "skipped")
if any(r["status"] != "completed" for r in runs):
    print("running")
elif all(r["conclusion"] in ok for r in runs):
    print("green")
else:
    print("red " + ",".join(r["name"] + "=" + str(r["conclusion"]) for r in runs if r["conclusion"] not in ok))
' 2>/dev/null || echo "unknown")

short=$(git rev-parse --short "$remote_sha")
case "$state" in
  running) log "ĐỢI: CI đang chạy cho $short"; exit 0 ;;
  green) : ;;
  red*) log "BỎ: CI đỏ cho $short — ${state#red }"
        mkdir -p "$(dirname "$SKIP_FILE")"; echo "$remote_sha" >>"$SKIP_FILE"
        notify "🔴 OnosFactory: bỏ deploy $short vì CI đỏ (${state#red })"
        exit 0 ;;
  *) log "BỎ QUA: không đọc được kết quả CI cho $short"; exit 0 ;;
esac

# ─── Deploy ──────────────────────────────────────────────────────────
subject=$(git log -1 --format='%s' "$remote_sha")
log "CI xanh cho $short — bắt đầu deploy: $subject"
notify "🚀 OnosFactory: deploy $short — $subject"

# Truyền THẲNG sha đã xanh, không để deploy.sh tự lấy đầu nhánh — ai push chen
# vào giữa lúc build thì bản đó chờ lượt sau và được chấm CI riêng.
if ./deploy.sh "$remote_sha" >>"$LOG" 2>&1; then
  log "XONG: prod đang chạy $(git rev-parse --short HEAD)"
  notify "✅ OnosFactory: prod đã lên $(git rev-parse --short HEAD)"
else
  log "HỎNG: deploy lỗi — đang tự lùi về bản trước"
  if ./deploy.sh --rollback >>"$LOG" 2>&1; then
    log "  đã lùi về $(git rev-parse --short HEAD)"
    notify "⚠️ OnosFactory: deploy $short hỏng, đã tự lùi về $(git rev-parse --short HEAD). Xem $LOG"
  else
    log "  LÙI CŨNG HỎNG — cần vào máy xử lý tay"
    notify "🔥 OnosFactory: deploy $short hỏng VÀ lùi cũng hỏng — cần vào máy prod xử lý tay ngay"
  fi
  # Không thử lại commit này nữa, tránh vòng lặp deploy-hỏng-lùi.
  mkdir -p "$(dirname "$SKIP_FILE")"; echo "$remote_sha" >>"$SKIP_FILE"
fi
