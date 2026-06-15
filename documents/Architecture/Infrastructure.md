# Infrastructure & Deployment — Printsel

Tài liệu mô tả infrastructure, deployment pipeline, và hướng dẫn cấu hình môi trường.

---

## 1. Deployment Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      PRODUCTION                              │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  Web App     │    │  API Server  │    │   MongoDB     │  │
│  │  (Static /   │    │  (PM2)       │    │   (Cloud)     │  │
│  │   Docker)    │    │  Port: 3007  │    │               │  │
│  └──────┬───────┘    └──────┬───────┘    └───────────────┘  │
│         │                   │                                │
│         │            ┌──────┼──────────────┐                 │
│         │            ▼      ▼              ▼                 │
│         │     ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│         │     │  Redis   │ │ RabbitMQ │ │ Elasticsearch│    │
│         │     │  (Docker)│ │ (Docker) │ │ (Docker/Opt.)│    │
│         │     └──────────┘ └──────────┘ └──────────────┘    │
│         │                                                    │
│  ┌──────┴───────────────────────────────────────────────┐   │
│  │              Backblaze B2 / AWS S3                    │   │
│  │              (Object Storage - Cloud)                 │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Docker Compose — Local Development

### 2.1 Core Services (`apps/api/docker/docker-compose.yml`)

Cung cấp RabbitMQ và Redis cho local development:

| Service | Image | Ports | Mục đích |
|---------|-------|-------|---------|
| **rabbitmq** | `rabbitmq:3-management-alpine` | `${RABBITMQ_AMQP_PORT}:5672` (AMQP), `${RABBITMQ_WEB_PORT}:15672` (Management UI) | Message broker |
| **redis** | `redis:alpine` | `${REDIS_PORT}:6379` | Cache + BullMQ backend |

**Cách chạy:**

```bash
cd apps/api/docker
docker-compose up -d
```

**Env variables cần set (trong file `.env.*`):**

```
RABBITMQ_AMQP_PORT=5672
RABBITMQ_WEB_PORT=15672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_DATA_PATH=./rabbitmq-data
RABBITMQ_LOG_PATH=./rabbitmq-logs

REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0
REDIS_DATA_PATH=./redis-data
```

### 2.2 ELK Stack (`apps/api/docker/docker-compose-elk.yml`)

Optional monitoring stack — chỉ cần khi muốn centralized logging:

| Service | Image | Port | Mục đích |
|---------|-------|------|---------|
| **elasticsearch** | `elasticsearch:8.7.1` | `${ELASTICSEARCH_PORT}:9200` | Search engine + log storage |
| **kibana** | `kibana:8.7.1` | `${KIBANA_PORT}:5601` | Visualization dashboard |
| **filebeat** | `filebeat:8.7.1` | — | Log shipper (reads from `../logs/`) |

**Cách chạy:**

```bash
cd apps/api/docker
docker-compose -f docker-compose-elk.yml up -d
```

---

## 3. PM2 — Production Process Manager

API Server được quản lý bởi PM2 trong production.

### Configuration (`apps/api/ecosystem.config.cjs`)

| Setting | Giá trị | Mô tả |
|---------|---------|-------|
| `name` | `${APP_NAME}` (from env) | Tên process trong PM2 |
| `script` | `./start.js` | Entry point |
| `instances` | `${APP_INSTANCES}` hoặc `1` | Số process instances |
| `max_memory_restart` | `1G` | Restart khi vượt 1GB RAM |

### Entry Point (`apps/api/start.js`)

Script khởi động thử load `./dist-prod/main.js` trước, fallback sang `./dist/main.js`:

```
start.js → dist-prod/main.js (preferred)
         → dist/main.js (fallback)
```

### PM2 Commands

```bash
# Deploy API (build + reload)
pnpm be-deploy    # = turbo build --filter ./apps/api && pm2 reload ecosystem.config.js

# Manual operations
pm2 start ecosystem.config.cjs
pm2 reload ecosystem.config.cjs
pm2 logs
pm2 monit
```

---

## 4. Deployment Flow

### API Deployment

```
1. Code push to repository
       │
       ▼
2. pnpm be-deploy
       │
       ├── turbo build --filter ./apps/api
       │       └── NestJS build with SWC compiler
       │           └── Output: dist/ or dist-prod/
       │
       └── pm2 reload ecosystem.config.js
               └── Zero-downtime reload
```

### Web Deployment

```
1. Code push to repository
       │
       ▼
2. pnpm fe-deploy
       │
       └── turbo build --filter ./apps/web
               └── Vite build
                   └── Output: apps/web/dist/
                       └── Static files → serve via nginx/CDN/Docker
```

### Full Deployment

```bash
pnpm deploy    # = turbo build (all) + pm2 reload
```

---

## 5. Dockerfiles

### API Dockerfile (`apps/api/Dockerfile`)

| Step | Command | Mô tả |
|------|---------|-------|
| Base | `node:18` | Node.js 18 runtime |
| Install | `pnpm install` | Install dependencies |
| Build | `pnpm build:prod` | NestJS production build |
| Run | `node dist/main.js` | Start API server |

### Web Dockerfile — Development (`apps/web/docker/develop/Dockerfile`)

| Step | Mô tả |
|------|-------|
| Base | `node:20-alpine3.16` |
| Build | `npm install && npm run build` |
| Run | `npm run dev` — expose port `2001` |

### Web Dockerfile — Production (`apps/web/docker/production/Dockerfile`)

| Step | Mô tả |
|------|-------|
| Base | `node:20-alpine3.16` |
| Build | `npm install && npm run build` |
| Run | `npm run preview` — expose port `5173` |

---

## 6. Environment Variables Guide

Tất cả env variables được quản lý qua `ApiConfigService` (`apps/api/src/shared/services/api-config.service.ts`). File template: `apps/api/.env.development.example` (200+ biến).

### 6.1 Core Application

| Variable | Required | Default | Mô tả |
|----------|----------|---------|-------|
| `NODE_ENV` | **Yes** | — | `development` / `production` / `test` |
| `PORT` | Yes | `3007` | HTTP port cho API server |
| `TRANSPORT_PORT` | No | `8080` | Microservice transport port |
| `APP_NAME` | Yes | — | Tên PM2 process |
| `APP_INSTANCES` | No | `1` | Số PM2 instances |
| `FALLBACK_LANGUAGE` | No | `en_US` | Ngôn ngữ mặc định |
| `ENABLE_DOCUMENTATION` | No | `true` | Bật/tắt Swagger docs |
| `API_VERSION` | No | — | Version hiển thị trên Swagger |
| `WEB_URL` | Yes | — | URL của Web App |
| `DOMAIN_NAME` | Yes | — | Domain name chính |

### 6.2 Authentication

| Variable | Required | Mô tả |
|----------|----------|-------|
| `JWT_PRIVATE_KEY` | **Yes** | RSA private key (PEM format) cho JWT signing |
| `JWT_PUBLIC_KEY` | **Yes** | RSA public key cho JWT verification |
| `JWT_EXPIRATION_TIME` | Yes | Token TTL (seconds), default `86400` (24h) |
| `MASTER_PASSWORD` | No | Master password cho emergency login |
| `RECAPTCHA_SECRET_KEY` | No | Google reCAPTCHA secret (disabled in current code) |

### 6.3 Database

| Variable | Required | Mô tả |
|----------|----------|-------|
| `DB_URI` | **Yes** | MongoDB connection string |

### 6.4 Redis

| Variable | Required | Default | Mô tả |
|----------|----------|---------|-------|
| `REDIS_HOST` | Yes | — | Redis host |
| `REDIS_PORT` | Yes | `6379` | Redis port |
| `REDIS_PASSWORD` | Yes | — | Redis password |
| `REDIS_DB` | No | `0` | Redis database number |

### 6.5 RabbitMQ

| Variable | Required | Mô tả |
|----------|----------|-------|
| `RABBITMQ_URI` | **Yes** | AMQP connection URI |
| `RABBITMQ_MAIN_EXCHANGE` | **Yes** | Exchange name — tất cả routing keys dựa trên giá trị này |

### 6.6 Object Storage (Backblaze B2 / S3)

| Variable | Required | Mô tả |
|----------|----------|-------|
| `AWS_S3_ACCESS_KEY_ID` | Yes | Access key |
| `AWS_S3_SECRET_ACCESS_KEY` | Yes | Secret key |
| `AWS_S3_ENDPOINT` | Yes | S3-compatible endpoint |
| `AWS_S3_IMAGES_BUCKET_NAME` | Yes | Bucket name |
| `AWS_S3_BUCKET_REGION` | Yes | Bucket region |
| `AWS_S3_API_VERSION` | No | API version |
| `BACKBLAZE_ENDPOINT` | No | Backblaze B2 API endpoint |

### 6.7 BullMQ (Scheduled Jobs)

| Variable | Required | Mô tả |
|----------|----------|-------|
| `BULLMQ_REFRESH_TRACKING_STATUS_CRON_TIME` | No | Cron pattern cho tracking refresh |
| `BULLMQ_SCAN_TRANSACTION_EMAIL_CRON_TIME` | No | Cron pattern cho email scan |
| `BULLMQ_SEND_MAIL_CRON_TIME` | No | Cron pattern cho scheduled mail |

### 6.8 Email / SMTP

| Variable | Required | Mô tả |
|----------|----------|-------|
| `SMTP_HOST` | Yes | SMTP server host |
| `SMTP_PORT` | No | SMTP port |
| `SMTP_USER` / `SMTP_USERNAME` | Yes | SMTP username |
| `SMTP_PASSWORD` | Yes | SMTP password |
| `SMTP_FROM` | Yes | Sender email address |
| `ADMIN_EMAIL` | No | Admin notification email |

### 6.9 Telegram

| Variable | Required | Mô tả |
|----------|----------|-------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token cho alerts |
| `TELEGRAM_CHANNEL_ID` | Yes | Channel ID cho notifications |
| `TELEGRAM_SCAN_NOTIFICATION_CHANNEL_ID` | No | Channel cho scan notifications |

### 6.10 Provider APIs

Mỗi provider có bộ env variables riêng. Pattern chung:

```
<PROVIDER>_API_URL=https://...
<PROVIDER>_API_KEY=...
<PROVIDER>_API_SECRET=...
```

Danh sách providers có API config: `FLASHSHIP`, `BURGERPRINTS`, `BEEFUN`, `PRINTCARE`, `ONOSPOD`, `GEARMENT`, `MERCHIZE`, `CUSTOMCAT`, `USFULFILL`, `HUBFULFILL`, `DREAMSHIP`, `PRINTEES`, `PRINTIFY`, `PINGPONGX`.

### 6.11 Monitoring & Other

| Variable | Required | Mô tả |
|----------|----------|-------|
| `ELASTICSEARCH_HOST` | No | ES host cho logging |
| `ELASTICSEARCH_APIKEY` | No | ES API key |
| `USER_ACTION_INDEX` | No | ES index cho user actions |
| `TRACKING_STATUS_API_URL` | No | External tracking API |
| `OCR_URL` | No | OCR service URL |
| `RATE_LIMITER_*` | No | Rate limiting config |
| `CDN_URL` | No | CDN base URL |
| `GOAUTH_*` | No | Google OAuth config |
| `PAYOS_*` | No | PayOS payment gateway |

### 6.12 Frontend

| Variable | Required | Mô tả |
|----------|----------|-------|
| `VITE_API_URL` | **Yes** | API base URL cho frontend |
| `VITE_PROD` | No | Nếu `true`, basename = `/app` |

---

## 7. Logging

### Winston Configuration

API sử dụng Winston với daily rotate files:

| Environment | Log Level | Transports |
|---|---|---|
| **Development** | `info` | Console (simple format) + File (`logs/activity.log`, error only) + Daily Rotate (`logs/application-{DATE}.log`) |
| **Production** | `activity` | Same transports, JSON format |

**Log rotation:** max 20MB per file, keep 14 days, auto zip.

### ELK Stack (Optional)

```
API (Winston) → Log files → Filebeat → Elasticsearch → Kibana
```

Filebeat watches `apps/api/logs/` directory and ships to Elasticsearch.

---

## 8. Network Architecture

```
┌──────────────────────────────────┐
│          Docker Network          │
│          "printsel" (bridge)     │
│                                  │
│  ┌──────────┐  ┌──────────────┐  │
│  │ RabbitMQ │  │ Redis        │  │
│  │ :5672    │  │ :6379        │  │
│  │ :15672   │  │              │  │
│  └──────────┘  └──────────────┘  │
│                                  │
│  ┌──────────┐  ┌──────────────┐  │
│  │   ES     │  │ Kibana       │  │
│  │ :9200    │  │ :5601        │  │
│  └──────────┘  └──────────────┘  │
└──────────────────────────────────┘
           ↕
┌──────────────────────────────────┐
│  API Server (host / PM2)         │
│  Port: 3007                      │
│  Connects to all Docker services │
└──────────────────────────────────┘
           ↕
┌──────────────────────────────────┐
│  Web App (host / Docker / CDN)   │
│  → Calls API at VITE_API_URL     │
└──────────────────────────────────┘
```

---

## 9. Health Checks

> **Lưu ý:** Hệ thống hiện chưa có health check endpoints. `HealthCheckerModule` đã bị comment out trong `app.module.ts`. Đây là một điểm cần cải thiện.

### Kiểm tra service thủ công

| Service | Cách kiểm tra |
|---------|--------------|
| API Server | `curl http://localhost:3007/documentation` |
| RabbitMQ | `http://localhost:15672` (Management UI) |
| Redis | `redis-cli -a $REDIS_PASSWORD ping` |
| Elasticsearch | `curl http://localhost:9200` |
| Kibana | `http://localhost:5601` |
| MongoDB | Connection string test qua `mongosh` |

---

## Tài liệu liên quan

- [C4 Model](./C4_Model.md) — Architecture diagrams
- [Event-Driven Architecture](./Event_Driven.md) — RabbitMQ + BullMQ details
- [Project Structure](../Foundation/Project_Structure.md) — Code organization
