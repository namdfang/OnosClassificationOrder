# Customer Portal — Function Description

> **File FE:** `apps/web/src/pages/customer/{login,register}/index.tsx`, `apps/web/src/pages/customer/orders/{index,new,track}.tsx`, `apps/web/src/pages/customer/catalog/{index,detail}.tsx`, `apps/web/src/layouts/customerLayout/CustomerLayout.tsx`, `apps/web/src/store/customerAuthStore.ts`, `apps/web/src/services/customerPortal.ts`, `apps/web/src/components/customer/CatalogProductCard.tsx`, `apps/web/src/components/common/FileUrlOrUploadInput.tsx`, `apps/web/src/pages/landing/index.tsx` (logo/link về `PATHS.LANDING`, đã bỏ text "Printsel")
> **File BE:** `apps/api/src/modules/customer-portal/` (`customer-auth.controller.ts`, `customer-order.controller.ts`, `customer-order.service.ts`, `customer-catalog.controller.ts`, `customer-catalog.service.ts`, `customer-portal.module.ts`), `apps/api/src/modules/customer/` (`customer.entity.ts`, `customer.service.ts` → `register()`/`validateLogin()`/`getById()`/`toSafeCustomer()`), `apps/api/src/modules/auth/jwt.strategy.ts` (branch theo `RoleType.Customer`)
> **Route:** `/customer/login`, `/customer/register`, `/customer/orders`, `/customer/orders/new`, `/customer/orders/:productionId`, `/customer/catalog`, `/customer/catalog/:id`
> **API:** `POST /v1/customer/auth/register`, `POST /v1/customer/auth/login`, `GET /v1/customer/auth/me`, `POST /v1/customer/orders`, `GET /v1/customer/orders`, `GET /v1/customer/orders/:productionId`, `PATCH /v1/customer/orders/:productionId`, `GET /v1/customer/catalog`, `GET /v1/customer/catalog/:id`

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

### 2.3 Đặt đơn — NHIỀU sản phẩm/1 địa chỉ ship, default sản xuất TÁI DÙNG luồng import

`PlaceCustomerOrderDto` (`packages/shared/dtos/production-order.dto.ts`) =
`{ items: PlaceCustomerOrderItemZod[], shippingAddress: PlaceCustomerOrderShippingAddressZod, referent? }`.
1 lần "Đặt đơn" có thể gồm **nhiều sản phẩm** (`items[]`, mỗi item =
`type/color/size/mockupUrl/printMethod/weight/width/height/length/quantity/designs`,
tách từ shape cũ) nhưng CHỈ **1 địa chỉ ship dùng chung** cho mọi item
(`shippingAddress`, bắt buộc `firstName`/`phone`/`address1`/`city` — các field
còn lại của `ProductionOrderShippingAddressZod` optional). KHÔNG có
factory/machine/fabric/toolResult/designer/fulfillment — các field này được
**default tự động giống hệt** lúc import nội bộ.

`CustomerOrderService.placeOrder()`:
1. Với MỖI item trong `dto.items`: sinh `productionId` random qua
   `generateUniqueProductionId()` — format `XX-NNNNN-NNNNN` (2 chữ cái + 5 số +
   5 số, CÙNG pattern với mã đơn thật/`CUTTING_FILE_PRODUCTION_ID_REGEX` — xem
   §2.3.1), check trùng qua `orderModel.exists()`, retry tối đa 10 lần.
2. Gộp TOÀN BỘ items thành 1 mảng `rows[]` — mỗi row mang theo CÙNG
   `shippingAddress` (snapshot vào field `OrderEntity.shippingAddress`, trước
   đây chỉ set qua luồng khôi phục OnosPod — xem Orders.md §9c) — rồi gọi
   **1 lần duy nhất** `OrderService.importOrders({ rows }, ctx)` cho cả batch —
   TÁI DÙNG map ProductConfig theo `type`, ưu tiên gán xưởng theo khách
   (`customer-assignment`), xử lý `designs`... y hệt luồng import file Excel
   nội bộ, thay vì viết lại logic default riêng.
3. Đọc lại TOÀN BỘ đơn vừa tạo theo `productionId $in [...]`, giữ đúng thứ tự
   submit, trả mảng `CustomerOrderSummary[]` (khác response cũ — object đơn lẻ).

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
thấy đơn của chính mình. Tiến trình 1 đơn (`track.tsx`) tái dùng thẳng
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

## 3. API / Schema

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/v1/customer/auth/register` | public | Đăng ký / claim tài khoản |
| POST | `/v1/customer/auth/login` | public | Đăng nhập → JWT `role=Customer` |
| GET | `/v1/customer/auth/me` | `@Auth([Customer])` | Thông tin tài khoản hiện tại |
| POST | `/v1/customer/orders` | `@Auth([Customer])` | Đặt đơn mới (thông tin cơ bản) |
| GET | `/v1/customer/orders` | `@Auth([Customer])` | Danh sách đơn của khách (phân trang) |
| GET | `/v1/customer/orders/:productionId` | `@Auth([Customer])` | Tiến trình 1 đơn (scope theo khách) |
| PATCH | `/v1/customer/orders/:productionId` | `@Auth([Customer])` | Sửa mockup/design/địa chỉ ship đơn ĐÃ đặt (chặn nếu đơn đã hủy) — xem §2.5 |
| GET | `/v1/customer/catalog` | `@Auth([Customer])` | Danh sách sản phẩm + giá tham khảo (đã áp discount theo tier) — xem §7 |
| GET | `/v1/customer/catalog/:id` | `@Auth([Customer])` | 1 sản phẩm — trang chi tiết `/customer/catalog/:id` trước khi đặt đơn — xem §7 |

`CustomerOrderSummaryZod` (`packages/shared/dtos/production-order.dto.ts`) —
field cơ bản (`productionId`/`type`/`color`/`size`/`quantity`/`mockupUrl`/
`status`/`orderAt`/`cancelledAt`/`cancelReason`/`createdAt`) + field rút gọn
tiến trình dùng cho listing: `inProductionAt`, `currentStageLabel`,
`currentStageAt`, `completed` (xem §2.4).

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
  đã có ở trang login nhân viên). Logo (link về `PATHS.LANDING`) + form. Trang
  login **tự chuyển hướng sang `/customer/orders`** nếu `customerAuthStore`
  đã có token còn hạn (`isAuthenticated()`, check 1 lần lúc mount) — khỏi bắt
  đăng nhập lại khi khách quay lại URL login.
- `layouts/customerLayout/CustomerLayout.tsx` — header (logo link về
  `PATHS.LANDING` + nút "Đặt đơn mới"/"Danh mục" + email khách + đăng xuất),
  container **`max-w-6xl`** (đã nới rộng từ `max-w-4xl` — nội dung catalog/đặt
  đơn cần nhiều cột hơn), KHÔNG dùng `Sidebar`/`MainLayout` của khu vực nhân
  viên.
- `pages/customer/orders/index.tsx` — listing dạng **BẢNG** (shadcn `Table`,
  không phải card): mỗi hàng = ảnh mockup thumb + mã đơn (link) + sản phẩm/màu-size
  + SL + badge chặng hiện tại/trạng thái + ngày đặt + ngày vào sản xuất + link
  "Xem chi tiết", phân trang (`PaginationBar`, `GET /customer/orders?page&limit`).
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

## 8. Thông báo cho khách hàng — Admin/nội bộ chủ động gửi (KHÔNG tự sinh theo trạng thái đơn)

> **File FE:** `apps/web/src/components/customer/NotificationBell.tsx` (chuông ở `CustomerLayout.tsx`), `apps/web/src/components/settings/CustomerNotificationSender.tsx` (soạn + lịch sử, mục `/adm/settings/customer-notify` — cùng gate `role.manage` như `CustomerAssignmentConfig`/`DesignerAssignmentConfig`, KHÔNG route/permission riêng), `apps/web/src/services/customerNotification.ts` (admin) + `services/customerPortal.ts` → `customerNotificationPortal` (khách hàng)
> **File BE:** `apps/api/src/modules/customer-notification/` (`customer-notification.entity.ts`, `.repository.ts`, `.service.ts`, `customer-notification.controller.ts` (admin), `customer-notification-portal.controller.ts` (khách hàng), `.module.ts`), `apps/api/src/modules/customer/customer.entity.ts` (+ `notificationsReadAt`)
> **API:** `POST /v1/customer-notifications` + `GET /v1/customer-notifications/sent` (`@Auth([Admin])`), `GET /v1/customer/notifications` + `POST /v1/customer/notifications/read` (`@Auth([Customer])`)

Admin/nội bộ soạn tiêu đề + nội dung → chọn gửi cho **1 khách cụ thể** (search
theo SKU/email, tái dùng `GET /customers` đã có sẵn cho tính năng gán xưởng)
hoặc **broadcast TẤT CẢ khách hàng** (bỏ trống `customerId`). KHÔNG có luồng
tự động sinh thông báo theo trạng thái đơn/chặng sản xuất (quyết định phạm
vi ban đầu — có thể mở rộng sau).

**Model lưu trữ** — `customer_notifications` (collection RIÊNG, KHÔNG dùng
chung `NotificationEntity` của nhân viên vì entity đó `ref: 'UserEntity'`,
khác domain/collection với `CustomerEntity`):
```ts
{ title: string; body?: string;
  customerId: string | null;   // null = broadcast tới TẤT CẢ khách hàng
  createdByUserId: string;     // ref UserEntity (admin gửi)
  createdByName: string;       // snapshot tên, tránh phải populate lúc hiển thị lịch sử
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

## 9. Permissions

Không dùng `permission-catalog` nội bộ — gate hoàn toàn bằng
`@Auth([RoleType.Customer])` (role-only, không permission code). Nhân viên
(mọi role khác) không bao giờ truy cập được API `/customer/*` vì `role` trong
JWT không khớp; ngược lại token khách hàng cũng không truy cập được bất kỳ
endpoint nội bộ nào (`RoleType.Customer` không nằm trong role-array của bất
kỳ `@Auth()` nào ở các module khác).
