# Deployment — onosfactory lên Ubuntu VPS

> **Phạm vi:** Hướng dẫn riêng cho monorepo onosfactory (apps/api + apps/web + packages/shared). Giả định bạn đã có 1 Ubuntu VPS (22.04 hoặc 24.04 LTS), đã SSH được, có user sudo, domain đã trỏ về IP VPS.
>
> **Stack:** NestJS Fastify (port `3007`) + React Vite (build static) + Mongo replica set + Redis + RabbitMQ + (optional Elasticsearch). PM2 chạy backend, Nginx reverse proxy + serve frontend static.

---

## 0. Cài đặt môi trường runtime (lần đầu)

Chạy tuần tự từng block. Mỗi block độc lập — có thể skip nếu đã cài, kiểm tra lại 1 lượt ở §0.12.

> Toàn bộ chạy dưới user thường có quyền sudo. Đừng đăng nhập trực tiếp root.

### 0.1 Update apt + công cụ cơ bản

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget gnupg ca-certificates lsb-release build-essential ufw
```

### 0.2 Set timezone Việt Nam

```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
timedatectl                 # verify: Time zone = Asia/Ho_Chi_Minh
```

> Quan trọng — code dùng `new Date()` ở server cho audit log, cron BullMQ, default date filter. Sai timezone → log lệch ngày, dashboard "hôm nay" ra rỗng.

### 0.3 Node 20 LTS qua NodeSource

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v                     # v20.x.x
npm -v
```

### 0.4 pnpm 8.6.10 (khớp `package.json` → `packageManager`)

```bash
sudo npm install -g pnpm@8.6.10
pnpm -v                     # 8.6.10
```

> Đừng cài qua `corepack` vì cần enable mỗi shell mới — global npm gọn hơn cho VPS.

### 0.5 PM2 (process manager)

```bash
sudo npm install -g pm2
pm2 -v
```

### 0.6 MongoDB + replica set

Check version Ubuntu trước:

```bash
lsb_release -cs       # noble = 24.04 | jammy = 22.04 | focal = 20.04
```

**Chọn version MongoDB theo OS:**

| Ubuntu        | MongoDB version                  | Codename trong URL      |
| ------------- | -------------------------------- | ----------------------- |
| 24.04 (noble) | **8.0** (7.0 chưa có repo noble) | `noble/mongodb-org/8.0` |
| 22.04 (jammy) | 7.0 hoặc 8.0                     | `jammy/mongodb-org/7.0` |
| 20.04 (focal) | 7.0                              | `focal/mongodb-org/7.0` |

Block dưới mặc định **MongoDB 7.0 + jammy**. Trên Ubuntu 24.04 → đổi `7.0`→`8.0`, `jammy`→`noble` trong cả URL key, URL repo, và path keyring.

```bash
# 1) Import GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

#   curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc
# -----BEGIN PGP PUBLIC KEY BLOCK-----
# Version: GnuPG v1

# mQINBGPILWABEACqeWP/ktugdlWEyk7YTXo3n19+5Om4AlSdIyKv49vAlKtzCfMA
# QkZq3mfvjXiKMuLnL2VeElAJQIYcPoqnHf6tJbdrNv4AX2uI1cTsvGW7YS/2WNwJ
# C/+vBa4o+yA2CG/MVWZRbtOjkFF/W07yRFtNHAcgdmpIjdWgSnPQr9eIqLuWXIhy
# H7EerKsba227Vd/HfvKnAy30Unlsdywy7wi1FupzGJck0TPoOVGmsSpSyIQu9A4Z
# uC6TE/NcJHvaN0JuHwM+bQo9oWirGsZ1NCoVqSY8/sasdUc7T9r90MbUcH674YAR
# 8OKYVBzU0wch4VTFhfHZecKHQnZf+V4dmP9oXnu4fY0/0w3l4jaew7Ind7kPg3yN
# hvgAkBK8yRAbSu1NOtHDNiRoHGEQFgct6trVOvCqHbN/VToLNtGk0rhKGOp8kuSF
# OJ02PJPxF3/zHGP8n8khCjUJcrilYPqRghZC8ZWnCj6GJVg6WjwLi+hPwNMi8xK6
# cjKhRW3eCy5Wcn73PzVBX9f7fSeFDJec+IfS47eNkxunHAOUMXa2+D+1xSWgEfK0
# PClfyWPgLIXY2pGQ6v8l3A6P5gJv4o38/E1h1RTcO3H1Z6cgZLIORZHPyAj50SPQ
# cjzftEcz56Pl/Cyw3eMYC3qlbABBgsdeb6KB6G5dkNxI4or3MgmxcwfnkwARAQAB
# tDdNb25nb0RCIDcuMCBSZWxlYXNlIFNpZ25pbmcgS2V5IDxwYWNrYWdpbmdAbW9u
# Z29kYi5jb20+iQI+BBMBAgAoBQJjyC1gAhsDBQkJZgGABgsJCAcDAgYVCAIJCgsE
# FgIDAQIeAQIXgAAKCRAWDSa7F4W6OM+eD/sE7KbJyRNWyPCRTqqJXrXvyPqZtbFX
# 8sio0lQ8ghn4f7lmb7LnFroUsmBeWaYirM8O3b2+iQ9oj4GeR3gbRZsEhFXQfL54
# SfrmG9hrWWpJllgPP7Six+jrzcjvkf1TENqw4jRP+cJhuihH1Gfizo9ktwwoN9Yr
# m7vgh+focEEmx8dysS38ApLxKlUEfTsE9bYsClgqyY1yrt3v4IpGbf66yfyBHNgY
# sObR3sngDRVbap7PwNyREGsuAFfKr/Dr37HfrjY7nsn3vH7hbDpSBh+H7a0b/chS
# mM60aaG4biWpvmSC7uxA/t0gz+NQuC4HL+qyNPUxvyIO+TwlaXfCI6ixazyrH+1t
# F7Bj5mVsne7oeWjRrSz85jK3Tpn9tj3Fa7PCDA6auAlPK8Upbhuoajev4lIydNd2
# 70yO0idm/FtpX5a8Ck7KSHDvEnXpN70imayoB4Fs2Kigi2BdZOOdib16o5F/9cx9
# piNa7HotHCLTfR6xRmelGEPWKspU1Sm7u2A5vWgjfSab99hiNQ89n+I7BcK1M3R1
# w/ckl6qBtcxz4Py+7jYIJL8BYz2tdreWbdzWzjv+XQ8ZgOaMxhL9gtlfyYqeGfnp
# hYW8LV7a9pavxV2tLuVjMM+05ut/d38IkTV7OSJgisbSGcmycXIzxsipyXJVGMZt
# MFw3quqJhQMRsA==
# =gbRM
# -----END PGP PUBLIC KEY BLOCK-----

# 2) Add repo. CHÚ Ý: "ubuntu jammy" phải có SPACE giữa.
#    Tee đôi khi paste dính → mở nano sửa tay hoặc:
#    sudo sed -i 's|ubuntujammy|ubuntu jammy|' /etc/apt/sources.list.d/mongodb-org-7.0.list
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
cat /etc/apt/sources.list.d/mongodb-org-7.0.list   # verify "ubuntu jammy" rời nhau

# 3) Cài + start
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
sudo systemctl status mongod    # active (running) — Ctrl+C để thoát
mongod --version                # v7.0.x
```

**Troubleshoot lỗi hay gặp khi cài Mongo:**

| Lỗi                                                                                      | Nguyên nhân                                                                   | Fix                                                                           |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `NO_PUBKEY ...` lúc `apt update`                                                         | GPG keyring rỗng (curl fail silently)                                         | `sudo rm` keyring → tải lại bằng `wget -qO- ... \| sudo gpg --dearmor -o ...` |
| `Malformed entry ... (Suite)`                                                            | repo file thiếu space giữa `ubuntu` và codename (dính chữ)                    | `sudo sed -i 's\|ubuntu<codename>\|ubuntu <codename>\|'` hoặc sửa nano        |
| `Malformed entry ... (Component)`                                                        | Giống trên                                                                    | Giống trên                                                                    |
| `Unable to locate package mongodb-org`                                                   | Sai codename **HOẶC** chưa `sudo apt update` sau khi sửa repo                 | Verify `cat` file + chạy lại `apt update`                                     |
| `Unable to locate package mongodb-org` trên Ubuntu 24.04 với repo `7.0/noble`            | MongoDB 7.0 không có release `noble`                                          | Chuyển sang `8.0` — đổi URL key + repo + keyring path                         |
| `BadValue: security.keyFile is required when authorization is enabled with replica sets` | Bật cả `replication` + `authorization` cần `keyFile` cho internal auth của RS | Xem §8.1 — sinh keyfile và thêm `security.keyFile: /etc/mongo-keyfile`        |

**Bật replica set** (bắt buộc — code dùng transactions, `DB_URI` có `?replicaSet=rs0`):

```bash
sudo nano /etc/mongod.conf
```

Sửa 2 block sau (giữ các block khác):

```yaml
net:
  bindIp: 127.0.0.1 # chỉ nghe localhost — KHÔNG đổi thành 0.0.0.0

replication:
  replSetName: rs0
```

Lưu (`Ctrl+O`, `Enter`, `Ctrl+X`) rồi:

```bash
sudo systemctl restart mongod
mongosh --eval 'rs.initiate()'                       # chạy 1 lần
mongosh --eval 'rs.status().members[0].stateStr'     # phải in PRIMARY
```

### 0.7 Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping                  # PONG
```

Đặt password (ghi lại để điền `.env` ở §3):

```bash
sudo nano /etc/redis/redis.conf
```

Tìm 2 dòng sau, uncomment + sửa:

```
bind 127.0.0.1
requirepass <Redis-Password-Mạnh>
```

```bash
sudo systemctl restart redis-server
redis-cli -a '<Redis-Password-Mạnh>' ping    # PONG
```

### 0.8 Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
nginx -v
```

Test: mở browser truy cập `http://<VPS-IP>` → thấy trang "Welcome to nginx".

### 0.9 Certbot (HTTPS Let's Encrypt — chuẩn bị cho §7)

```bash
sudo apt install -y certbot python3-certbot-nginx
certbot --version
```

> Chưa chạy `certbot --nginx` lúc này. Đợi §7 sau khi đã có Nginx config domain.

### 0.10 (Optional) RabbitMQ

Chỉ cài nếu sẽ dùng module messaging (`RabbitMQ_URI` trong env). Không chắc → skip, BE chạy được mà không có Rabbit.

```bash
sudo apt install -y rabbitmq-server
sudo systemctl enable --now rabbitmq-server
sudo rabbitmq-plugins enable rabbitmq_management
```

### 0.11 Firewall (ufw)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'     # 80 + 443
sudo ufw enable                 # gõ y khi confirm
sudo ufw status verbose
```

Mongo/Redis/Rabbit bind `127.0.0.1` → KHÔNG mở port ra Internet, chỉ BE local truy cập.

### 0.12 Verify cuối — tất cả phải in version, không "command not found"

```bash
node -v                                      # v20.x
pnpm -v                                      # 8.6.10
git --version                                # 2.x
pm2 -v                                       # 5.x
nginx -v                                     # nginx/1.x
mongod --version                             # v7.0.x
redis-cli -a '<Redis-Password-Mạnh>' ping    # PONG
timedatectl | grep "Time zone"               # Asia/Ho_Chi_Minh
mongosh --eval 'rs.status().ok'              # 1
```

Xong §0 — môi trường VPS sẵn sàng. Sang §1.

---

## 1. Layout thư mục trên VPS

Tách **3 thư mục riêng** cho 3 vai trò khác nhau:

```
/var/www/onosfactory/
├── current/            ← repo (clone vào đây) — owned: $USER
├── logs/               ← log PM2 + Nginx
└── shared-uploads/     ← (optional) local upload storage

/var/www/onosfactory-web/   ← FE static (Nginx serve) — owned: www-data
```

> **Lý do tách `onosfactory-web` ra:** Nginx user (`www-data`) chỉ cần đọc file FE, không cần (và không nên) có quyền vào repo. Mỗi lần deploy, `deploy.sh` copy `apps/web/dist-prod/*` → `onosfactory-web/` và `chown www-data` lại.

```bash
# Repo dir + log dir
sudo mkdir -p /var/www/onosfactory/logs
sudo chown -R $USER:$USER /var/www/onosfactory
cd /var/www/onosfactory
git clone <repo-url> current
cd current

# FE static dir (www-data sẽ owner sau deploy đầu)
sudo mkdir -p /var/www/onosfactory-web
sudo chown -R www-data:www-data /var/www/onosfactory-web
```

---

## 2. Cài dependencies + build shared package

```bash
cd /var/www/onosfactory/current

# Cài deps cho toàn workspace (pnpm tự link apps/* + packages/*)
pnpm install --frozen-lockfile

# Build shared package — apps/api và apps/web đều import từ đây.
# Nếu thiếu bước này, BE sẽ crash với "Cannot read properties of undefined"
# do các Zod schema chưa tồn tại trong dist/index.cjs.
pnpm --filter shared build
```

> **Lưu ý:** `packages/shared` có `postinstall: pnpm run build` → `pnpm install` đã tự build. Nhưng nếu chỉ pull code và build BE/FE, **luôn rebuild shared trước** khi đổi DTO.

---

## 3. Cấu hình env cho Backend (`apps/api`)

### 3.1 File env

Tạo 2 file (vì `start.js` load `.env` rồi mới load `.env.${NODE_ENV}`):

```bash
cd /var/www/onosfactory/current/apps/api
cp .env.example .env             # chỉ chứa: NODE_ENV=production
nano .env                        # đổi thành: NODE_ENV=production
cp .env.development.example .env.production
nano .env.production             # điền giá trị thật (xem §3.2)
```

Set quyền chặt:

```bash
chmod 600 .env .env.production
```

### 3.2 Các biến BẮT BUỘC phải điền cho production

| Biến                                                        | Giá trị                                                                           | Ghi chú                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `APP_NAME`                                                  | `onosfactory-api`                                                                 | PM2 dùng để đặt tên process                             |
| `PORT`                                                      | `3007`                                                                            | Phải khớp Nginx upstream                                |
| `TRANSPORT_PORT`                                            | `8080`                                                                            | RabbitMQ microservice — bỏ qua nếu không dùng           |
| `API_VERSION`                                               | `v1.0.0`                                                                          | FE gọi `/v1/...` — KHÔNG đổi                            |
| `WEB_URL`                                                   | `https://app.your-domain.com`                                                     | CORS allow-list                                         |
| `DB_URI`                                                    | `mongodb://127.0.0.1:27017/onosfactory-prod?replicaSet=rs0&directConnection=true` | Replica set bắt buộc                                    |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`                        | Sinh cặp RSA mới                                                                  | **KHÔNG dùng key trong file example**                   |
| `MASTER_PASSWORD`                                           | Random 32+ ký tự                                                                  | Đổi khác example                                        |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Theo Redis của bạn                                                                |                                                         |
| `REDIS_CACHE_ENABLED`                                       | `true`                                                                            | Bật cache 60s cho `/v1/orders` + `/v1/orders/dashboard` |
| `RATE_LIMITER_ENABLED`                                      | `true`                                                                            |                                                         |
| `ADMIN_EMAIL`                                               | email admin                                                                       | Seed user đầu                                           |
| `RabbitMQ_URI`                                              | `amqp://user:pass@127.0.0.1:5672`                                                 | Nếu không có Rabbit → để rỗng, BE skip                  |
| `BULLMQ_REFRESH_TRACKING_STATUS_CRON_TIME`                  | `"*/30 * * * *"`                                                                  | Hoặc disable bằng cách comment                          |
| `ENABLE_DOCUMENTATION`                                      | `false` cho prod (ẩn `/api-docs`)                                                 |                                                         |
| `ENABLE_ORM_LOGS`                                           | `false`                                                                           | Đỡ noise log                                            |
| `FALLBACK_LANGUAGE`                                         | `vi_VN`                                                                           | i18n                                                    |

### 3.3 Sinh JWT keypair mới

```bash
cd /tmp
openssl genrsa -out jwt_private.pem 4096
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem

# Convert sang format inline cho .env (literal \n)
awk 'NR==1{printf "%s", $0; next} {printf "\\n%s", $0} END{print ""}' jwt_private.pem
awk 'NR==1{printf "%s", $0; next} {printf "\\n%s", $0} END{print ""}' jwt_public.pem

rm jwt_private.pem jwt_public.pem
```

Paste output vào `.env.production` ở `JWT_PRIVATE_KEY=...` và `JWT_PUBLIC_KEY=...`.

### 3.4 Các biến optional (chỉ điền nếu dùng)

- `AWS_S3_*` — upload ảnh lên S3/Backblaze
- `GDRIVE_CDN_URL` — CDN cache ảnh Google Drive (xem `ImageOptimization.md`)
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANNEL_ID` — notification
- `RECAPTCHA_SECRET_KEY` — captcha register
- Các provider fulfillment (`FLASHSHIP_*`, `BURGER_PRINTS_*`, ...) — chỉ cần nếu module đó được dùng
- `ELASTICSEARCH_HOST` + `ELASTICSEARCH_APIKEY` — log user action; bỏ qua nếu không cần
- `PAYOS_*` — top-up; bỏ qua nếu không dùng billing
- `API_KEY_MASTER_KEY` — Partner API HMAC. Sinh: `openssl rand -base64 32`

---

## 4. Build Backend

```bash
cd /var/www/onosfactory/current/apps/api
pnpm build
```

Kết quả: `apps/api/dist-prod/main.js` (sản phẩm chạy thật) + `apps/api/dist/`.

Test boot thử 1 lần trước khi giao PM2:

```bash
NODE_ENV=production node ./start.js
# Đợi log "Nest application successfully started"
# Test: curl -i http://127.0.0.1:3007/v1/health  (nếu có) hoặc /api-docs
# Ctrl+C để dừng
```

Nếu lỗi `Cannot read properties of undefined (reading 'array')` → quay lại `pnpm --filter shared build`.

---

## 5. Chạy Backend bằng PM2

Project đã có sẵn `apps/api/ecosystem.config.cjs` (đọc env qua `dotenv`).

```bash
cd /var/www/onosfactory/current/apps/api
NODE_ENV=production pm2 start ecosystem.config.cjs

# Lưu để boot lại khi restart server
pm2 save
pm2 startup            # copy lệnh sudo nó in ra → chạy
```

Một số lệnh hay dùng:

```bash
pm2 list
pm2 logs onosfactory-api --lines 200
pm2 restart onosfactory-api
pm2 reload onosfactory-api          # zero-downtime
pm2 monit                        # CPU + RAM realtime
```

**Lưu ý code trong `ecosystem.config.cjs`:**

- `script: './start.js'` — không phải `dist-prod/main.js` trực tiếp.
- `max_memory_restart: '1G'` — process > 1G RAM thì PM2 tự restart. Nếu BE bulk-import nặng và bị restart liên tục → tăng giới hạn này trong file.
- `APP_INSTANCES` env có thể set > 1 để cluster mode, nhưng **BullMQ + WebSocket dùng in-memory state nên hiện tại để 1**.

### Script convenience trong root

`package.json` root có sẵn:

```bash
pnpm be-deploy   # = pnpm build:api && pm2 reload ecosystem.config.js
pnpm fe-deploy   # = pnpm build:web
pnpm deploy      # = build cả 2 + pm2 reload
```

Cảnh báo: script `deploy` tham chiếu `ecosystem.config.js` (root) không tồn tại — file PM2 thật đặt ở `apps/api/ecosystem.config.cjs`. Khi deploy, gọi lệnh trực tiếp:

```bash
cd /var/www/onosfactory/current
pnpm --filter shared build
pnpm --filter ./apps/api build
cd apps/api
pm2 reload ecosystem.config.cjs
```

---

## 6. Build Frontend (`apps/web`)

### 6.1 Env

```bash
cd /var/www/onosfactory/current/apps/web
cp .env.example .env.production
nano .env.production
```

Điền:

```
NODE_ENV=production
VITE_API_URL=https://api.your-domain.com
VITE_PROD=true
```

> `VITE_API_URL` được embed vào bundle tại lúc `vite build`. Đổi domain → **phải rebuild FE**.

### 6.2 Build

```bash
cd /var/www/onosfactory/current/apps/web
pnpm build
```

Output: `apps/web/dist-prod/` (Vite copy từ `dist/` qua). Đây là folder Nginx serve.

> Build FE tốn RAM (Vite + Rollup khoảng 1–2GB). Nếu VPS RAM thấp → tạo swap 2GB hoặc build local rồi rsync lên.

---

## 7. Nginx reverse proxy + serve frontend

### 7.1 Domain dự kiến

- `https://app.your-domain.com` → FE (static từ `apps/web/dist-prod`)
- `https://api.your-domain.com` → BE (proxy về `127.0.0.1:3007`)

### 7.2 File config

```bash
sudo nano /etc/nginx/sites-available/onosfactory
```

```nginx
# ─── Backend API ─────────────────────────────────────────────────
server {
    listen 80;
    server_name api.your-domain.com;

    # client_max_body_size lớn để cho phép upload mockup + bulk-import paste
    client_max_body_size 50M;

    # Tăng buffer để xử lý header lớn (JWT có thể dài do RSA-4096)
    large_client_header_buffers 4 16k;

    location / {
        proxy_pass http://127.0.0.1:3007;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;        # bulk-import có thể chạy 30–60s
        proxy_send_timeout 300s;
    }

    access_log /var/www/onosfactory/logs/api-access.log;
    error_log  /var/www/onosfactory/logs/api-error.log;
}

# ─── Frontend (SPA) ──────────────────────────────────────────────
server {
    listen 80;
    server_name app.your-domain.com;

    root /var/www/onosfactory-web;
    index index.html;

    # SPA fallback — react-router cần
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache assets dài hạn (Vite gắn hash vào tên file)
    location ~* \.(?:js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|webp|gif|ico)$ {
        expires 365d;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    # Service worker KHÔNG được cache lâu (sw.js)
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    access_log /var/www/onosfactory/logs/web-access.log;
    error_log  /var/www/onosfactory/logs/web-error.log;
}
```

### 7.3 Enable + test

```bash
sudo ln -s /etc/nginx/sites-available/onosfactory /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7.4 HTTPS bằng Certbot (Let's Encrypt)

```bash
sudo certbot --nginx -d api.your-domain.com -d app.your-domain.com
```

Certbot tự sửa block server thành HTTPS + redirect HTTP → HTTPS. Auto-renew chạy qua systemd timer `certbot.timer` — không cần làm gì thêm.

> Sau khi có HTTPS, đổi `WEB_URL` trong `.env.production` BE và `VITE_API_URL` trong `.env.production` FE thành `https://...`, rebuild FE, `pm2 reload` BE.

---

## 8. Tạo DB user + Mongo/Rabbit credential cho app

§0.6–0.10 đã cài service. Bước này tạo **user app riêng** (không dùng root) — bắt buộc cho prod.

### 8.1 MongoDB — tạo user app

**Thứ tự bắt buộc:** tạo user TRƯỚC khi bật `authorization` (nếu bật auth trước → không vào được mongosh để tạo).

#### 8.1.a Tạo user app (khi auth chưa bật)

```bash
mongosh
```

Trong mongosh:

```js
use onosfactory-prod
db.createUser({
  user: "onosfactory",
  pwd: "<DB-Password>",
  roles: [{ role: "readWrite", db: "onosfactory-prod" }]
})
// Tạo thêm 1 admin user để recovery sau này
use admin
db.createUser({ user: "root", pwd: "<Root-Password>", roles: ["root"] })
exit
```

#### 8.1.b Sinh keyfile cho replica set internal auth

Mongo bắt buộc `keyFile` khi bật auth **+** replica set, kể cả single-node. Bỏ bước này → mongod fail boot với `BadValue: security.keyFile is required when authorization is enabled with replica sets`.

```bash
sudo openssl rand -base64 756 | sudo tee /etc/mongo-keyfile > /dev/null
sudo chown mongodb:mongodb /etc/mongo-keyfile
sudo chmod 400 /etc/mongo-keyfile
ls -l /etc/mongo-keyfile
# -r-------- 1 mongodb mongodb 1024 ... /etc/mongo-keyfile
```

#### 8.1.c Bật auth trong `/etc/mongod.conf`

```bash
sudo nano /etc/mongod.conf
```

Block `security` phải có **đủ 2 dòng**, indent 2 space:

```yaml
security:
  authorization: enabled
  keyFile: /etc/mongo-keyfile
```

Restart + verify:

```bash
sudo systemctl restart mongod
sudo systemctl status mongod      # active (running)
```

#### 8.1.d Test connect bằng user app

```bash
# Lưu ý: PHẢI dùng single quote vì password có ! / $ / ` / \
mongosh 'mongodb://onosfactory:Dieuanh1108!@127.0.0.1:27017/onosfactory-prod?authSource=onosfactory-prod' --eval 'db.runCommand({ping:1})'
# { ok: 1 }
```

#### 8.1.e Update `.env.production` (§3)

```
DB_URI=mongodb://onosfactory:<DB-Password>@127.0.0.1:27017/onosfactory-prod?replicaSet=rs0&directConnection=true&authSource=onosfactory-prod
```

> File `.env` đọc bằng dotenv, không qua shell → KHÔNG cần quote, KHÔNG cần escape `!`/`$`/`` ` ``.
> Nhưng mọi lệnh CLI (`mongosh`, `mongodump`, `mongorestore`) **luôn dùng single quote** quanh URI.

### 8.2 Redis

Password đã đặt ở §0.7. Chỉ cần verify `.env.production`:

```
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=<Redis-Password-Mạnh>
REDIS_DB=1
REDIS_CACHE_ENABLED=true
```

### 8.3 RabbitMQ (skip nếu §0.10 đã skip)

```bash
sudo rabbitmqctl add_user onosfactory <RABBIT-Password>
sudo rabbitmqctl add_vhost onosfactory
sudo rabbitmqctl set_permissions -p onosfactory onosfactory ".*" ".*" ".*"

# Xóa user guest mặc định (chỉ login được từ localhost nhưng vẫn nên xóa)
sudo rabbitmqctl delete_user guest
```

`.env.production`:

```
RabbitMQ_URI=amqp://onosfactory:<RABBIT-Password>@127.0.0.1:5672/onosfactory
```

---

## 9. Seed dữ liệu khởi tạo

Module auth có seed default roles + admin user. Sau khi BE chạy lần đầu, `OrderService.onModuleInit()` cũng tự backfill `originalFactoryId` cho legacy orders (xem `Orders.md §11.4`).

Nếu cần chạy seed thủ công:

```bash
cd /var/www/onosfactory/current/apps/api
NODE_ENV=production pnpm seed
```

> Workshop config (`workshop_config`) và Product config (`product_config`) hiện không có seed sẵn. Admin phải tạo qua UI:
>
> 1. Đăng nhập với `ADMIN_EMAIL`
> 2. Vào `/workshop-config` tạo các category: `print_status`, `print_status_note`, `tool_result`, `tool_result_note`, `error_file_type`, `assignee`, `assignee_note`, `fabric_type` (xem `WorkshopConfig.md`)
> 3. Vào `/products` tạo product config — gắn `fabricType` + `toolResult` để import auto-derive (xem `Orders.md §3.3`)

---

## 10. Quy trình deploy lần kế tiếp (sau lần đầu)

Đóng gói trong `deploy.sh` ở repo root.

### 10.1 Setup lần đầu (chỉ làm 1 lần)

```bash
ssh user@vps
cd /var/www/onosfactory/current
chmod +x deploy.sh
```

Đồng thời tạo sudoers entry cho user (vì script cần `sudo cp` + `sudo chown` lên `/var/www/onosfactory-web` mà không hỏi password):

```bash
sudo visudo -f /etc/sudoers.d/onosfactory-deploy
```

Paste (đổi `<USER>` thành tên user của bạn):

```
<USER> ALL=(ALL) NOPASSWD: /bin/rm -rf /var/www/onosfactory-web/*, /bin/cp -r /var/www/onosfactory/current/apps/web/dist-prod/* /var/www/onosfactory-web/, /bin/chown -R www-data\:www-data /var/www/onosfactory-web
```

> Restrict chỉ cho 3 lệnh cụ thể trên đúng path — đỡ rủi ro hơn `ALL=(ALL) NOPASSWD: ALL`.

### 10.2 Mỗi lần deploy

```bash
ssh user@vps
cd /var/www/onosfactory/current
./deploy.sh
```

Script chạy tuần tự (fail-fast với `set -e`):

1. `git pull origin main`
2. `pnpm install --frozen-lockfile`
3. `pnpm --filter shared build` — bắt buộc trước (DTO mới sẽ cần)
4. `pnpm build:api` (turbo build → `dist-prod/main.js`)
5. `pnpm build:web` (Vite build → `dist-prod/`)
6. `pm2 reload ecosystem.config.cjs --update-env` + `pm2 save`
7. Sync `apps/web/dist-prod/*` → `/var/www/onosfactory-web/` + `chown www-data:www-data` (Nginx pick up tự động vì root cố định)

### 10.3 Rollback nhanh

```bash
cd /var/www/onosfactory/current
git log --oneline -10
git checkout <commit-hash-cũ>
./deploy.sh    # build + reload với code đã checkout
# Sau đó: git checkout main để quay về head trước khi push fix
```

> Đừng vừa rollback vừa debug ở prod. Rollback xong, sửa commit lỗi ở local, test, push, deploy lại.

### 10.4 Khi nào KHÔNG dùng deploy.sh

- **Lần deploy đầu tiên** — chạy tay theo §1–§7 vì cần setup `.env`, Nginx, certbot, seed admin.
- **Migration MongoDB schema** — chạy migration script bằng tay TRƯỚC, rồi mới `./deploy.sh`.
- **Đổi PM2 ecosystem config** (vd. `max_memory_restart`) — `pm2 reload` đôi khi không apply; dùng `pm2 delete <name> && pm2 start ecosystem.config.cjs`.
- **Đổi env BE** (vd. swap MongoDB URI) — sửa `.env.production` xong, chạy `./deploy.sh` (script có `--update-env` cho PM2).

---

## 11. Health check + monitoring

| Mục              | Lệnh / Cách                                                                            |
| ---------------- | -------------------------------------------------------------------------------------- |
| BE process       | `pm2 list` → status `online`, restart count = 0 (hoặc thấp)                            |
| BE log           | `pm2 logs onosfactory-api --lines 200`                                                 |
| BE RAM           | `pm2 monit` → < 1GB (max_memory_restart)                                               |
| Nginx            | `sudo systemctl status nginx`, log `/var/www/onosfactory/logs/*.log`                   |
| Mongo connection | `mongosh "$DB_URI" --eval 'db.runCommand({ping:1})'`                                   |
| Redis            | `redis-cli -a "$REDIS_PASSWORD" ping`                                                  |
| HTTPS cert hạn   | `sudo certbot certificates`                                                            |
| Đo bị 502        | `tail -f /var/www/onosfactory/logs/api-error.log` — thường là BE crash, xem `pm2 logs` |

PM2 cài tiện ích log rotate:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
```

---

## 12. Backup

| Đối tượng                 | Cách                                                                    | Tần suất                                            |
| ------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| MongoDB                   | `mongodump --uri="$DB_URI" --gzip --out=/var/backups/mongo/$(date +%F)` | Daily (cron 03:00)                                  |
| `.env.production` BE + FE | Lưu offline (1Password / Bitwarden)                                     | Mỗi lần đổi                                         |
| JWT keypair               | Lưu offline                                                             | Sinh 1 lần, không xoay (xoay = đăng xuất toàn user) |
| File upload (nếu local)   | rsync sang storage khác                                                 | Daily                                               |

Cron mẫu cho mongodump:

```cron
0 3 * * * mongodump --uri='mongodb://onosfactory:<pwd>@127.0.0.1:27017/onosfactory-prod?replicaSet=rs0' --gzip --out=/var/backups/mongo/$(date +\%F) >> /var/www/onosfactory/logs/backup.log 2>&1
0 4 * * * find /var/backups/mongo -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} \;
```

---

## 13. Troubleshooting nhanh

| Triệu chứng                                                                 | Nguyên nhân hay gặp                                                         | Cách fix                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| BE crash `Cannot read properties of undefined (reading 'array')`            | Shared DTO chưa rebuild                                                     | `pnpm --filter shared build` rồi rebuild BE                                |
| BE log `MongooseError: Could not connect ... replicaSet`                    | Mongo chưa init replica set                                                 | `mongosh --eval 'rs.initiate()'`                                           |
| FE login xong bị 401 toàn API                                               | `WEB_URL` BE không khớp domain FE → CORS reject                             | Sửa `.env.production` BE → `pm2 reload`                                    |
| FE call `localhost:3007` ở prod                                             | Build FE quên set `VITE_API_URL`                                            | Sửa `.env.production` web → `pnpm build` lại                               |
| Bảng đơn hiển thị giờ lệch                                                  | Server không phải `Asia/Ho_Chi_Minh`                                        | `sudo timedatectl set-timezone Asia/Ho_Chi_Minh`                           |
| Bulk import 502 sau 60s                                                     | Nginx default `proxy_read_timeout` = 60s                                    | Block API trong Nginx đã set 300s — verify Nginx reload sau khi sửa config |
| FE load trang trắng + console `Failed to fetch dynamically imported module` | User đang cache bundle cũ (Vite hash đổi sau deploy)                        | Service worker sẽ tự refresh; hoặc Ctrl+Shift+R                            |
| `pm2 reload` xong vẫn dùng code cũ                                          | `start.js` cache module — đôi khi cần `pm2 restart` (không reload)          | `pm2 restart onosfactory-api`                                              |
| Redis log `WRONGPASS`                                                       | Đặt password trong `.env` nhưng quên restart Redis sau khi sửa `redis.conf` | `sudo systemctl restart redis`                                             |

---

## 14. Checklist trước khi go-live

- [ ] `.env.production` BE đã đổi `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `MASTER_PASSWORD`, `API_KEY_MASTER_KEY` khác file example
- [ ] `WEB_URL` (BE) và `VITE_API_URL` (FE) trỏ về domain HTTPS thật
- [ ] `ENABLE_DOCUMENTATION=false` (ẩn Swagger ở prod)
- [ ] `ENABLE_ORM_LOGS=false`
- [ ] MongoDB user app có password, bind `127.0.0.1`, replica set OK
- [ ] Redis có password, bind `127.0.0.1`
- [ ] Nginx có HTTPS (Certbot), `client_max_body_size 50M`, proxy timeout 300s
- [ ] PM2 `pm2 save` + `pm2 startup` đã set → reboot VPS không mất process
- [ ] Cron backup MongoDB chạy được (test trước: `mongorestore --dryRun`)
- [ ] Tạo admin user đầu tiên qua seed hoặc UI
- [ ] Tạo workshop_config + product_config qua UI
- [ ] Smoke test: login → vào `/dashboard?tab=factory` → bấm "Xuất Excel" → kiểm tra file `.xlsx` tải về có 4 loại sheet
- [ ] Smoke test: vào `/orders` → tab Import → paste 1 dòng test → verify upsert + auto-derive fabricType
- [ ] Verify timezone server = `Asia/Ho_Chi_Minh` (`timedatectl`)

mongorestore --uri='mongodb://onosfactory:Dieuanh1108@127.0.0.1:27017/?replicaSet=rs0&authSource=onosfactory-prod' --gzip --drop --nsFrom='onos-classifycation._' --nsTo='onosfactory-prod._' /tmp/onosfactory-\*/
