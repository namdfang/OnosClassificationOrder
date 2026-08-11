# Customer Order Intake (Staging + CSV + Push to production) — Function Description

> **File FE:** `apps/web/src/pages/customer/orders/{index,import,new}.tsx`, `apps/web/src/components/customer/PushToProductionDialog.tsx`, `apps/web/src/services/customerPortal.ts`
> **File BE:** `apps/api/src/modules/customer-portal/{customer-order.entity,customer-payment.entity,customer-order.service,customer-order.controller}.ts`
> **Route:** `/customer/orders` (listing 8 tab), `/customer/orders/import` (CSV), `/customer/orders/new` (form)
> **API:** `/v1/customer/orders/*`
> **Plan gốc:** `documents/Plans/CustomerOrderIntake-CSV-API.md` (v3 — đã implement đợt CSV/XLSX; API key + Public API + webhook hoãn Phase 2)

## 1. Overview

Khách hàng Customer Portal lên đơn theo mô hình **staging 2 pha** thay vì vào thẳng sản xuất:

1. **Pending (staging)** — đơn tạo qua form (`placeOrder`) hoặc import CSV theo **đúng template fulfill OnosPod cũ** nằm ở collection riêng **`customer_orders`** (1 document = 1 ĐƠN nhiều item + 1 địa chỉ chung). Đơn Pending **KHÔNG BAO GIỜ** là `OrderEntity` → toàn bộ pipeline sản xuất + thống kê nội bộ (dashboard, designer stats, fulfillment, Telegram) không thấy đơn này, không phải sửa filter nào.
2. **Push to production** — khách tick chọn đơn Pending → xem bảng **giá chốt** từng item (dialog) → confirm: mỗi item nổ ra 1 `OrderEntity` với `productionId` riêng qua đúng 1 điểm vào `orderService.importOrders()` (map ProductConfig, ép xưởng theo khách, auto-gán designer, Telegram noti như luồng nội bộ). Ledger `customer_payments` ghi 1 record `status='waived'` + tổng amount mỗi lần push (payment gate OFF đợt này — plan §12.1).

Trạng thái đơn khách **derive at read-time** từ `OrderEntity` (không dual-write): 8 tab **All / Pending / Processing / In Production / Fulfilled / Completed / Refunded / Cancelled** + 2 badge chồng **On Hold** (`heldAt`) và **Đang sửa lỗi/Rework** (`designerStatus='rework'` hoặc tool-check chưa ok). Trạng thái mức ĐƠN = item **chậm nhất** (least-advanced).

Hai luồng đơn cùng tồn tại (plan §1.3):

- **Luồng A (đa số):** đơn sync từ hệ OnosPod cũ → `importOrders()` vào thẳng `OrderEntity` như trước. Backfill + lazy-sync tạo staging row `pushedAt=createdAt` (orderKey `legacy-<productionId>`) chỉ để listing portal thấy đơn — KHÔNG payment record, KHÔNG đổi hành vi sản xuất.
- **Luồng B (khách tự lên đơn):** form/CSV → staging Pending → push.

## 2. Luồng hoạt động

### 2.1 CSV import theo template cũ

1. Khách mở `/customer/orders/import`, tải file mẫu (`apps/web/public/customer-order-template.csv` — copy nguyên template hệ cũ) hoặc dùng file sẵn có.
2. FE parse tại browser (`parseTemplateRows()` trong `import.tsx`, lib `xlsx`):
   - **Trim header** (template thật có `order_id `, `quantity `... thừa khoảng trắng), match không phân biệt hoa thường.
   - **Cắt ở dòng trống hoàn toàn đầu tiên** — block hướng dẫn UPDATED/NOTE cuối template tự bị bỏ, không sinh lỗi ảo.
   - `raw:false` khi đọc sheet → `postcode`/`telephone` giữ dạng string (không mất số 0 đầu).
   - **Group nhiều dòng cùng `(order_id, identifier)` = 1 đơn nhiều item** (rule hệ cũ). Địa chỉ lấy dòng ĐẦU; dòng sau lệch địa chỉ → warning.
   - **Địa chỉ lưu ĐỦ bộ field hệ cũ** (`firstName/lastName/company/phone/email/address1/address2/city/state/postcode/country`): cột `name` template tự tách từ đầu = firstName, phần còn lại = lastName; file export hệ cũ có sẵn cột `first_name`/`last_name`/`phone` → ưu tiên dùng thẳng (alias `phone` ↔ `telephone`). `is_national`/`national` hệ cũ không áp dụng.
   - Cột `design_*` parse **động** → key `DesignFields` (snake→camel: `design_sleeve_left`→`sleeveLeft`); cột `shipping` qua `parseCustomerShipMethod()` (shared — 4 giá trị + alias `SBTT`→`tiktok`, trống→`express_us`); `tracking_number/carrier/url` + `shipping_label` → `items[].tracking` (lưu-hiển-thị, chưa nối sản xuất).
   - **Validate bằng CHÍNH schema Zod shared** `CustomerImportOrderZod.safeParse()` từng đơn — cùng schema `ImportCustomerOrdersDto` BE validate qua ZodValidationPipe → rule FE/BE khớp 100%, KHÔNG validate tay ở FE. Giá trị thô đẩy thẳng vào Zod (quantity trống → `undefined` để default(1), coerce bắt số sai; shipping parse qua `parseCustomerShipMethod` shared, giá trị lạ giữ raw cho enum bắn `invalid_enum_value`). Zod issue được map path → (dòng file, cột template) qua `ITEM_FIELD_TO_COLUMN`/`ADDRESS_FIELD_TO_COLUMN` + dịch message theo ngôn ngữ hiện tại (`issueMessage()` → keys `importCsv.cellErrors.*`).
   - Preview = **bảng tính từng dòng** (13 cột template): ô lỗi bôi đỏ + message ngay dưới giá trị; đơn phân tách bằng border đậm. **Còn ≥1 ô lỗi → nút import DISABLE hẳn** (không còn chế độ "import đơn hợp lệ") — khách sửa file rồi tải lại.
   - Cột **"Sản phẩm hệ thống"** (ngay sau cột sku, nền tím nhạt): sau parse FE gọi `POST /import/resolve` đối chiếu từng SKU với catalog → hiện ảnh mockup + tên sản phẩm + màu/size + giá tham khảo (gạch giá gốc khi có Promotion, tính đúng công thức import/push) để khách check trước khi submit. SKU không tồn tại → ô đỏ "SKU không tồn tại trong catalog" + **tính vào lỗi chặn submit** (khớp rule BE fail cả đơn); nút import disable trong lúc đang đối chiếu.
3. `POST /customer/orders/import` nhận `orders[]` đã group (cap 500 dòng) → BE validate lại: **SKU bắt buộc match `variations[].sku`** (uppercase+trim, plan §13.1) → resolve `productConfigId`/`type`/`size`/`color` từ variation (SKU là nguồn chân lý; size/color file chỉ tham khảo) + tính **giá tham khảo** (`priceSnapshot`) → **cấp `productionId` từng item** (`assignProductionIds()`, xem §3.2) → tạo staging doc `pending`. Response kết quả từng đơn `created | duplicated | failed` (+ `itemErrors`).
4. **Idempotency mức ĐƠN:** unique index `(customerId, orderKey)` với `orderKey = customerOrderKey(order_id, identifier)` (normalize lowercase) — import lại file → mọi đơn cũ báo `duplicated`, không tạo trùng.

### 2.2 Push to production

```
Tick đơn Pending → "Push to production" → POST /push-preview (bảng giá chốt, không commit)
  → confirm → POST /push:
     1. validate (pending, chưa push, có item, đủ địa chỉ tối thiểu)
     2. chốt giá từng item (resolveUnitPrice: cod/tiktok → nonShipCost fallback retailPrice;
        express_us/economy_us → retailPrice fallback nonShipCost; áp Promotion theo tier
        qua promotionMatches/applyPromotionDiscount — tái dùng như customer-catalog)
     3. TÁI DÙNG items[].productionId đã cấp lúc tạo/import (fallback generateUniqueProductionId
        cho staging doc cũ) → 1 lệnh importOrders() duy nhất
        (type = ProductConfig.fullName resolve từ SKU → map config chính xác)
     4. tạo customer_payments record { status:'waived', method:'waived', amount }
     5. $set items (priceSnapshot chốt) + pushedAt + paymentId vào staging doc
```

- Push **nguyên đơn** (không lẻ item). Payment gate đọc từ `system_configs` key `customer_payment_gate_enabled` — đợt này nếu bật sẽ throw (luồng Admin confirm chưa build, plan §12.1).
- Form `placeOrder` giờ chỉ tạo staging Pending (KHÔNG gọi `importOrders` nữa) — toast hướng khách sang listing để push.

### 2.3 Derive trạng thái (plan §1)

| Trạng thái | Điều kiện |
| --- | --- |
| Pending | staging `pushedAt=null`, `status='pending'` |
| Processing | đã push, `currentFulfillmentStage=null` && `fulfillmentCompletedAt=null` |
| In Production | `currentFulfillmentStage` set (kể cả đang rework — badge chồng, KHÔNG tụt về Processing) |
| Fulfilled | `fulfillmentCompletedAt` set |
| Completed | `fulfillmentCompletedAt` ≤ now − N ngày (`system_configs` key `customer_order_completed_days`, default 14) |
| Refunded | staging `refundedAt` set (flow set chưa build đợt này — tab luôn 0) |
| Cancelled | staging cancelled HOẶC mọi `OrderEntity` của đơn `cancelledAt`/bị xóa |
| _(badge)_ On Hold | ≥1 item `heldAt` set |
| _(badge)_ Rework | ≥1 item `designerStatus='rework'` hoặc (`productionErrorSource='tool-check'` && `toolResultNote`∉{'', 'ok'}) |

## 3. API / Schema

### 3.1 Endpoints (`customer-order.controller.ts`, tất cả `@Auth([RoleType.Customer])`)

| Method | Path | Mô tả |
| --- | --- | --- |
| POST | `/v1/customer/orders` | Form đặt đơn → staging Pending (res `CustomerStagingOrderResDto`) |
| GET | `/v1/customer/orders` | Listing theo ĐƠN — filter `status`/`held`/`search`, phân trang aggregation |
| GET | `/v1/customer/orders/counts` | Đếm 8 trạng thái + `held`/`rework` cho tab bar |
| POST | `/v1/customer/orders/import/resolve` | Đối chiếu SKU với catalog cho preview import — trả tên/ảnh (`ProductConfig.mockup`)/màu-size/giá tham khảo (`resolveImportSkus()` tái dùng `quoteItem`); `found=false` → FE chặn submit |
| POST | `/v1/customer/orders/import` | CSV import (orders[] đã group) — kết quả từng đơn |
| POST | `/v1/customer/orders/push-preview` | Bảng giá chốt (không commit) + `paymentGateEnabled` |
| POST | `/v1/customer/orders/push` | Push nguyên đơn → importOrders + payment waived |
| PATCH | `/v1/customer/orders/staging/:id` | Sửa đơn PENDING tự do (orderName/note/địa chỉ/items) |
| POST | `/v1/customer/orders/staging/:id/cancel` | Hủy đơn PENDING |
| GET | `/v1/customer/orders/:productionId` | (giữ nguyên) track 1 item đã push |
| PATCH | `/v1/customer/orders/:productionId` | (giữ nguyên) sửa mockup/designs/address đơn đã push — giờ đồng bộ ngược vào staging item |

### 3.2 Staging entity `customer_orders` (`customer-order.entity.ts`)

```ts
CustomerOrderEntity {
  customerId; userSku; userEmail;         // denorm match keys
  orderKey;                               // unique (customerId, orderKey) — idempotency mức ĐƠN
  orderId?; identifier?; orderName?;      // giữ nguyên văn giá trị khách điền
  source: 'form'|'csv'|'api'|'sync';
  status: 'pending'|'cancelled';          // CHỈ trạng thái TRƯỚC push
  shippingAddress?;                       // 1 địa chỉ CHUNG cả đơn (có email/company)
  items: CustomerOrderItem[];             // sku, productConfigId, type/size/color (resolve từ SKU),
                                          // quantity, shipMethod, activeService, mockupUrl, designs,
                                          // tracking (lưu-hiển-thị), priceSnapshot,
                                          // productionId — cấp NGAY lúc tạo/import, xem note dưới
  note?; pushedAt?; paymentId?; cancelledAt?; cancelReason?; refundedAt?;
}
// Indexes: unique (customerId, orderKey); (customerId, status, createdAt); ('items.productionId')
```

> **productionId cấp lúc tạo (không phải lúc push):** mã dạng `XX-#####-#####` (2 chữ cái + 2×5 số, cùng pattern `CUTTING_FILE_PRODUCTION_ID_REGEX`), unique trên CẢ `orders` lẫn staging (`generateUniqueProductionId()` check 2 collection). `assignProductionIds()` gọi ở `placeOrder` / `importOrdersCsv` / `updateStagingOrder` (items mới); khi sửa đơn pending FE echo-back `productionId` qua `CustomerStagingItemInputZod.productionId` — BE chỉ nhận mã ĐANG thuộc chính đơn đó (mỗi mã dùng lại tối đa 1 lần), mã lạ bị bỏ qua + cấp mã mới. `pushToProduction` **tái dùng** `item.productionId` làm `OrderEntity.productionId` (fallback sinh mới cho staging doc cũ tạo trước cơ chế này) — khách theo dõi đúng 1 mã xuyên suốt portal → xưởng. Item pending có mã nhưng CHƯA có `OrderEntity` → trang track `GET /:productionId` 404, FE chỉ render link track khi item đã push (drawer + dashboard).

### 3.3 Ledger `customer_payments` (`customer-payment.entity.ts`)

```ts
CustomerPaymentEntity {
  customerId; orderIds[];                 // staging _id các đơn thuộc lần push
  amount;                                 // tổng giá chốt (USD)
  status: 'awaiting'|'paid'|'waived'|'cancelled';
  method: 'manual'|'waived'|'wallet';
  confirmedBy?; confirmedAt?; refunds[];
}
```

### 3.4 Shared (`packages/shared`)

- `enums/customer-order-status.ts` — `CustomerOrderStatus` (7 giá trị + labels VI cho BE) + `CUSTOMER_ORDER_STATUS_PROGRESS` (thứ tự least-advanced).
- `dtos/customer-order.dto.ts` — `CUSTOMER_SHIP_METHODS` (4 giá trị) + `parseCustomerShipMethod()` + `customerOrderKey()` + toàn bộ DTOs: `CustomerStagingOrderZod`/`CustomerStagingItemZod`, `GetCustomerStagingOrders*`, `CustomerOrderCountsZod`, `ImportCustomerOrders*` (`CustomerImportOrderZod` items SKU required), `PushCustomerOrders*`/`PreviewPush*`, `UpdateCustomerStagingOrderDto`, `CancelCustomerStagingOrderDto`, payment consts. Keys `CUSTOMER_ORDER_COMPLETED_DAYS_KEY`, `CUSTOMER_PAYMENT_GATE_KEY`.

## 4. UI Components

- `pages/customer/orders/index.tsx` — listing theo ĐƠN, row giàu thông tin mirror hệ OnosPod cũ: cột Mã đơn (`#<productionId item đầu>` qua `orderDisplayCode()` — **bấm mở drawer chi tiết**, + copy + reference orderId + source + ngày), Sản phẩm (mockup + tên + sku/màu-size, đa item hiện "+N sản phẩm khác"), Khách nhận (tên + địa chỉ rút gọn), Trạng thái (StatusBadge + chip thanh toán Unpaid/Waived + badge Hold/Rework), Vận chuyển (tracking number + carrier + link label), Tổng tiền, actions (Eye mở drawer, Push/Hủy cho pending). Tab bar 8 trạng thái + count badge (`GET /counts`), chip "On Hold", search, checkbox chọn đơn Pending (tab Pending).
- `components/customer/CustomerOrderDetailDrawer.tsx` — **drawer chi tiết ĐƠN** (Sheet phải RỘNG `sm:max-w-[1150px]`, mở khi bấm productionId/Eye), layout **2 cột mirror trang chi tiết hệ OnosPod cũ**: header (mã đơn + copy + reference + chips status/payment/tổng tiền/số item/hold-rework + nút Push/Hủy cho pending); **cột trái 2/3**: card ORDER ACTIVITY (stepper **5 chặng** mirror hệ cũ: Tạo đơn → Gửi sản xuất → Sản xuất xong → Đã lấy hàng → Đã giao hàng; theo `CUSTOMER_ORDER_STATUS_PROGRESS` — Picked Up suy từ (Fulfilled + có tracking number) hoặc Completed, Delivered ≈ Completed vì chưa tích hợp carrier; dấu ✓ chặng đã qua; đơn hủy → banner đỏ; dưới stepper: tracking summary carrier + số vận đơn + link label) + card ORDER DETAILS (mỗi item: mockup LỚN 144px + tên + ID/Merchant/Fulfill code lines + **design thumbnails thật** qua `driveThumbUrl()`/`driveViewUrl()` + giá chốt gạch giá gốc + block PRODUCTIONS `#productionId` + chặng hiện tại + badge; footer totals Tạm tính/Phí ship/Tổng/Đã thanh toán) + card **Order Records** (`OrderRecords` — timeline nhật ký derive thuần FE từ mốc staging: Tạo đơn/Gửi sản xuất kèm mã/Sản xuất xong từng item/Hủy đơn, mới nhất trước; KHÔNG lộ OrderLog nội bộ); **cột phải 1/3**: SHIPPING ADDRESS (đơn đã push hiện dạng text gọn, pending → form sửa → `PATCH staging/:id`) + SHIPPING METHOD (4 option radio-style, highlight method items đang dùng + note activeService USPS) + BUYER NOTE (sửa được khi pending) + TRACKING (number/carrier/URL/nút Shipping label + **iframe preview label PDF**). Export `orderDisplayCode()`.
- `components/customer/CustomerOrderBadges.tsx` — `CustomerOrderStatusBadge` + `CustomerOrderPaymentBadge` (pending = Chưa thanh toán đỏ, đã push = Miễn thanh toán xanh — gate OFF) + `CustomerOrderOverlayBadges` (Hold/Rework) dùng chung listing + drawer.
- `components/customer/PushToProductionDialog.tsx` — gọi `push-preview` khi mở: bảng giá chốt từng item (gạch giá gốc khi có Promotion, tổng theo đơn + tổng cộng), warning dòng chưa chốt được giá, confirm → `push` → toast + reload.
- `pages/customer/dashboard/index.tsx` — mã đơn ở "Đơn gần đây" chỉ render link track khi item đã push (pending hiện text + copy, tránh 404).
- `pages/customer/orders/import.tsx` — 3 bước: chọn file → **preview bảng tính từng dòng** (validate bằng `CustomerImportOrderZod` shared, ô lỗi bôi đỏ + message i18n theo cột, warning lệch địa chỉ; còn lỗi → nút import disable, xem §2.1) → kết quả từng đơn `created/duplicated/failed`. Nút tải file mẫu = template cũ nguyên bản.
- `pages/customer/orders/new.tsx` — giữ nguyên form, chỉ đổi toast sau submit (`orderNew.successPending`).
- i18n: namespace `customerPortal` keys `orders.tabs/status/source/badge*/payment*/moreItems`, `orderDetail.*` (drawer), `push.*`, `importCsv.*` (vi + en).

## 5. Backend logic

Tất cả trong `customer-order.service.ts`:

- `buildDerivePipeline()` — aggregation dùng CHUNG listing + counts: `$lookup` orders theo `items[].productionId` (project `PROD_DERIVE_FIELDS`) → `$addFields statusDerived/heldAny/reworkAny/sortAt`. Logic MIRROR bộ hàm JS `deriveItemStatus()`/`isReworkBadge()`/`toStagingOrder()` (đổi 1 nơi phải đổi nơi kia — comment tại chỗ).
- `quoteItem()` + `buildPricingContext()` — resolve SKU→variation (map `bySku`) hoặc type→config (map `byType`, cho đơn form; chọn variation qua `pickVariation()` match attributes size/color, chỉ nhận khi không mơ hồ). Giá theo ship method + Promotion theo tier.
- `importOrdersCsv()` — validate + create từng đơn, bắt `E11000` → `duplicated`; đơn có item lỗi → `failed` cả đơn.
- `previewPush()` / `pushToProduction()` — mô tả ở §2.2. 1 lệnh `importOrders()` duy nhất cho mọi item (1 Telegram noti/lần push).
- `onModuleInit()` — backfill 1 lần theo marker `system_configs['customer_orders_backfill_v1']`: mọi customer → `syncLegacyOrdersForCustomer()`. Hàm này cũng chạy **lazy mỗi lần khách mở listing** để bắt đơn Luồng A sync về sau backfill (insertMany `ordered:false`, trùng orderKey tự nuốt).
- `updateOrder()` (đơn đã push) — sau khi sửa OrderEntity giờ **đồng bộ ngược** mockup/designs/address vào staging item tương ứng.

## 6. Performance notes

- Listing dùng 1 aggregation duy nhất ($lookup theo `productionId` có index unique bên `orders` + index `items.productionId` bên staging) — không N+1 per đơn; `computeCurrentStage` chạy JS trên trang hiện tại (≤100 doc).
- `syncLegacyOrdersForCustomer` mỗi lần mở listing: 1 `distinct` + 1 `find $nin` scoped theo khách — chi phí tỉ lệ số đơn của chính khách đó. Khách có hàng chục nghìn đơn legacy sẽ chậm ở lần đầu (insertMany), các lần sau chỉ 2 query rỗng.
- Backfill onModuleInit chạy đúng 1 lần (marker) — boot sau không quét lại.
- Import cap 500 dòng/lần; `buildPricingContext` load config theo `$in` SKU 1 query cho cả batch.

## 7. Permissions

- Toàn bộ endpoint `@Auth([RoleType.Customer])` — không dùng permission-catalog nội bộ (pattern Customer Portal sẵn có, `RolesGuard` chặn role Customer khỏi API ngoài prefix `customer/...`).
- Không có trang admin mới đợt này (payment gate OFF — plan §12.1).
