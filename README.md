# Workspace Starter

Bộ khung dự án sạch gồm **NestJS + Fastify** (backend) và **React + Vite + Ant Design** (frontend), tổ chức theo dạng monorepo với pnpm + Turborepo. Đã được dọn dẹp gọn lại còn luồng **Auth + Dashboard** để làm điểm khởi đầu.

---

## Mục lục

- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Chạy lần đầu](#chạy-lần-đầu)
  - [1. Cài dependencies](#1-cài-dependencies)
  - [2. Khởi động infrastructure (MongoDB + Redis + RabbitMQ)](#2-khởi-động-infrastructure-mongodb--redis--rabbitmq)
  - [3. Cấu hình env cho API](#3-cấu-hình-env-cho-api)
  - [4. Cấu hình env cho Web](#4-cấu-hình-env-cho-web)
  - [5. Chạy dev](#5-chạy-dev)
- [Các lệnh hay dùng](#các-lệnh-hay-dùng)
- [Tài khoản đăng nhập](#tài-khoản-đăng-nhập)
- [Troubleshooting](#troubleshooting)

---

## Yêu cầu hệ thống

| Tool | Phiên bản | Ghi chú |
|------|-----------|---------|
| **Node.js** | >= 18.0.0 | Khuyến nghị 20 LTS. Dùng `nvm` để quản lý version |
| **pnpm** | 8.6.10 | `npm install -g pnpm@8.6.10` |
| **Docker Desktop** | Mới nhất | Để chạy MongoDB / Redis / RabbitMQ bằng `docker compose` |
| **Git** | Mới nhất | |

> Nếu bạn không muốn dùng Docker, có thể cài MongoDB / Redis / RabbitMQ trực tiếp hoặc dùng cloud (MongoDB Atlas, Upstash, CloudAMQP).

---

## Cấu trúc dự án

```
.
├── apps/
│   ├── api/        # NestJS + Fastify backend
│   └── web/        # React + Vite frontend
├── packages/
│   ├── core/       # NestJS utilities (guards, decorators, services)
│   ├── shared/     # Types / DTOs / enums dùng chung giữa FE & BE
│   ├── ui/         # Shared UI components (tối giản)
│   └── ...
├── documents/      # Tài liệu thiết kế
├── pnpm-workspace.yaml
└── turbo.json
```

**Backend modules hiện có:** `auth`, `user`, `role`, `custom-role`, `permission`, `departments`, `notifications`, `mail`, `upload`, `actions`, `system-config`, `amqp`, `redis-cache`, `queue`, `cronjob`, `winston`, `counter`.

**Frontend pages hiện có:** `login`, `register`, `forgot-password`, `dashboard`, `account`, `users`, `roles`, `custom-roles`, `departments`, `notifications`, `settings`, `errors`.

---

## Chạy lần đầu

### 1. Cài dependencies

```bash
# Ở thư mục gốc dự án
pnpm install
```

### 2. Khởi động infrastructure (MongoDB + Redis + RabbitMQ)

Dự án dùng `docker-compose.yml` ở `apps/api/docker/`. Cần khai báo một vài biến môi trường trước khi `docker compose up`.

```bash
cd apps/api/docker
```

Tạo file `.env` trong thư mục `apps/api/docker/` với nội dung:

```env
# RabbitMQ
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=admin123
RABBITMQ_AMQP_PORT=5672
RABBITMQ_WEB_PORT=15672
RABBITMQ_DATA_PATH=~/.docker-conf/rabbitmq/data
RABBITMQ_LOG_PATH=~/.docker-conf/rabbitmq/log

# Redis
REDIS_PORT=6379
REDIS_PASSWORD=12345678
REDIS_DB=1
REDIS_DATA_PATH=~/.docker-conf/redis/data
```

Khởi động containers:

```bash
docker compose up -d
```

Sau khi chạy:
- **MongoDB** lắng nghe ở `localhost:27017` (replica set `rs0`)
- **Redis** lắng nghe ở `localhost:6379` (password `12345678`)
- **RabbitMQ** AMQP ở `localhost:5672`, web UI ở `http://localhost:15672` (admin / admin123)

**Khởi tạo MongoDB replica set** (chỉ cần lần đầu — Mongoose của NestJS cần điều này):

```bash
docker exec -it printsel-mongodb mongosh --eval "rs.initiate()"
```

Kiểm tra status:

```bash
docker exec -it printsel-mongodb mongosh --eval "rs.status().ok"
```

### 3. Cấu hình env cho API

Trong `apps/api/`, copy file env mẫu:

```bash
cd ../..              # về thư mục gốc
cp apps/api/.env.development.example apps/api/.env.development
```

Mở `apps/api/.env.development` và đảm bảo các biến quan trọng:

```env
NODE_ENV=development
PORT=3007

# MongoDB
DB_URI=mongodb://localhost:27017/workspace?replicaSet=rs0

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=12345678
REDIS_DB=1

# RabbitMQ
RabbitMQ_URI=amqp://admin:admin123@localhost:5672

# JWT — đã có keypair sẵn trong file mẫu, giữ nguyên cho dev
JWT_EXPIRATION_TIME=86400

# CORS
ALLOWED_ORIGINS=http://localhost:5173
```

> `.env.development.example` chứa khá nhiều biến cho các tính năng đã bị xoá (Backblaze, Telegram, providers...). Bạn có thể bỏ qua hoặc xoá bớt cho gọn — API vẫn chạy nếu chúng để trống.

### 4. Cấu hình env cho Web

```bash
cp apps/web/.env.example apps/web/.env.development
```

Sửa `apps/web/.env.development`:

```env
NODE_ENV=development
VITE_API_URL=http://localhost:3007/api/v1
```

### 5. Chạy dev

Mở 2 terminal:

**Terminal 1 — Backend:**

```bash
cd apps/api
pnpm dev
```

API sẽ chạy ở `http://localhost:3007`. Swagger docs: `http://localhost:3007/documentation`.

**Terminal 2 — Frontend:**

```bash
cd apps/web
pnpm dev
```

Web app sẽ chạy ở `http://localhost:5173`. Mở trình duyệt và bạn sẽ thấy trang Login.

> Hoặc chạy cả hai cùng lúc từ thư mục gốc: `pnpm dev`.

---

## Các lệnh hay dùng

Chạy ở thư mục gốc:

```bash
pnpm dev            # Chạy cả API + Web song song
pnpm dev:api        # Chỉ API
pnpm dev:web        # Chỉ Web
pnpm build          # Build tất cả
pnpm build:api      # Build API
pnpm build:web      # Build Web
pnpm lint           # ESLint tất cả packages
pnpm format         # Prettier format
```

Dọn dẹp khi gặp vấn đề:

```bash
pnpm clean-node-modules   # Xoá toàn bộ node_modules
pnpm install              # Cài lại
```

---

## Tài khoản đăng nhập

Hiện tại chưa có seed script — database trống sau khi khởi tạo. Có 2 cách để có user đầu tiên:

**Cách 1:** Dùng endpoint `POST /api/v1/auth/register` (qua Swagger UI ở `http://localhost:3007/documentation`) để tạo tài khoản. Lưu ý: register yêu cầu trong DB phải có sẵn 1 `Role` tên `SellerManager` và 1 `Department` tên `PKD-1` — bạn cần tự seed bằng mongosh hoặc Mongo Compass.

**Cách 2 (khuyến nghị):** Insert thủ công vào MongoDB qua mongosh:

```bash
docker exec -it printsel-mongodb mongosh workspace
```

```js
// Tạo role Admin
db.roles.insertOne({
  _id: "role_admin",
  name: "Admin",
  permissionIds: [],
  createdAt: new Date(),
  updatedAt: new Date()
})

// Tạo department mặc định (cần cho register flow)
db.departments.insertOne({
  _id: "dept_default",
  name: "PKD-1",
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Sau đó dùng `POST /api/v1/auth/register` qua Swagger để tạo user. Vào DB update lại `roleId` của user thành `"role_admin"` để có quyền admin.

> Nếu muốn, mình có thể viết một seed script nhỏ ở `apps/api/scripts/` để chạy `pnpm seed` tạo admin tự động — báo nhé.

---

## Troubleshooting

**API báo lỗi `ECONNREFUSED` khi khởi động**
→ Kiểm tra MongoDB / Redis / RabbitMQ containers đã chạy chưa: `docker ps`. Nếu thiếu thì `docker compose up -d` lại trong `apps/api/docker`.

**MongoDB báo `not primary` hoặc transactions fail**
→ Replica set chưa được khởi tạo. Chạy: `docker exec -it printsel-mongodb mongosh --eval "rs.initiate()"`.

**Frontend gọi API bị CORS**
→ Trong `apps/api/.env.development`, set `ALLOWED_ORIGINS=http://localhost:5173`.

**`pnpm install` cài siêu lâu hoặc kẹt**
→ Xoá lockfile cũ ở các package con (nếu có) và chạy lại. Hoặc dùng `pnpm install --no-frozen-lockfile`.

**Port 3007 / 5173 đã bị chiếm**
→ Đổi `PORT` trong `apps/api/.env.development`, đổi port Vite bằng `vite --port 5174` hoặc trong `apps/web/vite.config.js`.

**TypeScript báo lỗi sau khi clone lần đầu**
→ Các `packages/shared`, `packages/core` cần build trước. Chạy `pnpm build` ở root một lần.

---

## Tài liệu nội bộ

Xem thư mục `documents/` để biết thêm:
- `Foundation/System_Overview.md` — Tổng quan hệ thống (bản gốc, có nhiều phần đã được dọn)
- `Foundation/Project_Structure.md` — Cấu trúc dự án chi tiết
- `Architecture/Auth_System.md` — Thiết kế hệ thống auth

> Lưu ý: nhiều file tài liệu vẫn mô tả các module đã bị xoá (orders, providers, tracking...). Coi như tư liệu tham khảo lịch sử.
