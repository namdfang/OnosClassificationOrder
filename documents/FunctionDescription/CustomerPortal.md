# Customer Portal — Function Description

> **File FE:** `apps/web/src/pages/customer/{login,register}/index.tsx`, `apps/web/src/pages/customer/orders/{index,new,track}.tsx`, `apps/web/src/pages/customer/catalog/index.tsx`, `apps/web/src/layouts/customerLayout/CustomerLayout.tsx`, `apps/web/src/store/customerAuthStore.ts`, `apps/web/src/services/customerPortal.ts`
> **File BE:** `apps/api/src/modules/customer-portal/` (`customer-auth.controller.ts`, `customer-order.controller.ts`, `customer-order.service.ts`, `customer-catalog.controller.ts`, `customer-catalog.service.ts`, `customer-portal.module.ts`), `apps/api/src/modules/customer/` (`customer.entity.ts`, `customer.service.ts` → `register()`/`validateLogin()`/`getById()`/`toSafeCustomer()`), `apps/api/src/modules/auth/jwt.strategy.ts` (branch theo `RoleType.Customer`)
> **Route:** `/customer/login`, `/customer/register`, `/customer/orders`, `/customer/orders/new`, `/customer/orders/:productionId`, `/customer/catalog`
> **API:** `POST /v1/customer/auth/register`, `POST /v1/customer/auth/login`, `GET /v1/customer/auth/me`, `POST /v1/customer/orders`, `GET /v1/customer/orders`, `GET /v1/customer/orders/:productionId`, `GET /v1/customer/catalog`

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
- `pages/customer/orders/new.tsx` — form đặt đơn.
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

## 7. Catalog (`/customer/catalog`) — giá tham khảo theo tier

**Chỉ tham khảo** — chưa đổi form đặt đơn (`/customer/orders/new` giữ nguyên
hành vi cũ, không tính tổng tiền). Trang này giúp khách xem thông tin sản
phẩm (mockup, mô tả, biến thể, giá) trước khi tự điền vào form đặt đơn (nút
copy tên sản phẩm qua `CopyButton`).

`CustomerCatalogService.getCatalog()` (`apps/api/src/modules/customer-portal/customer-catalog.service.ts`):
1. Query `ProductConfigEntity` với `variations` không rỗng (chỉ sản phẩm đã
   được enrich đầy đủ mới hiện trong catalog — xem [`Products.md §2.5`](Products.md))
   **VÀ `status=active`** (Inactive/Hidden bị loại khỏi catalog khách hàng —
   xem [`Products.md §2.2`](Products.md); data cũ chưa có field `status` vẫn
   coi như active qua `$in: [Active, null]`), filter thêm `search`/`productCategoryId`
   nếu có. `productCategory` trả về trong response là TÊN đã resolve từ
   `productCategoryId` (populate virtual qua `ProductCategory` module —
   [`Products.md §4`](Products.md)), KHÔNG phải id.
2. Lấy toàn bộ promotion đang active + trong khoảng ngày hiệu lực qua
   `PromotionService.getActiveInDateRange()` ([`Promotion.md`](Promotion.md)).
3. Với mỗi biến thể, dùng `promotionMatches()` + `applyPromotionDiscount()`
   (tái dùng từ `promotion.service.ts`) để tìm promotion cho giá **thấp
   nhất** theo tier của khách (`customer.tier`, VIP 0..5 hoặc `null` = khách
   lẻ), `quantity` mặc định = 1 (trang browse không có input số lượng).

**Bảo mật dữ liệu:** response CHỈ trả `retailPrice`/`discountedPrice`/
`appliedPromotionName` — **tuyệt đối KHÔNG** trả `cost`/`nonShipCost` (giá vốn
nội bộ) ra Customer Portal. Xem `CustomerCatalogVariationZod` trong
`packages/shared/dtos/product-config.dto.ts`.

## 8. Permissions

Không dùng `permission-catalog` nội bộ — gate hoàn toàn bằng
`@Auth([RoleType.Customer])` (role-only, không permission code). Nhân viên
(mọi role khác) không bao giờ truy cập được API `/customer/*` vì `role` trong
JWT không khớp; ngược lại token khách hàng cũng không truy cập được bất kỳ
endpoint nội bộ nào (`RoleType.Customer` không nằm trong role-array của bất
kỳ `@Auth()` nào ở các module khác).
