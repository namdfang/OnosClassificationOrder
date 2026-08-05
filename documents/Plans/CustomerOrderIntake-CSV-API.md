# Kế hoạch: Khách hàng lên đơn bằng CSV + Public API

> **Trạng thái:** CHƯA IMPLEMENT — kế hoạch chờ duyệt.
> **Ngày lập:** 2026-08-04
> **Nguyên tắc:** Tất cả nằm trong monorepo hiện tại, KHÔNG tạo dự án mới. Mọi đơn — dù lên bằng form portal, CSV hay API — đều đổ về đúng 1 pipeline `orderService.importOrders()` sẵn có.

---

## 1. Hiện trạng — cái gì ĐÃ CÓ và tái dùng nguyên vẹn (~70%)

| Mảnh | Vị trí | Vai trò cho tính năng mới |
| --- | --- | --- |
| **Pipeline tạo đơn duy nhất** `importOrders()` | `apps/api/src/modules/order/order.service.ts` | Map Product Config theo `type`, ép xưởng theo khách (`customer_assignment_config`), auto-gán designer, Telegram noti. KHÔNG viết lại logic tạo đơn. |
| **Đặt đơn portal** `POST /customer/orders` | `apps/api/src/modules/customer-portal/customer-order.service.ts` → `placeOrder()` | Đã bridge portal → `importOrders` (max 50 items, 1 địa chỉ ship chung), tự sinh `productionId` qua `generateUniqueProductionId()`. |
| **Auth khách hàng** | `customers` collection + branch `RoleType.Customer` trong `apps/api/src/modules/auth/jwt.strategy.ts` + phân luồng token `apps/web/src/apis/index.tsx` | Đăng ký / đăng nhập / guard đã chạy. |
| **Xem đơn + tracking** | `listOrders` / `trackOrder` + FE `apps/web/src/pages/customer/orders/{index,track}.tsx` | Đơn lên bằng CSV/API tự hiện ở đây, không cần sửa. |
| **Parse CSV/XLSX phía FE** | `apps/web/src/pages/orders/ImportOrderTab.tsx` (lib `xlsx`, parse client-side → gửi JSON rows) | Copy pattern, không upload file thô lên server. |
| **Idempotency có chỗ bám** | `OrderEntity.externalId` sẵn có | Khóa chống tạo trùng khi hệ thống khách retry API. |
| **Swagger** | Đã bật sẵn ở `apps/api` | Tài liệu Public API cho khách gần như miễn phí (tag riêng). |

## 2. Cái gì CÒN THIẾU — 3 mảnh cần xây

### Mảnh 1 — Lên đơn bằng CSV (FE là chính)

- Trang mới `/customer/orders/import` (`apps/web/src/pages/customer/orders/import.tsx`):
  - Upload `.csv / .xlsx / .xls`, parse tại browser bằng lib `xlsx` (đã có trong dependencies).
  - Bảng **preview + validate từng dòng** trước khi gửi: thiếu `type`, quantity không hợp lệ, thiếu tên người nhận/SĐT/địa chỉ/thành phố… → tô đỏ dòng lỗi kèm lý do, chỉ cho submit khi hết lỗi (hoặc cho phép "bỏ qua dòng lỗi").
  - Nút **tải file mẫu** (template tĩnh trong `apps/web/public/`).
- **Điểm phải mở rộng BE**: `PlaceCustomerOrderDto` hiện chỉ cho 1 `shippingAddress` chung cho cả lần đặt — CSV thực tế mỗi dòng là 1 người nhận khác nhau. → Endpoint mới:
  - `POST /customer/orders/import` (JWT Customer) nhận `rows[]`, mỗi row có `shippingAddress` + `externalRef` riêng.
  - Cap ~**500 dòng**/lần, service chia batch nội bộ khi gọi `importOrders`.
  - Response trả **kết quả từng dòng**: `{ row, status: 'created' | 'failed', productionId?, error? }` — FE hiển thị lại bảng kết quả.

#### Format file CSV mẫu (header tiếng Anh, khớp field DTO)

```
external_ref,type,color,size,quantity,mockup_url,design_front,design_back,recipient_name,phone,address1,address2,city,state,zip,country,note
```

- `external_ref`: mã đơn phía khách (optional nhưng khuyến khích — dùng tra cứu + idempotency).
- `design_*`: mỗi cột 1 vị trí in, key khớp `printArea[].key` của sản phẩm (giống `DesignFieldsZod`).
- 1 dòng = 1 `OrderEntity` (giống 1 item của `PlaceCustomerOrderItemZod` + địa chỉ riêng).

### Mảnh 2 — API key cho khách (mảnh mới hoàn toàn)

Hệ thống **chưa có bất kỳ hạ tầng API-key nào** (đã grep toàn bộ `apps/api`). Máy-gọi-máy không dùng JWT login của portal. Cần:

- **Schema**: field `apiKeys[]` trên `CustomerEntity`:
  ```ts
  apiKeys: [{ label: string; prefix: string;      // 8 ký tự đầu, hiển thị để nhận diện
              hash: string;                        // sha256(key) — KHÔNG lưu plain
              createdAt: Date; lastUsedAt?: Date; revokedAt?: Date }]
  ```
  Key plain dạng `onos_live_<32 hex>` — hiển thị **đúng 1 lần** lúc tạo.
- **Guard**: `ApiKeyGuard` (`apps/api/src/guards/api-key.guard.ts`) đọc header `x-api-key` → sha256 → tìm customer theo hash (index trên `apiKeys.hash`) → gắn customer vào request kèm role ảo `RoleType.Customer` (đúng pattern branch Customer trong `jwt.strategy.ts` để RolesGuard tái dùng nguyên vẹn). Cập nhật `lastUsedAt` async.
- **UI quản lý key trong portal**: mục "API & Tích hợp" (trang mới `/customer/settings/api`): tạo key (đặt label), danh sách prefix + lastUsedAt, nút thu hồi. Endpoints: `GET/POST /customer/api-keys` + `DELETE /customer/api-keys/:prefix` (JWT Customer).
- **Rate limit**: thêm `@nestjs/throttler`, limit theo key (vd 60 req/phút; riêng POST orders 10 req/phút).

### Mảnh 3 — Public Order API (module mới, mỏng)

Module `apps/api/src/modules/customer-open-api/` — controller versioned, tất cả qua `ApiKeyGuard`:

| Method | Path | Mô tả |
| --- | --- | --- |
| POST | `/open-api/v1/orders` | Tạo đơn — body giống `rows[]` của Mảnh 1 (max 100/call). **Idempotent theo `externalRef`**: gọi trùng (cùng customer + externalRef) trả lại đơn cũ, không tạo đôi. |
| GET | `/open-api/v1/orders/:ref` | Tra trạng thái theo `externalRef` HOẶC `productionId` — tái dùng logic `trackOrder` (timeline chặng sản xuất, đã ẩn field nội bộ). |
| GET | `/open-api/v1/orders` | List đơn của customer sở hữu key, phân trang, filter theo trạng thái/ngày. |

Cả 3 endpoint chỉ là **adapter**: validate → gọi cùng service với Mảnh 1 → `importOrders`. Không có logic tạo đơn riêng.

## 3. Kiến trúc tổng thể

```
FE portal (form)   ──► POST /customer/orders               ┐
FE portal (CSV)    ──► POST /customer/orders/import        ├─► CustomerOrderService ─► orderService.importOrders()
Hệ thống khách     ──► POST /open-api/v1/orders (x-api-key)┘      (map config, ép xưởng theo khách,
                                                                    auto-gán designer, Telegram noti)
```

Idempotency + tra cứu: `OrderEntity.externalId` = `externalRef` khách gửi, unique theo `(userSku, userEmail, externalId)` (partial index, chỉ khi externalId tồn tại).

## 4. Danh sách file dự kiến

### Backend (~7 file mới / 4 file sửa)

| File | Việc |
| --- | --- |
| `apps/api/src/modules/customer-open-api/customer-open-api.{module,controller,service}.ts` | MỚI — Mảnh 3 |
| `apps/api/src/guards/api-key.guard.ts` | MỚI — Mảnh 2 |
| `apps/api/src/modules/customer/customer.entity.ts` | SỬA — thêm `apiKeys[]` + index `apiKeys.hash` |
| `apps/api/src/modules/customer/customer.service.ts` | SỬA — `createApiKey/revokeApiKey/findByApiKeyHash` |
| `apps/api/src/modules/customer-portal/customer-order.service.ts` | SỬA — `importOrdersBulk(rows)` dùng chung Mảnh 1 + 3, kết quả từng dòng, idempotency |
| `apps/api/src/modules/customer-portal/customer-order.controller.ts` | SỬA — `POST /customer/orders/import` + api-keys endpoints (hoặc controller riêng `customer-api-key.controller.ts`) |
| `apps/api/src/app.module.ts` | SỬA — đăng ký module mới + ThrottlerModule |

### Shared

| File | Việc |
| --- | --- |
| `packages/shared/dtos/production-order.dto.ts` | `ImportCustomerOrderRowZod` (item + shippingAddress + externalRef), `ImportCustomerOrdersDto/ResDto` (kết quả từng dòng), Open API DTOs |
| `packages/shared/dtos/customer.dto.ts` | `CustomerApiKeyZod` + Create/Revoke/List DTOs |

### Frontend (~4 file mới / 3 file sửa)

| File | Việc |
| --- | --- |
| `apps/web/src/pages/customer/orders/import.tsx` | MỚI — upload + preview + validate + kết quả từng dòng |
| `apps/web/src/pages/customer/settings/api.tsx` | MỚI — quản lý API key + hướng dẫn tích hợp ngắn (curl mẫu) |
| `apps/web/public/customer-order-template.csv` (+ `.xlsx`) | MỚI — file mẫu |
| `apps/web/src/services/customerPortal.ts` | SỬA — `importOrders`, `apiKeys` service |
| `apps/web/src/layouts/customerLayout/CustomerLayout.tsx` + router customer | SỬA — menu 2 entry mới |
| i18n `customerPortal` namespace (vi + en) | SỬA — key cho 2 trang mới |

### Docs

- MỚI `documents/FunctionDescription/CustomerOrderIntake.md` (hoặc mở rộng `CustomerPortal.md` §9): công thức idempotency, format CSV, spec 3 endpoint open-api, cơ chế hash key.
- SỬA `CLAUDE.md`: cập nhật dòng mapping Customer Portal.

## 5. Thứ tự thực thi

1. **Shared DTOs** (row/bulk/api-key/open-api).
2. **BE Mảnh 1**: `importOrdersBulk` + `POST /customer/orders/import` + partial unique index `externalId`.
3. **BE Mảnh 2**: entity `apiKeys` + service + endpoints quản lý key + `ApiKeyGuard` + throttler.
4. **BE Mảnh 3**: module `customer-open-api` (3 endpoint, tag Swagger riêng).
5. **FE**: trang import CSV → trang API key → menu + i18n.
6. **Docs** + cập nhật CLAUDE.md.
7. **Verify**: tsc/eslint/prettier; test tay trên DB local: import CSV 10 dòng (có dòng lỗi chủ đích), gọi open-api bằng curl với key thật (tạo → retry cùng externalRef → xác nhận không tạo trùng → tra trạng thái), kiểm tra đơn hiện đúng ở portal + bảng orders nội bộ + auto-gán designer chạy.

## 6. Câu hỏi mở (cần chốt trước khi implement)

1. **Ai được cấp API key?** Mọi khách tự tạo trong portal, hay Admin duyệt/cấp tay từng khách (thêm cờ `apiAccessEnabled` Admin bật)?
2. **Cap CSV 500 dòng/lần** và **API 100 đơn/call** như đề xuất có phù hợp sản lượng thực tế không?
3. Header CSV **tiếng Anh** (như mẫu §2) hay cần hỗ trợ song song header tiếng Việt?
4. Phase 2: có cần **webhook** báo trạng thái đơn về hệ thống khách không (để khách khỏi polling GET)?

---

> Chốt các câu hỏi §6 xong và có lệnh "implement" thì bắt đầu code theo thứ tự §5.
