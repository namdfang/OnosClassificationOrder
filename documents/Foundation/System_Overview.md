# System Overview — Printsel

## 1. Bài toán kinh doanh

**Printsel** là hệ thống quản lý đơn hàng fulfillment nội bộ, phục vụ cho công ty hoạt động trong lĩnh vực **Print-on-Demand (POD)** và **Dropshipping**.

### Vấn đề cần giải quyết

- Công ty làm việc với **hàng chục nhà cung cấp in ấn** (Printify, Gearment, CustomCat, Merchize, Flashship, BurgerPrints...), mỗi nhà cung cấp có API và quy trình riêng.
- Seller (nhân viên bán hàng) cần một hệ thống duy nhất để tạo đơn, theo dõi trạng thái, quản lý thanh toán — thay vì phải thao tác trên nhiều nền tảng khác nhau.
- Team vận hành cần theo dõi toàn bộ vòng đời đơn hàng: từ lúc tạo → sản xuất → ship out → vận chuyển quốc tế → giao hàng.
- Kế toán cần quản lý wallet, giao dịch, và xuất báo cáo tài chính.

### Mục tiêu hệ thống

1. **Tập trung quản lý đơn hàng** — Một nơi duy nhất để tạo, theo dõi, và quản lý tất cả đơn hàng POD, Dropship, và Stock.
2. **Tự động hóa** — Tích hợp API với các nhà cung cấp để tự động gửi đơn, nhận trạng thái, lấy tracking.
3. **Quản lý tài chính** — Hệ thống Wallet nội bộ, thanh toán tự động, hoàn tiền, báo cáo.
4. **Vận hành logistics** — Theo dõi shipping từ Việt Nam/Trung Quốc sang Mỹ qua nhiều milestone (ShipOut → Manifest → USArrival → CarrierReceived → Delivered).
5. **Phân quyền linh hoạt** — Nhiều vai trò (Seller, Support, Logistics, Accountant...) với quyền truy cập khác nhau.

---

## 2. Actors chính

```
┌─────────────────────────────────────────────────────────────┐
│                        PRINTSEL                             │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │  Seller   │  │ Support  │  │ Logistics │  │Accountant │  │
│  │          │  │          │  │           │  │           │  │
│  │ Tạo đơn  │  │ Xử lý   │  │ Quản lý   │  │ Quản lý   │  │
│  │ Quản lý  │  │ issue    │  │ ship out  │  │ wallet    │  │
│  │ store    │  │ Hỗ trợ   │  │ tracking  │  │ giao dịch │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────┘  │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐                 │
│  │  Admin   │  │ Designer │  │ Referrer  │                 │
│  │          │  │          │  │           │                 │
│  │ Quản trị │  │ Quản lý  │  │ Giới      │                 │
│  │ hệ thống │  │ artwork  │  │ thiệu     │                 │
│  │ users    │  │ design   │  │ seller    │                 │
│  └──────────┘  └──────────┘  └───────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

| Actor | Vai trò chính | Chức năng thường dùng |
|-------|--------------|----------------------|
| **Seller** | Người bán hàng | Tạo đơn (Manual/Import), quản lý Store, nạp tiền Wallet, theo dõi đơn, tạo Issue |
| **Support** | Nhân viên hỗ trợ | Xử lý Issue, hỗ trợ Seller, cập nhật trạng thái đơn |
| **Logistics** | Nhân viên logistics | Quản lý Ship Out, cập nhật Manifest/USArrival/CarrierReceived, theo dõi Tracking |
| **Accountant** | Kế toán | Quản lý Wallet/Transaction, xử lý Topup, xuất báo cáo tài chính |
| **Product Manager** | Quản lý sản phẩm | CRUD Product, Category, Product Variant, quản lý Provider |
| **Admin/SuperAdmin** | Quản trị viên | Quản lý User, Role, Permission, cấu hình hệ thống |
| **Designer** | Nhà thiết kế | Quản lý Artwork, upload design |
| **Referrer** | Người giới thiệu | Giới thiệu Seller mới, theo dõi hoa hồng |

---

## 3. Core Business Flows

### 3.1 Luồng đơn hàng POD (Order Flow)

Đây là luồng chính của hệ thống — xử lý đơn hàng Print-on-Demand:

```
Seller tạo đơn (Manual/Import/Bulk)
        │
        ▼
   ┌─────────┐     Thiếu artwork?     ┌───────────┐
   │ Created  │ ──────────────────────→│ NoArtwork │
   └────┬────┘     Chưa match?        └───────────┘
        │         ┌───────────┐
        ├────────→│ Unmatched │
        │         └───────────┘
        ▼
   ┌─────────┐  Charge Wallet   ┌────────────┐
   │ Pending  │ ───────────────→│ Processing │
   └─────────┘                  └─────┬──────┘
                                      │
                          Gửi đơn tới Provider (API)
                                      │
                                      ▼
                               ┌──────────────┐
                               │ InProduction  │ ← Provider bắt đầu sản xuất
                               └──────┬───────┘
                                      │
                           ┌──────────┼──────────────┐
                           ▼          ▼              ▼
                      ┌────────┐ ┌─────────┐  ┌──────────┐
                      │Produced│ │Packaging│  │PickupReady│
                      └───┬────┘ └────┬────┘  └─────┬────┘
                          │           │             │
                          ▼           ▼             ▼
                    ┌──────────────────────────────────┐
                    │           ShipOut                  │ ← Hàng xuất kho VN/CN
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────┼──────────────────┐
                    ▼              ▼                   ▼
             ┌────────────┐ ┌──────────┐       ┌───────────┐
             │ShipReceived│ │ Manifest │       │ USArrival  │
             └─────┬──────┘ └────┬─────┘       └─────┬─────┘
                   │             │                    │
                   └─────────────┼────────────────────┘
                                 ▼
                          ┌──────────────┐
                          │CarrierReceived│ ← Carrier Mỹ nhận hàng
                          └──────┬───────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
             ┌──────────┐ ┌────────────┐ ┌──────────┐
             │ InTransit │ │OutForDeliv.│ │ Delivered│
             └──────────┘ └────────────┘ └────┬─────┘
                                              │
                                              ▼
                                        ┌───────────┐
                                        │ Completed  │
                                        └───────────┘
```

### 3.2 Luồng đơn hàng Dropship

Tương tự Order Flow nhưng không có bước sản xuất (InProduction). Hàng được mua từ nhà cung cấp bên thứ 3:

```
Seller Import → Pending → Confirmed → Processing → ShipOut → ShipmentReceived →
Adjustment (nếu cần) → Fulfillment → Manifest → USArrival → CarrierReceived →
InTransit → Delivered → Completed
```

### 3.3 Luồng đơn hàng Stock

Flow ngắn nhất — hàng đã có trong kho:

```
Seller Import → Pending → ShipmentReceived → Fulfillment → Manifest →
USArrival → InTransit → Delivered → Completed
```

### 3.4 Luồng thanh toán (Payment Flow)

```
Seller nạp tiền (Topup)
  │  Qua: Payoneer / Pingpong / LianLian / WorldFirst / Paypal / BankTransfer
  │
  ▼
Wallet Balance tăng
  │
  │  Seller tạo đơn hàng
  ▼
Hệ thống Charge Wallet
  │  Trừ tiền = (base price + shipping + fees) × quantity
  │
  ▼
Transaction được ghi nhận
  │  Type: Charge, Status: Completed
  │
  │  Nếu đơn bị hủy/hoàn:
  ▼
Refund / PartiallyRefund
  │  Tiền được hoàn lại Wallet
  ▼
Transaction mới ghi nhận (Type: Refund)
```

### 3.5 Luồng xử lý Issue

```
Seller/Support tạo Issue
  │  Loại: Image Quality, Item Damaged, Wrong Print...
  │
  ▼
┌─────────┐
│ Opening  │
└────┬────┘
     │
     ├──→ OnHold (cần thêm thông tin)
     │
     ├──→ Approved ──→ Refund hoặc Replace ──→ Completed
     │
     └──→ Rejected
```

### 3.6 Luồng tích hợp Provider

```
Hệ thống tạo đơn nội bộ
  │
  ▼
Provider Order được tạo
  │  Gọi API của Provider (Printify, Gearment, CustomCat...)
  │
  ▼
Provider xử lý đơn
  │  Trạng thái cập nhật qua:
  │  - Webhook (provider gọi lại)
  │  - Polling (hệ thống check định kỳ)
  │
  ▼
Provider ship hàng
  │  Tracking number được cập nhật
  │
  ▼
Hệ thống cập nhật Order Status + Tracking
```

---

## 4. Tech Stack

### Backend (API)

| Công nghệ | Phiên bản | Lý do chọn |
|---|---|---|
| **NestJS** | 10.x | Framework Node.js có cấu trúc rõ ràng, module-based, phù hợp enterprise |
| **Fastify** | — | HTTP adapter nhanh hơn Express, phù hợp high-throughput |
| **MongoDB + Mongoose** | — | NoSQL linh hoạt cho schema đơn hàng phức tạp, dễ scale |
| **Redis** | — | Cache layer + backing store cho BullMQ job queue |
| **BullMQ** | — | Job queue bất đồng bộ: export, email, refresh tracking... |
| **RabbitMQ** | — | Message broker cho giao tiếp async giữa các module |
| **Passport + JWT** | — | Authentication stateless, phù hợp API |
| **Zod** | — | Schema validation, type-safe DTOs, tích hợp Swagger tự động |
| **Swagger/OpenAPI** | 3.1 | Tài liệu API tự động, hỗ trợ testing |
| **Winston** | — | Structured logging với daily rotate |
| **Elasticsearch + Kibana** | 8.7 | (Optional) Search engine và monitoring dashboard |
| **SWC** | — | Build tool nhanh hơn tsc, giảm thời gian build |

### Frontend (Web)

| Công nghệ | Phiên bản | Lý do chọn |
|---|---|---|
| **React** | 18.x | UI library phổ biến, ecosystem lớn |
| **Vite** | 4.x | Build tool nhanh, HMR tốt, thay thế Webpack |
| **TypeScript** | — | Type safety, giảm bug runtime |
| **Ant Design** | — | UI component library enterprise-grade, phù hợp admin panel |
| **Zustand** | — | State management nhẹ, đơn giản hơn Redux |
| **React Router v6** | — | Client-side routing |
| **Tailwind CSS** | — | Utility-first CSS, custom styling nhanh |
| **styled-components** | — | CSS-in-JS cho các component phức tạp |

### Infrastructure

| Công nghệ | Mục đích |
|---|---|
| **pnpm** | Package manager nhanh, tiết kiệm disk |
| **Turborepo** | Build orchestration cho monorepo |
| **Docker Compose** | Container hóa services (RabbitMQ, Redis, ELK) |
| **PM2** | Process manager cho production |
| **Husky + commitlint** | Git hooks, enforce commit convention |
| **ESLint + Prettier** | Code quality và formatting |
| **cspell** | Spell checking cho code (tiếng Anh + Việt) |

### Third-party Services

| Service | Mục đích |
|---|---|
| **Backblaze B2 / AWS S3** | Lưu trữ file: artwork, mockup, label, export |
| **Gmail / Nodemailer** | Gửi email thông báo, template email |
| **Telegram Bot** | Alert cho team khi có lỗi critical |
| **Google OAuth** | Đăng nhập qua Google (optional) |
| **PayOS** | Payment gateway (optional) |

---

## 5. High-level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS                                    │
│     Seller │ Support │ Admin │ Logistics │ Accountant            │
└──────┬──────────────────────────────────────────────────────────┘
       │ HTTPS
       ▼
┌──────────────────┐         ┌──────────────────────────────────┐
│   Web App (SPA)  │         │      External Providers          │
│   React + Vite   │         │  Printify, Gearment, CustomCat   │
│   Ant Design     │         │  Merchize, Flashship, Beefun...  │
│   Port: varies   │         └──────────┬───────────────────────┘
└──────┬───────────┘                    │ REST API + Webhooks
       │ REST API                       │
       ▼                                ▼
┌──────────────────────────────────────────────────────────────┐
│                    API Server (NestJS + Fastify)              │
│                                                              │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌───────────────────┐ │
│  │  Auth   │ │ Orders  │ │ Products │ │  Provider Services│ │
│  │  Module │ │ Module  │ │ Module   │ │  (API Clients)    │ │
│  └─────────┘ └─────────┘ └──────────┘ └───────────────────┘ │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌───────────────────┐ │
│  │Tracking │ │  Trans- │ │  Issue   │ │  Export/Mail/     │ │
│  │  Module │ │ action  │ │  Module  │ │  Notification     │ │
│  └─────────┘ └─────────┘ └──────────┘ └───────────────────┘ │
└───────┬────────────┬─────────────┬───────────────────────────┘
        │            │             │
        ▼            ▼             ▼
┌────────────┐ ┌──────────┐ ┌──────────────┐ ┌─────────────┐
│  MongoDB   │ │  Redis   │ │   RabbitMQ   │ │   BullMQ    │
│            │ │  Cache   │ │   Message    │ │   Job Queue │
│  Primary   │ │  + Queue │ │   Broker     │ │             │
│  Database  │ │  Backend │ │              │ │             │
└────────────┘ └──────────┘ └──────────────┘ └─────────────┘
                                                    │
                                              ┌─────┴──────┐
                                              │ Backblaze  │
                                              │ B2 / S3    │
                                              │ Storage    │
                                              └────────────┘
```

---

## 6. Quy mô hệ thống (Metrics)

| Metric | Giá trị |
|---|---|
| Số lượng API modules | 40+ |
| Số lượng Provider tích hợp | 30+ (14 có API) |
| Số lượng web pages | 50+ |
| Frontend components | 100+ |
| API services (frontend) | 25+ |
| Order status states | 30+ |
| User roles | 16 built-in + custom roles |

---

## Tài liệu liên quan

- [Glossary & Domain Dictionary](./Glossary.md) — Bảng thuật ngữ chi tiết
- [Project Structure](./Project_Structure.md) — Cấu trúc thư mục dự án
- Architecture Design (Phase 2) — *Sẽ được tạo*
- Data Architecture (Phase 3) — *Sẽ được tạo*
