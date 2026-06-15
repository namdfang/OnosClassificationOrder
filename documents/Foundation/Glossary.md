# Glossary & Domain Dictionary

Bảng thuật ngữ nghiệp vụ của hệ thống **Printsel** — hệ thống quản lý đơn hàng fulfillment nội bộ cho ngành Print-on-Demand (POD).

> **Quy ước:** Mỗi thuật ngữ được mô tả kèm theo tên module/entity/enum tương ứng trong code để tiện tra cứu.

---

## 1. Thuật ngữ nghiệp vụ cốt lõi

### Order (Đơn hàng POD)

Đơn hàng Print-on-Demand nội bộ, được tạo bởi Seller thông qua hệ thống. Mỗi Order chứa thông tin người nhận, sản phẩm cần in, artwork, và được gán cho một Provider để sản xuất.

- **Code reference:** `apps/api/src/modules/order/`, entity `OrderEntity`
- **Prefix mã đơn:** `PS_`
- **Trạng thái:** xem [Order Status](#order-status)

### Dropship Order (Đơn hàng Dropship)

Đơn hàng mà sản phẩm được mua từ bên thứ 3 (Trung Quốc, hoặc nhà cung cấp khác) rồi ship trực tiếp cho khách hàng cuối. Khác với Order (POD) ở chỗ không cần artwork in, mà cần link sản phẩm và hình ảnh.

- **Code reference:** `apps/api/src/modules/dropship-order/`, entity `DropShipOrderEntity`
- **Prefix mã đơn:** `PS_`
- **Trạng thái:** xem [Dropship Order Status](#dropship-order-status)

### Stock Order (Đơn hàng Stock/Kho)

Đơn hàng fulfillment từ hàng có sẵn trong kho. Không cần sản xuất, chỉ cần đóng gói và giao hàng. Flow ngắn hơn Order và Dropship Order.

- **Code reference:** `apps/api/src/modules/stock-order/`, entity `StockOrderEntity`
- **Prefix mã đơn:** `PS_`
- **Trạng thái:** xem [Stock Order Status](#stock-order-status)

### Line Item / Order Item

Một dòng sản phẩm trong đơn hàng. Mỗi Order có thể có nhiều Line Item, mỗi item tương ứng với một sản phẩm + variant + số lượng cụ thể.

- **Code reference:**
  - Order: `apps/api/src/modules/order-item/` → `LineItemEntity`
  - Dropship: `apps/api/src/modules/dropship-order-item/` → `DropShipLineItemEntity`
  - Stock: `apps/api/src/modules/stock-order-item/` → `StockLineItemEntity`
- **Barcode prefix:** `LI-`

### Provider (Nhà cung cấp)

Nhà cung cấp dịch vụ in ấn/sản xuất hoặc nguồn hàng. Hệ thống tích hợp API với nhiều provider, mỗi provider có code riêng.

- **Code reference:** `apps/api/src/modules/provider/`, entity `ProviderEntity`
- **Phân loại:** `Factory` (nhà máy sản xuất) | `Stock` (nhà cung cấp hàng có sẵn)
- **Danh sách provider:** xem [Provider Codes](#provider-codes)

### Provider Order (Đơn hàng gửi Provider)

Đơn hàng được tạo và gửi tới nhà cung cấp bên ngoài thông qua API tích hợp. Mỗi Provider Order ánh xạ tới một hoặc nhiều Line Item của Order nội bộ.

- **Code reference:** `apps/api/src/modules/provider-order/`, entity `ProviderOrderEntity`

### Store (Cửa hàng)

Đại diện cho một cửa hàng/kênh bán hàng của Seller. Mỗi Seller có thể sở hữu nhiều Store.

- **Code reference:** `apps/api/src/modules/store/`, entity `StoreEntity`
- **Loại store:** `Manual` | `API` | `Tiktok`

### Product (Sản phẩm)

Sản phẩm Print-on-Demand trong catalog hệ thống. Mỗi Product có nhiều Variant và thuộc một Category.

- **Code reference:** `apps/api/src/modules/product/`, entity `ProductEntity`

### Product Variant (Biến thể sản phẩm)

Biến thể cụ thể của sản phẩm, phân biệt bởi color, size, hoặc các option khác. Mỗi Variant có giá riêng, SKU, và liên kết với Provider.

- **Code reference:** `apps/api/src/modules/product-variant/`, entity `ProductVariantEntity`

### Category (Danh mục)

Phân loại sản phẩm (ví dụ: T-Shirt, Mug, Poster...).

- **Code reference:** `apps/api/src/modules/category/`, entity `CategoryEntity`

### Artwork (File thiết kế)

File hình ảnh thiết kế dùng để in lên sản phẩm. Một sản phẩm có thể có nhiều vị trí in: Front, Back, Left, Right, Collar.

- **Code reference:** `apps/api/src/modules/artwork/`
- **Image type enum:** `ImageType.Artwork`
- **Print area:** `1 side` | `2 side`

### Tracking (Theo dõi vận chuyển)

Thông tin theo dõi lô hàng sau khi ship. Mỗi Tracking gắn với tracking number từ carrier (DHL, USPS, UPS, FEDEX).

- **Code reference:** `apps/api/src/modules/tracking/`, entity `TrackingEntity`
- **Trạng thái:** xem [Tracking Status](#tracking-status)

### Transaction (Giao dịch tài chính)

Giao dịch tài chính trong Wallet hệ thống: nạp tiền (Topup), trừ tiền (Charge), hoàn tiền (Refund), rút tiền (Withdraw).

- **Code reference:** `apps/api/src/modules/transaction/`, entity `TransactionEntity`
- **Trạng thái:** xem [Transaction Status & Types](#transaction-status--types)

### Wallet (Ví)

Ví điện tử nội bộ của Seller. Seller nạp tiền vào Wallet, hệ thống tự động trừ khi đơn hàng được xử lý (Charge). Số dư Wallet quyết định khả năng tạo đơn.

- **Balance Before / Balance After:** Số dư trước và sau giao dịch, được ghi nhận trong mỗi Transaction.

### Issue (Vấn đề / Khiếu nại)

Vấn đề phát sinh liên quan đến đơn hàng: lỗi in, hàng hư, giao sai... Seller hoặc Support tạo Issue, được xử lý bởi team nội bộ.

- **Code reference:** `apps/api/src/modules/issue/`, entity `IssueEntity`
- **Trạng thái:** xem [Issue Status & Types](#issue-status--types)

### Export (Xuất dữ liệu)

Chức năng xuất dữ liệu ra file Excel/CSV: đơn hàng, thanh toán, tracking, topup.

- **Code reference:** `apps/api/src/modules/export/`, entity `ExportEntity`
- **Định dạng:** `XLSX` | `CSV`

### Notification (Thông báo)

Thông báo nội bộ cho user: thông báo về đơn hàng, hệ thống, tài khoản.

- **Code reference:** `apps/api/src/modules/notifications/`, entity `NotificationEntity`
- **Loại:** `Order` | `System` | `Account`

### Webhook

Endpoint nhận callback từ bên thứ 3 (provider, payment...) để cập nhật trạng thái đơn hàng.

- **Code reference:** `apps/api/src/modules/webhooks/`, entity `WebhookEntity`
- **Topic:** `Order Processing`

### Department (Phòng ban)

Phòng ban/bộ phận trong công ty, dùng để phân nhóm user và đơn hàng.

- **Code reference:** `apps/api/src/modules/departments/`

### Referrer (Người giới thiệu)

Người giới thiệu Seller mới vào hệ thống. Referrer nhận hoa hồng (commission) từ đơn hàng của Seller được giới thiệu.

- **Code reference:** `apps/api/src/modules/referrer/`

---

## 2. Actors (Vai trò người dùng)

| Role | Enum Value | Mô tả |
|------|-----------|-------|
| **Super Admin** | `SuperAdmin` | Toàn quyền quản trị hệ thống |
| **Admin** | `Admin` | Quản trị viên cấp cao |
| **Seller** | `Seller` | Người bán hàng — tạo đơn, quản lý store, nạp tiền |
| **Manager** | `Manager` | Quản lý chung |
| **Seller Manager** | `SellerManager` | Quản lý nhóm Seller |
| **Product Manager** | `ProductManager` | Quản lý sản phẩm và catalog |
| **Support Manager** | `SupportManager` | Quản lý đội hỗ trợ |
| **Support** | `Support` | Nhân viên hỗ trợ — xử lý issue, hỗ trợ Seller |
| **Developer** | `Developer` | Lập trình viên — truy cập kỹ thuật |
| **Shipment** | `Shipment` | Nhân viên vận chuyển |
| **Provider** | `Provider` | Đại diện nhà cung cấp |
| **Accountant** | `Accountant` | Kế toán — quản lý giao dịch, thanh toán |
| **Designer** | `Designer` | Nhà thiết kế (Folinas designers) |
| **Logistics** | `Logistics` | Nhân viên logistics — quản lý ship out, manifest |
| **Fulfillment** | `Fulfillment` | Nhân viên fulfillment — xử lý đóng gói, giao hàng |
| **Referrer** | `Referrer` | Người giới thiệu — nhận hoa hồng |

- **Code reference:** `packages/shared/enums/role-type.ts` → `RoleType`
- **Custom Role:** Ngoài các role cố định, hệ thống hỗ trợ **Custom Role** do Admin tự tạo với bộ permission tùy chỉnh (`apps/api/src/modules/custom-role/`).
- **Tier:** Seller được phân hạng theo tier: `Standard` → `Silver` → `Gold` → `Diamond`.

---

## 3. Trạng thái (Status Enums)

### Order Status

Vòng đời đơn hàng POD:

```
Created → Imported → Pending → OnHold → Processing → InProduction → Produced →
Packaging → PickupReady → PickedUp → ShipOut → ShipmentReceived → Manifest →
USArrival → CarrierReceived → PreTransit → InTransit → OutForDelivery → Delivered → Completed
```

Trạng thái đặc biệt:
- `NoArtwork` — Đơn thiếu file artwork
- `Unmatched` — Sản phẩm chưa khớp với variant trong hệ thống
- `TrackingMissing` — Chưa có tracking number
- `ArtworkError` — Lỗi file artwork
- `Canceled` / `Rejected` / `Refunded` / `PartiallyRefunded` / `Returned` — Các trạng thái hủy/hoàn

**Luồng chuyển trạng thái chính** (theo `NEXT_ORDER_STATUS`):

| Từ trạng thái | Sang trạng thái |
|---|---|
| Pending | Processing |
| Processing | InProduction |
| InProduction | ShipOut |
| ShipOut | ShipmentReceived, Manifest |
| ShipmentReceived | Manifest |
| Manifest | USArrival |
| USArrival | CarrierReceived |
| CarrierReceived | Delivered |

- **Code reference:** `packages/shared/constants/order.ts` → `OrderStatus`, `NEXT_ORDER_STATUS`

### Dropship Order Status

```
Pending → Confirmed → Processing → ShipOut → ShipmentReceived → Adjustment →
AdjustmentCompleted → Fulfillment → Manifest → USArrival → CarrierReceived →
InTransit → OutForDelivery → Delivered → Completed
```

Trạng thái đặc biệt:
- `TrackingMissing` — Chưa có tracking
- `ScanMissing` — Chưa scan hàng
- `TrackingHold` — Tracking bị giữ
- `Canceled` / `Refunded`

- **Code reference:** `packages/shared/constants/dropship-order.ts` → `DropshipOrderStatus`

### Stock Order Status

```
Pending → ShipmentReceived → Fulfillment → Manifest → USArrival → InTransit →
Delivered → Completed
```

Trạng thái đặc biệt: `TrackingMissing`, `ScanMissing`, `TrackingHold`, `Canceled`, `Refunded`

- **Code reference:** `packages/shared/constants/stock-order.ts` → `StockOrderStatus`

### Line Item Status

Trạng thái của từng sản phẩm trong đơn hàng POD, tương tự Order Status nhưng ở cấp item:

```
Created → Imported → Pending → OnHold → Processing → InProduction → Produced →
PickupReady → PickedUp → PreTransit → InTransit → Delivered → Completed
```

- **Code reference:** `packages/shared/constants/order.ts` → `LineItemStatus`

### Tracking Status

| Trạng thái | Mô tả |
|---|---|
| `Pending` | Chờ xử lý |
| `Created` | Đã tạo tracking |
| `InTransit` | Đang vận chuyển |
| `OutForDelivery` | Đang giao hàng |
| `Delivered` | Đã giao |
| `Not Delivered` | Giao không thành công |
| `PickupHeld` | Hàng bị giữ tại bưu cục |
| `ReturnedToSender` | Trả lại người gửi |
| `AdditionalActions` | Cần hành động thêm |
| `Error` | Lỗi tracking |
| `NotFound` | Không tìm thấy tracking |
| `NotAvailable` | Chưa có thông tin |
| `Tracking Number Missing` | Chưa có tracking number (virtual status) |

- **Code reference:** `packages/shared/enums/tracking.ts` → `TrackingStatus`

### Transaction Status & Types

**Transaction Status:**

| Trạng thái | Mô tả |
|---|---|
| `Pending` | Chờ xử lý |
| `Processing` | Đang xử lý |
| `Failed` | Thất bại |
| `Completed` | Hoàn thành |
| `Rejected` | Bị từ chối |

**Transaction Types:**

| Loại | Mô tả |
|---|---|
| `Topup` | Nạp tiền vào ví |
| `DirectTopup` | Nạp tiền trực tiếp (Admin) |
| `Charge` | Trừ tiền khi xử lý đơn hàng |
| `Withdraw` | Rút tiền |
| `CreditTopup` | Nạp tín dụng (nợ) |
| `PartiallyRefund` | Hoàn tiền một phần |
| `Refund` | Hoàn tiền toàn bộ |

**Payment Platforms:** Payoneer, Pingpong, LianLian, WorldFirst, Paypal, BankTransfer, AutoBankTransfer

- **Code reference:** `packages/shared/constants/transaction.ts`

### Issue Status & Types

**Issue Status:**

| Trạng thái | Mô tả |
|---|---|
| `Opening` | Đang mở, chờ xử lý |
| `Approved` | Đã duyệt |
| `Rejected` | Từ chối |
| `OnHold` | Tạm giữ |
| `Completed` | Hoàn tất |
| `Cancelled` | Đã hủy |

**Issue Types:**

| Loại | Mô tả |
|---|---|
| `Image quality` | Lỗi chất lượng hình ảnh/màu sắc |
| `Item damaged` | Hàng bị hư hỏng |
| `Item missing` | Thiếu hàng |
| `Item not as expected` | Hàng không đúng mong đợi |
| `No update from carrier` | Carrier không cập nhật |
| `Order Late production` | Sản xuất trễ |
| `Shipping problem` | Vấn đề vận chuyển |
| `Wrong item size/type received` | Nhận sai size/loại |
| `Wrong print delivered` | In sai |
| `Shipping to wrong address` | Giao sai địa chỉ |
| `Size not as expected` | Size không đúng kỳ vọng |
| `Print missing (front/back)` | Thiếu mặt in |
| `Request unlock order` | Yêu cầu mở khóa đơn |
| `Another reason` | Lý do khác |
| `Cancel by buyer` | Buyer yêu cầu hủy |
| `Relabel FBA` | Dán nhãn lại FBA |

**Issue Solutions:** `Refund` (hoàn tiền) | `Replace` (thay thế)

- **Code reference:** `packages/shared/constants/issue.ts`

### Shipping Status

| Trạng thái | Mô tả |
|---|---|
| `None` | Chưa ship |
| `Pending` | Chờ ship |
| `PickedUp` | Đã lấy hàng |
| `Awaiting` | Đang chờ |
| `InTransit` | Đang vận chuyển |
| `PartiallyDelivered` | Giao một phần |
| `Delivered` | Đã giao |
| `AddressError` | Sai địa chỉ |

### Download Status

Trạng thái tải artwork/label files: `None` → `Pending` → `Downloading` → `Completed` | `Error`

---

## 4. Provider Codes

Danh sách các nhà cung cấp được tích hợp trong hệ thống:

### Nhà cung cấp có API tích hợp

| Code | Tên | Loại | Service trong code |
|------|-----|------|-------------------|
| `PRINTSEL` | Printsel (nội bộ) | Factory | — |
| `BEEFUN` | Beefun | Factory | `BeefunService` |
| `FLASHSHIP` | Flashship | Factory | `FlashshipService` |
| `ONOS` | OnosPod | Factory | `OnosPodService` |
| `PRINTCARE` | PrintCare / MonsterDTG | Factory | `PrintCareService` |
| `BURGERPRINTS` | BurgerPrints | Factory | `BurgerPrintsService` |
| `GEARMENT` | Gearment | Factory | `GearmentService` |
| `CUSTOMCAT` | CustomCat | Factory | `CustomCatService` |
| `PRINTIFY` | Printify | Factory | `PrintifyService` |
| `MERCHIZE` | Merchize | Factory | `MerchizeService` |
| `DreamShip` | Dreamship | Factory | `DreamshipService` |
| `HubFulfill` | Hub Fulfill | Factory | `HubFulfillService` |
| `PrinteesHub` | Printees Hub | Factory | `PrinteesService` |
| `EGFULFILL` | EG Fulfill | Factory | `UsFulfillService` |

### Nhà cung cấp không có API tích hợp (quản lý thủ công)

| Code | Tên |
|------|-----|
| `PRINTWAY` | Printway |
| `MKP` | MKT City |
| `SwiftPOD` | SwiftPOD |
| `VietAnh` | Viet Anh |
| `Fastex` | Fastex |
| `Varldens` | Varldens |
| `PunchNeedle` | Punch Needle |
| `DangHai` | Dang Hai |
| `EFex` | EFex |
| `Kelvin` / `KelvinTX` | Kelvin |
| `DonDang` | Don Dang |
| `DangQuang` | Dang Quang |
| `PrintDoors` | Print Doors |
| `HP` | HP |
| `OrsomeUS` | Orsome US |

### Nhà cung cấp Trung Quốc

| Code | Tên |
|------|-----|
| `POD5` | POD5 |
| `AliceXu` | Alice Xu |
| `HongPhuc` | Hong Phuc |
| `CatKiss` | CatKiss |
| `ZBear` | ZBear |
| `Lucky` | Lucky |
| `ToAddit` | ToAddit |
| `MOC` | MOC |
| `1688` | 1688 |
| `Falcon` | Falcon |
| `Sunshine` | Sunshine |

- **Code reference:** `packages/shared/enums/provider-code.ts` → `ProviderCode`, `ProviderType`

---

## 5. Order Types & Shipping

### Order Type (Cách tạo đơn)

| Loại | Mô tả |
|---|---|
| `Manual` | Tạo thủ công qua form |
| `Import` | Import từ file Excel/CSV |
| `Bulk` | Tạo hàng loạt |

### Shipping Type (Loại giao hàng)

| Loại | Mô tả |
|---|---|
| `Normal` | Giao hàng bình thường — hệ thống tạo tracking |
| `Label` | Seller cung cấp shipping label — dùng label của platform (Tiktok, Amazon, Etsy) |
| `FBA` | Fulfillment by Amazon |

### Shipping Method (Phương thức giao)

| Loại | Mô tả |
|---|---|
| `Standard` | Giao hàng tiêu chuẩn |
| `Expedited` | Giao hàng nhanh |
| `FlashShipLine1` / `Line3` / `Line6` | Các line sản xuất của Flashship |

### Shipping Carrier (Đơn vị vận chuyển)

`DHL` | `USPS` | `UPS` | `FEDEX`

### Label Service (Platform cung cấp label)

`None` | `Tiktok` | `Amazon` | `Etsy`

---

## 6. Image & File Types

### Image Type

| Loại | Mô tả |
|---|---|
| `ProductImage` | Ảnh sản phẩm |
| `ProductDescImage` | Ảnh mô tả sản phẩm |
| `Mockup` | Ảnh mockup sản phẩm |
| `Artwork` | File thiết kế để in |
| `TopupImage` | Ảnh chứng minh nạp tiền |
| `Avatar` | Ảnh đại diện user |

### File Type

| Loại | Mô tả |
|---|---|
| `LabelFile` | File nhãn giao hàng |
| `ExportOrder` | File xuất đơn hàng |
| `ExportPayment` | File xuất thanh toán |
| `ExportTopup` | File xuất nạp tiền |
| `ExportTracking` | File xuất tracking |

---

## 7. Các khái niệm kỹ thuật

| Thuật ngữ | Mô tả |
|---|---|
| **Monorepo** | Toàn bộ codebase (API + Web + packages) nằm chung một repository, quản lý bởi pnpm workspaces + Turborepo |
| **Module** (NestJS) | Đơn vị tổ chức code trong API — mỗi module gồm Controller, Service, Repository, Entity |
| **Entity** | Schema Mongoose, đại diện cho một collection trong MongoDB |
| **DTO** | Data Transfer Object — định nghĩa cấu trúc dữ liệu vào/ra, validate bằng Zod |
| **Guard** | Middleware kiểm tra authentication/authorization trước khi request đến controller |
| **BullMQ** | Job queue dựa trên Redis — xử lý tác vụ nặng bất đồng bộ |
| **RabbitMQ (AMQP)** | Message broker — giao tiếp bất đồng bộ giữa các service |
| **Redis Cache** | Layer cache dùng Redis — tăng tốc truy vấn cho dữ liệu thường xuyên đọc |
| **Cronjob** | Tác vụ chạy định kỳ (ScheduleModule của NestJS) |
| **Barcode** | Mã vạch cho Order (`OD-`) và Line Item (`LI-`) |
| **ERP** | Enterprise Resource Planning — hệ thống quản lý doanh nghiệp bên ngoài, liên kết qua `erpUser`, `erpShopCode`, `erpDepartment` |

---

## 8. Mapping Module → Entity → Collection

| Module | Entity Class | MongoDB Collection (inferred) |
|---|---|---|
| `order` | `OrderEntity` | `orders` |
| `order-item` | `LineItemEntity` | `lineitems` |
| `dropship-order` | `DropShipOrderEntity` | `dropshiporders` |
| `dropship-order-item` | `DropShipLineItemEntity` | `dropshiplineitems` |
| `stock-order` | `StockOrderEntity` | `stockorders` |
| `stock-order-item` | `StockLineItemEntity` | `stocklineitems` |
| `product` | `ProductEntity` | `products` |
| `product-variant` | `ProductVariantEntity` | `productvariants` |
| `category` | `CategoryEntity` | `categories` |
| `provider` | `ProviderEntity` | `providers` |
| `provider-order` | `ProviderOrderEntity` | `providerorders` |
| `store` | `StoreEntity` | `stores` |
| `user` | `UserEntity` | `users` |
| `tracking` | `TrackingEntity` | `trackings` |
| `transaction` | `TransactionEntity` | `transactions` |
| `issue` | `IssueEntity` | `issues` |
| `role` | `RoleEntity` | `roles` |
| `custom-role` | `CustomRoleEntity` | `customroles` |
| `permission` | `PermissionEntity` | `permissions` |
| `notification` | `NotificationEntity` | `notifications` |
| `webhook` | `WebhookEntity` | `webhooks` |
| `export` | `ExportEntity` | `exports` |
| `folder-image` | `FolderEntity` | `folders` |

---

## 9. Viết tắt thường gặp

| Viết tắt | Đầy đủ |
|---|---|
| POD | Print-on-Demand |
| FBA | Fulfillment by Amazon |
| SKU | Stock Keeping Unit |
| CNY | Chinese Yuan (Nhân dân tệ) |
| ERP | Enterprise Resource Planning |
| AMQP | Advanced Message Queuing Protocol |
| JWT | JSON Web Token |
| DTO | Data Transfer Object |
| ERD | Entity Relationship Diagram |
| CRUD | Create, Read, Update, Delete |
| PKD | Phòng Kinh Doanh (Department) |
