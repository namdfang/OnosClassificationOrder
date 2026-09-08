#!/usr/bin/env bash
#
# dev-autopull.sh — máy dev tự kéo code mới, để nhiều dev cùng dùng chung một
# môi trường dev mà KHÔNG ai cần SSH vào máy này.
#
# Vì sao có (08/09/2026): dev server chạy ba service ở chế độ tự nạp lại
# (`onos-api-dev` nodemon, `onos-web-dev` vite, `onos-seller-dev` next dev) trên
# đúng MỘT cây làm việc ở /root/.vibedev/repos/onos. Ai muốn thử code trên dev
# đều phải nhờ người có quyền vào máy `git pull` hộ. Script này chạy theo hẹn
# giờ: có commit mới trên nhánh theo dõi thì kéo về, và chỉ làm thêm việc khi
# thật sự cần.
#
# Ba nguyên tắc AN TOÀN, đừng bỏ:
#  1. **Chỉ đi thẳng** (`merge --ff-only`). Nhánh trên máy dev lệch khỏi remote
#     thì DỪNG và báo, không bao giờ `reset --hard` — trên máy này có thể đang
#     có việc dở của người khác.
#  2. **Cây làm việc bẩn thì bỏ qua lượt đó.** Kéo đè lên file đang sửa là mất
#     việc của người đang ngồi máy.
#  3. **Một lượt một lúc** (`flock`). Cài đặt kéo dài quá một phút mà lượt sau
#     chen vào là hỏng `node_modules`.
#
# Cài đặt / gỡ:
#   ./dev-autopull.sh --install          # chép ra /usr/local/bin + bật timer
#   systemctl disable --now onos-dev-autopull.timer
# Xem lượt kéo gần nhất:
#   tail -30 /var/log/onos-dev-autopull.log
#
# Bản chạy thật nằm ở /usr/local/bin/onos-dev-autopull — CỐ Ý chép ra ngoài
# repo, vì script nằm trong repo tự sửa chính mình giữa lúc đang chạy.
set -u

REPO_DIR="${ONOS_REPO_DIR:-/root/.vibedev/repos/onos}"
BRANCH="${ONOS_DEV_BRANCH:-main}"
LOG="${ONOS_AUTOPULL_LOG:-/var/log/onos-dev-autopull.log}"
LOCK=/var/lock/onos-dev-autopull.lock
INSTALLED=/usr/local/bin/onos-dev-autopull

log() { echo "$(date '+%d/%m %H:%M:%S') $*" >>"$LOG"; }

# ─── --install ───────────────────────────────────────────────────────
if [ "${1:-}" = "--install" ]; then
  install -m 755 "$0" "$INSTALLED"
  cat >/etc/systemd/system/onos-dev-autopull.service <<UNIT
[Unit]
Description=OnosFactory DEV tu keo code moi tu nhanh $BRANCH
After=network-online.target

[Service]
Type=oneshot
Environment=ONOS_DEV_BRANCH=$BRANCH
ExecStart=$INSTALLED
UNIT
  cat >/etc/systemd/system/onos-dev-autopull.timer <<'UNIT'
[Unit]
Description=Chay onos-dev-autopull moi phut

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now onos-dev-autopull.timer
  echo "Đã bật. Nhánh theo dõi: $BRANCH · log: $LOG"
  systemctl list-timers onos-dev-autopull.timer --no-pager | head -3
  exit 0
fi

# ─── một lượt ────────────────────────────────────────────────────────
exec 9>"$LOCK"
flock -n 9 || exit 0

cd "$REPO_DIR" || { log "LỖI: không vào được $REPO_DIR"; exit 1; }

# Gói Zalo (@zero-126/*) ở registry riêng; thiếu GHCR_TOKEN là pnpm 401 giữa chừng.
[ -f /root/.onos-ghcr.env ] && . /root/.onos-ghcr.env
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" != "$BRANCH" ]; then
  log "BỎ QUA: máy dev đang ở nhánh '$current_branch', không phải '$BRANCH'"
  exit 0
fi

git fetch --quiet origin "$BRANCH" || { log "LỖI: fetch hỏng"; exit 1; }
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$BRANCH")
[ "$local_sha" = "$remote_sha" ] && exit 0

# Chỉ tính file ĐANG THEO DÕI: file lạ (log, script nháp ai đó để lại) không bị
# ff-only ghi đè, mà tính vào đây thì một file rác cũng chặn dev đứng mãi. Trường
# hợp commit mới thêm đúng đường dẫn đó thì merge tự hỏng và được ghi log bên dưới.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "BỎ QUA: có thay đổi chưa commit trên máy dev — không kéo đè. Commit hoặc stash rồi lượt sau tự chạy."
  exit 0
fi

changed=$(git diff --name-only "$local_sha" "origin/$BRANCH")
if ! git merge --ff-only "origin/$BRANCH" >/dev/null 2>&1; then
  log "DỪNG: nhánh trên máy dev đã lệch khỏi origin/$BRANCH (cần xử lý tay)."
  exit 1
fi
log "Kéo $(git rev-parse --short "$local_sha") → $(git rev-parse --short HEAD): $(git log -1 --format='%s')"

has() { echo "$changed" | grep -q "$1"; }
restart_all=0

if has '^pnpm-lock.yaml$'; then
  log "  lockfile đổi → pnpm install"
  yes | pnpm install --frozen-lockfile >>"$LOG" 2>&1 || log "  LỖI: pnpm install hỏng"
  restart_all=1
fi
# `shared`/`core` là dist đã build; watcher của app KHÔNG tự dựng lại hộ, thiếu
# bước này là sửa DTO xong mà API vẫn cắt mất trường mới.
if has '^packages/shared/'; then
  log "  packages/shared đổi → build shared"
  pnpm --filter shared build >>"$LOG" 2>&1 || log "  LỖI: build shared hỏng"
  restart_all=1
fi
if has '^packages/core/'; then
  log "  packages/core đổi → build core"
  pnpm --filter core build >>"$LOG" 2>&1 || log "  LỖI: build core hỏng"
  restart_all=1
fi

# Mã nguồn trong apps/* thì nodemon/vite/next tự nạp lại, không đụng service.
if [ "$restart_all" = 1 ]; then
  systemctl restart onos-api-dev onos-web-dev onos-seller-dev
  log "  đã restart 3 service dev"
fi
