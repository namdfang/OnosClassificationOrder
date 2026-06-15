# Billing (Wallet & Payments) — Function Description

> **Folder:** `apps/web/src/pages/billing/`
> **Backend:** `apps/api/src/modules/transaction/`

---

## 1. Overview

Module **Billing** quản lý ví điện tử (P-Wallet) và thanh toán trong hệ thống Printsel. Bao gồm:
- **Wallet (TopUp)**: Nạp tiền vào ví qua nhiều phương thức
- **Payments**: Lịch sử thanh toán đơn hàng và hoàn tiền

---

## 2. Cấu trúc Files

### Frontend
```
pages/billing/
├── wallet/
│   ├── index.tsx              → Trang quản lý topup (Seller view)
│   ├── ManagerTopUp.tsx       → Trang quản lý topup (Admin/Accountant view)
│   ├── TopUpModal.tsx         → Modal topup (placeholder)
│   └── TopUpList.tsx          → Component bảng danh sách topup (reusable)
└── payments/
    ├── Payments.tsx            → Lịch sử thanh toán (Seller view)
    └── PaymentManager.tsx      → Lịch sử thanh toán (Admin view)

components/Orders/ordersTable/
└── TopUpModal.tsx              → Modal topup đầy đủ (component chính)
```

### Backend
```
modules/transaction/
├── transaction.module.ts       → NestJS module
├── transaction.controller.ts   → HTTP endpoints
├── transaction.service.ts      → Business logic (~2000+ dòng)
├── transaction.repository.ts   → Data access
├── transaction.entity.ts       → Mongoose schema
└── transaction.consumer.ts     → RabbitMQ consumer (PayOS async)
```

---

## 3. Luồng TopUp (Nạp tiền)

### 3.1 Luồng TopUp thủ công (Pingpong / LianLian / PayPal)

```
1. Seller click "Top up" → TopUpModal mở
2. Chọn phương thức: Pingpong / LianLian
3. Chuyển tiền theo hướng dẫn:
   - Pingpong: chuyển đến quanlyprintsel@gmail.com
   - LianLian: chuyển đến lehuycam1@gmail.com
4. Nhập: Transaction ID, Amount, Seller Note, Upload ảnh chứng từ
5. Submit → POST /v1/transactions/topup-request
   → Tạo transaction status=Pending
   → Gửi thông báo Lark
6. Modal bước 2 hiển thị xác nhận (Trx ID, Method, Amount)
7. Admin/Accountant review trong ManagerTopUp:
   - Process → POST /v1/transactions/process-topup-request
     → Cộng balance cho user (transactional)
     → Cập nhật transaction status=Completed
     → Xóa cache user → balance cập nhật ngay
     → Gửi thông báo Lark
   - Reject → POST /v1/transactions/reject-topup-request
     → Cập nhật transaction status=Rejected
```

### 3.2 Luồng AutoBankTransfer (PayOS - Chuyển khoản tự động)

```
1. Seller chọn "Auto Bank Transfer" trong TopUpModal
2. Nhập số tiền (USD)
3. Submit → GET /v1/transactions/create-payment-link?amount=X
   → Lấy tỷ giá VND/USD từ Vietcombank API
   → Quy đổi sang VND
   → Tạo PayOS payment link
   → Publish message vào RabbitMQ queue
4. Seller mở link checkout → scan QR code bằng app ngân hàng
5. Thanh toán hoàn tất → PayOS callback
6. TransactionConsumer xử lý async (throttle 10s/message):
   → Kiểm tra trạng thái PayOS
   → Nếu PAID: tạo transaction AutoBankTransfer
   → Cộng balance cho user (USD)
   → Redirect về /topup
```

### 3.3 Credit TopUp (Admin trực tiếp cộng tiền)

```
1. Admin/Accountant gọi POST /v1/transactions/credit-topup
2. Nhập: userEmail, amount, systemNote, sellerNote
3. Validate: user phải có role SellerManager
4. Tạo transaction type=CreditTopup, status=Completed ngay
5. Cộng balance + totalTopup cho user (transactional)
```

---

## 4. Luồng Payment (Thanh toán đơn hàng)

### 4.1 Pay Orders (Thanh toán đơn thường)

```
1. Seller chọn orders cần thanh toán
2. Gọi transactionService.payOrders(orderIds, amount, user)
3. Transactional:
   a. Validate balance đủ (hoặc trong debt limit)
   b. Trừ balance user, cộng totalSpent
   c. Tạo transaction type=Charge, status=Completed
   d. Cập nhật orders: isPaid=true, status=Processing
   e. Publish event order.updated qua RabbitMQ
   f. Gửi notification + email
   g. Xóa cache user
```

### 4.2 Refund (Hoàn tiền)

```
1. Admin/Accountant khởi tạo refund
2. Gọi transactionService.refundMoney(amount, userId, processById)
3. Transactional:
   a. Cộng balance cho user
   b. Tạo transaction type=Refund
   c. Xóa cache
```

---

## 5. Trang Wallet - Seller View

**File:** `pages/billing/wallet/index.tsx`
**Route:** `/topup` (hoặc tương đương)

### Hiển thị
- **P-Wallet Balance**: Số dư ví từ `profile.balance`
- **Bảng transactions**: TopUpList component

### Bộ lọc

| Filter | Mô tả |
|--------|-------|
| Trx ID | Tìm theo mã giao dịch |
| User | Chọn user (chỉ SellerManager) |
| TopUp Type | Payoneer / Pingpong / PayPal / LianLian |
| Type | Topup / CreditTopup |
| Method | Wallet |
| Date Range | Presets: Today, Yesterday, 7/14/30 days |

### Export
- **By Order Selected**: Chọn transactions → export Excel
- **By Time Selected**: Chọn khoảng thời gian → gửi API export

---

## 6. Trang Wallet - Manager View

**File:** `pages/billing/wallet/ManagerTopUp.tsx`

### Chức năng
- Xem tất cả topup requests của sellers
- **Process**: Duyệt topup (nhập System Note) → cộng tiền cho seller
- **Reject**: Từ chối topup (nhập System Note)
- Chỉ Admin/Accountant có nút Process/Reject

### Bộ lọc
- Trx ID, Email, TopUp Via, Type, Method
- Không có Date Range picker

---

## 7. TopUpList Component

**File:** `pages/billing/wallet/TopUpList.tsx`

### Columns

| Cột | Nội dung |
|-----|----------|
| Trx ID | Mã giao dịch hệ thống |
| Your Trx ID | External ID (mã bên ngoài) |
| Type | Topup / CreditTopup |
| Method | Wallet |
| Via | Payoneer / Pingpong / PayPal / LianLian / AutoBankTransfer |
| Amount | Số tiền (USD) |
| Image | Ảnh chứng từ |
| Status | Pending (vàng) / Completed (xanh) / Rejected (đỏ) |
| User | Tên user thực hiện |
| Created | Thời gian tạo |
| Seller Note | Ghi chú của seller |
| System Note | Ghi chú của admin |
| Actions | Process / Reject (chỉ Admin/Accountant) |

### Actions Modal
- Mở modal với input **System Note** (bắt buộc)
- Confirm → gọi processTopUp hoặc rejectTopUp callback

---

## 8. TopUpModal Component (Đầy đủ)

**File:** `components/Orders/ordersTable/TopUpModal.tsx`

### Form Fields

| Field | Type | Validation |
|-------|------|-----------|
| Phương thức | Radio (Pingpong / LianLian / AutoBankTransfer) | Bắt buộc |
| Payment Type | Radio (Make payment / Instant) | — |
| Transaction ID | Input | Bắt buộc (trừ AutoBankTransfer) |
| Amount | InputNumber | Bắt buộc, max 99,999.99, 2 chữ số thập phân |
| Seller Note | TextArea | Tùy chọn |
| Image | Upload | Bắt buộc (trừ AutoBankTransfer) |

### 2 bước:
1. **Bước 1**: Chọn phương thức + điền form → Submit
2. **Bước 2**: Modal xác nhận hiển thị Transaction ID, Method, Amount

---

## 9. Trang Payments - Seller View

**File:** `pages/billing/payments/Payments.tsx`

### Bộ lọc
- Trx ID, Email (SellerManager only), Type (Charge/Refund), Method, Date Range

### Columns

| Cột | Nội dung |
|-----|----------|
| ID | Mã giao dịch |
| Order IDs | Danh sách order liên quan (tags) |
| Code | Mã code |
| Type | Charge / Refund |
| Method | Wallet |
| Status | Trạng thái |
| Amount | Số tiền |
| Balance Before | Số dư trước |
| Balance After | Số dư sau |
| Created At | Thời gian tạo |
| Updated At | Thời gian cập nhật |
| User | Tên user (Admin/SellerManager only) |

---

## 10. Trang Payments - Manager View

**File:** `pages/billing/payments/PaymentManager.tsx`

Tương tự Payments.tsx nhưng:
- Xem tất cả giao dịch
- Lọc theo Email
- Export theo thời gian (không export theo selection)

---

## 11. API Endpoints

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/v1/transactions` | Admin, Manager, Accountant, Seller | Lấy danh sách transactions |
| GET | `/v1/transactions/:id` | Admin, Manager, Seller | Chi tiết transaction |
| GET | `/v1/transactions/statistic` | Admin, Manager, Accountant, Seller | Thống kê transactions |
| POST | `/v1/transactions/topup-request` | Admin, Seller | Tạo yêu cầu nạp tiền |
| POST | `/v1/transactions/process-topup-request` | Admin, Accountant | Duyệt topup |
| POST | `/v1/transactions/reject-topup-request` | Admin, Accountant | Từ chối topup |
| POST | `/v1/transactions/credit-topup` | Admin, Accountant | Cộng tiền trực tiếp |
| GET | `/v1/transactions/create-payment-link` | Admin, Seller | Tạo link thanh toán PayOS |
| GET | `/v1/transactions/payment-webhook/:userId` | Public | PayOS webhook callback |

---

## 12. Data Model

### Transaction Entity

```
TransactionEntity {
  code: string (unique)
  sellerNote?: string (0-255 chars)
  systemNote?: string (0-255 chars)
  externalId?: string
  amount: number
  balanceBefore: number | null
  balanceAfter: number | null
  imageId? → ImageEntity
  referenceIds[] → OrderEntity / DropshipOrderEntity
  storeCode?: string
  status: Pending | Completed | Rejected
  type: Topup | Charge | Refund | CreditTopup
  topupType?: Payoneer | Pingpong | PayPal | LianLian | AutoBankTransfer
  method: Wallet
  currency: string (default: USD)
  userId → UserEntity (required)
  processById? → UserEntity (admin who processed)
  createdAt, updatedAt
}
```

### Virtuals
- `user` → UserEntity
- `processBy` → UserEntity
- `orders` → OrderEntity[]
- `store` → StoreEntity
- `image` → ImageEntity

---

## 13. Phân quyền

| Tính năng | Admin | Accountant | Manager | Seller | SellerManager |
|-----------|-------|-----------|---------|--------|---------------|
| Xem transactions mình | ✓ | ✓ | ✓ | ✓ | ✓ |
| Xem tất cả transactions | ✓ | ✓ | ✓ | ✗ | ✓ (cùng dept) |
| Tạo topup request | ✓ | ✗ | ✗ | ✓ | ✗ |
| Duyệt topup | ✓ | ✓ | ✗ | ✗ | ✗ |
| Từ chối topup | ✓ | ✓ | ✗ | ✗ | ✗ |
| Credit topup | ✓ | ✓ | ✗ | ✗ | ✗ |
| Tạo payment link | ✓ | ✗ | ✗ | ✓ | ✗ |
| Export transactions | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lọc theo user | ✓ | ✓ | ✗ | ✗ | ✓ |

---

## 14. Tự động duyệt TopUp (Email Scanning)

Backend có chức năng quét email tự động để duyệt topup:

### scanPingPongEmail()
- Quét inbox Gmail tìm email xác nhận từ PingPong
- Regex parse: transaction ID, amount, sender
- Match với pending topup requests
- Tự động approve nếu khớp
- Dùng Redis cache tránh xử lý trùng

### scanLianLianEmail()
- Tương tự cho LianLian
- Parse email body để lấy transaction info
- Auto-approve matching pending topups

### OAuth2 Gmail
- Dùng Google OAuth2 để đọc email
- Token refresh tự động khi hết hạn
- Access token cache trong Redis

---

## 15. Async Processing (RabbitMQ)

### TransactionConsumer
- **Queue**: `{exchange}.transaction.process`
- **Dead Letter Queue**: `{exchange}.transaction.process.dlq` (TTL: 24h)
- **Bottleneck**: maxConcurrent=1, minTime=10s
- Xử lý PayOS payment confirmations
- Retry nếu payment chưa hoàn tất (requeue)
- Timeout 60s per message

---

## 16. Validation Rules

| Rule | Giá trị |
|------|---------|
| Min topup amount | Từ shared constants (MIN_TOPUP_AMOUNT) |
| Max topup amount | 99,999.99 USD |
| Decimal places | Chính xác 2 chữ số |
| External ID | Bắt buộc nếu không phải AutoBankTransfer |
| Image upload | Bắt buộc nếu không phải AutoBankTransfer |
| System Note | Bắt buộc khi Process/Reject |
| Debt limit | Balance mới >= debtLimit (cho phép âm nếu có limit) |

---

## 17. Status Transitions

```
TopUp:        Pending → Completed (process)
                     → Rejected  (reject)

CreditTopup:  → Completed (tạo là Completed luôn)

Charge:       → Completed (tạo khi pay orders)

Refund:       → Completed (tạo khi refund)
```
