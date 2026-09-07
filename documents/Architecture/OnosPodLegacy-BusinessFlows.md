# Hệ cũ OnosPod (`app.onospod.com`) — Nghiệp vụ, dữ liệu và khoảng trống so với hệ mới

> **Mục đích:** tài liệu tham chiếu cho giai đoạn chuyển đổi toàn bộ vận hành từ OnosPod (mất source code) sang OnosFactory. Viết từ lượt khảo sát **chỉ đọc** ngày 07/09/2026 bằng tài khoản super admin: đi hết mọi màn hình, bắt các lệnh GraphQL giao diện gửi, đọc mã JS đã build để liệt kê lệnh ghi, và truy vấn API để lấy số liệu thật. **Không bấm bất kỳ nút nào gây ghi dữ liệu.**
>
> **Độ tin cậy:** phần "Nắm chắc" có số liệu/log chứng minh; phần "Suy ra" ghi rõ; phần "Chưa rõ" liệt kê ở §14 để người vận hành xác nhận.
>
> **Liên quan:** hệ mới đọc dữ liệu OnosPod ở `apps/api/src/modules/order/onospod-order-lookup.service.ts` (tra đơn), `onospod-import.service.ts` (kéo production `PaginateMrpProduct`), `apps/api/src/modules/product-config/onospod-product-import.service.ts` (kéo sản phẩm). **Hệ mới KHÔNG ghi gì ngược về OnosPod.**

---

## 1. Kiến trúc kỹ thuật (nắm chắc)

- SPA React (CRA, 99 file JS build) tại `app.onospod.com`; API GraphQL duy nhất `POST https://api.onospod.com/graphql`. Introspection **tắt** (Apollo Server production).
- Xác thực: header `Authorization: Bearer <JWT>` (JWT HS256 chứa email + mật khẩu — **rất yếu**, ai có token là có mật khẩu) + `x-onos-super-token` cho quyền admin + `Origin/Referer` phải là `app.onospod.com` (thiếu → 403). Phân trang qua header `x-page`/`x-per-page`, tổng ở `x-total`.
- Mọi lệnh đều là **query/mutation ẩn danh** dựng bằng chuỗi (`"mutation {" + name + args`), không có `operationName`, nên log phía server không phân biệt được người gọi theo tên lệnh.
- Lưu trữ file: CDN `cdn.onospod.com` (barcode PDF, invoice xlsx, ảnh sản phẩm), `podorder.sgp1.digitaloceanspaces.com` (mockup), `poddesign.sgp1.cdn.digitaloceanspaces.com` (design), label ở `cdn.onosexpress.com`. Cấu hình S3 ở màn Storage.
- Thông báo: Telegram bot "Onos Manufacturer Bot" (nhóm `-599424200`) với 5 action bật: `tracking_update` (mention @NyanMew, nhóm ONOS-PODGEEK-Fulfill), `remind_every_day` 06:00 và 13:00, `new_production_request`, `package_done_request`, `production_error`. Cấu hình máy in: tem barcode 6×4.
- Có API token cho seller (màn "API Token"), log gọi API (`token-access-logs`), chặn IP (`block-logs`), tickets (trống), extensions (tải Chrome extension), system notifications (18 trang thông báo cho seller, tiếng Việt).

## 2. Quy mô (30 ngày tính đến 07/09/2026)

| Chỉ số | Số |
|---|---|
| Đơn tạo mới | 18.615 (processing 112 · in production 1.114 · fulfilled 4.459 · completed 12.362 · pending 77 · cancelled 475) |
| Đơn theo xưởng | Mê Linh 8.393 · Thái Nguyên 9.892 |
| Vận đơn | 14.820 (in transit 1.571 · delivered 9.309 · exception 7) |
| Production (item) qua MRP | Mê Linh 9.529 · Thái Nguyên 11.122 · Thái Nguyên Decor 29 · Grabink 0 · 2D US 0 |
| Kiện quét xong | Mê Linh 9.003 · Thái Nguyên 10.290 |
| Lô sản xuất | Mê Linh 66 · Thái Nguyên 63 |
| Chuyển trạng thái MRP 7 ngày | In Sewing→Packing 4.427 · Ready→In Sewing 258 · Ready→Ready 574 · On Hold→Packing 55 |
| Giao dịch ví seller (mẫu 800 gần nhất, 7 ngày) | payment 424 ($5.353) · import_tax 296 ($145) · active 76 ($53) · topup 4 ($2.569) |
| Giao dịch sản xuất (mẫu 600, 7 ngày) | 100% `payment` "Payment production <mã item>", mức 3,3–11,49 $/item |
| Người dùng | 2.761 (active 2.680 · banned 77); mẫu 600 mới nhất: 100% seller nhóm `sale+tiktok`, VIP 3 chiếm 98%, payment_type credit 62% |
| Sản phẩm | 3D 146+ · 2D 12 · Thêu 11 · Gỗ 16 · Grabink 12 · Dropship 11 (theo tab) |
| Tài khoản vận chuyển (logistics) | 125: SBTT 54 · ONOSEXPRESS 38 · SHIPEXPRESS 32 · GHTK 1; active 62 |
| Hóa đơn seller | 5.586 (pending 2.367 · paid 3.215); hóa đơn sản xuất 272 trang |

Kết luận: hệ cũ **đang là hệ vận hành thật**, không phải "chạy cho có". Xưởng Mê Linh và Thái Nguyên quét MRP cũ hằng ngày (tài khoản chung theo vai: `printer@email.com`, `packager@email.com`), tạo lô hằng ngày, và mọi tiền nong đều chốt ở đây.

## 3. Thực thể và trường quan trọng

### 3.1 User (seller / nhân viên)
Trường đáng chú ý: `identity`/`identity_label` (mã seller, ví dụ TIENHC — khớp `userSku` hệ mới), `groups[]` (vai), `vip` 0..5, `partner_vip`, `payment_type` credit|debit + `debit_limit`, `total_credit` (số dư, âm = nợ), `ship_by_seller`/`ship_by_onos`, `default_shipping_method`, `enable_non_ship`, `addition_base_cost`, `addition_shipping_service_price`, `is_international`, `active_tracking_day`/`day_update_tracking`, `process_without_design`, `disable_design_production`, `enable_check_dimension`, `hold_off`, `current_affiliate_id`, `sale_plan`.

Vai (`usergroups`, 18 nhóm): `[Super Admin] super_root`, `[Admin] root`, `[Fulfiller]`, `[Cutter] cut_group`, `[Printer] print_group`, `[Sewer] sew_group`, `[Packager] package_group`, `[Accounting]`, `[Order QC]`, `[Supporter]`, `[Designer]`, `[Seller] sale`, `[Tiktok]`, `[SUPER 0] production_member`, `[SUPER 1 - P] partner`, `[PARTNER VIP]`, `partner_sale`, CUSTOMER ROLE. Ma trận quyền theo module `view/add/update/delete` (trả về rỗng với super admin trong khảo sát).

### 3.2 Order
`identity` (mã đơn `XX-#####-#####`, cùng dạng mã hệ mới), `platform_id`/`alias_id` (mã bên sàn / merchant), `custom_id`, `status`, `auth` (seller), `manufacture_id`, `line_items[]` (mỗi item: sku biến thể, `print.meta_data` gồm Base_cost/Sale_cost/weight/package_*, design theo vị trí `front/back/sleeve/hood/chest_left/...`, `print_areas`, `production_id`, `productions[]`), `shipping` (địa chỉ, `is_national` + `national{}` cho nội địa), `shipping_method` (ONOSEXPRESS/SBTT/…), `tracking{tracking, carrier, url, shipping_label.url, shipment{status, detail[]}}`, tiền: `subtotal`, `shipping_price`, `shipping_addition_price`, `total_tax`, `total`, `base`, `discount_vip_total`, `total_refund`, `total_paid`; mốc: `created_at`, `paid_at`, `inproduction_at`, `completed_at`, `delivered_at`, `production_business_day`, `delivered_business_day`; cờ: `is_priority`, `is_test`, `ship_by_seller`, `keep_in_stock`, `defer_tracking`; `transactions[]`, `order_issues`, `queues`, `replacement`/`return` (RAR), `cancel_reason`/`reject_reason`.

### 3.3 Production (MRP product) — 1 item = 1 production
`increment_id` (mã sản xuất `XX-#####-#####`, chính là `productionId` hệ mới), `barcode` `N-<mã>` (+ PDF), `mrp_status`, `batch_id`, `manufacture_id`, `assign_to_user_id`, `print_method`, `print_size`, `price` (base), thiết kế theo vị trí, `package_completed`, `is_priority`, `note`, lỗi báo qua `reportMrpError`, QC note.

### 3.4 Batch (lô sản xuất), Package (kiện), Shipment
- **Batch** (`mrpBatchProducts`): `increment_id` dạng `BA-2609-227`, `name` ("7-9 thai nguyen"), `barcode`, `status` Producting|On Hold|Cancelled|Completed|Ready|Error|Reproduction, `assign_to_user`, `product_type`; tiến độ đếm theo 4 công đoạn cắt/in/may/đóng (ví dụ lô 76 món: 0/49/76). Tạo bằng `makeMrpBatchProduct(product_ids, params)`; in barcode lô; xuất danh sách.
- **Package** (`mrpProductPackages`): `increment_id`, `order_increment_id`, `productions[]`, `shipping_method`, `weight/width/height/length`, `real_weight`, `shipping_cost`, `real_shipping_cost`, `base_cost`, `surcharge`, `status`, `packaged_at`, `pickup_at`, `delivered_at`, `confirmed`, `print_time`, `logistics{status, delivery, detail}`. Counter phân theo hãng: MULSTRAN, ONOSEXPRESS, NETSHIP, HPW, SHOPEE, GHTK, COD, NONSHIP và theo trạng thái tracking.
- **Shipment** (`shipmentOrders`/`shipmentEvents`): trạng thái Processing → Picked Up → Processed → In Transit → Out For Delivery → Delivery Attempt → Delivered | Failed | Exception | Other. `maskAsDelivered` chốt tay.

### 3.5 Logistics (tài khoản vận chuyển của seller)
Mỗi seller có thể có nhiều: `provider` SBTT (Ship By TikTok — seller tự cấp label TikTok), ONOSEXPRESS (dịch vụ gom của Onos), SHIPEXPRESS/"Express US" (label USPS qua đối tác, file label ở `cdn.onosexpress.com`), GHTK (nội địa). Cờ `is_international`, `is_global`, `is_replacement`, `is_test`, `is_freeship`, địa chỉ hoàn (`return_*`), `addition_price`, `origin_country`, `config{user,password,token,api_url}`. 125 tài khoản, 62 đang kết nối.

### 3.6 Tiền
- **Transaction (ví seller)**: `type` payment | import_tax | active | topup | refund, `status` Paid|Pending|Error|Cancelled, `payment_method` (topup qua **PingPong**), `referent` (đơn), `balance`, `invoice_id`.
- **ProductionTransaction**: `type` payment, "Payment production <mã item>", số tiền = **base cost** của item, sinh khi kiện quét xong.
- **Invoice** (seller, kỳ 10 ngày: 01–10, 11–21, 22–cuối tháng): `amount`, `total_product_cost`, `total_estimate_ship_cost`, `total_actual_ship_cost` (kèm nút "Retry fetch ship cost" — phí ship thật lấy về sau), file xlsx trên CDN, trạng thái Pending|Paid|Cancelled. Có cả **Production Invoice** riêng (272 trang) — suy ra là đối soát với xưởng.
- **Affiliate**: nhóm giới thiệu, hoa hồng `profit_per_unit` theo phương thức COD / ONOSEXPRESS / SBTT (mặc định 0,3 $/đơn vị).

### 3.7 Product preset (sản phẩm) và biến thể
Cấp sản phẩm: `sku` (ONOS-GTS500DTF), `identity` (OY-75084), `provider` Private|Grabink|Gearment…, `collection` (3D/2D/Embroidery/Handmade Wood…), `print_method` (DTF/…), `manufacture_id` (xưởng mặc định), `category`, `type` Custom, `fix_profit`, `min_price/max_price`, `side_additional_cost` (3 $), `position_additional_cost` (2 $), `shipping_additional_cost`, `print_areas[]` (mỗi vị trí có `addition_price`/`addition_base_price`/`is_required`/`is_embroidery`), `tax_groups` (US: Duty 25% + US Import Tax 16–20% theo SKU), `visible`, `skip_design_check`, `skip_affiliate`, `unit_discounts`, `monopolist_users` (giới hạn seller), `linked_products`, size chart, print template (Drive), `specifics` cho eBay.
Cấp biến thể (`attribute_specifics[]`): `sku`, `base_price` (giá vốn/giá tính cho xưởng — 4,64), `sale_price` (giá niêm yết 14,79), `nonship_price` (5,04), `tiktok_final_price` (5,64), `wholesale_price`, `gb_price` (13,95), `ship_price`, `standard_price`, `fix_profit` (1,8), `weight` (g), `package_*` (cm), `in_stock`, `shipping_methods[]{amount,cost}`.

### 3.8 Danh mục lỗi và barcode thao tác
31 mã lỗi MRP: `1001–1011` cắt (mũ, tay trái/phải, thân trước/sau, bo tay, túi ngực, gấu, khóa), `2001–2011` in (+ `2011` lỗi design), `3001+` may. Trang "Call To Action" in barcode: 3 mã hệ thống `O-N-O-S-01..03` (thao tác chung, suy ra là "bước tiếp theo/hoàn thành/giữ") và barcode lỗi theo vai cutting/printer/sewer — công nhân quét mã lỗi tại trạm, giống `StageErrorCatalog` hệ mới.

## 4. Vòng đời đơn (nắm chắc — từ `orderSteps` của đơn thật)

| # | Bước (`step`) | Ai | Việc gì |
|---|---|---|---|
| 1 | `create_order` | seller (API "Order created via API request" hoặc tay "Order created manual", CSV) | Đơn `Pending`, chưa trừ tiền |
| 2 | `update_order` | seller | Sửa design/địa chỉ/phương thức ship (log từng thay đổi) |
| 3 | `submitted_to_processing` | seller | Gửi xử lý |
| 4 | `save_items` | hệ thống | Lưu mockup + design, tạo production, gán xưởng (`setOrderManufacture`, mặc định theo `manufacture_id` của sản phẩm) |
| 5 | `process_shipment` | hệ thống | **Mua label NGAY LÚC NÀY** (trước sản xuất): "Shipment processed. Tracking number …", label PDF, tracking USPS "PRE TRANSIT" |
| 6 | `process_order` | hệ thống | Trừ ví: `payment` (subtotal + ship) + `import_tax`; `paid_at`, `inproduction_at`; đơn → `In Production`; production → MRP `To Do` |
| 7 | MRP | xưởng | §5 |
| 8 | Kiện quét xong | packager | `package_completed` → production transaction (base cost) → đơn `Fulfilled` |
| 9 | Tracking | cron + Telegram | Hãng quét → `In Transit`… → `Delivered` → đơn `Completed` |

Trạng thái đơn: Pending · Processing · In Production · Fulfilled · Completed · Refunded · Cancelled · Rejected · Trashed. Sau khi vào sản xuất đơn bị **khóa** ("Order had been locked"). Hành động trên chi tiết đơn: chọn phương thức ship (hiện giá từng tài khoản logistics của seller + `presignOrderShippingMethod` báo giá dịch vụ), Request Shipment Order / Cancel Shipment Order, Download/Print Shipping Label, **Request active by USPS +$0.7** (giao dịch `active` — kích hoạt tracking USPS), Request Make Products, Create Print Zip File, Cancel/Reject/Refund, Split Multiple, Clone, Keep in stock, Transform to inventory, Add new transaction (điều chỉnh tiền tay).

Ví dụ tiền thật (đơn PQ-22157-83778, DESI, 1 áo baseball jersey): subtotal 6,10 (sale) · ship 8,77 · thuế 0,45 · **total 15,32** → ví: −14,87 payment, −0,45 import_tax; base 5,50 → production transaction 5,50 khi kiện xong. Seller này `total_credit` −137.266 $ (nợ, `payment_type` debit) → hóa đơn kỳ.

## 5. Sản xuất — MRP (nắm chắc)

- Màn `Productions` theo xưởng, trạng thái: **To Do → Ready → In Cutting → In Print → In Sewing → Packing** (+ On Hold, Cancelled), mỗi trạng thái có cờ lỗi riêng (`READY_ERROR`, `CUTTING_ERROR`, `PRINT_ERROR`, `SEWING_ERROR`, `PACKAGE_ERROR`) và `PACKAGE_COMPLETED`. Bộ lọc theo loại sản phẩm, merchant group (nhóm seller ưu tiên), Priority Mode, tải file in ("Download Print"), in barcode/QR theo item hoặc theo lô.
- Chuyển bước bằng **quét barcode** `N-<mã>` (`mrpProductNextProcessStep(_id)`), báo lỗi bằng mã lỗi (`reportMrpError(_id, errors[], note)`), gỡ lỗi (`mrpProductRemoveError`), ghi QC note. Timeline item thật: Ready 13:38 (admin, "Moved to batch #BA-2609-227") → In Sewing 16:01 (`printer@email.com`) → Packing 17:16 (`packager@email.com`). Tức xưởng dùng **tài khoản chung theo vai**, không định danh từng công nhân (hệ mới có định danh + thống kê lỗi theo người).
- **Lô**: mỗi ngày xưởng gom item thành lô có tên/ngày, in barcode lô, theo dõi tiến độ 4 công đoạn theo lô (0/49/76). ~2 lô/ngày/xưởng. Dùng cho phiếu cắt/may theo lô và đếm tiến độ. Hệ mới không có khái niệm này.
- Báo cáo sản xuất theo xưởng theo kỳ: số production, tiền base cost, lỗi, xuất CSV có/không giá; "Daily report": số item xử lý theo seller và **packages pickup**, ma trận chuyển trạng thái from→to.
- Xưởng Grabink (đối tác 2D US) và 2D US: 0 hoạt động 30 ngày; Thái Nguyên Decor: 29 item To Do (mới mở 18/08).

## 6. Đóng hàng, kiện, bàn giao (nắm chắc + suy ra)

- Packing = quét kiện (`scanPackageTracking(tracking)` quét mã tracking dán trên label đã in sẵn từ bước 5, hoặc `mrpVerifyShipmentV2(orders[])` xác nhận theo đơn) → `package_completed`, `packaged_at` → đơn Fulfilled + trừ tiền sản xuất + Telegram "Package Completed".
- Kiện có cân nặng khai báo vs `real_weight`, `shipping_cost` ước vs `real_shipping_cost` thật (lấy về sau qua "Retry fetch ship cost" trên hóa đơn) → seller bị tính lại phí ship thật trên hóa đơn kỳ (suy ra từ cột "Total estimate ship cost / Total actual ship cost").
- Bàn giao: `mrpProductPackageUpdateExportTime(ids)` (giờ xuất kho), `exportPickupOrders(account_id)`, `dowloadPackageTracking` — phiếu pickup theo seller/ngày; "Packages pickup" trong daily report. Không thấy khái niệm "lô bàn giao hãng" có trạng thái riêng.
- Màn "Box Packages" theo xưởng hiện **0 bản ghi 30 ngày** — suy ra kiện quản lý ở cấp đơn/seller (`mrpProductPackages(order_increment_id)`), không theo xưởng.
- Label seller tự cấp (Ship By TikTok): `importShippingPackage(orders[{order_increment_id, tracking…}])` nhập tracking hàng loạt; `ship_by_seller` trên đơn.

## 7. Vận chuyển (nắm chắc)

- Phương thức trên đơn mẫu 200 gần nhất: 100% có `shipping_method` = ONOSEXPRESS/SBTT (trường `shipping_lines` rỗng), 174/200 tracking USPS, 194/200 giao Mỹ, 6 giao VN, 175/200 đơn 1 item.
- Label mua lúc xử lý đơn qua đối tác (`cdn.onosexpress.com/express/labels/...`), tracking USPS 92xx…; kích hoạt USPS +0,7 $ tùy chọn.
- Bảng phí ship EXPRESS US (`shippingCost`): theo **cân nặng** (100 g → 4,69 $, 200 g → 5,69, 300 g → 6,99, 450 g → 8,36, 700 g → 11,77, 900 g → 13,55, 1.100 g → 15,78…) × **bậc số lượng** 1–1000 / 1001–2000 / 2001+ (giảm 0,10 $ mỗi bậc). `shipRate(method, weight, dimension)` báo giá theo kích thước.
- Tracking cập nhật bằng cron (`when_tracking_update`, `day_update_tracking`, `active_tracking_day` trên user) + Telegram; shipment `detail[]` lưu lịch sử quét.
- Nội địa VN: GHTK, địa chỉ `national{province, district, ward}`, COD (có trong affiliate và counter kiện).

## 8. Tiền — luồng đầy đủ (nắm chắc + suy ra)

1. Seller nạp tiền (`topup`, PingPong hoặc admin nạp tay ở Billing → Topup có mã giao dịch ngoài + ảnh chứng từ) hoặc dùng **debit** với `debit_limit` (nợ, âm số dư, thanh toán theo hóa đơn kỳ).
2. Lúc xử lý đơn: trừ `payment` = sale price × qty + phí ship ước + phụ phí; trừ `import_tax` theo `tax_groups` của SKU (Duty 25% + US import tax 16–20% trên **giá trị khai** — công thức chính xác chưa rõ, mẫu: 0,45 $ trên đơn 15,32).
3. Giảm giá: `discount_vip_total` theo `vip` 0..5 và `partner_vip`, `unit_discounts` theo số lượng, `tiktok_vip_discount`; VIP 3 là mặc định của seller TikTok mới.
4. Lúc kiện xong: `productionTransaction` = base cost (ghi cho tài khoản sản xuất/xưởng — suy ra dùng để đối soát trả xưởng qua Production Invoice).
5. Cuối kỳ 10 ngày: Invoice seller gom giao dịch + phí ship thật (fetch lại) → Pending → Paid/Cancelled; file xlsx.
6. Hoàn tiền: `refund` (dashboard "Latest Refund"), `total_refund` trên đơn, RAR (Return & Replacement) tạo đơn thay thế tham chiếu `replacement`/`return`.
7. Affiliate: hoa hồng theo đơn vị theo phương thức ship cho người giới thiệu.

## 9. Sản phẩm và catalog (nắm chắc)

Tab theo collection: 3D · 2D · Grabink · Embroidery · Dropship · Handmade Wood; category/tag/technique (Embroidery, Applique, Sublimation, Laser Cut…)/material; "Hide product for seller", "Enable design check", "Disable affiliate commission"; max production time / max shipping time; mockup preset; print areas & parts với print document/print key; "Calculate Prices" tự tính giá từ base + fix_profit; giới hạn seller (`monopolist_users`). Hệ mới đã kéo catalog này về (`onospod-product-import.service.ts`) và có `productLine`/`printMethod` tương ứng `collection`/`print_method`.

## 10. Tích hợp và đối tác

- Fulfilment partner (làm thay Onos): Grabink (2D US), Gearment ("DUC - Gearment"); cấu hình sẵn cho CustomCat, Merchize, Geargag, Scalable, Printify, Private API. Đơn Grabink đi màn riêng `mrp-provider` (4.265 item all-time, 281 To Do).
- Sàn: `platform` (Temu, TikTok, eBay members email, `podorders.store`), "Ship By TikTok" = seller lấy label từ TikTok Shop; `platform_specifics` cho eBay.
- Telegram bot vận hành (§1), email SMTP (cấu hình có sẵn), extension trình duyệt cho seller.

## 11. Danh mục lệnh API quan trọng (từ mã JS + bắt mạng)

**Đọc:** `orders`, `dashboardOrder`, `orderSteps`, `orderLogistics`, `shipmentOrders`/`shipmentOrderCount`/`shipmentEvents`, `mrpProducts`, `mrpCounterQuery`, `mrpBatchProducts`/`mrpBatchCounter`/`searchBatch`, `mrpProductPackages`/`mrpPackageCounter`, `productionStatictics`, `dailyUserReport`, `dailyProductionReport`, `productionTransactions`, `transactions`, `invoices`, `productionInvoices`, `users`/`usergroups`/`usersNoneGroup`, `productPreset`/`productPresetCount`/`productMockupPresets`, `logistics`, `shippingCost`, `shipRate`, `shippingPreset`, `shippingProducts` (thuế), `manufactures`, `locations`, `fulfilments`, `appConfig`, `callToAction`, `mrpQueryErrorCodes`, `affiliateGroups`, `merchantGroups`, `systemNotifications`, `tokenAccessLogs`, `getProductByQRCode`.

**Ghi (chưa gọi, chỉ liệt kê):** `setOrderManufacture(order_id, …)`, `presignOrderShippingMethod(order_id, shipping_id)`, `makeShippingLabel(order_id)`, `chargeOrder`, `trashOrder(ids)`, `mrpProductNextProcessStep(_id)`, `reportMrpError(_id, errors[], note)`, `mrpProductRemoveError(_id)`, `makeMrpBatchProduct(product_ids, params)`, `updateMrpBatchProduct`, `trashMrpBatchProduct`, `printBarcodeMrpProduct/Batch`, `printQRCode*`, `exportBatchProducts`, `scanPackageTracking(tracking)`, `mrpVerifyShipment(V2)(orders[])`, `importShippingPackage(orders[])`, `mrpPackageSplit(_id)`, `mrpProductPackageUpdateExportTime(ids)`, `trashMrpProductPackage`, `maskAsDelivered(_id)`, `exportPickupOrders(account_id)`, `dowloadPackageTracking`, `requestProductionHistory(auth_id)`, `switchUser`, `saveMerchantGroup`, `toggleDesignProduction`, `logisticAuthorize`, `trashLogistic`, `sendRemindTelegram`, `notificationMake`, `saveProductLabel`, `applyOrderProductTags`. Tổng ~230 tên lệnh; danh sách đầy đủ trong scratchpad khảo sát (không commit).

## 12. Đối chiếu với hệ mới OnosFactory

| Khâu | Hệ cũ | Hệ mới | Khoảng trống |
|---|---|---|---|
| Lên đơn seller (form/CSV/API), tài khoản, API key, webhook | Có | Có (Seller Portal + Public Order API) | Thiếu: nhập tracking hàng loạt cho label seller tự cấp qua UI (API/CSV đã có), Split/Clone/Keep in stock, RAR |
| Catalog, biến thể, giá | 8 loại giá + phụ phí vị trí/mặt in + thuế theo SKU + VIP/partner/unit discount | `cost`/`nonShipCost`/`retailPrice` + Promotion theo tier | **Thiếu công thức giá đầy đủ, thuế nhập, phụ phí vị trí in, giảm giá số lượng** |
| Ví, trừ tiền, nợ, hóa đơn kỳ, topup, hoàn tiền, đối soát xưởng | Có, là sổ cái | Chỉ có ledger `customer_payments` ghi `waived` | **Thiếu toàn bộ** — điểm chặn lớn nhất |
| Gán xưởng | Theo sản phẩm (`manufacture_id`) + tay | Product Config + khách→xưởng | Có |
| Sản xuất | 6 trạng thái MRP, tài khoản chung theo vai, mã lỗi 31, QC note, priority, merchant group | Soát tool → designer → 6 công đoạn, định danh người, thống kê lỗi theo người, luồng rút gọn theo xưởng | Hệ mới **mạnh hơn**; thiếu **lô sản xuất theo ngày** và "Download Print"/phiếu in theo lô |
| Label | Mua lúc xử lý đơn (trước SX), USPS qua onosexpress, +0,7 kích hoạt | VNP eGlobal, mua tay từ menu Admin | **Thiếu tự động hóa + chọn thời điểm mua + báo giá + phí ship theo bậc** |
| Đóng kiện | Quét tracking → kiện xong → Fulfilled + trừ tiền SX | Công đoạn Đóng hàng, chưa gắn label/kiện/tiền | **Thiếu hook label + tính tiền lúc đóng** |
| Bàn giao hãng | Giờ xuất kho + phiếu pickup theo seller | Chưa có | Thiếu lô bàn giao |
| Tracking | Cron + Telegram + trạng thái shipment 11 mức | Cron VNP 2 lần/ngày, trạng thái 3 mức | Thiếu đổ về seller + webhook `order.shipped` |
| Báo cáo | Daily report, production report theo xưởng có tiền, dashboard | Dashboard, CEO dashboard, Operations hub | Thiếu báo cáo tiền theo xưởng/seller |
| Đối tác fulfil ngoài (Grabink, Gearment) | Có | Không | Cần quyết định có giữ không (30 ngày qua 0 hoạt động) |
| Affiliate | Có | Không | Cần quyết định |
| Thông báo Telegram vận hành | Có | Có (báo cáo SLA, Zalo) | Bổ sung action package/error nếu cần |

## 13. Gợi ý thứ tự chuyển đổi (từ dữ liệu trên)

1. **Cầu tạm chống làm hai lần:** hệ mới quét xong công đoạn → gọi `mrpProductNextProcessStep`/`scanPackageTracking` bên cũ (cần thử trên đơn test `is_test`). Xưởng chỉ quét ở hệ mới, tiền vẫn chốt bên cũ.
2. **Ví + tính tiền** ở hệ mới (trừ lúc đẩy đơn, trừ base cost lúc đóng kiện, thuế nhập theo SKU, hóa đơn kỳ, topup, debit limit, hoàn tiền), chạy song song đối chiếu ≥ 1 kỳ hóa đơn với số hệ cũ (§8).
3. **Label + kiện + bàn giao** ở hệ mới (VNP), chọn mô hình mua label (trước sản xuất như cũ, hay lúc đóng).
4. **Lô sản xuất theo ngày** nếu xưởng xác nhận cần phiếu theo lô.
5. Cắt theo dòng sản phẩm: gỡ sản phẩm khỏi catalog cũ (`visible=false`/"Hide product for seller"), seller sang portal mới, tắt tài khoản logistics cũ.

## 14. Chưa rõ — cần người vận hành xác nhận

1. Công thức giá bán cho seller từ 8 loại giá + VIP + partner + unit discount + phụ phí vị trí/mặt in; và công thức thuế nhập (cơ sở tính là giá nào).
2. Production Invoice là hóa đơn trả cho xưởng hay hóa đơn sản xuất cho seller debit? Kỳ và ai duyệt.
3. Ai quyết định phương thức ship khi đơn có nhiều tài khoản logistics; ONOSEXPRESS đi qua hãng nào ở Mỹ (onosexpress.com).
4. Lô sản xuất: xưởng dùng để in phiếu cắt/may hay chỉ để đếm tiến độ? Có in "Download Print" theo lô không?
5. Barcode `O-N-O-S-01..03` là thao tác gì.
6. Grabink/2D US/Gearment còn dùng không (0 hoạt động 30 ngày).
7. RAR, Affiliate, Merchant group có cần mang sang hệ mới không.
8. Quy tắc Completed (giao xong sau bao ngày), quy tắc hoàn tiền/hủy sau khi đã mua label.

## 15. Cách kiểm lại và lưu ý bảo mật

- Script khảo sát (Playwright + fetch GraphQL, chỉ đọc) nằm ở scratchpad phiên làm việc 07/09/2026, **không commit** vì chứa token phiên. Muốn chạy lại: đăng nhập admin, bắt header `authorization` + `x-onos-super-token` từ tab Network, gọi các query ở §11 với `Origin: https://app.onospod.com`.
- JWT của hệ cũ **chứa mật khẩu dạng rõ** → sau khảo sát phải **đổi mật khẩu** tài khoản đã dùng; không dán token/mật khẩu vào chat, ticket, hay repo.
- Token super admin đang nằm trong `apps/api/.env.production` (`ONOSPOD_API_*`) để hệ mới đọc; giữ nguyên phạm vi chỉ đọc cho tới khi làm cầu tạm ở §13.1.
