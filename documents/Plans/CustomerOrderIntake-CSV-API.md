# Kế hoạch: Customer Order Intake — CSV/API + Vòng đời trạng thái + Payment gate

> **Trạng thái:** ✅ **ĐÃ IMPLEMENT đợt CSV/XLSX (2026-08-07)** — xem doc chính thức [`documents/FunctionDescription/CustomerOrderIntake.md`](../FunctionDescription/CustomerOrderIntake.md). Phase 2 (API key + Public API + webhook + payment gate ON + refund flow) CHƯA làm. Kế hoạch v3 **đã chốt quyết định (§12 + §13)** (v1 ngày 2026-08-04 chỉ có CSV + Public API; v2 ngày 2026-08-07 bổ sung vòng đời trạng thái đơn khách + payment gate; **v3 cùng ngày 2026-08-07: CSV import GIỮ NGUYÊN template OnosPod cũ** — khách hệ cũ dùng lại đúng file quen thuộc, nhiều dòng cùng `(order_id, identifier)` = 1 đơn nhiều item, xem §6 + §13). Đợt này CHỈ làm CSV/XLSX; API + API key + webhook hoãn Phase 2.
> **Nguyên tắc:** Tất cả nằm trong monorepo hiện tại. Mọi đơn — form portal, CSV hay API — đều đổ về đúng 1 pipeline `orderService.importOrders()` sẵn có, NHƯNG chỉ ở thời điểm **Push to production** (sau khi thanh toán), không phải lúc khách tạo đơn.

---

## 1. Mô hình trạng thái đơn khách hàng (mirror hệ OnosPod cũ)

Tabs: **All / Pending / Processing / In Production / Fulfilled / Completed / Refunded / Cancelled** (+ badge **On Hold** chồng lên, KHÔNG phải tab trạng thái).

| Status | Nghĩa | Nguồn suy ra (derive) | Ai hành động |
| --- | --- | --- | --- |
| **Pending** | Khách vừa tạo (form/CSV/API), CHƯA thanh toán, CHƯA vào hệ sản xuất. Sửa/hủy tự do. | Staging row `customer_orders.status='pending'`, chưa có `productionId` | Khách |
| **Processing** | Đã push + thanh toán → đơn đã vào hệ nội bộ, đang tiền-sản-xuất (soát tool, thiết kế, gán designer) **và CHƯA từng vào In** | Đã push (`productionId` set) + `OrderEntity`: `currentFulfillmentStage` null && `fulfillmentCompletedAt` null && `cancelledAt` null | Seller (nội bộ) |
| **In Production** | Đã vào In ít nhất 1 lần (kể cả đang bị bật ngược sửa lỗi) | `currentFulfillmentStage` set && `fulfillmentCompletedAt` null | Xưởng |
| _(badge)_ **Đang sửa lỗi (Rework)** | Đơn In báo lỗi đẩy ngược về designer/soát tool — chồng lên In Production, KHÔNG tụt về Processing | `designerStatus='rework'` HOẶC (`productionErrorSource='tool-check'` && `toolResultNote!='ok'`) — mà `currentFulfillmentStage` vẫn set | Designer/Support sửa → đơn tự về In |
| **Fulfilled** | Đã đóng hàng xong / xuất kho | `fulfillmentCompletedAt` set | Vận chuyển |
| **Completed** | Chốt sổ — mặc định auto sau N ngày kể từ Fulfilled (config, đề xuất 14 ngày; phase sau nối tracking giao hàng thật) | `fulfillmentCompletedAt` < now − N ngày | — |
| **Refunded** | Đã hoàn tiền (đơn hủy sau khi đã thanh toán) | `customer_payments` có refund record cho đơn này | Admin (phase 1) / ví (phase 2) |
| **Cancelled** | Hủy trước push (staging) hoặc hủy sau push (nội bộ) | Staging `status='cancelled'` HOẶC `OrderEntity.cancelledAt` set | Khách (pending) / Admin (sau push) |
| _(badge)_ **On Hold** | Đơn đứng im chờ bổ sung (design/địa chỉ...) — chồng lên Processing/In Production | `OrderEntity.heldAt` set (cơ chế Hold sẵn có, Orders.md §9b) | Khách bổ sung → unhold |

### 1.1 Tại sao tách Pending và Processing (không gộp làm 1)?

1. **Ranh giới TIỀN**: Pending = chưa trả tiền → sửa/xóa/hủy tự do, miễn phí, không ai bị ảnh hưởng. Từ Processing = đã thanh toán → hủy là phát sinh hoàn tiền, sửa bị giới hạn. Cổng thanh toán chính là cạnh chuyển Pending → Processing.
2. **Ranh giới TRÁCH NHIỆM/SLA**: Pending là "sân của khách" (đang soạn đơn, gộp nhiều lần import CSV, sửa dòng lỗi — nhà máy KHÔNG nhìn thấy, không lọt vào thống kê). Processing là "sân của seller" — đơn đã được tiếp nhận, SLA sản xuất bắt đầu tính.
3. **Lên đơn theo lô**: khách import 500 dòng nhưng chỉ chọn (select) push từng đợt theo khả năng thanh toán/độ sẵn sàng design — phần chưa push phải có chỗ nằm chờ = Pending.
4. **Processing ≠ In Production vì chưa tốn vật tư**: giai đoạn Processing (soát tool/thiết kế) còn "cứu" được — thiếu file, sai địa chỉ → hold/bổ sung/hoàn tiền sạch sẽ. Vào In Production là đã in vật lý, không cho sửa/hủy tự do nữa.

### 1.1b Rework (In báo lỗi → designer/soát tool) nằm ở đâu?

Kiểm chứng code (`fulfillment-task.service.ts` reworkBack target=designer + `order.service.ts buildDesignerReworkBackFromError`): khi đơn ở In (print) báo lỗi đẩy về designer HOẶC soát tool, hệ thống **KHÔNG xóa** `currentFulfillmentStage` mà **reset về `print`** để chạy lại toàn chuỗi, chỉ set thêm `designerStatus='rework'` (soát tool: + `productionErrorSource='tool-check'`, `toolResultNote='error'`). → Đơn đã vào In thì `currentFulfillmentStage` luôn còn giá trị.

**Quyết định:** đơn rework = **vẫn In Production + badge "Đang sửa lỗi"** (cờ chồng orthogonal như Hold, KHÔNG tụt về Processing, KHÔNG là tab riêng). Trung thực với data + khớp tab In Production nội bộ + khớp hệ OnosPod cũ (gộp rework vào In Production). Ranh giới cứng: **Processing = chưa từng vào In; In Production = đã vào In ≥ 1 lần.**

### 1.2 Hold nằm ở đâu?

Hold **KHÔNG phải 1 nấc trong chuỗi tuyến tính** — nó là cờ chồng (orthogonal flag) lên đơn đang ở Processing hoặc In Production: đơn vẫn thuộc chặng đó nhưng đồng hồ dừng. Hệ nội bộ ĐÃ CÓ đầy đủ (`heldAt`/`holdReason`, guard chặn transition, Orders.md §9b) — chỉ cần:

- Portal hiển thị badge "On Hold" + lý do trên card/row đơn (map `holdReason` → text thân thiện).
- Khi `holdReason` = chờ design / chờ địa chỉ (`hold-reason.ts` sẵn có): hiện CTA "Bổ sung ngay" → tái dùng `updateOrder` (khách tự sửa designs/địa chỉ, đã có) → sau khi bổ sung, Support unhold theo luồng sẵn có (phase sau có thể auto-unhold khi đủ dữ liệu).
- Filter chip "On Hold" ở listing (không phải tab).

### 1.3 Hai luồng đơn CÙNG TỒN TẠI — KHÔNG bỏ `importOrders` cũ

Hiện tại đa số khách vẫn đặt đơn trên **hệ OnosPod cũ**, rồi đơn được **đồng bộ về hệ mới qua `importOrders()`** (import sheet/sync). Hệ mới bây giờ chỉ mở cho **1-2 khách test** tự lên đơn → push to production. Do đó:

- **Luồng A (đa số khách, giữ nguyên):** đơn đồng bộ từ hệ cũ → `importOrders()` → vào thẳng `OrderEntity` như hiện tại. KHÔNG qua staging, KHÔNG có trạng thái Pending (đơn hệ cũ đã "chốt" rồi). Backfill tạo staging row `pushedAt=createdAt` chỉ để **listing portal của khách đó** thấy đơn — không đổi hành vi sản xuất.
- **Luồng B (khách test hệ mới):** form/CSV → staging `customer_orders` (Pending) → select + push + pay → `importOrders()`.
- Cả 2 luồng hội tụ tại cùng `importOrders()` + cùng `OrderEntity`, nên Processing/In Production/Fulfilled derive giống nhau. Chỉ khác **điểm vào**: Luồng A vào ngay, Luồng B qua staging + payment gate.
- Không có công tắc bật/tắt riêng cho khách — khách nào tự lên đơn ở portal thì tự nhiên đi Luồng B; đơn sync từ hệ cũ đi Luồng A. Đơn của cùng 1 khách có thể có cả 2 nguồn, listing gộp chung.

## 2. Kiến trúc: staging collection `customer_orders` (quyết định quan trọng nhất)

**Vấn đề:** hiện tại `placeOrder()` gọi thẳng `importOrders()` → đơn vào sản xuất NGAY (set `inProductionAt`, soát tool, auto-gán designer, Telegram noti, lọt vào mọi dashboard/stats). Nếu thêm trạng thái `pending` vào `OrderEntity` thì PHẢI loại pending khỏi **hàng chục** điểm aggregation (buildVisibilityFilter, dashboard, designer stats, fulfillment, telegram aggregator...) — cùng loại rủi ro cross-cutting như cancelled/unmapped/US-factory đã ghi trong CLAUDE.md, rất dễ leak.

**Chọn:** collection staging riêng **`customer_orders`** (entity trong module `customer-portal`). Đơn Pending KHÔNG BAO GIỜ là `OrderEntity` → pipeline sản xuất + toàn bộ thống kê nội bộ giữ nguyên 100%, không sửa 1 filter nào.

```
customer_orders (1 document = 1 ĐƠN của khách — nhiều item, 1 địa chỉ ship chung; khớp mô hình template cũ)
├── customerId, userSku, userEmail        // match keys, denorm từ customer
├── orderKey                              // idempotency mức ĐƠN = normalize(order_id + '|' + identifier)
│                                         // unique (customerId, orderKey) partial index; form portal tự sinh
├── orderId, identifier?, orderName?      // giữ nguyên giá trị khách điền (hiển thị listing)
├── source: 'form' | 'csv' | 'api'
├── status: 'pending' | 'cancelled'      // CHỈ lưu trạng thái TRƯỚC push; sau push derive từ OrderEntity
├── shippingAddress                       // 1 địa chỉ CHUNG cho cả đơn (+ email, company — template cũ)
├── items[]                               // MỖI PHẦN TỬ = 1 dòng CSV = 1 đơn sản xuất tương lai
│   ├── sku, merchantSku?                 // sku BẮT BUỘC match variations[].sku (§13.1)
│   ├── productConfigId, type, size, color  // resolve từ SKU lúc import (SKU là nguồn chân lý)
│   ├── quantity, shipMethod, activeService?
│   ├── mockupUrl?, designs               // designs = MỌI cột design_* (map printArea[].key)
│   ├── tracking?: { number?, carrier?, url?, labelUrl? }   // lưu-hiển-thị, CHƯA nối SX (§13.3)
│   ├── priceSnapshot?: { shipMethod, unitPrice, discountedPrice?, promotionName?, lineTotal }
│   │                                     // tính lúc tạo (tham khảo), CHỐT LẠI + đóng băng lúc push
│   └── productionId?                     // set lúc push — link sang OrderEntity (mỗi item 1 productionId)
├── pushedAt?                             // push theo NGUYÊN ĐƠN (mọi item cùng lúc)
├── paymentId?                            // link customer_payments (1 payment cover cả đơn)
├── note?
└── cancelledAt?, cancelReason?
```

- **`customer_orders` là bảng chính của listing portal**: mọi đơn khách (form/CSV/API) đều tạo staging doc; đơn đã push thì `$lookup` sang `orders` theo `items[].productionId` để derive trạng thái (§1) — derive at read-time, không dual-write, không drift. **Trạng thái mức ĐƠN = item "chậm nhất"** (least-advanced trong chuỗi Processing → In Production → Fulfilled → Completed); trang chi tiết đơn hiển thị tiến trình từng item.
- **Push nguyên đơn, nổ ra N đơn sản xuất**: hệ nội bộ giữ nguyên bất biến 1 `OrderEntity` = 1 item — lúc push, mỗi phần tử `items[]` thành 1 row `importOrders()` với `productionId` riêng, cùng `shippingAddress` của đơn (`ImportProductionOrderRow.shippingAddress` sẵn có). KHÔNG cho push lẻ từng item trong 1 đơn.
- Form portal (`placeOrder` hiện tại đã là `items[] + 1 shippingAddress`) map thẳng 1-1 vào staging doc — `orderKey` tự sinh (`form-<objectId>`).
- **Backfill 1 lần** (`onModuleInit`, pattern backfill sẵn có): đơn khách cũ trong `orders` (match `userSku`+`userEmail` với bảng `customers`) → tạo staging row `pushedAt=createdAt`, coi như đã push + payment `waived` — listing không mất đơn cũ, không double-count.
- `updateOrder` chia 2 nhánh: row pending → sửa TỰ DO cả type/color/size/quantity/địa chỉ (chưa chốt gì); row đã push → giữ logic hiện tại (chỉ mockup/designs/address, chặn theo chặng).
- `placeOrder` (form) đổi thành: tạo staging rows `pending` (KHÔNG gọi `importOrders` nữa) — khách thấy đơn ở tab Pending rồi tự push.

## 3. Payment gate — "pay rồi mới push to production"

Cổng thanh toán nằm ở cạnh **Pending → Processing**, thiết kế pluggable để phase topup/ví cắm vào sau mà không đổi state machine:

```
Khách tick chọn ĐƠN Pending (nguyên đơn, không lẻ item) → bấm "Push to production"
  1. Validate từng đơn (mọi item: SKU còn match variations, quantity, địa chỉ đủ field)
  2. CHỐT GIÁ từng item (đóng băng items[].priceSnapshot) → tổng tiền theo đơn
  3. Tạo customer_payments record:
     { customerId, orderIds[], amount, status: 'awaiting'|'paid'|'waived'|'cancelled',
       method: 'manual'|'wallet'(phase 2), confirmedBy?, confirmedAt?, refunds[] }
  4a. Công tắc paymentGateEnabled = OFF (system_configs) → status='waived', push NGAY
  4b. Công tắc ON  → đơn bị KHÓA sửa (vẫn tab Pending + badge "Chờ thanh toán");
      phase 1: Admin xác nhận đã nhận tiền (trang /adm) → 'paid' → push
      phase 2: trừ ví trong transaction ngay lúc bấm → 'paid' → push (chỉ thêm method, không đổi flow)
  5. Push thực thi (trong transaction): generateUniqueProductionId cho TỪNG ITEM
     → bridge items[] → orderService.importOrders() (mỗi item 1 đơn sản xuất,
       shippingAddress CHUNG của đơn gắn vào từng row)
     → ghi items[].productionId + pushedAt vào staging doc
     → từ đây trạng thái derive từ OrderEntity (Processing → ...)
```

- `customer_payments` là **ledger ngay từ phase 1** (kể cả khi gate off — ghi `waived` + amount để đối soát/thống kê doanh thu). Topup sau này chỉ thêm nguồn tiền, không phải đập lại.
- **Refund**: đơn đã thanh toán bị hủy (Admin hủy ở Processing) → tạo refund record trong payment (phase 1: Admin đánh dấu đã hoàn; phase 2: cộng lại ví). Tab Refunded đếm từ đây.
- Giá chốt = giá catalog theo tier + Promotion đang active (tái dùng `promotionMatches`/`applyPromotionDiscount` như customer-catalog.service) + shipping method của đơn — đây chính là "bước 2 chốt giá" đã bàn, làm luôn trong phase này.

## 4. Luồng tổng thể

```
FE form portal ──┐
FE CSV import  ──┼─► customer_orders (Pending, sửa/hủy tự do)
Open API       ──┘         │
                    [select + Push] ─► chốt giá ─► customer_payments ─► PAID/WAIVED
                           │
                           ▼
              orderService.importOrders()  (pipeline sẵn có: map config, ép xưởng
                           │                theo khách, auto-gán designer, Telegram)
                           ▼
     Processing ─► In Production ─► Fulfilled ─► Completed
     (soát tool,    (6 chặng          (đóng hàng    (auto sau N ngày)
      thiết kế)      fulfillment)      xong)
         │  ▲________ On Hold badge (heldAt) ________▲  │
         └─► Cancelled (Admin) ─► Refunded (đã thanh toán)
```

## 5. Hiện trạng tái dùng nguyên vẹn (từ plan v1, vẫn đúng)

| Mảnh | Vị trí | Vai trò |
| --- | --- | --- |
| Pipeline tạo đơn `importOrders()` | `apps/api/src/modules/order/order.service.ts` | Điểm vào DUY NHẤT lúc push |
| Auth khách + phân luồng token | `jwt.strategy.ts` branch Customer + `apps/web/src/apis/index.tsx` | Giữ nguyên |
| Tracking + computeCurrentStage | `customer-order.service.ts` (mirror `getLifecycleTrack`) | Tái dùng cho derive In Production/Fulfilled |
| Hold engine | `holdOrder/unholdOrder/assertNotHeld` + `hold-reason.ts` | Nguồn badge On Hold |
| Parse CSV/XLSX client-side | `apps/web/src/pages/orders/ImportOrderTab.tsx` (lib `xlsx`) | Copy pattern cho trang import khách |
| Idempotency | `externalRef` trên staging (thay vì `OrderEntity.externalId`) | Chống trùng khi khách retry |
| Promotion pricing | `promotionMatches`/`applyPromotionDiscount` | Chốt giá lúc push |
| Swagger | đã bật | Docs Public API |

## 6. CSV import — GIỮ NGUYÊN template OnosPod cũ (v3, thay toàn bộ format v1/v2)

> **Quyết định v3:** KHÔNG phát minh format mới. File import = đúng template fulfill hệ cũ (`Data/onos-fulfill-template.xlsx - Tiếng Việt.csv`) — khách hệ cũ không phải học lại gì. File mẫu tải về = chính template này.

### 6.1 Header template cũ (36 cột) → map staging

```
order_id, identifier, order_name, item, quantity, color, size, shipping, active_service,
sku, merchant_sku, telephone, email, name, country, state, city, address_1, address_2,
company, postcode, design_back, design_front, design_sleeve, design_hood, design_placket,
design_sleeve_left, design_sleeve_right, design_chest_left, design_chest_right,
mockup, note, tracking_number, tracking_carrier, tracking_url, shipping_label
```

| Nhóm cột | Map | Ghi chú |
| --- | --- | --- |
| `order_id` + `identifier` | `orderKey` (idempotency mức ĐƠN) + lưu raw | **Nhiều dòng cùng cặp này trong 1 file = 1 đơn nhiều item.** Khác identifier = đơn khác (rule hệ cũ). |
| `order_name`, `note` | `orderName`, `note` | Mức đơn. |
| `item` | Chỉ hiển thị tham khảo | KHÔNG dùng để match — SKU là nguồn chân lý (§13.1). |
| `sku` | `items[].sku` → resolve `productConfigId`/`type`/`size`/`color` từ `variations[].sku` (uppercase+trim) | **BẮT BUỘC match**, không match → dòng lỗi. `size`/`color` trong file chỉ đối chiếu: lệch với variation → warning trên preview, lưu theo variation. |
| `quantity`, `merchant_sku` | `items[].quantity`, `items[].merchantSku` | |
| `shipping` | `items[].shipMethod` | Enum đủ 4: `cod \| express_us \| economy_us \| tiktok`; parse case-insensitive, `SBTT`→`tiktok`; trống → default `express_us` (§12.4). |
| `active_service` | `items[].activeService` (boolean) | Chỉ ý nghĩa với express_us; lưu-hiển-thị, chưa nối SX. |
| `name, telephone, email, country, state, city, address_1, address_2, company, postcode` | `shippingAddress` mức ĐƠN (map `name`→firstName, `telephone`→phone, `postcode`→zip; + `email`/`company` thêm vào schema address staging) | Nhiều dòng cùng đơn mà địa chỉ lệch nhau → lấy dòng ĐẦU + warning. `postcode` đọc dạng string (giữ số 0 đầu). |
| `design_*` (9 cột) | `items[].designs` — parse **ĐỘNG mọi cột prefix `design_`**, key khớp `printArea[].key` | Không hardcode danh sách cột; cột có giá trị nhưng không thuộc printArea của sản phẩm → warning. |
| `mockup` | `items[].mockupUrl` | |
| `tracking_number/carrier/url`, `shipping_label` | `items[].tracking{number,carrier,url,labelUrl}` | Lưu staging + hiển thị chi tiết đơn; CHƯA truyền vào sản xuất (§13.3, Phase 2 nối khâu đóng hàng). |

### 6.2 Parser phải chịu được data thật (đã kiểm chứng trên file mẫu)

- **Trim header** (template thật có `order_id `, `quantity `, `country `, `address_1 ` thừa khoảng trắng), match không phân biệt hoa thường.
- **Cắt ở dòng trống đầu tiên**: template thật có block hướng dẫn (UPDATED/NOTE/mô tả cột) ở cuối file sau 2 dòng trống — mọi thứ từ dòng trống hoàn toàn đầu tiên trở xuống bị bỏ qua, không sinh lỗi ảo.
- Normalize `size` (`Xl`→`XL`...), `postcode`/`telephone` ép string, bỏ qua êm cột lạ ngoài 36 cột.

### 6.3 Luồng import

- Trang mới `/customer/orders/import`: upload `.csv/.xlsx/.xls` (lib `xlsx`, copy pattern `ImportOrderTab.tsx`), parse tại browser → **group theo `(order_id, identifier)` ngay ở preview**: bảng preview hiển thị theo ĐƠN (expand items), validate từng dòng (SKU không match / quantity sai / thiếu name/phone/address_1/city/country/postcode → tô đỏ kèm lý do), warning màu vàng (size lệch variation, địa chỉ lệch trong cùng đơn, design key lạ). Đơn có ≥1 dòng lỗi → **cả đơn không import được** (tránh đơn thiếu item); cho phép "bỏ qua các đơn lỗi" import phần còn lại. Nút tải file mẫu (template tĩnh `apps/web/public/`).
- `POST /customer/orders/import` (JWT Customer) nhận `orders[]` ĐÃ group (mỗi phần tử = orderKey + shippingAddress + items[]), cap ~500 dòng/lần → validate lại server-side (SKU match, unique orderKey) → tạo staging docs `pending`. Response kết quả từng ĐƠN `{ orderKey, status: 'created' | 'duplicated' | 'failed', error?, itemErrors? }`.
- **Idempotency (§13.4):** `(customerId, orderKey)` đã tồn tại (kể cả pending) → skip CẢ ĐƠN, báo `duplicated`. Khách muốn sửa → sửa/xóa trên portal rồi import lại.
- Giá tham khảo từng item tính ngay lúc import (theo variation + tier + Promotion, ghi chú "giá chốt khi push").

## 7. API key cho khách (Mảnh 2 — ⛔ HOÃN sang PHASE 2, chưa làm đợt này)

> Theo chỉ đạo: đợt này CHỈ làm CSV/XLSX. Toàn bộ §7 + §8 (API key + Public Order API) để lại Phase 2, ghi ở đây cho định hướng, KHÔNG code trong đợt này.



- `CustomerEntity.apiKeys[]: { label, prefix, hash(sha256), createdAt, lastUsedAt?, revokedAt? }` — key plain `onos_live_<32hex>` hiển thị đúng 1 lần.
- `ApiKeyGuard` (`apps/api/src/guards/api-key.guard.ts`): header `x-api-key` → sha256 → tìm customer (index `apiKeys.hash`) → gắn role ảo `RoleType.Customer`. Cập nhật `lastUsedAt` async.
- UI portal `/customer/settings/api`: tạo/list/thu hồi key. Rate limit `@nestjs/throttler` theo key.

## 8. Public Order API (Mảnh 3 — ⛔ HOÃN sang PHASE 2, chưa làm đợt này)

Module `apps/api/src/modules/customer-open-api/`, tất cả qua `ApiKeyGuard`:

| Method | Path | Mô tả |
| --- | --- | --- |
| POST | `/open-api/v1/orders` | Tạo đơn Pending (rows[], max 100/call). Idempotent theo `externalRef`. |
| POST | `/open-api/v1/orders/push` | (MỚI so v1) Push theo externalRefs/ids — cùng cổng thanh toán §3. |
| GET | `/open-api/v1/orders/:ref` | Tra trạng thái theo `externalRef` hoặc `productionId` — trả status §1 + timeline. |
| GET | `/open-api/v1/orders` | List đơn của customer sở hữu key, filter theo status/ngày. |

## 9. UI portal `/customer/orders` (redesign)

- Thanh tab như hệ cũ: All / Pending / Processing / In Production / Fulfilled / Completed / Refunded / Cancelled + count badge từng tab (endpoint counts riêng: 1 count staging pending/cancelled + 1 aggregation `$switch` trên orders đã push).
- Listing theo ĐƠN (row = 1 staging doc, hiện `orderId`/`orderName` + số item + tổng quantity); đơn nhiều item expand xem từng item — trạng thái mức đơn = item chậm nhất (§2), chi tiết hiện tiến trình từng item.
- Tab Pending: checkbox chọn nhiều ĐƠN + nút **"Push to production"** → dialog xác nhận hiện bảng giá chốt từng item + tổng tiền theo đơn → (gate on) hướng dẫn thanh toán / (gate off) push luôn. Nút sửa/xóa từng đơn (push nguyên đơn, không lẻ item).
- Badge "On Hold" + lý do + CTA bổ sung design/địa chỉ trên đơn held.
- Đơn Pending hiện giá tham khảo (snapshot lúc tạo, ghi chú "giá chốt khi push").

## 10. Danh sách file dự kiến

### Shared

| File | Việc |
| --- | --- |
| `packages/shared/enums/customer-order-status.ts` | MỚI — enum 8 status + labels |
| `packages/shared/dtos/customer-order.dto.ts` | MỚI — StagingRow/Import/Push/Counts/Payment DTOs (kết quả từng dòng, priceSnapshot) |
| `packages/shared/dtos/customer.dto.ts` | SỬA — ApiKey DTOs |
| `packages/shared/dtos/production-order.dto.ts` | SỬA — deprecate PlaceCustomerOrder trả thẳng OrderEntity (đổi sang staging) |

### Backend

| File | Việc |
| --- | --- |
| `apps/api/src/modules/customer-portal/customer-order.entity.ts` | MỚI — staging `customer_orders` + indexes |
| `apps/api/src/modules/customer-portal/customer-payment.entity.ts` | MỚI — ledger `customer_payments` |
| `apps/api/src/modules/customer-portal/customer-order.service.ts` | SỬA LỚN — placeOrder→staging, listOrders/counts derive, importRows, push+pay, cancel/refund, backfill onModuleInit |
| `apps/api/src/modules/customer-portal/customer-order.controller.ts` | SỬA — endpoints import/push/cancel/counts |
| `apps/api/src/modules/customer-portal/customer-payment.controller.ts` (hoặc gộp) | MỚI — Admin confirm payment/refund (`@Auth([Admin])`) |
| `apps/api/src/guards/api-key.guard.ts` | MỚI |
| `apps/api/src/modules/customer/customer.{entity,service}.ts` | SỬA — apiKeys[] |
| `apps/api/src/modules/customer-open-api/…{module,controller,service}.ts` | MỚI |
| `apps/api/src/app.module.ts` | SỬA — module mới + Throttler |

### Frontend

| File | Việc |
| --- | --- |
| `apps/web/src/pages/customer/orders/index.tsx` | SỬA LỚN — tab bar 8 status + counts + select/push + badge hold |
| `apps/web/src/pages/customer/orders/import.tsx` | MỚI — CSV upload/preview/kết quả |
| `apps/web/src/pages/customer/settings/api.tsx` | MỚI — API keys |
| `apps/web/src/components/customer/PushToProductionDialog.tsx` | MỚI — bảng giá chốt + tổng + confirm |
| `apps/web/public/customer-order-template.xlsx` (+ `.csv`) | MỚI — COPY nguyên template OnosPod cũ (`Data/onos-fulfill-template.xlsx`), KHÔNG tự chế format |
| `apps/web/src/services/customerPortal.ts` | SỬA |
| `apps/web/src/layouts/customerLayout/CustomerLayout.tsx` + router | SỬA — menu |
| (Admin) trang xác nhận thanh toán trong `/adm` | MỚI (phase 1 gate on) hoặc HOÃN (gate off) |
| i18n `customerPortal` vi+en | SỬA |

### Docs

- MỚI `documents/FunctionDescription/CustomerOrderIntake.md` (status model + CSV + open-api + payment) hoặc mở rộng `CustomerPortal.md`; SỬA `CLAUDE.md` mapping.

## 11. Thứ tự thực thi (ĐỢT NÀY — CSV/XLSX, KHÔNG làm API)

1. Shared: enum status (+ nhãn) + staging/payment/push/counts DTOs (KHÔNG apiKey/open-api DTOs).
2. BE: entity `customer_orders` + `customer_payments`; refactor `placeOrder` → staging; backfill đơn khách cũ (Luồng A) thành staging `pushedAt` + payment `waived`.
3. BE: listOrders/counts derive 8 status (+ badge Hold/Rework) + cancel pending.
4. BE: push + chốt giá (Promotion theo tier) + payment (gate qua system_configs, method manual/waived).
5. FE: redesign `/customer/orders` (tab bar 8 status + counts + select + PushToProductionDialog + badge Hold/Rework).
6. BE+FE: **CSV/XLSX import theo template cũ** (§6 v3: parse 36 cột + group `(order_id, identifier)` + resolve SKU→variation + `POST /customer/orders/import` + trang `/customer/orders/import` preview theo đơn/validate/kết quả + file mẫu = template cũ).
7. FE: Admin confirm payment (chỉ khi gate = ON; gate OFF thì bỏ qua đợt này).
8. Docs + CLAUDE.md.
9. Verify: tsc/eslint/prettier cả 3 package; test tay local: form→pending→push (gate off & on)→đơn hiện Processing→giả lập chạy fulfillment→In Production→giả lập rework (badge)→Fulfilled; CSV test = chính file mẫu `Data/onos-fulfill-template.xlsx - Tiếng Việt.csv` (có sẵn 2 đơn nhiều dòng `70634`/`70638` để test group, block hướng dẫn cuối file để test cắt footer) + thêm dòng lỗi chủ đích (SKU không tồn tại, thiếu address_1); import lại lần 2 toàn bộ phải ra `duplicated`; xác nhận đơn Pending KHÔNG xuất hiện ở BẤT KỲ trang/thống kê nội bộ nào (dashboard, designer, fulfillment, telegram); xác nhận đơn Luồng A (sync hệ cũ) vẫn chạy nguyên vẹn.

> **PHASE 2 (sau, không làm bây giờ):** §7 API key + §8 Public Order API + webhook.

## 12. Quyết định đã chốt (2026-08-07)

1. **Payment gate = OFF** đợt này. Push tự do, KHÔNG chờ xác nhận tiền. Ledger `customer_payments` VẪN ghi mỗi lần push 1 record `status='waived'` + `amount` (giá chốt) để đối soát doanh thu + sẵn sàng nối topup Phase 2. → KHÔNG làm trang Admin confirm payment đợt này (bỏ bước §11.7).
2. **Rework = In Production + badge "Đang sửa lỗi"** (§1.1b) — KHÔNG tụt về Processing.
3. **Completed = Fulfilled + 14 ngày**, lưu số ngày trong `system_configs` (đổi được, không hardcode).
4. **Ship method mặc định = `express_us`** khi khách bỏ trống → giá chốt = `retailPrice` (đã áp Promotion theo tier). Khách vẫn chọn `cod`/`tiktok` từng đơn.
5. **Backfill Luồng A** (đơn khách cũ / sync hệ cũ): tạo staging row `pushedAt=createdAt` + payment record `waived` — listing portal thấy đơn cũ, không double-count, không đổi hành vi sản xuất.

> API key + Public API + webhook: HOÃN Phase 2, KHÔNG làm đợt này.

## 13. Quyết định v3 đã chốt (2026-08-07) — CSV giữ nguyên template cũ

1. **SKU bắt buộc đúng** (như hệ cũ): `sku` phải match `variations[].sku` (uppercase+trim) → resolve `productConfigId`/type/size/color từ variation. Không match → dòng lỗi, KHÔNG tạo pending, KHÔNG fallback theo tên `item`. `size`/`color` trong file lệch variation → chỉ warning, lưu theo variation.
2. **Shipping giữ đủ 4 giá trị hệ cũ**: enum `cod | express_us | economy_us | tiktok` (`SBTT` alias `tiktok` khi parse); trống → `express_us` (§12.4). Giá chốt theo ship method gom về 1 hàm `resolveUnitPrice(variation, tier, shipMethod)` — đề xuất: `cod`/`tiktok` (không dùng ship US) → `nonShipCost` fallback `retailPrice`; `express_us`/`economy_us` → `retailPrice`; confirm số cụ thể khi làm bước giá (§11.4).
3. **Tracking/label khách cấp**: parse + lưu `items[].tracking` ở staging, hiển thị chi tiết đơn portal. CHƯA thêm field vào `OrderEntity`, CHƯA truyền qua `importOrders` — Phase 2 nối vào khâu đóng hàng.
4. **Idempotency mức ĐƠN, skip-toàn-bộ**: `(customerId, orderKey)` với `orderKey = normalize(order_id + '|' + identifier)`. Đơn đã tồn tại (kể cả pending) → mọi dòng của đơn báo `duplicated`, bỏ qua. Sửa đơn = sửa/xóa trên portal rồi import lại.
5. **Nhiều dòng cùng `(order_id, identifier)` = 1 đơn nhiều item** (rule hệ cũ): staging `customer_orders` đổi thành 1 document/đơn + `items[]` (§2); push nguyên đơn → mỗi item 1 `OrderEntity` + `productionId` riêng, địa chỉ chung; trạng thái mức đơn = item chậm nhất; đơn có ≥1 dòng lỗi → cả đơn không import.

---

> Chốt §12 + §13 xong và có lệnh "implement" thì code theo thứ tự §11 (với §6 là bản v3 — template cũ).
