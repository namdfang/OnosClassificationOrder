# Ví seller + Seller tự mua label VNP

> Plan chốt 09/09/2026. **Tình trạng: ĐÃ CODE cùng ngày** — doc chính thức: `documents/FunctionDescription/SellerWallet.md` (doc thắng plan nếu lệch). Đọc kèm `documents/Architecture/ShippingLabelPatterns.md` và `documents/FunctionDescription/VnpShipping.md`.

## 1. Bối cảnh & quyết định đã chốt (với user)

Hiện label chỉ Admin/SuperAdmin mua được (mọi endpoint `shipping-vnp/*` đều `@Auth([SuperAdmin, Admin])`, RolesGuard chặn vai Customer ngoài prefix `customer/`). Seller chỉ tự cấp tracking hoặc xem read-only. Muốn seller tự mua → phải có **ví seller** vì giá seller trả ≠ giá VNP thật.

| Quyết định | Chốt |
| --- | --- |
| Cân tính cước | **max(cân seller tự điền, cân quy đổi)**; quy đổi = `(dài×rộng×cao)/6` cm → gram. Kích thước KHÓA theo biến thể (seller chỉ điền cân nặng). |
| Làm tròn | LÊN mốc kế tiếp trong bảng giá (120g → mốc 150g). **>10.000g → CHẶN mua**, báo "liên hệ hỗ trợ". |
| Bảng giá | `Data/shipping_cost.csv` (71 mốc 50g→10.000g, USD). **1 bảng chung mọi seller**, lưu `system_configs`, admin upload/sửa lại được; schema chừa chỗ thêm cột theo tier sau này. **Snapshot giá mỗi lượt mua.** |
| Loại đơn được mua | **CHỈ đơn cod/tiktok** (giá sản phẩm = `nonShipCost`, chưa gồm ship). Express_us/economy_us giữ nguyên admin mua (ship đã nằm trong `retailPrice` — cho seller mua là trả ship 2 lần). |
| Tiền đơn hàng | **CHƯA trừ ví phase này** — push vẫn ghi `customer_payments` `waived` như cũ. Ledger ví thiết kế sẵn `kind='order'` để sau bật gate là chạy, không đổi flow. |
| Ví seller | **USD**, ví TỔNG đa mục đích (label + đơn hàng + chi phí mở rộng sau). **Cho nợ có hạn mức**: `creditLimit` từng seller do admin cấp (mặc định 0), số dư được xuống tới `-creditLimit`. |
| Ví công ty | KHÔNG xây sổ riêng — ví VNP sẵn có (`shippingCost`/`balanceAfter` trên `shipments`). Margin = giá thu seller − giá VNP, tự có từ 2 sổ. |
| Nạp ví | Phase 1 nạp TAY: seller chuyển khoản ngoài hệ thống → admin cộng ví ở hub kèm ghi chú. Cổng thanh toán = phase sau. |
| Hủy label | Phase 1 seller KHÔNG tự hủy — liên hệ admin; admin hủy (luồng fail-closed sẵn có) + tự quyết hoàn ví tay (`adjust`/`label_refund`). Chính sách hoàn VNP chưa rõ. |
| Lỗi cho seller | Dịch về mã an toàn (§5). TUYỆT ĐỐI không trả raw VNP response/địa chỉ gửi/ví công ty (hiện `BadRequestException` đang nhét nguyên `JSON.stringify(raw)` 6000 ký tự). |

## 2. `packages/shared` — nguồn chung FE/BE

- `packages/shared/client/seller-shipping.ts` (entry nest-free — seller FE cần runtime để preview giá):
  - `computeChargeableWeightGram({ actualGram, lengthCm, wideCm, heightCm })` → `max(actualGram, ceil(L×W×H/6))`.
  - `resolveSellerShipPrice(gram, table)` → `{ tierGram, price } | { error: 'over_max' }` — tìm mốc ĐẦU TIÊN ≥ gram; quá mốc cuối → over_max.
  - Test thuần: biên đúng mốc / giữa mốc / đúng 10.000 / 10.001 / bảng rỗng.
- `packages/shared/dtos/customer-wallet.dto.ts`: `WALLET_TXN_KINDS = ['topup','label','label_refund','order','adjust'] as const` (mở rộng được), `CustomerWalletTxnZod` (**bắt buộc `balanceBefore` + `balanceAfter` trên từng record** — yêu cầu hiển thị của user), DTO list/topup/adjust, `SELLER_SHIPPING_PRICE_CONFIG_KEY = 'seller_shipping_price_config'`, `SellerShippingPriceTableZod` (`rows: [{ weightGram, price }]`, chừa `tierPrices?` cho sau), quote/buy DTOs (`GetSellerShipQuote*`, `BuySellerLabel*` + union mã lỗi an toàn §5).
- `packages/shared/dtos/customer.dto.ts`: thêm `creditLimit` + `walletBalance` vào safe customer (portal me thấy được).

## 3. BE — module `customer-wallet` (mới, đủ bộ module/controller/service/repository/entity)

- **Entity `customer_wallet_transactions`** (append-only, KHÔNG update/delete):
  `customerId` (index) · `kind` · `amount` (dương=cộng, âm=trừ) · `balanceBefore` · `balanceAfter` · `note?` · `byUserId?` (admin thao tác) · `refs?: { shipmentId?, orderIds?, paymentId?, requestId? }`. Index `{ customerId: 1, createdAt: -1 }` + **unique partial `{ customerId, 'refs.requestId' }`** (idempotency tầng DB — cùng khuôn `purchaseKey` của ShippingLabelPatterns §2).
- **`CustomerEntity`**: thêm `walletBalance: number` (cache, default 0) + `creditLimit: number` (default 0). Nhớ bẫy Common_Pitfalls §1 nếu đụng $project.
- **Service `applyTransaction(customerId, { kind, amount, refs, note, by })`** — MỌI biến động tiền đi qua đúng 1 hàm này, chạy trong **transaction Mongo** (replica set sẵn): đọc balance → kiểm `balance + amount >= -creditLimit` (fail-closed, lỗi `insufficient_funds`) → insert txn với before/after → `$set` walletBalance. Retry khi write-conflict.
- **Endpoints**:
  - Seller (prefix `customer/` bắt buộc): `GET customer/wallet` (balance + creditLimit) · `GET customer/wallet/transactions` (phân trang).
  - Admin (hub, prefix KHÔNG chứa `customer/`): `GET admin/customer-wallets` (list seller + số dư) · `POST admin/customer-wallets/:customerId/topup` · `POST .../adjust` (+/−, bắt buộc note) · `PATCH .../credit-limit` · `GET .../transactions`. Tất cả `@Auth([Admin])`, logging Winston đủ.

## 4. BE — seller mua label (`customer-portal` hoặc module `seller-shipping` riêng)

- **Bảng giá**: blob `system_configs` key `seller_shipping_price_config`. `POST admin/seller-shipping/price-table/import` (parse CSV `WEIGHT,PRICE`, validate tăng dần) + `GET` cho cả admin lẫn seller (`GET customer/shipping/price-table` — seller xem được bảng giá công khai).
- **Điều kiện đơn mua được** (check server-side, mirror sang FE):
  1. Staging order thuộc seller đang đăng nhập (ownership theo `customerId`).
  2. Đã push sản xuất (`pushedAt`), resolve nhóm production orders theo `orderId`.
  3. **MỌI item trong nhóm `shipMethod ∈ {cod, tiktok}`** — lẫn express → từ chối cả nhóm.
  4. Chưa có tracking (kể cả tự cấp `provider='customer'`), không held/cancelled, không đang `purchasing`.
- **`GET customer/shipping/orders/:stagingId/quote`**: cân prefill = Σ(weight biến thể × qty); kích thước từ biến thể (Σ thể tích các item × qty → cân quy đổi); nhận `weightGram?` seller điền → trả `{ actualGram, dimGram, chargeableGram, tierGram, price }` hoặc mã lỗi. Seller đổi cân → gọi lại quote (hàm shared nên FE cũng preview ngay không cần round-trip).
- **`POST customer/shipping/orders/:stagingId/label`** (`requestId` bắt buộc) — thứ tự tiền theo ShippingLabelPatterns:
  1. Validate điều kiện + tính giá server-side (không tin giá FE gửi lên).
  2. **Trừ ví trước**: `applyTransaction(kind='label', amount=-price, refs={requestId, orderIds})` — không đủ tiền chết ngay tại đây, chưa đụng VNP.
  3. Gọi luồng mua VNP SẴN CÓ (`createShipmentForOrder` — giữ chỗ `purchasing`, unique index chống mua trùng, đối soát `balanceAfter` giữ nguyên). Ghi thêm lên record `shipments`: `sellerPrice` (snapshot), `sellerWalletTxnId`, `boughtByCustomerId`.
  4. VNP lỗi → **hoàn tự động** `kind='label_refund'` cùng `refs.requestId` + trả mã lỗi an toàn. VNP ok → trả tracking + labelUrl.
  - Idempotency 2 tầng: requestId trùng → trả kết quả cũ (không trừ tiền lần 2 nhờ unique index txn); nhóm đã có label → lỗi `already_has_label`.
- **Không mở endpoint hủy cho seller.** Admin hủy dùng luồng cũ; hoàn ví = admin bấm tay ở hub.

## 5. Bộ dịch lỗi an toàn (BE là chốt chặn, FE chỉ map i18n)

| Mã trả seller | Gom từ |
| --- | --- |
| `over_max_weight` | >10.000g |
| `missing_weight` | không có cân + seller không điền |
| `not_eligible` | sai shipMethod / chưa push / held / cancelled |
| `already_has_label` | đã có tracking (mua hay tự cấp) |
| `insufficient_funds` | ví + hạn mức không đủ |
| `service_unavailable` | MỌI lỗi còn lại: VNP sập/hết ví công ty/sai config/địa chỉ lỗi... — "Dịch vụ tạm gián đoạn, liên hệ hỗ trợ" |

Chi tiết thật (raw VNP, stack) chỉ vào Winston log + record `shipments` cho admin. Cấm `JSON.stringify(raw)` chảy ra response seller.

## 6. FE seller portal (`apps/seller`, khu `/portal`)

- **Trang Ví** (`/portal/wallet`, entry sidebar): số dư + hạn mức; **bảng lịch sử giao dịch từng record hiện `balanceBefore → balanceAfter`** (yêu cầu tường minh của user), kind badge, note, phân trang; khối hướng dẫn nạp tay (nội dung admin sửa được sau — phase 1 hardcode i18n); link bảng giá ship.
- **Nút "Mua vận đơn"** ở chi tiết đơn + hàng đủ điều kiện: dialog hiện cân prefill (sửa được MỖI cân nặng) → breakdown cân thật/quy đổi/mốc/giá → xác nhận → trừ ví + trả tracking. Lỗi hiện theo 6 mã i18n. Responsive ≤ md theo rule app.
- Điều kiện hiển thị nút mirror §4 (ẩn hẳn với đơn express).

## 7. FE hub (`apps/seller`, khu `/hub`)

- **Trang "Ví seller"** (`/hub/wallets`): list seller + số dư + hạn mức; dialog Nạp/Điều chỉnh (bắt buộc note) + sửa creditLimit; drill lịch sử giao dịch từng seller.
- **Tab bảng giá**: upload CSV mới + xem bảng hiện hành (hiện ngày cập nhật).
- `/adm/shipments` (web cũ): thêm cột "Thu seller" + tổng margin (record nào có `sellerPrice`).

## 8. Test & verify

- Jest: `applyTransaction` (đủ/thiếu tiền, creditLimit, idempotent requestId, concurrent — transaction retry), quote (mốc/biên/over-max), buy flow mock VNP (fail → refund tự động, ledger cân), eligibility.
- `pnpm build-types` cả 3 package; e2e seller chạy trên hub server sau deploy (thêm case trang ví + nút mua).
- Doc: tạo `documents/FunctionDescription/SellerWallet.md` + cập nhật `VnpShipping.md`/`SellerPortal.md`/CLAUDE.md mapping (theo skill write-feature-doc).

## 9. Phase sau (đã note memory `seller-wallet-label`)

- Cổng thanh toán nạp ví tự động.
- Seller tự hủy label + hoàn ví tự động (chờ rõ chính sách hoàn VNP).
- Bật gate trừ ví cho tiền ĐƠN HÀNG (`kind='order'` đã chừa sẵn).
- Giá theo tier VIP (thêm `tierPrices` vào config, không đập bảng).
- Ngưỡng cảnh báo ví VNP công ty thấp → tự khóa nút mua seller + báo Telegram.
