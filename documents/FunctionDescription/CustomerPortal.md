# Customer Portal — Function Description

> **File FE:** `apps/web/src/pages/customer/{login,register}/index.tsx`, `apps/web/src/pages/customer/orders/{index,new,track}.tsx`, `apps/web/src/pages/customer/catalog/{index,detail}.tsx`, `apps/web/src/layouts/customerLayout/CustomerLayout.tsx`, `apps/web/src/store/customerAuthStore.ts`, `apps/web/src/services/customerPortal.ts`
> **File BE:** `apps/api/src/modules/customer-portal/` (`customer-auth.controller.ts`, `customer-order.controller.ts`, `customer-order.service.ts`, `customer-catalog.controller.ts`, `customer-catalog.service.ts`, `customer-portal.module.ts`), `apps/api/src/modules/customer/` (`customer.entity.ts`, `customer.service.ts` → `register()`/`validateLogin()`/`getById()`/`toSafeCustomer()`), `apps/api/src/modules/auth/jwt.strategy.ts` (branch theo `RoleType.Customer`)
> **Route:** `/customer/login`, `/customer/register`, `/customer/orders`, `/customer/orders/new`, `/customer/orders/:productionId`, `/customer/catalog`, `/customer/catalog/:id`
> **API:** `POST /v1/customer/auth/register`, `POST /v1/customer/auth/login`, `GET /v1/customer/auth/me`, `POST /v1/customer/orders`, `GET /v1/customer/orders`, `GET /v1/customer/orders/:productionId`, `GET /v1/customer/catalog`, `GET /v1/customer/catalog/:id`

---

## 1. Overview

Cổng tự phục vụ cho khách hàng bên ngoài — đăng ký/đăng nhập, đặt đơn (chỉ
thông tin cơ bản), xem tiến trình đơn, xem danh sách đơn của chính mình.
Đây là root router thứ 3 bên cạnh `/adm` (trang dùng chung/quản trị) và
`/ffm` (trang sản xuất) — xem quy ước routing ở đầu `CLAUDE.md`.

Khách hàng **không phải nhân viên** — không có `UserEntity`, không dùng hệ
thống `permissionCodes`/`RolesGuard` theo role nội bộ, và **không thấy** bất
kỳ thông tin sản xuất nào (factory, machine, designer, fulfillment stage...).

## 2. Luồng hoạt động

### 2.1 Tài khoản = bảng `customers` (dùng chung với dedup gán xưởng)

`CustomerEntity` (`apps/api/src/modules/customer/customer.entity.ts`) vốn là
bảng dedup `(userSku, userEmail)` phục vụ tính năng ưu tiên gán xưởng theo
khách (xem [`CustomerFactoryAssignment.md`](CustomerFactoryAssignment.md)).
Thay vì tạo bảng riêng, Customer Portal **dùng chung đúng bảng này** — bổ
sung field `password` (hash, mặc định `''`), `fullName`, `phone`, `status`:

- Record tạo qua **sync** (từ lịch sử `orders`) hoặc **thêm tay** (admin) có
  `password=''` — chỉ là "chỗ giữ sẵn", CHƯA đăng nhập được.
- Khách tự **đăng ký** (`POST /customer/auth/register`) theo đúng
  `(userSku, userEmail)` sẽ **"nhận" (claim) lại** record đã có sẵn đó (set
  password) thay vì tạo trùng; nếu chưa từng có record nào khớp → tạo mới
  với `source: 'register'`. `userSku` không còn bắt buộc — khách đăng ký lần
  đầu (chưa có lịch sử đơn) vẫn tạo được tài khoản với `userSku=''`.
- `password` KHÔNG BAO GIỜ trả ra API (kể cả cho chính khách đó) — mọi read
  path đi qua `CustomerService.toSafeCustomer()` hoặc `.select('-password')`.

### 2.2 Đăng nhập — JWT dùng chung hạ tầng nhân viên

`RoleType.Customer` là 1 giá trị enum mới (`packages/shared/enums/role-type.ts`)
— KHÔNG seed vào collection `roles` (khác các role nhân viên), chỉ dùng làm
discriminator trong JWT payload.

`POST /customer/auth/login` gọi thẳng `AuthService.createAccessToken()` (y hệt
staff login) với `role: RoleType.Customer`. `JwtStrategy.validate()` rẽ nhánh:
`role === Customer` → load từ `CustomerService.getById()` (collection
`customers`) thay vì `UserService.getUserById()` (collection `users`), rồi gắn
`role = { name: RoleType.Customer }` thủ công để `RolesGuard`/`PermissionsGuard`
tái dùng nguyên vẹn — xem chi tiết [`Architecture/Auth_System.md §2.5`](../Architecture/Auth_System.md).
Mọi endpoint Customer Portal gate bằng `@Auth([RoleType.Customer])` — token
nhân viên không bao giờ lọt qua (role không khớp) và ngược lại.

FE giữ token khách hàng ở store **riêng** (`customerAuthStore.ts`, key
persist `customer-auth-store`) — tách biệt hoàn toàn khỏi `authStore.ts`
(nhân viên). `apis/index.tsx` phân luồng token theo URL: request tới
`/customer/...` → lấy token từ `customerAuthStore`, còn lại → `authStore`.

### 2.3 Đặt đơn — chỉ thông tin cơ bản, default sản xuất TÁI DÙNG luồng import

`PlaceCustomerOrderDto` (`packages/shared/dtos/production-order.dto.ts`) chỉ
nhận: `type, color, size, mockupUrl, printMethod, weight/width/height/length,
quantity, designs, referent`. KHÔNG có factory/machine/fabric/toolResult/
designer/fulfillment — các field này được **default tự động giống hệt** lúc
import nội bộ.

`CustomerOrderService.placeOrder()`:
1. Sinh `productionId` mới qua `CounterService.findAndUpdateCounter('customer-portal-order', CounterType.OrderCode)` → format `CUS000001`, `CUS000002`...
2. Gọi thẳng `OrderService.importOrders({ rows: [row] }, ctx)` — TÁI DÙNG map
   ProductConfig theo `type`, ưu tiên gán xưởng theo khách
   (`customer-assignment`), xử lý `designs`... y hệt luồng import file Excel
   nội bộ, thay vì viết lại logic default riêng.
3. Đọc lại đơn vừa tạo, chỉ trả field cơ bản (`CustomerOrderSummary`).

### 2.4 Xem đơn / theo dõi tiến trình — SCOPE theo (userSku, userEmail)

`GET /customer/orders` và `GET /customer/orders/:productionId` luôn filter
`{ userSku: customer.userSku, userEmail: customer.userEmail }` — khách chỉ
thấy đơn của chính mình. Tiến trình đơn tái dùng thẳng
`OrderService.getLifecycleTrack()` (phễu 8 chặng đã có sẵn cho
Dashboard/OrderLifecycle — xem [`OrderLifecycle.md`](OrderLifecycle.md)), sau
khi đã xác nhận đơn thuộc về khách hàng đang đăng nhập.

## 3. API / Schema

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/v1/customer/auth/register` | public | Đăng ký / claim tài khoản |
| POST | `/v1/customer/auth/login` | public | Đăng nhập → JWT `role=Customer` |
| GET | `/v1/customer/auth/me` | `@Auth([Customer])` | Thông tin tài khoản hiện tại |
| POST | `/v1/customer/orders` | `@Auth([Customer])` | Đặt đơn mới (thông tin cơ bản) |
| GET | `/v1/customer/orders` | `@Auth([Customer])` | Danh sách đơn của khách (phân trang) |
| GET | `/v1/customer/orders/:productionId` | `@Auth([Customer])` | Tiến trình 1 đơn (scope theo khách) |
| GET | `/v1/customer/catalog` | `@Auth([Customer])` | Danh sách sản phẩm + giá tham khảo (đã áp discount theo tier) — xem §7 |
| GET | `/v1/customer/catalog/:id` | `@Auth([Customer])` | 1 sản phẩm — trang chi tiết `/customer/catalog/:id` trước khi đặt đơn — xem §7 |

Schema `customers` (mở rộng — xem [`CustomerFactoryAssignment.md §3`](CustomerFactoryAssignment.md)):
```ts
{ userSku: string;   // '' nếu chưa có lịch sử đơn
  userEmail: string;
  source: 'sync' | 'manual' | 'register';
  password: string;  // '' = chưa đăng ký/claim
  fullName: string;
  phone: string;
  status: Status;    // Active mặc định
}
```

## 4. UI Components

- `pages/customer/login`, `pages/customer/register` — form shadcn/ui
  (`@/components/ui/*`), cùng phong cách với `pages/login` nhân viên (KHÔNG
  dùng Ant Design cho khu vực auth/portal độc lập này — theo đúng precedent
  đã có ở trang login nhân viên).
- `layouts/customerLayout/CustomerLayout.tsx` — header tối giản (logo + nút
  "Đặt đơn mới" + email khách + đăng xuất), KHÔNG dùng `Sidebar`/`MainLayout`
  của khu vực nhân viên.
- `pages/customer/orders/index.tsx` — bảng danh sách đơn (shadcn `Table`).
- `pages/customer/orders/new.tsx` — form đặt đơn. **2 chế độ** dựa vào `location.state` (điều hướng từ `CustomerCatalogDetail.handleNewOrder`, xem §7):
  - **Từ catalog** (`state.fromCatalog === true`): ẩn các field tự gõ tay (`type`/`color`/`size`/`mockupUrl`/`printMethod` — LẤY SẴN từ `state`, không hiện lại trên form), hiện card tóm tắt sản phẩm đã chọn (mockup + tên + màu/size + SKU + giá, nút "Đổi sản phẩm khác" quay lại `/customer/catalog`) + chỉ còn nhập **thông tin cần thiết**: số lượng, 1 ô link thiết kế (Drive URL) cho MỖI vị trí in trong `state.printArea` (field `designs.<key>` — key khớp `ProductPrintAreaKey`/`DesignFieldsZod`), ghi chú.
  - **Trực tiếp** (vào thẳng `/customer/orders/new`, không qua catalog): giữ nguyên form tự do cũ (`type`/`color`/`size`/`quantity`/`mockupUrl`/`printMethod`/ghi chú) — khách gõ tay tên sản phẩm không có trong catalog.
- `pages/customer/orders/track.tsx` — stepper dọc hiển thị `LifecycleTrack.stages`.

## 5. Backend logic

Xem `apps/api/src/modules/customer-portal/customer-order.service.ts` — toàn
bộ default sản xuất đi qua `OrderService.importOrders()`, KHÔNG duplicate
logic map ProductConfig / ưu tiên gán xưởng theo khách ở đây.

`apps/api/src/modules/customer/customer.service.ts` — `register()`,
`validateLogin()`, `getById()`, `toSafeCustomer()` (helper strip password,
dùng ở MỌI response trả `Customer` ra ngoài, kể cả `list()`/`create()` của
tính năng gán xưởng theo khách).

## 6. Performance notes

Chưa có ghi nhận benchmark riêng — tái dùng nguyên vẹn pipeline `importOrders`
(đã tối ưu cho import hàng loạt) cho trường hợp 1-đơn/lần nên chi phí không
đáng kể so với luồng import nội bộ hiện có.

## 7. Catalog (`/customer/catalog`, `/customer/catalog/:id`) — xem sản phẩm + đặt đơn theo biến thể

Khách xem danh sách sản phẩm (giá tham khảo theo tier) → bấm vào 1 sản phẩm →
trang chi tiết (layout gallery trái/thông tin phải, giống trang sản phẩm
catalog thương mại điện tử) → chọn biến thể (màu/size...) → bấm **"Đặt đơn
mới"** → điều hướng sang `/customer/orders/new` với sản phẩm/biến thể đã chọn
đóng gói sẵn qua `location.state` (xem §4) — khách chỉ cần nhập số lượng +
link thiết kế theo từng vị trí in + ghi chú, KHÔNG phải tự gõ lại tên sản
phẩm/màu/size. Đặt đơn trực tiếp (không qua catalog) vẫn dùng form tự do cũ.

`CustomerCatalogService` (`apps/api/src/modules/customer-portal/customer-catalog.service.ts`)
dùng chung 1 hàm `mapRow()` (map `ProductConfigEntity` → `CustomerCatalogItem`
+ áp discount theo tier) cho cả 2 API:

1. `getCatalog()` — danh sách, phân trang.
2. `getCatalogItem()` — 1 sản phẩm theo `_id`, dùng cho trang chi tiết
   `/customer/catalog/:id`. 404 nếu không khớp filter hiển thị bên dưới.

**Filter hiển thị (cả 2 API):** `ProductConfigEntity` với `variations` không
rỗng (chỉ sản phẩm đã được enrich đầy đủ mới hiện trong catalog — xem
[`Products.md §2.5`](Products.md)) **VÀ `status=active`** (Inactive/Hidden bị
loại khỏi catalog khách hàng — xem [`Products.md §2.2`](Products.md); data cũ
chưa có field `status` vẫn coi như active qua `$in: [Active, null]`).
`getCatalog()` filter thêm `search`/`productCategoryId` nếu có. `productCategory`
trả về trong response là TÊN đã resolve từ `productCategoryId` (populate
virtual qua `ProductCategory` module — [`Products.md §4`](Products.md)), KHÔNG
phải id.

Với mỗi biến thể, dùng `promotionMatches()` + `applyPromotionDiscount()` (tái
dùng từ `promotion.service.ts`) để tìm promotion đang active + trong khoảng
ngày hiệu lực (`PromotionService.getActiveInDateRange()`,
[`Promotion.md`](Promotion.md)) cho giá **thấp nhất** theo tier của khách
(`customer.tier`, VIP 0..5 hoặc `null` = khách lẻ), `quantity` mặc định = 1.

**Bảo mật dữ liệu:** response CHỈ trả `retailPrice`/`discountedPrice`/
`appliedPromotionName` — **tuyệt đối KHÔNG** trả `cost`/`nonShipCost` (giá vốn
nội bộ) ra Customer Portal. Xem `CustomerCatalogVariationZod` trong
`packages/shared/dtos/product-config.dto.ts`.

### 7.1 Trang chi tiết (`pages/customer/catalog/detail.tsx`)

- Gallery trái: `mockup` làm ảnh chính, `sizeChartUrl` (nếu có) làm ảnh phụ —
  strip thumbnail chỉ hiện khi có ≥2 ảnh (data hiện tại tối đa 2: mockup +
  size chart, KHÔNG có field gallery nhiều ảnh trong `ProductConfigZod`).
- Panel phải: breadcrumb (Home › Danh mục › tên sản phẩm), badge `printMethod`,
  giá (ưu tiên `discountedPrice`, gạch ngang `retailPrice` nếu có giảm), SKU
  của biến thể đang chọn, bộ chọn thuộc tính, vị trí in (`printArea[].label`),
  mô tả, nút "Đặt đơn mới", nút tải bảng size (nếu có `sizeChartUrl`).
- **Bộ chọn thuộc tính (màu/size...):** `attributes` của từng biến thể là
  key-value tự do (`label`/`value`, xem `Products.md §2.5`) — FE **gom nhóm
  theo `label`** (giữ thứ tự xuất hiện đầu tiên), mỗi label → danh sách
  `value` duy nhất. Label chỉ có **đúng 1 giá trị** (VD "Colour: As Design")
  → hiện badge tĩnh (không chọn được, đúng như ảnh mẫu "COLORS: AS DESIGN").
  Label có **≥2 giá trị** → hiện dạng nút chọn (VD "SIZES: S/M/L/XL/...").
  Chọn đủ tổ hợp → tìm biến thể khớp CHÍNH XÁC mọi `label`/`value` đã chọn
  (`findMatchingVariation`) để lấy SKU/giá hiển thị.
- **Nút "Đặt đơn mới"** (`handleNewOrder`) điều hướng sang
  `PATHS.CUSTOMER_ORDER_NEW` kèm `location.state`:
  `{ fromCatalog: true, productId, fullName, mockupUrl, printMethod, printArea, sku, color, size, attributes, price }`.
  `color`/`size` được đoán từ `attributes` đã chọn qua `pickColorSize()` —
  match `label` chứa "color"/"colour"/"màu" → `color`, chứa "size"/"cỡ" →
  `size` (heuristic, vì `label` tự do không có key cố định "color"/"size").

### 7.2 API `GET /v1/customer/catalog/:id`

`GetCustomerCatalogItemResDto` (`packages/shared/dtos/product-config.dto.ts`)
— `data: CustomerCatalogItemZod` (KHÔNG nullable, 404 nếu không tìm thấy/không
active/không có biến thể — khác `getCatalog()` trả mảng có thể rỗng).

## 8. Permissions

Không dùng `permission-catalog` nội bộ — gate hoàn toàn bằng
`@Auth([RoleType.Customer])` (role-only, không permission code). Nhân viên
(mọi role khác) không bao giờ truy cập được API `/customer/*` vì `role` trong
JWT không khớp; ngược lại token khách hàng cũng không truy cập được bất kỳ
endpoint nội bộ nào (`RoleType.Customer` không nằm trong role-array của bất
kỳ `@Auth()` nào ở các module khác).
