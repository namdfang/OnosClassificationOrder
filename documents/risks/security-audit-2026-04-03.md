# SECURITY AUDIT REPORT - PRINTSEL

**Date:** 2026-04-03
**Auditor:** Security Review (Automated)
**Scope:** Full-stack (NestJS API + React Frontend)

---

## CRITICAL

### 1. Master Password Bypass

- **File:** `apps/api/src/modules/auth/auth.service.ts` (lines 92-104)
- **Description:** Login cho phép dùng master password từ env để đăng nhập vào **bất kỳ tài khoản nào**, bỏ qua hoàn toàn password hash:
  ```typescript
  if (loginDto.password === process.env.MASTER_PASSWORD) {
    isPasswordValid = true;
  }
  ```
- **Risk:** Nếu master password bị lộ (qua log, CI/CD, memory dump), attacker login được mọi account.
- **Remediation:** Xóa master password. Nếu cần recovery, dùng token-based password reset có thời hạn.

---

### 2. CORS `origin: '*'` kết hợp `credentials: true`

- **File:** `apps/api/src/main-nest.ts` (lines 27-35)
  ```typescript
  cors: { origin: '*', credentials: true }
  ```
- **Risk:** Bất kỳ website nào cũng có thể gửi authenticated request thay mặt user → CSRF attack toàn diện.
- **Remediation:**
  ```typescript
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com'],
    credentials: true,
  }
  ```

---

### 3. Payment Webhook không có authentication

- **File:** `apps/api/src/modules/transaction/transaction.controller.ts` (lines 299-308)
  ```typescript
  @Get('payment-webhook/:userId')  // Không có @Auth()!
  async handlePaymentWebhook(@Param('userId') userId, @Query('id') id) {
    await this.transactionService.processPaymentLink(userId, id);
  }
  ```
- **Risk:** Attacker gọi `GET /transactions/payment-webhook/{victimId}?id=xxx` → trigger nạp tiền miễn phí cho bất kỳ ai.
- **Remediation:** Verify webhook signature từ PayOS (HMAC checksum). Không trust userId từ URL param.

---

### 4. Race Condition - Double Spending trong Wallet

- **File:** `apps/api/src/modules/transaction/transaction.service.ts` (lines 703-799)
- **Description:** `payOrders()` đọc balance → check → trừ tiền nhưng **không atomic**. Hai request đồng thời cùng đọc balance=$100, cả hai pass validation, kết quả balance=-$100.
- **Risk:** User gửi 2 request pay đồng thời → double spending, bypass debt limit.
- **Remediation:**
  ```typescript
  const result = await this.userRepository.findOneAndUpdate(
    { _id: user._id, balance: { $gte: amount } },  // Atomic check
    { $inc: { balance: -amount } }
  );
  if (!result) throw new BadRequestException('Insufficient balance');
  ```

---

### 5. No Brute Force Protection trên Login

- **File:** `apps/api/src/modules/auth/auth.controller.ts` (lines 49-111)
- **Description:** Login endpoint không có `@Auth()` → không áp rate limiting. Global rate limiting đã bị comment out tại `main-nest.ts:49-54`.
- **Risk:** Attacker brute force password không giới hạn.
- **Remediation:** Thêm rate limiting riêng cho login (5 attempts / 15 phút / IP). Implement account lockout sau X lần fail.

---

### 6. Permission Guard luôn return `true`

- **File:** `apps/api/src/guards/permissions.guard.ts` (lines 36-38)
  ```typescript
  // Khi permission check FAIL:
  request.passAuth = false;
  return true;  // Vẫn cho qua!
  ```
- **Risk:** Nếu RolesGuard không chạy sau đó, mọi request đều bypass permission check.
- **Remediation:** Return `false` hoặc throw `ForbiddenException` khi permission fail.

---

## HIGH

### 7. IDOR - Không kiểm tra ownership trên Order

- **File:** `apps/api/src/modules/order/order.service.ts` (lines 5048-5148)
- **Affected endpoints:** `updateStatus`, `updateSellerNote`, `updateSystemNote`, `updateTracking`
- **Description:** Các endpoint chỉ check order tồn tại, **không check order thuộc về user hiện tại**.
- **Risk:** Seller A sửa/xem được order của Seller B.
- **Remediation:** Thêm `userId: user._id` vào filter query cho mọi order operation.

---

### 8. NoSQL Injection qua `$regex` (12+ files)

- **Description:** User input truyền thẳng vào MongoDB `$regex` mà không escape:
  ```typescript
  { email: { $regex: search, $options: 'i' } }
  ```
- **Affected files:**
  - `modules/order/order.service.ts` (lines 456, 1254)
  - `modules/user/user.service.ts` (lines 588, 592, 1148, 1295, 1308-1310)
  - `modules/folder-image/folder.service.ts` (lines 67-68)
  - `modules/artwork/artwork.service.ts` (lines 28-30)
  - `modules/tracking/tracking.service.ts` (lines 161-168, 195-197, 309-311)
  - `modules/provider/provider.service.ts` (lines 30-31)
  - `modules/store/store.service.ts` (lines 24-25)
  - `modules/departments/department.service.ts` (lines 20-21)
  - `modules/category/category.service.ts` (lines 19-20)
  - `modules/product/product.service.ts` (lines 87-88, 1194-1195)
  - `modules/provider-order/provider-order.service.ts` (lines 28-29)
  - `modules/notifications/notification.service.ts` (lines 40-41)
  - `modules/webhooks/webhook.service.ts` (lines 18-19)
- **Risk:** ReDoS attack, data extraction qua regex injection, filter bypass.
- **Remediation:** Dùng `escapeStringRegexp(search)` trước khi truyền vào `$regex`.

---

### 9. SSRF - Download file từ URL không validate

- **File:** `apps/api/src/modules/upload/upload.service.ts` (lines 764-793)
  ```typescript
  const response = await axios.get(url, { timeout: 0 }); // URL từ user, timeout=0!
  ```
- **Also affected:**
  - `modules/stock-order/stock-order.service.ts` (lines 1086, 1495)
  - `modules/dropship-order/dropship-order.service.ts` (lines 1078, 1418)
  - `modules/tracking/tracking.service.ts` (lines 364-366)
- **Risk:** Attacker truyền URL `http://localhost:27017` → scan internal services, truy cập Redis/MongoDB, exfiltrate data.
- **Remediation:** Whitelist allowed domains, block private IPs (127.0.0.1, 10.*, 172.16-31.*, 192.168.*), set timeout hợp lý (30s).

---

### 10. XSS qua `dangerouslySetInnerHTML`

- **File:** `apps/web/src/components/products/ProductDescription.tsx` (line 43)
  ```typescript
  dangerouslySetInnerHTML={{ __html: description }}
  ```
- **Also affected (innerHTML in print):**
  - `apps/web/src/pages/orders/allOrders/OrderDetailDrawer.tsx` (line 421)
  - `apps/web/src/pages/orders/dropshipOrders/OrderDetailDrawer.tsx` (line 391)
  - `apps/web/src/pages/orders/stockOrders/OrderDetailDrawer.tsx` (line 343)
- **Risk:** Nếu description chứa malicious script → XSS → steal token từ localStorage.
- **Remediation:** `DOMPurify.sanitize(description)` trước khi render.

---

### 11. Password lọt vào log

- **File:** `apps/api/src/modules/auth/auth.controller.ts` (lines 63-71)
  ```typescript
  this.logger.info({ body: loginDto }); // loginDto chứa password!
  ```
- **Risk:** Password plaintext trong log files, monitoring systems.
- **Remediation:** Loại bỏ password khỏi log: `{ body: { ...loginDto, password: '***' } }`.

---

### 12. S3 Upload endpoint public (không cần auth)

- **File:** `apps/api/src/shared/shared.controller.ts` (lines 13-33)
  ```typescript
  @Post('generate-put-url')
  @Auth([], [], { public: true })  // Ai cũng upload được!
  ```
- **Risk:** Storage quota exhaustion, chi phí AWS tăng, upload file độc hại.
- **Remediation:** Require authentication. Thêm rate limiting, file size limit, content-type validation.

---

### 13. Negative Amount không validate trong Transaction

- **File:** `apps/api/src/modules/transaction/transaction.service.ts`
  - `createTopupRequest` (lines 438-508) — không validate `amount > 0`
  - `createCreditTopup` (lines 625-700) — không validate `amount > 0`, không limit max amount
- **Risk:** User request topup số âm (rút tiền), hoặc admin nạp credit vô hạn.
- **Remediation:**
  ```typescript
  if (amount <= 0) throw new BadRequestException('Amount must be positive');
  if (amount > MAX_TOPUP_AMOUNT) throw new BadRequestException('Exceeds maximum');
  ```

---

## MEDIUM

### 14. JWT token lưu localStorage

- **File:** `apps/web/src/store/authStore.ts` (line 52)
- **Risk:** Nếu có XSS → attacker đọc được token từ localStorage → full account takeover.
- **Remediation:** Chuyển sang httpOnly cookie. Backend set `Set-Cookie: token=...; httpOnly; Secure; SameSite=Strict`.

---

### 15. Logout dùng GET method (CSRF)

- **File:** `apps/api/src/modules/auth/auth.controller.ts` (line 113)
  ```typescript
  @Get('logout')  // GET request thay đổi state!
  ```
- **Risk:** Attacker nhúng `<img src=".../auth/logout">` → logout user.
- **Remediation:** Đổi sang `@Post('logout')` hoặc `@Delete('logout')`.

---

### 16. `request.passAuth` flag bypass role check

- **File:** `apps/api/src/guards/roles.guard.ts` (lines 40-42)
  ```typescript
  if (request?.passAuth) {
    return true;  // Bypass role checking!
  }
  ```
- **Risk:** Nếu middleware/guard nào đó set `passAuth = true`, role check bị vô hiệu hóa.
- **Remediation:** Dùng explicit return values từ guards, không rely vào request property.

---

### 17. `console.log` chứa sensitive data trong production

- **Files:**
  - `modules/order/order.service.ts` (lines 1239, 1247, 1776, 1778)
  - `modules/upload/upload.service.ts` (lines 337, 702)
  - `main.ts` (line 4) — log `process.env.DB_URI?.length`
- **Risk:** Information disclosure qua production logs.
- **Remediation:** Xóa tất cả `console.log`, dùng Winston logger với level control.

---

### 18. Không validate `folderId` ownership trong upload

- **File:** `apps/api/src/modules/upload/upload.controller.ts` (line 34)
- **Risk:** User upload file vào folder của user khác.
- **Remediation:** Verify user owns the folder trước khi upload.

---

### 19. File validation chỉ check extension, không check magic bytes

- **File:** `apps/api/src/modules/upload/upload.service.ts` (lines 29-156)
  ```typescript
  IMAGE_EXTENSIONS = /(jpg|jpeg|png|webp)$/i;  // Chỉ check extension
  ```
- **Risk:** Upload file giả extension (ví dụ `malware.pdf.jpg`).
- **Remediation:** Validate file magic bytes (file header) ngoài extension.

---

### 20. Helmet config thiếu CSP headers

- **File:** `apps/api/src/main-nest.ts` (line 47)
  ```typescript
  app.use(helmet());  // Default config, thiếu CSP
  ```
- **Remediation:**
  ```typescript
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  }));
  ```

---

## ACTION PLAN

### Tuần 1 (Critical)

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Fix CORS → whitelist domain | `main-nest.ts` | [ ] |
| 2 | Thêm webhook signature verification cho payment | `transaction.controller.ts` | [ ] |
| 3 | Fix race condition wallet (atomic update) | `transaction.service.ts` | [ ] |
| 4 | Xóa/disable master password | `auth.service.ts` | [ ] |
| 5 | Thêm rate limiting cho login | `auth.controller.ts` | [ ] |
| 6 | Fix Permission Guard return logic | `permissions.guard.ts` | [ ] |
| 7 | Thêm ownership check cho order endpoints | `order.service.ts` | [ ] |

### Tuần 2 (High)

| # | Task | File | Status |
|---|------|------|--------|
| 8 | Escape tất cả `$regex` input | 12+ service files | [ ] |
| 9 | Validate URL trước khi download (block private IPs) | `upload.service.ts` + 3 files | [ ] |
| 10 | Sanitize HTML với DOMPurify | `ProductDescription.tsx` + 3 files | [ ] |
| 11 | Xóa password khỏi log | `auth.controller.ts` | [ ] |
| 12 | Require auth cho S3 upload | `shared.controller.ts` | [ ] |
| 13 | Validate `amount > 0` trong mọi transaction | `transaction.service.ts` | [ ] |

### Tuần 3 (Medium)

| # | Task | File | Status |
|---|------|------|--------|
| 14 | Chuyển JWT sang httpOnly cookie | `authStore.ts` + backend | [ ] |
| 15 | Đổi logout sang POST | `auth.controller.ts` | [ ] |
| 16 | Xóa `console.log` trong production | Multiple files | [ ] |
| 17 | Validate folderId ownership | `upload.controller.ts` | [ ] |
| 18 | Thêm magic bytes validation cho file upload | `upload.service.ts` | [ ] |
| 19 | Cấu hình CSP headers trong helmet | `main-nest.ts` | [ ] |
| 20 | Refactor passAuth flag | `roles.guard.ts` | [ ] |
