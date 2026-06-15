# Project Structure — Printsel

Tài liệu mô tả cấu trúc thư mục, tổ chức code, và vai trò của từng phần trong monorepo **Printsel**.

---

## 1. Tổng quan Monorepo

Printsel sử dụng kiến trúc **Monorepo** với:
- **pnpm workspaces** — quản lý dependencies chung
- **Turborepo** — orchestrate build/dev/lint giữa các packages

```
printsel/                          ← Root monorepo
├── apps/
│   ├── api/                       ← Backend — NestJS + Fastify
│   └── web/                       ← Frontend — React + Vite
├── packages/
│   ├── core/                      ← Shared NestJS utilities
│   ├── shared/                    ← Shared types, DTOs, enums, constants
│   ├── ui/                        ← Shared UI components (nhẹ)
│   ├── eslint-config-custom/      ← ESLint configs cho FE + BE
│   └── tsconfig/                  ← Shared TypeScript configs
├── documents/                     ← Tài liệu hệ thống
├── package.json                   ← Root workspace config
├── pnpm-workspace.yaml            ← Workspace definition
├── turbo.json                     ← Turborepo pipeline config
├── .commitlintrc.json             ← Commit message convention
├── .prettierrc.js                 ← Code formatting rules
└── cspell.json                    ← Spell checking config
```

### Mối quan hệ giữa các packages

```
┌──────────────────────────────────────────────────┐
│                    apps/api                       │
│               (NestJS Backend)                    │
│                                                   │
│   imports: core, shared                           │
└────────┬────────────────────┬────────────────────┘
         │                    │
         ▼                    ▼
┌────────────────┐  ┌────────────────┐
│  packages/core │  │packages/shared │
│  (NestJS libs) │  │ (Types, DTOs)  │
└────────────────┘  └───────┬────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────┐
│                    apps/web                       │
│               (React Frontend)                    │
│                                                   │
│   imports: shared (types, enums, DTOs)            │
└──────────────────────────────────────────────────┘
```

- **`apps/api`** import cả `core` và `shared`
- **`apps/web`** chỉ import `shared` (types/enums/DTOs dùng chung)
- **`core`** chứa NestJS-specific code (guards, decorators, services) — chỉ API dùng
- **`shared`** chứa platform-agnostic code (types, enums, constants) — cả API và Web dùng

---

## 2. Backend — `apps/api/`

Package name: `fulfill` | Runtime: Node.js ≥ 18 | Framework: NestJS 10 + Fastify

```
apps/api/
├── src/
│   ├── main.ts                    ← Entry point — bootstrap app
│   ├── main-nest.ts               ← NestJS bootstrap + microservice setup
│   ├── app.module.ts              ← Root module — imports tất cả feature modules
│   ├── setup-swagger.ts           ← Swagger/OpenAPI config (route: /documentation)
│   │
│   ├── modules/                   ← Feature modules (chi tiết bên dưới)
│   ├── shared/                    ← Global shared module
│   │   ├── shared.module.ts       ← @Global module: config, JWT, S3, provider clients
│   │   ├── shared.controller.ts   ← Upload endpoint (S3 presigned URL)
│   │   └── services/              ← Provider API clients + config
│   │
│   ├── providers/                 ← NestJS providers (context)
│   ├── decorators/                ← Custom decorators (@Auth, etc.)
│   ├── seed/                      ← Database seeding
│   ├── utils/                     ← HTTP, file, hash, tracking helpers
│   ├── i18n/                      ← Internationalization files
│   └── assets/                    ← Static assets (Swagger docs)
│
├── test/                          ← Jest test files
├── docker/
│   ├── docker-compose.yml         ← RabbitMQ + Redis (local dev)
│   └── docker-compose-elk.yml     ← Elasticsearch + Kibana + Filebeat
├── scripts/                       ← Utility scripts
│
├── Dockerfile                     ← Production Docker image
├── ecosystem.config.cjs           ← PM2 config
├── start.js                       ← PM2 entry script
├── nest-cli.json                  ← NestJS CLI config (SWC, Swagger plugin)
├── vite.config.ts                 ← Vite config (for test tooling)
├── .env.example                   ← Minimal env template
├── .env.development.example       ← Full development env template (200+ vars)
└── package.json                   ← Dependencies + scripts
```

### 2.1 Feature Modules (`apps/api/src/modules/`)

Mỗi module tuân theo pattern NestJS tiêu chuẩn:

```
modules/<feature>/
├── <feature>.module.ts            ← Module definition (imports, providers, exports)
├── <feature>.controller.ts        ← REST endpoints
├── <feature>.service.ts           ← Business logic
├── <feature>.repository.ts        ← Database queries (Mongoose)
├── <feature>.entity.ts            ← Mongoose schema/entity
└── dtos/                          ← Request/Response DTOs (Zod)
```

#### Phân nhóm modules theo nghiệp vụ

**Order Management (Quản lý đơn hàng):**

| Module | Mô tả |
|--------|-------|
| `order/` | Đơn hàng POD — module lớn nhất, chứa nhiều Mongoose models |
| `order-item/` | Line items của Order POD |
| `dropship-order/` | Đơn hàng Dropship |
| `dropship-order-item/` | Line items của Dropship Order |
| `stock-order/` | Đơn hàng Stock |
| `stock-order-item/` | Line items của Stock Order |
| `provider-order/` | Đơn hàng gửi tới Provider qua API |
| `issue/` | Khiếu nại/vấn đề liên quan đơn hàng |

**Product & Catalog:**

| Module | Mô tả |
|--------|-------|
| `product/` | Sản phẩm POD |
| `product-variant/` | Biến thể sản phẩm (color, size, price) |
| `product-weight/` | Quản lý trọng lượng sản phẩm |
| `category/` | Danh mục sản phẩm |
| `artwork/` | File thiết kế để in |
| `folder-image/` | Tổ chức folder cho hình ảnh/artwork |

**User & Access Control:**

| Module | Mô tả |
|--------|-------|
| `auth/` | Authentication — login, register, JWT, Passport |
| `user/` | CRUD user, profile |
| `role/` | Vai trò cố định (SuperAdmin, Admin, Seller...) |
| `custom-role/` | Vai trò tùy chỉnh do Admin tạo |
| `permission/` | Quản lý quyền truy cập |
| `departments/` | Phòng ban trong công ty |

**Finance:**

| Module | Mô tả |
|--------|-------|
| `transaction/` | Giao dịch tài chính (Topup, Charge, Refund) — module phức tạp, nhiều dependencies |
| `referrer/` | Quản lý người giới thiệu và hoa hồng |

**Operations:**

| Module | Mô tả |
|--------|-------|
| `tracking/` | Theo dõi vận chuyển |
| `store/` | Quản lý cửa hàng/kênh bán |
| `provider/` | @Global — quản lý nhà cung cấp |
| `export/` | Xuất dữ liệu ra file (Excel/CSV) |
| `upload/` | Upload file lên S3/Backblaze |

**Infrastructure:**

| Module | Mô tả |
|--------|-------|
| `amqp/` | @Global — RabbitMQ connection + exchange |
| `queue/` (BullMQ) | Job queue: refresh tracking, email, export... |
| `redis-cache/` | Redis cache service |
| `cronjob/` | @Global — Scheduled tasks |
| `mail/` | Email templates + sending |
| `notifications/` | In-app notifications |
| `webhooks/` | Webhook endpoints cho provider callbacks |
| `winston/` | Logging configuration |
| `actions/` | User activity logging |
| `content/` | CMS content management |
| `counter/` | Auto-increment counters |
| `elks/` | Elasticsearch integration |

### 2.2 Shared Module (`apps/api/src/shared/`)

`SharedModule` là **@Global** module, cung cấp:

- **`ApiConfigService`** — Trung tâm config, đọc tất cả env variables
- **Provider API clients** — HTTP clients cho từng nhà cung cấp:
  - `BeefunService`, `FlashshipService`, `BurgerPrintsService`, `PrintCareService`
  - `OnosPodService`, `MerchizeService`, `GearmentService`, `CustomCatService`
  - `UsFulfillService`, `HubFulfillService`, `DreamshipService`, `PrinteesService`
  - `PrintifyService` (imported riêng, không qua SharedModule)
- **Infrastructure services** — `AwsS3Service`, `BackblazeService`, `TelegramService`
- **`RateLimiterService`** — Rate limiting dựa trên Redis
- **`SharedController`** — Endpoint `POST /upload/generate-put-url` (S3 presigned URL)

### 2.3 Global Modules

Các module được đánh dấu `@Global()` và available ở mọi nơi:

| Module | Vai trò |
|--------|---------|
| `SharedModule` | Config, JWT, S3, provider clients, rate limiting |
| `AmqpModule` | RabbitMQ connection |
| `CronjobModule` | Scheduled jobs |
| `ProviderModule` | Provider CRUD |

---

## 3. Frontend — `apps/web/`

Package name: `folinas-fe` | Framework: React 18 + Vite 4 | UI: Ant Design + Tailwind

```
apps/web/
├── src/
│   ├── main.tsx                   ← Entry point — React root + Ant ConfigProvider
│   ├── App.tsx                    ← Router config — BrowserRouter + PrivateRoute
│   │
│   ├── pages/                     ← Page components (route-based)
│   ├── components/                ← Reusable UI components
│   ├── services/                  ← API client functions (Axios-based)
│   ├── store/                     ← Zustand stores
│   ├── types/                     ← TypeScript type definitions
│   ├── utils/                     ← Utility functions
│   ├── constants/                 ← App constants (paths, config)
│   ├── layouts/                   ← Layout components (MainLayout)
│   └── apis/                      ← Axios instance + interceptors
│
├── docker/
│   ├── develop/Dockerfile         ← Dev Docker image
│   └── production/Dockerfile      ← Production Docker image
│
├── vite.config.js                 ← Vite config + path aliases (@/, @core, @shared)
├── tailwind.config.js             ← Tailwind CSS config (primary: #e65800)
├── .env.example                   ← VITE_API_URL
└── package.json
```

### 3.1 Pages (`apps/web/src/pages/`)

Pages được tổ chức theo feature/domain:

```
pages/
├── login/                         ← Login + ForgotPassword
├── register/                      ← User registration
├── home/                          ← Dashboard (charts, statistics)
│
├── orders/                        ← 🔴 Largest section
│   ├── allOrders/                 ← All Orders list + detail drawer
│   ├── dropshipOrders/            ← Dropship Orders list + detail
│   ├── stockOrders/               ← Stock Orders list + detail
│   ├── issues/                    ← Issue management
│   ├── CreateOrder/
│   │   ├── ManualOrder/           ← Manual order creation form
│   │   └── LabelOrder/            ← Label order creation
│   ├── ImportDropshipOrder/       ← Import dropship orders from Excel
│   ├── ImportStockOrder/          ← Import stock orders from Excel
│   ├── importOrder/               ← Import POD orders
│   ├── importOrderTracking/       ← Import tracking numbers
│   ├── importOrderStatus/         ← Import/update order status
│   ├── importOrderShipOuts/       ← Import ship out data
│   ├── makePayment/               ← Payment for POD orders
│   ├── makePaymentDropShip/       ← Payment for Dropship orders
│   ├── makePaymentStock/          ← Payment for Stock orders
│   ├── managerOrder/              ← Order manager view
│   ├── orderInventory/            ← Inventory management
│   ├── UpdateDropShipOrderPrice/  ← Bulk update prices
│   ├── UpdateDropShipOrderItemInfo/ ← Bulk update item info
│   └── UpdateDropShipOrderItemWeight/ ← Bulk update weights
│
├── catalogs/                      ← Product management
│   ├── products/                  ← Product list, detail, match, duplicate
│   ├── categories/                ← Category management
│   └── productForm/               ← Product create/edit form (complex)
│
├── billing/
│   ├── wallet/                    ← Wallet topup, topup list
│   └── payments/                  ← Payment history
│
├── trackings/                     ← Tracking management
├── stores/                        ← Store management
├── users/                         ← User management + logs
├── providers/                     ← Provider management
├── roles/                         ← Role management
├── custom-roles/                  ← Custom role management
├── departments/                   ← Department management
├── notifications/                 ← Notification management
├── webhooks/                      ← Webhook management
├── export/                        ← Export data
├── mailTemplates/                 ← Email template management
├── mailHistory/                   ← Email history
├── artworks/                      ← Artwork management
├── settings/                      ← System settings
├── employee/                      ← Employee management
├── commission/                    ← Commission reports
├── referrer-manager/              ← Referrer management
├── actions/                       ← Activity logs
├── activities/                    ← User activities
└── errors/                        ← Error pages (404)
```

### 3.2 Services (`apps/web/src/services/`)

API client layer — mỗi file tương ứng với một nhóm API endpoints:

```
services/
├── index.ts                       ← RepositoryRemote — barrel export tất cả services
├── auth.ts                        ← Login, register, logout, getMe
├── order.ts                       ← CRUD orders, import, export, statistics
├── dropship-order.ts              ← CRUD dropship orders
├── stock-order.ts                 ← CRUD stock orders
├── product.ts                     ← Product variants, statistics
├── catalogs.ts                    ← Categories + Products CRUD
├── tracking.ts                    ← Tracking CRUD
├── transactions.ts                ← Wallet transactions
├── issue.ts                       ← Issue management
├── users.ts                       ← User management
├── providers.ts                   ← Provider management
├── stores.ts                      ← Store management
├── roles.ts                       ← Role management
├── custom-roles.ts                ← Custom role management
├── export.ts                      ← Export orders/payments/trackings
├── upload.ts                      ← File upload
├── artworks.ts                    ← Artwork + folder management
├── notifications.ts               ← Notifications CRUD + seen/unseen
├── webhooks.ts                    ← Webhook management
├── mailTemplate.ts                ← Email template CRUD
├── mailHistory.ts                 ← Email history + schedule
├── cache.ts                       ← Cache management (clear)
├── departments.ts                 ← Department CRUD
├── actions.ts                     ← Activity logs
└── referrer.ts                    ← Referrer management
```

Tất cả services sử dụng hàm `callApi()` từ `apis/` folder — wrapper quanh Axios với JWT token tự động.

### 3.3 State Management (`apps/web/src/store/`)

Sử dụng **Zustand** với persist middleware (localStorage):

| Store | Mục đích |
|-------|---------|
| `authStore.ts` | Token, profile, authentication state. Tự động redirect `/login` khi token expired |
| `notificationStore.ts` | Đếm số notification chưa đọc (unseen count) |

### 3.4 Routing

Routing config trong `App.tsx`:
- **`PrivateRoute`** — Guard kiểm tra authentication, redirect tới `/login` nếu chưa đăng nhập
- **Public routes:** `/login`, `/register`, `/forgot-password`, `/catalog`, `/product/:id`
- **Protected routes:** Tất cả routes khác, wrapped trong `MainLayout` (sidebar + header)
- **Basename:** Production dùng `/app` prefix (`VITE_PROD`)

---

## 4. Shared Packages

### 4.1 `packages/shared/`

Package name: `shared` | Build: tsup (CJS + ESM)

Chứa code dùng chung giữa API và Web:

```
packages/shared/
├── constants/                     ← Business constants
│   ├── order.ts                   ← OrderStatus, LineItemStatus, ShippingMethod, import/export headers
│   ├── dropship-order.ts          ← DropshipOrderStatus, import/export headers
│   ├── stock-order.ts             ← StockOrderStatus, import/export headers
│   ├── transaction.ts             ← TransactionStatus, TransactionType, PaymentPlatform
│   ├── tracking.ts                ← TrackingType, import/export headers
│   ├── issue.ts                   ← IssueStatus, IssueType, IssueSolution
│   ├── common.ts                  ← Common constants
│   ├── common-length.ts           ← Field length constraints
│   ├── common-zod.ts              ← Shared Zod schemas (IDZod, etc.)
│   ├── country.ts / countries.ts  ← Country lists + codes
│   ├── us-states.ts               ← US states list
│   ├── marketplace.ts             ← Marketplace definitions
│   ├── mail.ts                    ← Mail constants
│   ├── user.ts                    ← User-related constants
│   ├── permission-action.ts       ← Permission action definitions
│   ├── patterns.ts                ← Regex patterns
│   ├── import-status.ts           ← Import job statuses
│   └── export-status.ts           ← Export job statuses
│
├── enums/                         ← Business enums
│   ├── commons.ts                 ← Status, Gender, StoreType, ActionType
│   ├── role-type.ts               ← RoleType enum (16 roles)
│   ├── provider-code.ts           ← ProviderCode, ProviderType, ProviderIcon
│   ├── tracking.ts                ← TrackingStatus enum
│   ├── tier.ts                    ← Tier enum (Standard → Diamond)
│   ├── image-type.ts              ← ImageType enum
│   ├── file-type.ts               ← FileType enum
│   ├── export-type.ts             ← ExportFileType, ExportOptions
│   ├── product.ts                 ← PrintArea
│   ├── notifications.ts           ← NotificationType
│   ├── webhook.ts                 ← WebhookTopic
│   ├── barcode-prefix.ts          ← BarcodePrefix
│   └── permission-type.ts         ← PermissionType
│
├── dtos/                          ← Zod-based DTOs cho validation
├── types/                         ← Shared TypeScript types
│   ├── BaseEntity.ts              ← Base entity with _id, timestamps
│   ├── PageQuery.ts               ← Pagination query (page, limit, search, sort)
│   ├── PageRes.ts                 ← Paginated response
│   └── Res.ts                     ← Standard API response {success, data, message}
│
├── utils/                         ← Utility functions
│   ├── camelCase.ts
│   ├── ids.ts
│   ├── queryString.ts
│   └── objectValues.ts
│
└── handlers/                      ← String handlers
```

### 4.2 `packages/core/`

Package name: `core` | Build: tsup (CJS)

Chứa NestJS-specific utilities — **chỉ API sử dụng**:

```
packages/core/
├── abstracts/                     ← Base classes
│   ├── entity.abstract.ts         ← AbstractEntity (timestamps, soft delete)
│   └── database-repository.abstract.ts ← AbstractDatabaseRepository (CRUD base)
│
├── constants/                     ← Technical constants
│   ├── database.ts                ← Field names (createdAt, deletedAt...)
│   ├── token-type.ts              ← TokenType (ACCESS, REFRESH)
│   ├── language-code.ts           ← LanguageCode (en_US, vi_VN)
│   ├── pagination.ts              ← OrderDirection type
│   └── patterns.ts                ← Password, email regex patterns
│
├── decorators/                    ← Custom NestJS decorators
│   ├── auth-user.ts               ← @AuthUser() — extract user from request
│   ├── database.ts                ← Database-related decorators
│   ├── public-route.ts            ← @Public() — skip auth guard
│   └── swagger.ts                 ← Swagger decorators
│
├── guards/                        ← Auth guard (JWT validation)
├── filters/                       ← Exception filters (BadRequest, Custom)
├── interceptors/                  ← File upload interceptors
├── exceptions/                    ← Custom exceptions (FileNotImage, UserNotFound, RateLimit)
├── dtos/                          ← Upload file DTO
├── interfaces/                    ← TypeScript interfaces (IApiFile, IDatabase, IPagination)
│
├── services/                      ← Infrastructure services
│   ├── aws-s3.ts                  ← AWS S3 / Backblaze B2 operations
│   ├── backblaze.ts               ← Backblaze B2 client
│   └── telegram.ts                ← Telegram bot service
│
└── utils/                         ← Common utilities
```

### 4.3 `packages/eslint-config-custom/`

ESLint configurations tách riêng cho Frontend và Backend:

| File | Target | Plugins chính |
|------|--------|---------------|
| `fe-eslint.js` | React/Vite apps | Airbnb, Tailwind, import sort, Prettier |
| `be-eslint.js` | NestJS API | unicorn, sonarjs, strict TypeScript rules, Mongoose `.save()` restriction |

### 4.4 `packages/tsconfig/`

Shared TypeScript configs:

| File | Mục đích |
|------|---------|
| `base.json` | Base config — strict mode, skipLibCheck |
| `nestjs.json` | NestJS — CommonJS, decorators, source maps |
| `vite.json` | React/Vite — ESNext module, DOM lib |
| `astro.json` | Astro (unused/legacy) — strictest settings |

### 4.5 `packages/ui/`

Shared UI component library — hiện tại ít sử dụng (Web app dùng Ant Design trực tiếp).

---

## 5. Configuration Files

### 5.1 Root Level

| File | Mục đích |
|------|---------|
| `package.json` | Workspace scripts: `dev`, `build`, `deploy`, `lint` |
| `pnpm-workspace.yaml` | Định nghĩa workspace: `apps/*`, `packages/*` |
| `turbo.json` | Build pipeline: `build` (có cache), `dev` (no cache, persistent) |
| `.commitlintrc.json` | Commit convention: `feat`, `fix`, `chore`, `docs`... |
| `.prettierrc.js` | Formatting: single quotes, trailing commas, 120 width |
| `cspell.json` | Spell check dictionaries (English + Vietnamese) |

### 5.2 API Config

| File | Mục đích |
|------|---------|
| `nest-cli.json` | NestJS CLI: SWC compiler, Swagger plugin, i18n assets |
| `ecosystem.config.cjs` | PM2: app name from env, max 1G memory, single instance |
| `.env.development.example` | **200+ env variables** — DB, Redis, RabbitMQ, S3, Provider APIs, JWT keys |
| `Dockerfile` | Production image |
| `docker/docker-compose.yml` | Local dev: RabbitMQ + Redis |
| `docker/docker-compose-elk.yml` | Optional: Elasticsearch + Kibana + Filebeat |

### 5.3 Web Config

| File | Mục đích |
|------|---------|
| `vite.config.js` | Path aliases: `@/` → `src/`, `@core`, `@shared` |
| `tailwind.config.js` | Primary color `#e65800`, JIT mode, no preflight |
| `.env.example` | `VITE_API_URL` — API base URL |

---

## 6. Scripts chính

### Root Scripts

```bash
pnpm dev              # Chạy cả API + Web ở chế độ dev (parallel)
pnpm dev:api          # Chỉ chạy API
pnpm dev:web          # Chỉ chạy Web
pnpm build            # Build tất cả
pnpm build:api        # Build chỉ API
pnpm build:web        # Build chỉ Web
pnpm deploy           # Build all + PM2 reload
pnpm be-deploy        # Build API + PM2 reload
pnpm fe-deploy        # Build Web only
pnpm lint             # Lint tất cả packages
pnpm format           # Prettier format
pnpm spell            # Spell check
```

### API Scripts (trong `apps/api/package.json`)

```bash
pnpm start:dev        # NestJS dev mode (watch + SWC)
pnpm start:prod       # Production mode
pnpm build            # NestJS build (SWC)
pnpm test             # Jest tests
pnpm lint             # ESLint
pnpm seed             # Database seeding
```

---

## 7. Quy ước đặt tên

### Backend (NestJS)

| Loại file | Pattern | Ví dụ |
|-----------|---------|-------|
| Module | `<feature>.module.ts` | `order.module.ts` |
| Controller | `<feature>.controller.ts` | `order.controller.ts` |
| Service | `<feature>.service.ts` | `order.service.ts` |
| Repository | `<feature>.repository.ts` | `order.repository.ts` |
| Entity | `<feature>.entity.ts` | `order.entity.ts` |
| DTO | `<feature>/dtos/*.dto.ts` | `create-order.dto.ts` |

### Frontend (React)

| Loại file | Pattern | Ví dụ |
|-----------|---------|-------|
| Page component | `pages/<feature>/index.tsx` | `pages/orders/allOrders/index.tsx` |
| UI component | `components/<Feature>/<Name>.tsx` | `components/Orders/ordersTable/OrdersTable.tsx` |
| Service | `services/<feature>.ts` | `services/order.ts` |
| Store | `store/<feature>Store.ts` | `store/authStore.ts` |
| Util | `utils/<name>.ts` | `utils/common.ts` |

### Shared Package

| Loại file | Pattern | Ví dụ |
|-----------|---------|-------|
| Enum | `enums/<domain>.ts` | `enums/role-type.ts` |
| Constant | `constants/<domain>.ts` | `constants/order.ts` |
| DTO | `dtos/<Domain>Dto.ts` | `dtos/CreateOrderDto.ts` |
| Type | `types/<Name>.ts` | `types/PageQuery.ts` |

---

## Tài liệu liên quan

- [Glossary & Domain Dictionary](./Glossary.md) — Bảng thuật ngữ chi tiết
- [System Overview](./System_Overview.md) — Tổng quan hệ thống và business flows
- Architecture Design (Phase 2) — *Sẽ được tạo*
