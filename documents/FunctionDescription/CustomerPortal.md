# Customer Portal — Function Description

> **File FE:** `apps/web/src/pages/customer/{login,register}/index.tsx`, `apps/web/src/pages/customer/dashboard/index.tsx`, `apps/web/src/pages/customer/orders/{index,new,track}.tsx`, `apps/web/src/pages/customer/catalog/{index,detail}.tsx`, `apps/web/src/layouts/customerLayout/CustomerLayout.tsx`, `apps/web/src/store/customerAuthStore.ts`, `apps/web/src/services/customerPortal.ts`, `apps/web/src/components/customer/CatalogProductCard.tsx`, `apps/web/src/components/common/FileUrlOrUploadInput.tsx`, `apps/web/src/pages/landing/index.tsx` (logo/link về `PATHS.LANDING`, đã bỏ text "OnosFactory")
> **File BE:** `apps/api/src/modules/customer-portal/` (`customer-auth.controller.ts`, `customer-order.controller.ts`, `customer-order.service.ts`, `customer-catalog.controller.ts`, `customer-catalog.service.ts`, `customer-portal.module.ts`), `apps/api/src/modules/customer/` (`customer.entity.ts`, `customer.service.ts` → `register()`/`validateLogin()`/`getById()`/`toSafeCustomer()`), `apps/api/src/modules/auth/jwt.strategy.ts` (branch theo `RoleType.Customer`)
> **Route:** `/customer/login`, `/customer/register`, `/customer/dashboard`, `/customer/orders`, `/customer/orders/new`, `/customer/orders/:productionId`, `/customer/catalog`, `/customer/catalog/:id`
> **API:** `POST /v1/customer/auth/register`, `POST /v1/customer/auth/login`, `GET /v1/customer/auth/me`, `POST /v1/customer/orders`, `GET /v1/customer/orders`, `GET /v1/customer/orders/product-types`, `GET /v1/customer/orders/dashboard`, `GET /v1/customer/orders/:productionId`, `PATCH /v1/customer/orders/:productionId`, `GET /v1/customer/catalog`, `GET /v1/customer/catalog/facets`, `GET /v1/customer/catalog/:id`

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
- **`passwordSource` (`AUTH-1`)** — `'self' | 'system'`, cũng **không bao giờ**
  trả ra API. Cần vì tính năng mạo danh đặt mật khẩu mặc định cho tài khoản chưa
  có mật khẩu, mà luồng claim ở trên lại dựa **đúng vào field đó** để biết "đã
  đăng ký hay chưa": nếu không phân biệt thì mạo danh một lần là khách **vĩnh
  viễn** không tự đăng ký được. `'system'` → `register()` **vẫn cho** chính chủ
  claim đè; `'self'`/thiếu field → từ chối như cũ. Bảng đầy đủ + hai điều cấm
  (không so giá trị mật khẩu, không lộ field ra API): [`Auth.md §10.6`](Auth.md).

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

### 2.3 Đặt đơn — staging PENDING 2 pha (xem `CustomerOrderIntake.md`)

> **ĐÃ ĐỔI KIẾN TRÚC:** từ đợt Customer Order Intake, `placeOrder()` KHÔNG gọi
> `importOrders()` nữa. Đơn form/CSV vào **staging `customer_orders`**
> (Pending — 1 document = 1 đơn nhiều item + 1 địa chỉ chung); khách tick chọn
> → **Push to production** (chốt giá + ledger `customer_payments`) mới nổ ra
> mỗi item 1 `OrderEntity` qua `importOrders()`. Listing `/customer/orders`
> giờ 8 tab trạng thái derive at read-time + badge On Hold/Rework. Chi tiết
> đầy đủ (CSV template cũ, idempotency `(customerId, orderKey)`, backfill
> Luồng A): [`CustomerOrderIntake.md`](CustomerOrderIntake.md).

`PlaceCustomerOrderDto` (`packages/shared/dtos/production-order.dto.ts`) giữ
nguyên input `{ items[], shippingAddress, referent? }` — response giờ là
`CustomerStagingOrderResDto` (1 staging order, chưa có `productionId`).
`productionId` chỉ sinh lúc push qua `generateUniqueProductionId()` (§2.3.1).

#### 2.3.1 Format `productionId` tự sinh — khớp pattern mã đơn thật

Trước đây dùng counter tuần tự (`CUS000001`, `CUS000002`...). Giờ sinh NGẪU
NHIÊN theo đúng pattern `^[A-Z]{2}-\d{5}-\d{5}$` mà hệ thống chính dùng (2 chữ
cái bất kỳ A-Z, không cố định) — CÙNG regex `CUTTING_FILE_PRODUCTION_ID_REGEX`
(`production-order.dto.ts`) dùng để parse mã đơn từ tên file cutting. Đặt đơn
qua Customer Portal giờ tương thích với MỌI logic parse/regex theo pattern
này (vd auto-match cutting file) thay vì bị bỏ sót do khác format.

### 2.4 Xem đơn / theo dõi tiến trình — SCOPE theo (userSku, userEmail)

`GET /customer/orders` và `GET /customer/orders/:productionId` luôn filter
`{ userSku: customer.userSku, userEmail: customer.userEmail }` — khách chỉ
thấy đơn của chính mình. Listing hỗ trợ thêm 2 query filter
(`GetCustomerOrdersZod`): `search` (mã đơn — regex chứa, case-insensitive,
escape regex) + `type` (sản phẩm — match CHÍNH XÁC; option lấy từ
`GET /customer/orders/product-types` = distinct `type` các đơn của khách).
2 route static `product-types`/`dashboard` khai báo TRƯỚC `:productionId`
trong controller (Nest match theo thứ tự khai báo). Tiến trình 1 đơn (`track.tsx`) tái dùng thẳng
`OrderService.getLifecycleTrack()` (phễu 8 chặng đã có sẵn cho
Dashboard/OrderLifecycle — xem [`OrderLifecycle.md`](OrderLifecycle.md)), sau
khi đã xác nhận đơn thuộc về khách hàng đang đăng nhập.

**Listing (`orders/index.tsx`) — rút gọn chặng hiện tại, KHÔNG N+1:**
`CustomerOrderSummaryZod` có thêm `inProductionAt`/`currentStageLabel`/
`currentStageAt`/`completed` — tính ngay trong `CustomerOrderService.toSummary()`
qua hàm thuần `computeCurrentStage()` (cùng file), MIRROR nhánh tính
`currentIndex` của `OrderService.getLifecycleTrack()` nhưng chỉ trả 1
label/mốc rút gọn (không trả mảng 8 chặng như track) — field thô cần thiết
(`toolResultNote`, `currentFulfillmentStage`, `fulfillmentStages`...) đã nằm
sẵn trong `CUSTOMER_ORDER_FIELDS` nên KHÔNG cần query thêm cho từng đơn. Đổi
logic chặng ở 1 nơi (`getLifecycleTrack` hoặc `computeCurrentStage`) phải soát
lại nơi còn lại. Nhãn chặng dùng riêng `CUSTOMER_STAGE_LABELS` (khách-hoá,
không lộ thuật ngữ nội bộ như `sew-in`/`sew-out`).

### 2.5 Khách tự sửa đơn ĐÃ đặt — mockup/design/địa chỉ ship

Trang chi tiết đơn (`track.tsx`, `/customer/orders/:productionId`) — ngoài
timeline — có form sửa NGAY DƯỚI, ẩn nếu đơn đã hủy (`order.cancelledAt`):

- **Ảnh mockup** (`mockupUrl`) — ảnh khách TỰ CUNG CẤP để xưởng sản xuất,
  KHÔNG phải ảnh mẫu catalog. Đặt đơn mới (`orders/new.tsx`) — chọn sản phẩm
  KHÔNG tự động điền `mockupUrl` từ `product.mockup` (đã bỏ default cũ), ô để
  trống buộc khách tự dán URL — cùng lý do, **BẮT BUỘC** phải điền mockup +
  ĐỦ design cho MỌI vị trí in mới cho phép bấm "Thêm vào đơn hàng"
  (`canAddToCart` check trong `new.tsx`, nút disabled nếu thiếu).
- **Design theo từng vị trí in** — số ô + nhãn PHỤ THUỘC `printArea[]` của
  sản phẩm (`ProductConfigZod`), KHÔNG cố định. Trang chi tiết resolve sản
  phẩm qua `CustomerOrderSummary.productConfigId` → gọi
  `GET /customer/catalog/:id` lấy `printArea[]` → render 1 `FileUrlOrUploadInput`
  cho mỗi vị trí, prefill từ `order.designs[key]` hiện có.
- **Địa chỉ ship** — sửa lại TOÀN BỘ `shippingAddress` (cùng field set với
  lúc đặt đơn — xem §2.3), PATCH sẽ ghi đè nguyên object.
- `CustomerOrderService.updateOrder()`: scope theo (productionId, userSku,
  userEmail) của khách đang đăng nhập, 404 nếu không khớp, chặn 400 nếu đơn
  đã hủy. `designs` gửi lên MERGE với `designs` cũ (chỉ ghi đè key được gửi,
  giữ nguyên vị trí in khác chưa đổi) — khớp UI sửa từng ô riêng lẻ, không
  bắt gửi lại toàn bộ.

### 2.6 Trang "Tài khoản của tôi" (`/customer/account`)

`apps/web/src/pages/customer/account/index.tsx` (route `PATHS.CUSTOMER_ACCOUNT`,
entry "Tài khoản" trên header `CustomerLayout.tsx`):

- Khối **Hồ sơ**: email + userSku read-only (khóa định danh — Admin cũng không
  sửa được, xem `Customers.md`), tự sửa `fullName`/`phone` →
  `PATCH /customer/auth/me` (`UpdateCustomerMeDto`) → cập nhật
  `customerAuthStore.profile`.
- Khối **Đổi mật khẩu**: nhập mật khẩu hiện tại + mật khẩu mới ×2 →
  `POST /customer/auth/change-password` (`ChangeCustomerPasswordDto`,
  validate `validateHash` mật khẩu cũ, sai → 400).
- **Quên mật khẩu**: CHƯA có gửi email — quy trình hiện tại là khách liên hệ →
  Admin reset ở trang `/adm/customers` (2 chế độ, xem `Customers.md` §4).
- Giao diện khách nằm TRỌN trong `CustomerLayout` (header/menu riêng) — ranh
  giới bắt buộc: KHÔNG dùng bất kỳ component layout xưởng nào; BE chặn cứng
  role Customer khỏi mọi API ngoài prefix `customer/...`
  (RolesGuard — xem `Customers.md` §6).

### 2.7 Dashboard (`/customer/dashboard`) — trang mặc định sau đăng nhập

`pages/customer/dashboard/index.tsx` (route `PATHS.CUSTOMER_DASHBOARD`; index
`/customer` redirect về đây). Gọi 1 API `GET /customer/orders/dashboard`
(`GetCustomerDashboardResDto`, `CustomerDashboardZod`):

- **4 KPI card**: Tổng đơn / Đang sản xuất / Hoàn thành / Đã hủy.
  `CustomerOrderService.getDashboard()` đếm bằng 3 `countDocuments` song song
  (scope (userSku, userEmail)): `cancelled` = có `cancelledAt`; `completed` =
  có `fulfillmentCompletedAt` VÀ chưa hủy; `processing` = phần còn lại.
- **Bảng "Đơn gần đây"**: 5 đơn mới nhất (`recentOrders`, sort `createdAt`
  desc) — mã đơn (link + `CopyButton`) + sản phẩm + SL + badge trạng thái +
  ngày đặt, link "Xem tất cả đơn".
- **Quick action**: nút Đặt đơn mới + Sản phẩm (catalog).

## 3. API / Schema

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/v1/customer/auth/register` | public | Đăng ký / claim tài khoản |
| POST | `/v1/customer/auth/login` | public | Đăng nhập → JWT `role=Customer` |
| GET | `/v1/customer/auth/me` | `@Auth([Customer])` | Thông tin tài khoản hiện tại |
| PATCH | `/v1/customer/auth/me` | `@Auth([Customer])` | Khách tự sửa hồ sơ (`fullName`/`phone`) — xem §2.6 |
| POST | `/v1/customer/auth/change-password` | `@Auth([Customer])` + Throttle 10/15' | Khách tự đổi mật khẩu (bắt buộc mật khẩu cũ) — xem §2.6 |
| POST | `/v1/customer/orders` | `@Auth([Customer])` | Đặt đơn mới (thông tin cơ bản) |
| GET | `/v1/customer/orders` | `@Auth([Customer])` | Danh sách đơn của khách (phân trang + `search` mã đơn + `type` sản phẩm — xem §2.4) |
| GET | `/v1/customer/orders/product-types` | `@Auth([Customer])` | Distinct sản phẩm khách đã đặt — option filter listing |
| GET | `/v1/customer/orders/dashboard` | `@Auth([Customer])` | Dashboard: `totals` (total/processing/completed/cancelled) + 5 đơn mới nhất — xem §2.7 |
| GET | `/v1/customer/orders/:productionId` | `@Auth([Customer])` | Tiến trình 1 đơn (scope theo khách) |
| PATCH | `/v1/customer/orders/:productionId` | `@Auth([Customer])` | Sửa mockup/design/địa chỉ ship đơn ĐÃ đặt (chặn nếu đơn đã hủy) — xem §2.5 |
| GET | `/v1/customer/catalog` | `@Auth([Customer])` | Danh sách sản phẩm + giá tham khảo (đã áp discount theo tier) — xem §7 |
| GET | `/v1/customer/catalog/:id` | `@Auth([Customer])` | 1 sản phẩm — trang chi tiết `/customer/catalog/:id` trước khi đặt đơn — xem §7 |

`CustomerOrderSummaryZod` (`packages/shared/dtos/production-order.dto.ts`) —
field cơ bản (`productionId`/`type`/`color`/`size`/`quantity`/`mockupUrl`/
`status`/`orderAt`/`cancelledAt`/`cancelReason`/`createdAt`) + field rút gọn
tiến trình dùng cho listing: `inProductionAt`, `currentStageLabel`,
`currentStageAt`, `completed` (xem §2.4). Cùng file:
`GetCustomerOrdersZod` (+ `search`/`type`),
`GetCustomerOrderProductTypesResDto` (data: string[]),
`CustomerDashboardZod`/`GetCustomerDashboardResDto` (xem §2.7).

Schema `customers` (mở rộng — xem [`CustomerFactoryAssignment.md §3`](CustomerFactoryAssignment.md)):
```ts
{ userSku: string;   // '' nếu chưa có lịch sử đơn
  userEmail: string;
  source: 'sync' | 'manual' | 'register';
  password: string;  // '' = chưa đăng ký/claim
  fullName: string;
  phone: string;
  status: Status;    // Active mặc định
  deletedAt?: Date;  // xóa mềm từ /adm/customers — chặn login + ẩn mọi list (Customers.md)
}
```

## 4. UI Components

- `pages/customer/login`, `pages/customer/register` — form shadcn/ui
  (`@/components/ui/*`), cùng phong cách với `pages/login` nhân viên (KHÔNG
  dùng Ant Design cho khu vực auth/portal độc lập này — theo đúng precedent
  đã có ở trang login nhân viên). Logo (link về `PATHS.LANDING`) + form. Trang
  login **tự chuyển hướng sang `/customer/orders`** nếu `customerAuthStore`
  đã có token còn hạn (`isAuthenticated()`, check 1 lần lúc mount) — khỏi bắt
  đăng nhập lại khi khách quay lại URL login.
- `layouts/customerLayout/CustomerLayout.tsx` — **header giữ nguyên** (logo +
  nút "Danh mục"/"Đặt đơn mới"/"Tài khoản" + email khách + chuông + đổi ngôn
  ngữ + đăng xuất) + **sidebar điều hướng BÊN TRÁI** (desktop `md:` trở lên,
  `w-56` border-right, `NavLink` active `bg-primary/10 text-primary`): 3 entry
  Dashboard (`end` match exact) / Quản lý đơn / Sản phẩm (catalog), build qua
  `buildNavItems(t)` (`useMemo` — quy tắc i18n label map), kèm nút "Đặt đơn
  mới" dưới cùng. Mobile (`<md`): sidebar thu thành **thanh nav ngang** (chip
  pill, scroll ngang) ngay dưới header. Container nới `max-w-7xl` (thêm cột
  sidebar), main `flex-1 min-w-0`. KHÔNG dùng `Sidebar`/`MainLayout` của khu
  vực nhân viên.
- `pages/customer/dashboard/index.tsx` — xem §2.7.
- `pages/customer/orders/index.tsx` — listing dạng **BẢNG** (shadcn `Table`,
  không phải card): toolbar **search theo mã đơn** (Enter/blur mới apply, icon
  Search) + **select lọc theo sản phẩm** (option từ `GET /customer/orders/product-types`,
  native select) + nút "Xóa bộ lọc" (chỉ hiện khi có filter; empty-state khi
  filter không khớp cũng có nút này thay vì "Đặt đơn đầu tiên"); mỗi hàng =
  ảnh mockup thumb + mã đơn (link + **`CopyButton`** copy productionId) +
  sản phẩm/màu-size + SL + badge chặng hiện tại/trạng thái + ngày đặt + ngày
  vào sản xuất + link "Xem chi tiết", phân trang (`PaginationBar`,
  `GET /customer/orders?page&limit&search&type` — đổi filter reset `page=1`).
  Click mã đơn/"Xem chi tiết" → `track.tsx` (chi tiết + timeline + sửa đơn).
- `pages/customer/orders/new.tsx` — form đặt đơn dạng **GIỎ HÀNG** (nhiều sản
  phẩm/1 địa chỉ ship — xem §2.3), **CHỈ chọn từ catalog** (đã bỏ chế độ nhập
  tay "Không tìm thấy sản phẩm? Nhập tay" — khách bắt buộc chọn sản phẩm có sẵn):
  - State `product` (sản phẩm ĐANG cấu hình, chưa thêm vào giỏ) tách biệt
    `cart: CartItem[]` (đã "Thêm vào đơn hàng").
  - **Bộ chọn sản phẩm** (`!product`): lưới ĐẦY ĐỦ sản phẩm (không giới hạn
    vài kết quả) dùng chung `components/customer/CatalogProductCard.tsx` với
    trang Danh mục, có ô tìm kiếm (debounce 300ms) + phân trang
    (`PaginationBar`) — gọi cùng `GET /customer/catalog`.
  - **Chọn sản phẩm xong** (cột trái): card sản phẩm + bộ chọn biến thể
    (màu/size...) + **ảnh mockup** (`mockupUrl`, để TRỐNG mặc định — KHÔNG lấy
    `product.mockup`, vì đây là ảnh khách TỰ CUNG CẤP để sản xuất, không phải
    ảnh mẫu catalog) + link thiết kế cho MỖI vị trí in (`designs.<key>`, cả 2
    qua `FileUrlOrUploadInput`) + số lượng. **Bắt buộc điền mockup + ĐỦ design
    mọi vị trí in** mới bấm được **"Thêm vào đơn hàng"** (`canAddToCart` check,
    nút disabled nếu thiếu — xem §2.5) — đẩy vào `cart`, quay lại bộ chọn sản
    phẩm để thêm tiếp (KHÔNG submit ngay).
  - **Cột phải (sticky, LUÔN hiện)**: card "Sản phẩm trong đơn (N)" — mỗi item
    hiện thumb mockup lớn + tên/biến thể/SL + DANH SÁCH link design đã điền
    (nhãn theo `printAreaLabels` snapshot lúc thêm vào giỏ) + nút xóa + tạm
    tính → card "Địa chỉ giao hàng" DÙNG CHUNG cho cả giỏ (field khớp
    `ProductionOrderShippingAddressZod`: First/Last name, Company, Phone,
    Email, Address 1/2, City, State, Postcode, Country — bắt buộc
    `firstName`/`phone`/`address1`/`city`, đánh dấu `*` thay vì text "(không
    bắt buộc)" cho các field còn lại) → card ghi chú + nút **"Đặt đơn (N sản
    phẩm)"** (`type="submit"` của `<Form>` bao ngoài toàn bộ 2 cột — validate
    qua `react-hook-form`, chỉ field địa chỉ ship nằm trong schema
    `zodResolver`; field sản phẩm quản lý tay qua `cart` state).
  - 1 lần bấm "Đặt đơn" gọi `RepositoryRemote.customerOrder.placeOrder({ items: cart.map(...), shippingAddress, referent })`
    — **1 API call cho TOÀN BỘ giỏ hàng**, trả về mảng `CustomerOrderSummary[]`
    (nhiều mã đơn, hiện trong toast `success`).
  - **Đòi mockup + design ở HAI TẦNG (ORD-22).** Giao diện chặn `canAddToCart`
    khi thiếu mockup hoặc thiếu design ở vị trí in bắt buộc; **máy chủ kiểm
    lại** trong `placeOrder()` → `assertArtworkComplete()`. Luật giống hệt nhau:
    **`isRequired !== false`** (vị trí không set cờ coi như bắt buộc). Sản phẩm
    chưa cấu hình vị trí in nào thì chỉ đòi mockup.
    Vì sao phải có tầng máy chủ: giao diện không phải hàng rào — một lần sửa
    điều kiện chặn ở `new.tsx` là đơn rỗng lọt vào, đi tiếp sang sản xuất, và
    **tới tận xưởng** mới lộ ra là không có gì để in, lúc đó đã chiếm mã đơn và
    đã vào hàng đợi soát tool. Thông báo lỗi song ngữ, nêu đúng tên vị trí in
    còn thiếu kèm key gốc (`Mặt trước (front)`). Khoá bằng
    `apps/api/src/modules/customer-portal/place-order-artwork.spec.ts`.
    Hai đường khác KHÔNG kiểm ở bước tạo — **cố ý**: Public Order API
    (`POST /v1/open-api/orders`) đi `importOrdersCsv()`, và `updateStagingOrder()`
    dựng lại items từ DTO mà không kiểm (đơn Pending là **vùng nháp**, khách
    được lưu dở rồi bổ sung sau). Cả hai được chặn ở **cửa cuối** là bước đẩy
    sản xuất — xem `CustomerOrderIntake.md` §2.2 "Cửa cuối về file thiết kế
    (ORD-25)".
  - `components/common/FileUrlOrUploadInput.tsx` — input dùng cho MỌI field
    kiểu file (mockup + design) ở Customer Portal: ô dán URL + nút "Tải file
    lên" **disabled** (chưa có storage backend, hover hiện tooltip giải thích
    — KHÔNG có caption tĩnh dưới field, tránh rối UI).
- `pages/customer/catalog/index.tsx` — lưới sản phẩm `CatalogProductCard`
  (2/3/4 cột theo breakpoint), search debounce, đếm kết quả, phân trang.
- `pages/customer/orders/track.tsx` — trang **CHI TIẾT 1 đơn**
  (`/customer/orders/:productionId`): header (mã đơn + trạng thái) → stepper
  dọc `LifecycleTrack.stages` → card **"Chỉnh sửa đơn hàng"** (ẩn nếu đơn đã
  hủy — xem §2.5) sửa mockup/design (resolve `printArea[]` qua
  `productConfigId` → `GET /customer/catalog/:id`)/địa chỉ ship, nút "Lưu thay
  đổi" gọi `PATCH /customer/orders/:productionId` rồi refetch.

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
đóng gói sẵn qua `location.state` (xem §4). Vào thẳng `/customer/orders/new`
KHÔNG qua catalog → hiện bộ chọn sản phẩm dạng lưới đầy đủ (cùng
`CatalogProductCard`) ngay trên trang — khách LUÔN chọn từ danh mục có sẵn,
không còn đường nhập tay sản phẩm ngoài danh mục.

`CustomerCatalogService` (`apps/api/src/modules/customer-portal/customer-catalog.service.ts`)
dùng chung 1 hàm `mapRow()` (map `ProductConfigEntity` → `CustomerCatalogItem`
+ áp discount theo tier) cho cả 2 API:

1. `getCatalog()` — danh sách, phân trang.
2. `getCatalogItem()` — 1 sản phẩm theo `_id`, dùng cho trang chi tiết
   `/customer/catalog/:id`. 404 nếu không khớp filter hiển thị bên dưới.
3. `getFacets()` — bộ lọc duyệt catalog (KHÔNG dùng `mapRow`): danh mục +
   collection đang `isActive` kèm số sản phẩm khách thấy được (aggregate
   `$group` theo `productCategoryId` / `$unwind collectionIds`, cùng filter
   hiển thị), chỉ trả mục count > 0. Route `GET /customer/catalog/facets`
   khai báo **TRƯỚC** `GET :id` trong controller (route param sẽ nuốt path).

**Filter hiển thị (cả 2 API):** CHỈ `status=active` (Inactive/Hidden bị loại
khỏi catalog khách hàng — xem [`Products.md §2.2`](Products.md); data cũ chưa có
field `status` vẫn coi như active qua `$in: [Active, null]`).

**Ảnh sản phẩm — luôn đọc `mockupLarge` trước, `mockup` chỉ là bậc dự phòng.**
`mapRow()` trả 2 URL: `mockup` (đúng giá trị trong DB — với ảnh crawl từ
onospod là bản thumbnail `-100x100`, hiện nhòe trong ô ~300px) và `mockupLarge`
(ảnh gốc full-size dẫn xuất qua `toFullSizeImageUrl()`). Mọi nơi hiển thị phải
dự phòng đủ 3 bậc `mockupLarge` → `mockup` → ảnh mặc định, vì ảnh gốc có thể đã
bị xóa khỏi onospod trong khi thumbnail vẫn còn. Lý do đầy đủ + trường hợp biên:
[`Catalog.md §5.1`](Catalog.md).

Phía FE, 3 bậc đó do `components/customer/CatalogProductCard.tsx` dựng qua hook
dùng chung `hooks/useImageFallback.ts` (cùng hook với thẻ catalog public). Thẻ
này **trước đây không có `onError` nào** nên `mockup` hỏng để lại icon ảnh vỡ của
trình duyệt — bậc cuối (`ImageIcon` trên nền `bg-muted`) là thứ bịt lỗ đó. Thẻ
dùng chung với bộ chọn sản phẩm ở "Đặt đơn mới" nên cả 2 nơi cùng hưởng.

> ⚠️ Filter này **không** đòi sản phẩm phải có `variations`. Bản đầu có thêm
> `variations: { $exists: true, $ne: [] }` với ý "chỉ sản phẩm đã enrich đủ giá
> mới hiện" — nhưng thực tế gần như không sản phẩm nào nhập biến thể (2/151 doc
> có field, cả 2 đều rỗng) nên **catalog luôn trống**. Biến thể chỉ là dữ liệu
> giá/SKU tùy chọn: sản phẩm chưa có biến thể vẫn xem được (card hiện giá "—")
> và vẫn đặt đơn được vì `PlaceCustomerOrderItemZod` chỉ bắt buộc `type`,
> `color`/`size` là optional. Muốn ẩn 1 sản phẩm khỏi catalog thì đặt
> `status = inactive/hidden`, đừng dựa vào biến thể.

`getCatalog()` filter thêm `search`/`productCategoryId`/`collectionId` nếu có
(`collectionId` match phần tử trong mảng `ProductConfig.collectionIds` —
[`Collections.md`](Collections.md)). `productCategory`
trả về trong response là TÊN đã resolve từ `productCategoryId` (populate
virtual qua `ProductCategory` module — [`Products.md §4`](Products.md)), KHÔNG
phải id. `getCatalogItem()` trả thêm `collections: string[]` (TÊN các
collection active sản phẩm thuộc về, sort `sortOrder`) + `shortDescription` +
`templateDescription`; cả 2 API trả `images[]`/`usImportTaxPerUnit` (map
trong `CATALOG_ROW_SELECT`) + `variations[].packageGram` (HTML `short_description`/`template_description` import
từ hệ cũ — nội dung tab "Chi tiết sản phẩm"/"Mockup & Template" ở §7.1) — CHỈ
API chi tiết, danh sách không trả để nhẹ payload.

**UI danh sách (`pages/customer/catalog/index.tsx`)** duyệt theo collection +
danh mục, mọi số liệu lấy từ `GET /customer/catalog/facets` (gọi 1 lần khi
mount):

- **Hàng "Bộ sưu tập"**: card cuộn ngang (ảnh `image` của collection, fallback
  gradient + icon; tên + số sản phẩm) — click chọn/bỏ chọn làm filter, card
  đang chọn viền + ring primary. Ẩn cả hàng khi không có collection nào.
- **Pill bar danh mục**: "Tất cả" + mỗi category 1 pill kèm count, cuộn ngang.
- **Chip filter đang áp** cạnh dòng đếm kết quả (X từng chip riêng) + nút "Xóa
  bộ lọc" (xóa cả search + category + collection). Đổi bất kỳ filter nào →
  reset về trang 1.

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

- Gallery trái: hiện TẤT CẢ ảnh — ảnh sản phẩm (ảnh chính) + gallery `images[]` +
  `sizeChartUrl`, dedupe theo `src` giữ thứ tự; strip thumbnail bo tròn 80px CUỘN
  NGANG DƯỚI ảnh chính (mirror trang hệ cũ), chỉ hiện khi ≥2 ảnh.
- **Gallery áp chuỗi dự phòng ảnh (merge 2 nhánh 2026-08-18):** `images` KHÔNG
  phải mảng URL mà là mảng **cặp** `{ src, fallback }` — ảnh sản phẩm là
  `{ mockupLarge, mockup }` (3 bậc `mockupLarge` → `mockup` → `ImageIcon`, xem
  `Catalog.md §5.1`); `images[]` + bảng size là `{ toFullSizeImageUrl(u), u }`
  (nhiều URL DB là thumb WordPress `-100x100` → ưu tiên bản full-size qua
  `toFullSizeImageUrl()` `apps/web/src/utils/imageUrl.ts`, hỏng thì về URL gốc).
  Ảnh chính + từng thumbnail đều render qua component `GalleryImage` (khai trong
  chính file, gọi `useImageFallback` — tách riêng vì hook không gọi được trong
  vòng lặp render strip). Hết bậc thì vẽ `ImageIcon`, không để lại ô ảnh vỡ.
  > Thumbnail dùng **cùng chuỗi** với ảnh chính chứ không cố ý tải bản nhỏ:
  > trình duyệt tái dùng ảnh đã tải nên không thêm request, đổi lại thumbnail
  > không bao giờ lệch bậc với ảnh chính đang xem.
- Panel phải: breadcrumb (Home › Danh mục › tên sản phẩm), badge `printMethod`
  + badge secondary cho từng collection (`item.collections`), giá, **selector
  "Phương thức ship"** (pill COD / Express US / Ship By Tiktok — chỉ hiện
  method có giá trên ít nhất 1 biến thể; giá phía trên đổi theo method:
  COD→`shipCodPrice`, Express US→`retailPrice` (CHỈ cột này áp promotion:
  ưu tiên `discountedPrice` + gạch ngang), TikTok→`tiktokPrice`), bộ chọn
  thuộc tính, **info block** (nền muted, mirror hệ cũ): "Thuế nhập US:
  ${`usImportTaxPerUnit`}/sản phẩm" (đỏ) + "SKU: {sku}" kèm `CopyButton` +
  "Đóng gói: {`packageGram` ?? `weight`}gram ({H}cm x {L}cm x {W}cm)" (kích
  thước đỏ) — 2 giá trị tax/packageGram crawl từ trang WP hệ cũ, xem
  [`Products.md §2.8`](Products.md), vị trí in (`printArea[].label`
  + kích thước px nếu có `widthPx`/`heightPx`; kèm 2 link "Tải template thiết
  kế"/"Tài liệu hướng dẫn design" khi sản phẩm có `printTemplate`/`printDocument`),
  bảng "Thông số sản phẩm" (`itemSpecifics[]` label/value, chỉ hiện khi
  có), nút "Đặt đơn mới", nút tải bảng size (nếu có `sizeChartUrl`).
- **Block "Thông tin {tên} " (tab, full-width DƯỚI CÙNG trang)** — mirror
  trang sản phẩm hệ OnosPod cũ, dùng `ui/tabs` (Radix) style gạch chân, tab
  không có nội dung tự ẩn:
  1. **Chi tiết sản phẩm** — `shortDescription` (bullet HTML
     `short_description` hệ cũ) + `description`.
  2. **Mockup & Template** — `templateDescription` (HTML `template_description`
     hệ cũ: Print File Requirements, hướng dẫn đặt design...) + list link 👉
     tải `printTemplate`/`printDocument`/`printArea[].templateUrl` (kèm size px).
  3. **Biến thể & Giá** — bảng mirror layout hệ cũ, luôn hiện: 1 cột / label
     thuộc tính (SIZE, COLOR... — union label của mọi biến thể) | SKU dạng
     chip teal + `CopyButton` | Cân nặng `{weight}g ({height}cm x {length}cm
     x {width}cm)` (kích thước đỏ) | Ship COD (xanh lá, `shipCodPrice`) |
     Ship Express US (`retailPrice`, promotion áp vào cột này: discounted +
     gạch retail) | Ship by TikTok (`tiktokPrice`). Cột weight/giá tự ẩn khi
     KHÔNG biến thể nào có giá trị (vd biến thể `-DEFAULT` tự tạo).
     **`shipCodPrice` = giá trị `nonShipCost`** — đây là GIÁ BÁN nonship
     public trên trang sản phẩm hệ cũ (`nonship_price`), KHÔNG phải giá vốn;
     giá vốn thật `cost` (`base_price`) + `wholesalePrice` vẫn tuyệt đối
     KHÔNG trả ra Customer Portal.
  Nội dung HTML render qua component `HtmlContent` (trong `detail.tsx`):
  `dangerouslySetInnerHTML` + **`DOMPurify.sanitize()`** (bắt buộc — data từ
  hệ ngoài) với bộ class Tailwind arbitrary-variant style sẵn
  p/heading/list/img/table (ảnh trong mô tả `max-w-full` + bo góc); plain
  text → `<p>` với `whitespace-pre-line`. Mô tả KHÔNG nằm trong panel phải
  (HTML dài kèm ảnh làm trang lệch).
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
  `{ fromCatalog: true, product (nguyên `CustomerCatalogItem` — gồm printArea giàu/printTemplate/printDocument), selectedAttrs }`.
  `color`/`size` được đoán từ `attributes` đã chọn qua `pickColorSize()` —
  match `label` chứa "color"/"colour"/"màu" → `color`, chứa "size"/"cỡ" →
  `size` (heuristic, vì `label` tự do không có key cố định "color"/"size").

### 7.2 API `GET /v1/customer/catalog/:id`

`GetCustomerCatalogItemResDto` (`packages/shared/dtos/product-config.dto.ts`)
— `data: CustomerCatalogItemZod` (KHÔNG nullable, 404 nếu không tìm thấy/không
active/không có biến thể — khác `getCatalog()` trả mảng có thể rỗng).

## 8. Thông báo cho khách hàng — Admin soạn tay + HỆ THỐNG tự sinh theo trạng thái đơn (ORD-5)

> **File FE:** `apps/web/src/components/customer/NotificationBell.tsx` (chuông ở `CustomerLayout.tsx`), `apps/web/src/components/settings/CustomerNotificationSender.tsx` (soạn + lịch sử, mục `/adm/settings/customer-notify` — cùng gate `role.manage` như `CustomerAssignmentConfig`/`DesignerAssignmentConfig`, KHÔNG route/permission riêng), `apps/web/src/services/customerNotification.ts` (admin) + `services/customerPortal.ts` → `customerNotificationPortal` (khách hàng)
> **File BE:** `apps/api/src/modules/customer-notification/` (`customer-notification.entity.ts`, `.repository.ts`, `.service.ts`, `customer-notification.controller.ts` (admin), `customer-notification-portal.controller.ts` (khách hàng), `.module.ts`), `apps/api/src/modules/customer/customer.entity.ts` (+ `notificationsReadAt`)
> **API:** `POST /v1/customer-notifications` + `GET /v1/customer-notifications/sent` (`@Auth([Admin])`), `GET /v1/customer/notifications` + `POST /v1/customer/notifications/read` (`@Auth([Customer])`)

Hai nguồn thông báo dùng CHUNG collection, chung chuông, chung cơ chế đã-đọc:

**(a) Admin soạn tay** — tiêu đề + nội dung → gửi **1 khách cụ thể** (search
theo SKU/email, tái dùng `GET /customers` đã có sẵn cho tính năng gán xưởng)
hoặc **broadcast TẤT CẢ khách hàng** (bỏ trống `customerId`).

**(b) Hệ thống tự sinh theo trạng thái đơn (ORD-5)** — `event` + `eventData` có
giá trị, không có người gửi. **Gộp ở MỨC ĐƠN** để khách không bị dội:

| `event` | Bắn khi | Ghi chú |
| --- | --- | --- |
| `order.pushed` | Push 1 đơn staging sang sản xuất | Đúng 1 thông báo/đơn dù nhiều item |
| `order.production_completed` | MỌI item chưa hủy của đơn đã `fulfillmentCompletedAt` | Đơn còn item dở → chưa bắn |
| `order.held` | Đơn chuyển từ 0 → ≥1 item bị giữ | Giữ thêm item nữa KHÔNG bắn lại |
| `order.unheld` | Đơn hết sạch item bị giữ | |
| `order.item_cancelled` | Mỗi item bị hủy | Báo theo ITEM (khách cần biết đích danh mã nào) |

- **Nguồn sự kiện DUY NHẤT**: `apps/api/src/modules/customer-event/customer-order-event.service.ts` (`CustomerOrderEventService.emit()`) — fan-out sang webhook khách API (ORD-4) *và* thông báo chuông này. Mọi call site (`pushToProduction`, `holdOrder`/`unholdOrder`/`bulkSetHold`/`cancelOrder` ở `order.service.ts`, transition hoàn thành ở `fulfillment-task.service.ts`) chỉ gọi `emit()`; **đường BULK cũng đã gắn** — thêm điểm đổi trạng thái mới thì gọi đúng hàm này, đừng tự chế đường bắn riêng.
- **Không chặn nghiệp vụ**: `emit()` trả về ngay, lỗi nuốt tại chỗ; `createSystemNotification()` còn bọc try/catch riêng. Push/hold/hủy vẫn thành công kể cả khi ghi thông báo lỗi.
- **Lý do giữ không phô nguyên văn**: BE quy `holdReason` nội bộ về nhóm an toàn `holdKind` (`waiting-design` / `waiting-address` / `other`) trước khi lưu; FE tra chuỗi theo nhóm. Nội dung KHÔNG chứa tên nhân viên, mã lỗi nội bộ, giá vốn, thông tin xưởng.
- **Chỉ đơn có staging row** mới sinh thông báo — đơn Luồng A (sync hệ cũ) chưa lazy-sync thì bỏ qua, thà im lặng còn hơn báo sai.
- **Đa ngôn ngữ**: BE lưu `title` bản tiếng Việt DỰ PHÒNG; FE `NotificationBell.tsx` (`systemNotificationText()`) dựng chữ từ `event`/`eventData` theo ngôn ngữ khách đang chọn (i18n `customerNotifications.bell.events.*`, vi + en). Bấm thông báo hệ thống → điều hướng `/customer/orders?search=<orderCode>` (listing seed state từ query `search`).
- Không backfill đơn cũ, không bắn lại khi chạy migration nội bộ.

**Model lưu trữ** — `customer_notifications` (collection RIÊNG, KHÔNG dùng
chung `NotificationEntity` của nhân viên vì entity đó `ref: 'UserEntity'`,
khác domain/collection với `CustomerEntity`):
```ts
{ title: string; body?: string;          // admin soạn tay: văn bản thật; hệ thống: bản VI dự phòng
  customerId: string | null;             // null = broadcast tới TẤT CẢ khách hàng
  event: CustomerNotificationEvent|null; // ORD-5 — rỗng = admin soạn tay
  eventData: { orderCode?; productionId?; holdKind?; stagingId? } | null;
  createdByUserId?: string | null;       // ref UserEntity; rỗng với thông báo hệ thống
  createdByName?: string;                // snapshot tên, tránh populate lúc hiển thị lịch sử
}
```

**Đã đọc = 1 mốc thời gian, KHÔNG track từng thông báo** — đơn giản hoá tối
đa: `CustomerEntity.notificationsReadAt` (field nội bộ, KHÔNG có trong
`CustomerZod`/không bao giờ trả qua `toSafeCustomer()` ngoài việc tự nhiên đi
kèm object, không nhạy cảm nên không cần strip). "Đánh dấu đã đọc" bump field
này lên `now()` — mọi thông báo tính tới thời điểm đó coi như đã đọc (giống
UX "mark all as read" của nhiều app, KHÔNG có trạng thái đọc/chưa đọc riêng
từng thông báo). `unreadCount` = đếm thông báo (`customerId` khớp HOẶC null)
có `createdAt > notificationsReadAt`.

`NotificationBell.tsx` fetch lúc mount + poll mỗi 60s (đủ cho quy mô khách
hàng B2B, KHÔNG dùng WebSocket/SSE) + fetch lại mỗi lần mở popover.

## 9. Thông báo lỗi backend theo ngôn ngữ khách (ORD-29)

Toàn bộ message backend vốn là chuỗi tiếng Việt cứng. Khách nước ngoài (đơn US) nhận về câu không đọc được. ORD-29 dựng đường i18n cho **đúng những câu người thật đọc** — 31 câu ở ba module — và **không đụng** 124 câu còn lại của nhân viên nội bộ: người đọc chúng là người Việt, dịch sang tiếng Anh chỉ làm họ khó dùng hơn.

| Module | Câu | Ai đọc |
|---|---|---|
| `customer-portal` (catalog + đơn hàng) | 16 | khách, trên trình duyệt |
| `design-storage` | 12 | khách, ở ô tải file design |
| `customer-webhook` | 3 | khách, ở trang API/webhook trong portal |

**Cơ chế** — `apps/api/src/shared/i18n/`:
- `request-language.ts` — `AsyncLocalStorage` giữ ngôn ngữ của request, gắn bằng một middleware toàn cục ở `main-nest.ts`. Nhờ vậy service ném lỗi đúng thứ tiếng mà **không phải thêm tham số vào từng hàm**.
- `customer-messages.ts` — từ điển `{vi, en}` theo khoá; câu có tham số khai bằng hàm. `customerMessage(key, ...args)` tra theo ngôn ngữ hiện tại, thiếu bản dịch thì lùi về tiếng Việt.

**Hai ràng buộc cứng, cả hai đều thuộc loại hỏng-thì-không-ai-báo:**

1. **Không khai ngôn ngữ → tiếng Việt.** Cố ý **không** dùng cơ chế fallback của `nestjs-i18n` dù thư viện đã được cấu hình sẵn: `FALLBACK_LANGUAGE` của dự án đang là `en_US`, đi theo nó thì request không khai ngôn ngữ sẽ rơi vào tiếng Anh — ngược hẳn yêu cầu.
2. **Public Order API nhận NGUYÊN VĂN chuỗi cũ.** Hai lớp, vì một lớp không đủ:
   - `resolveRequestLang()` ép `vi` cho mọi đường `/open-api/`, bất kể `Accept-Language`.
   - Nhưng ép tiếng Việt chỉ giữ được **ngôn ngữ**, không giữ được **câu**: hai câu "thiếu mockup" / "thiếu design" đi CHUNG `pushToProduction()` với portal, và chính bản tiếng Việt của chúng đã đổi (bỏ nửa tiếng Anh chắp vá của ORD-22). Nên hai câu đó khai thêm trường `machine` — chuỗi nguyên văn trước ORD-29 — và `customerMessage()` trả trường đó khi request đến từ bề mặt máy.
   Bên tích hợp chỉ có mỗi chuỗi message để bám vì API chưa trả mã lỗi; đổi câu là gãy mà không ai báo. TEST bắt được thiếu sót này ở vòng 1.

**Đường truyền:** `apps/web/src/apis/index.tsx` gắn `Accept-Language` **chỉ cho tuyến `/customer/...`**, lấy từ `languageStore` mà toggle VI/EN đã dùng. Không thêm trường ngôn ngữ vào bảng `customers` — bảng đó dùng chung với tính năng gán xưởng theo khách.

**Đo trên API đang chạy** (`GET /api/v1/public/catalog/<id không tồn tại>`):

| `Accept-Language` | Message trả về |
|---|---|
| không gửi · `vi` · `fr` · `xx-YY` · rỗng | `Không tìm thấy sản phẩm này.` |
| `en` · `en-US,en;q=0.9` | `This product could not be found.` |

Khoá bằng `apps/api/src/shared/i18n/customer-messages.spec.ts` (9 ca), trong đó có ca ép tiếng Việt cho `/open-api/` và ca bắt mọi khoá phải có bản tiếng Anh khác câu tiếng Việt.

## 10. Permissions

Không dùng `permission-catalog` nội bộ — gate hoàn toàn bằng
`@Auth([RoleType.Customer])` (role-only, không permission code). Nhân viên
(mọi role khác) không bao giờ truy cập được API `/customer/*` vì `role` trong
JWT không khớp; ngược lại token khách hàng cũng không truy cập được bất kỳ
endpoint nội bộ nào (`RoleType.Customer` không nằm trong role-array của bất
kỳ `@Auth()` nào ở các module khác).
