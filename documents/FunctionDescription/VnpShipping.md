# VNP eGlobal Shipping — Function Description

> **File FE:** `apps/web/src/components/orders/VnpShipmentDialog.tsx`, `apps/web/src/components/settings/VnpShippingConfig.tsx` (mục `/adm/settings/vnp-shipping`), `apps/web/src/services/vnpShipping.ts`, entry ở `apps/web/src/components/orders/OrderRowActionsMenu.tsx`
> **File BE:** `apps/api/src/modules/shipping-vnp/` (`vnp-eglobal.client.ts`, `shipping-vnp.service.ts`, `shipping-vnp.controller.ts`, `shipping-vnp.module.ts`)
> **Route:** không có trang riêng — dialog mở từ menu "..." của hàng đơn (trang Orders)
> **API:** `/v1/shipping-vnp/*`

## 1. Overview

Tích hợp **VNP eGlobal Shipment API** (carrier aggregator của VNPost/Nexo, staging `https://vnp-eglobal.itel.dev`) để tạo vận đơn + label cho đơn sản xuất. **Giai đoạn hiện tại là TEST**: Admin/SuperAdmin bấm tay từng đơn qua nút "Vận đơn VNP" ở bảng đơn hàng, mục tiêu là chạy thật toàn trình (check địa chỉ → tạo vận đơn → tracking → hủy) và **soi raw response tìm xem label nằm ở đâu** — spec VNP không khai response body (mọi endpoint trả `object` trống trong OpenAPI, PDF cũng bỏ trống mục Response).

Nguồn spec: `Data/Tai_lieu_API_VNP_eGlobal_dev.pdf` + OpenAPI sống `https://vnp-eglobal.itel.dev/api/v3/api-docs` (151 endpoints, auth Bearer JWT qua `POST /auth/signin`).

Định hướng sau khi test ổn (CHƯA làm): auto-hook tạo vận đơn khi đơn vào công đoạn Đóng hàng, nút in label trên màn quét của công nhân pack, đổ tracking về Customer Portal.

## 2. Luồng hoạt động

1. Bảng đơn hàng → menu "..." của hàng → **"Vận đơn VNP"** (chỉ Admin/SuperAdmin) → mở `VnpShipmentDialog`.
2. Dialog gọi `GET /shipping-vnp/status` — thiếu env thì hiện banner cảnh báo kèm tên biến thiếu.
3. **Bước 1 — Kiểm tra địa chỉ** (2 lớp, `ShippingVnpService.checkAddress()`): (a) **pre-check local** các gate mà createShipment chắc chắn chặn nhưng USPS bỏ qua/tự sửa — country phải US, state phải thuộc `VALID_US_STATE_SET`, đủ street/city/zip; (b) gọi `POST /shipment/usps/checkAddress` và parse CHÍNH XÁC `result.verifications.{zip4,delivery}` (delivery bắt cả số nhà không tồn tại `E.ADDRESS.NOT_FOUND`; `code` ngoài cùng LUÔN 200 kể cả khi sai — không dùng `looksOk`). USPS tự sửa state theo zip (gõ "ZZ" vẫn trả "NC") → nếu state USPS trả khác state của đơn thì đánh invalid bắt sửa dữ liệu. Badge hợp lệ/không + message lý do (nối bằng " • ") + raw.
4. **Bước 2 — Tạo vận đơn** — **GỘP THEO `orderId` seller (1 đơn nhiều item = 1 label)**: phía mình mỗi item là 1 `OrderEntity` có `productionId` riêng, nhưng seller đặt 1 đơn (`orderId`) nhiều item và chỉ mua 1 label. Dialog gọi `GET /shipping-vnp/orders/:id/group` hiện danh sách item cùng `orderId` (loại đơn hủy); item khác trong nhóm đã có vận đơn active → chặn tạo thêm. Chọn service (`Standard/Express/Uniuni/Letter/FirstFlat/FirstClass/UpsGround`) + shipping_type (`GDE/DOMESTIC`) + cân nặng fallback gram (chỉ áp cho item thiếu `order.weight`) → BE chuỗi:
   - `POST /shipment/createAddress` (type `ShippingTo`, map từ `shippingAddress`) → lấy `toAddressId`;
   - `POST /shipment/createShipment` — **1 entry `package_details` cho MỖI item của nhóm** (weight riêng từng item), **`shipping_from_id` resolve THEO XƯỞNG của đơn** (xem §2b), `shipping_unit_id` = env, **`rep1` = `productionId` từng item** (unique bên VNP → chống tạo trùng, tra ngược `GET /shipment/getByRef1/{ref1}`), `rep2` = `orderId`, `ship_date`/`ready_time`/`last_time_available` = hôm nay, `disable_fallback: true` chỉ khi service Uniuni;
   - dò response (`digString` BFS các key phổ biến) nhặt `shipmentId`/`trackingCode`/`labelUrl` → **lưu subdoc `order.vnpShipment` lên CẢ nhóm** (item nào mở dialog cũng thấy); tracking/hủy/nhặt-bù-label cũng updateMany theo `vnpShipment.shipmentId`.
5. Đơn đã có vận đơn: dialog hiện shipmentId/tracking/link label + 3 nút **Tra tracking** / **Chi tiết shipment** (GET `/shipment/{id}` — soi bù label nếu createShipment không trả) / **Hủy vận đơn** (hủy xong được phép tạo lại).
6. Client VNP tự đăng nhập lấy JWT (`LoginRq {email,password}`), cache in-memory, dính 401 thì re-login 1 lần rồi retry.

### 2b. Địa chỉ gửi (ShippingFrom) theo xưởng — cấu hình UI, sống theo môi trường

- **Cài đặt → Vận chuyển VNP** (`/adm/settings/vnp-shipping`, perm `role.manage`, component `VnpShippingConfig.tsx`): (1) form **tạo địa chỉ gửi** — BE gọi thẳng `POST /shipment/createAddress` (type `ShippingFrom`) bên VNP rồi lưu id + snapshot; (2) bảng **gán xưởng → địa chỉ** (mỗi xưởng 1 select; nhiều xưởng chung 1 địa chỉ OK — 2D Thái Nguyên + Gỗ Thái Nguyên → cùng địa chỉ Thái Nguyên) + **địa chỉ mặc định**.
- Config lưu blob `system_configs` key `VNP_SHIPPING_CONFIG_KEY = 'vnp_shipping_config'` (`{addresses[], factoryMap{factoryId→vnpAddressId}, defaultAddressId}`) — **sống theo môi trường**: production tự bấm tạo/gán trên UI, KHÔNG restore data từ local (id địa chỉ bên VNP staging/production khác nhau).
- `resolveFromAddressId(order)` khi tạo vận đơn: `factoryMap[order.factoryId]` → `defaultAddressId` → env `VNP_EGLOBAL_FROM_ADDRESS_ID` (fallback cuối, giờ TÙY CHỌN) → không có thì báo lỗi trỏ về trang Settings.
- Địa chỉ đầu tiên tạo ra tự thành mặc định. Nút gỡ chỉ xóa khỏi config (không xóa bên VNP) + tự dọn mapping trỏ vào nó.
- **Phát hiện khi test staging (2026-08-24) — ĐÃ TẠO LABEL THÀNH CÔNG:**
  - Shipping unit staging `b47b8c02...` = **USPS_zone (supplier usps, nội địa US)** → `shipping_type: "DOMESTIC"`; from PHẢI khớp 1 trong 8 **hub US** (Carson CA 90810 / Jamaica NY 11434 / Garden Grove CA 92841 / Houston TX 77099 / Westminster CA 92683 / St. Louis MO 63132 / Wentzville MO 63385 / Columbus OH 43219) — danh sách nằm trong lỗi `valid_from_address`.
  - **BẪY MAPPING QUAN TRỌNG NHẤT: VNP map `district` của address thành `state` phía carrier — field `state` gửi lên bị BỎ QUA lúc createShipment, `ward` chỉ là placeholder.** Xác nhận bằng test cô lập 24/08 (chỉ `district`=NC → tạo label OK; chỉ `ward`=NC → "State field is invalid") + khớp curl mẫu tài liệu VNP (`district: "TX"`). Địa chỉ US phải điền `district` = MÃ BANG ("CA"); createAddress không gửi `state` thì VNP tự copy district→state, lỗi chỉ nổ ở createShipment. Service đã tự xử lý (`createShipment` + `createFromAddress` với country=US set district=mã bang). Lưu ý phụ: thiếu `ready_time`/`last_time_available` ở createShipment → lỗi mù `"Cannot invoke method getTime() on null object"` — service luôn gửi đủ.
  - Carrier validate thêm: kích thước ≥ 0.1 (đơn thiếu dims → service gửi 1cm), phone người nhận bắt đầu khác 0 + 8-15 số (`normalizeVnpPhone`, fail → placeholder `9999999999`).
  - **Response createShipment thành công**: `{ code:200, result:[{ id (=shipmentId uuid), shipping_cost, zone, shipmentResults:{ id, tracking_code (USPS 30 số), image_url (**LABEL PDF** trên CloudFront) } }] }` — service parse chính xác các field này, digString chỉ còn là fallback.
  - Ví phải ≥ $50 (lỗi "Insufficient wallet balance"). Format lỗi VNP: `{code, message (JSON lồng của carrier), timestamp, details, traceCode}` — `traceCode` gửi Nexo để tra log.

## 3. API / Schema

| Method | Path | Mô tả |
| --- | --- | --- |
| GET | `/v1/shipping-vnp/status` | Trạng thái cấu hình (tên env thiếu — không lộ secret) |
| GET | `/v1/shipping-vnp/config` | Config địa chỉ gửi theo xưởng (blob) |
| POST | `/v1/shipping-vnp/from-addresses` | Tạo địa chỉ ShippingFrom bên VNP + lưu blob |
| GET | `/v1/shipping-vnp/remote-addresses` | Địa chỉ đã lưu bên VNP (raw — tìm id hub US) |
| POST | `/v1/shipping-vnp/from-addresses/import` | Thêm địa chỉ ĐÃ TỒN TẠI bên VNP vào config bằng id |
| GET | `/v1/shipping-vnp/wallet` | Số dư ví VNP (cần ≥ $50 mới tạo được vận đơn) |
| PUT | `/v1/shipping-vnp/config/map` | Lưu factoryMap + defaultAddressId |
| DELETE | `/v1/shipping-vnp/from-addresses/:vnpAddressId` | Gỡ địa chỉ khỏi config (không xóa bên VNP) |
| GET | `/v1/shipping-vnp/orders/:orderId/group` | Nhóm item cùng `orderId` seller (1 đơn = 1 label) |
| POST | `/v1/shipping-vnp/orders/:orderId/check-address` | Bước 1 — USPS checkAddress cho địa chỉ đơn |
| POST | `/v1/shipping-vnp/orders/:orderId/shipment` | Bước 2 — createAddress + createShipment, lưu `vnpShipment` |
| GET | `/v1/shipping-vnp/orders/:orderId/tracking` | Bước 3 — tra tracking |
| GET | `/v1/shipping-vnp/orders/:orderId/shipment-detail` | GET /shipment/{id} bên VNP, nhặt bù label/tracking |
| PUT | `/v1/shipping-vnp/orders/:orderId/cancel` | Bước 4 — hủy vận đơn |

Tất cả `@Auth([SuperAdmin, Admin])`. Mọi Res kèm `raw` (JSON nguyên văn VNP).

```ts
// packages/shared/dtos/vnp-shipping.dto.ts
VnpShipmentInfoZod = { shipmentId?, trackingCode?, labelUrl?, service?, shippingType?,
  toAddressId?, addressValid?, addressCheckedAt?, createdAt?, cancelledAt?,
  lastTrackingStatus?, lastTrackingAt? }
// OrderEntity.vnpShipment (subdoc raw, order.entity.ts) + ProductionOrderZod.vnpShipment
CreateVnpShipmentZod = { service, shippingType, weightGram, lengthCm?, wideCm?, heightCm?, packageType?, packages }
```

Env (`apps/api/.env.development.example`): `VNP_EGLOBAL_API_URL` (default staging), `VNP_EGLOBAL_EMAIL`, `VNP_EGLOBAL_PASSWORD`, `VNP_EGLOBAL_SHIPPING_UNIT_ID` (staging: `b47b8c02-5dd0-40cf-9b22-10978d82bdc4`), `VNP_EGLOBAL_FROM_ADDRESS_ID`. Thiếu email/password → `vnpEglobalConfig` getter (api-config.service.ts) trả null, feature tự disable.

## 4. UI Components

- `VnpShipmentDialog.tsx` — dialog 2 section (địa chỉ / vận đơn), mỗi call hiện `RawBlock` (details/pre collapsible) chứa raw response. Select native styled, i18n namespace `orders` key `vnp.*` + `rowActionsMenu.vnpShipment` (vi/en).
- `OrderRowActionsMenu.tsx` — item "Vận đơn VNP" (icon Truck), chỉ `isAdmin`, disable khi đơn hủy.
- `workshopTableConfig.tsx` — `WorkshopOrderRow` thêm `weight`/`shippingAddress`/`vnpShipment`.

## 5. Backend logic

- `VnpEglobalClient` — axios, baseURL từ config, timeout 30s; `digString()` không nằm ở client mà ở service.
- `ShippingVnpService.loadGroup()` — nhóm theo `orderId` (trim, loại `cancelledAt`); đơn không có `orderId` → nhóm 1 mình. `createShipment()` guard: BẤT KỲ item nào trong nhóm có `vnpShipment.shipmentId` chưa hủy → chặn (1 đơn 1 label); `rep1` unique chặn thêm phía VNP.
- Chưa nói đến GIÁ label trong PDF/spec — hệ VNP chạy mô hình VÍ: `GET /availableBalance`, `POST /payment/generateQr` (topup), `GET /payment/exchangeRate`, `POST /public/calculateFee` + `POST /shipment/usps/getRate` (báo giá trước khi mua — cần JWT dù path "public"). Khi có tài khoản cần test thêm calculateFee + soi số dư trước/sau createShipment.
- Mapping địa chỉ US: `district` ← MÃ BANG (field carrier đọc làm state — bắt buộc), `ward` ← placeholder (service hiện điền cùng mã bang, vô hại), `state` ← mã bang (VNP bỏ qua lúc createShipment nhưng gửi kèm cho tự mô tả).
- `looksOk()` heuristic lỗi: `code>=400 || status>=400 || error` trên response — còn dùng cho createAddress/tracking/cancel; riêng checkAddress đã parse exact `verifications` (heuristic chỉ là fallback khi VNP đổi shape).

## 6. Performance notes

- Chỉ chạy khi bấm tay, 1 đơn/lần — không ảnh hưởng luồng chung. JWT cache in-memory (mất khi restart, tự login lại).

## 7. Permissions

- **Mọi bề mặt VNP đều CHỈ Admin/SuperAdmin** (rà soát 25/08):
  - BE: 14 endpoint `@Auth([SuperAdmin, Admin])`.
  - Nút "Vận đơn VNP" + `VnpShipmentDialog`: gate `isAdmin` ở `OrderRowActionsMenu.tsx` (mount duy nhất).
  - Entry settings `/adm/settings/vnp-shipping`: `adminOnly: true` ở `pages/settings/index.tsx` — perm `role.manage` cấp qua custom role KHÔNG đủ, phải đúng role Admin/SuperAdmin.
  - Link 🏷️ Label ở cột mã đơn (`workshopTableConfig.tsx`): helper `isAdminViewer()` đọc `authStore` — role khác không thấy link/tracking.
- Agent API: field `orders.vnpShipment` khai trong registry (đọc được qua DSL — bề mặt riêng key-gated, không phải UI nhân viên).
