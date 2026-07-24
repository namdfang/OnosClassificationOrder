# Products — Function Description

> **File FE:** `apps/web/src/pages/products/index.tsx`, `apps/web/src/pages/products/detail/index.tsx` (trang chi tiết/chỉnh sửa sản phẩm)
> **File BE:** `apps/api/src/modules/product-config/`, `factory/`, `machine-type/`, `product-category/`
> **Route:** `/adm/products`, `/adm/products/:id` (chi tiết)
> **API:** `/v1/product-configs`, `/v1/product-configs/:id` (GET 1 sản phẩm), `/v1/factories`, `/v1/machine-types`, `/v1/product-categories`
> **Liên quan:** Chương trình giảm giá theo tier khách hàng — [`Promotion.md`](Promotion.md). Catalog cho Customer Portal (giá tham khảo đã áp discount) — [`CustomerPortal.md`](CustomerPortal.md) §7.

---

## 1. Overview

Module **Products** quản lý 4 entity liên quan đến cấu hình sản xuất + catalog:

- **Product Config** — map `fullName` (tên đầy đủ sản phẩm) → `factory` + `machineType` (phòng / loại máy in) + `machineNumber` (số máy) + default `fabricType` + default `toolResult` + chi tiết catalog (§2.4/§2.5)
- **Factory** — danh sách xưởng sản xuất (mặc định ML/TN/US)
- **Machine Type** — danh sách "Phòng" / loại máy in (ICL / IEN / HT…)
- **Product Category** (§4) — danh mục sản phẩm, module riêng (KHÔNG dùng workshop_config), ProductConfig tham chiếu qua `productCategoryId`

UI chia 3 tab:
- **Config tab** — CRUD product config + import từ Google Sheets + xóa toàn bộ
- **Danh mục tab** (`ProductCategoryTab.tsx`) — CRUD product category (§4), tab riêng cho dễ tìm
- **Xưởng tab** — CRUD factory / machine type (2 bảng xếp dọc, xem §3)

---

## 2. Tab `Config` (`apps/web/src/pages/products/ProductConfigTab.tsx`)

### 2.1 Tính năng
| Chức năng | Mô tả |
|-----------|-------|
| List | Bảng có **phân trang** (`<PaginationBar>`, mặc định `pageSize=20`, đọc `total` từ response), sort theo `createdAt` desc. Search/Xóa tất cả reset về trang 1 |
| Search | Substring match `fullName`, `shortName`, hoặc `sku` (case-insensitive) |
| Filter | Query string `factoryId`, `machineTypeId`, `status` |
| **Trạng thái** (`status`) | Badge màu + `<select>` inline mỗi dòng (Active/Inactive/Hidden — xem §2.2) đổi ngay; dropdown filter toolbar mặc định "Tất cả (trừ Đã ẩn)" (không truyền `status` — BE tự loại `hidden`), chọn cụ thể 1 trạng thái để xem đúng nhóm đó (VD: xem lại các sản phẩm Đã ẩn). Màu: Active xanh lá, Inactive vàng, Hidden xám (`STATUS_META` — export từ `ProductConfigTab.tsx`, dùng chung với trang chi tiết). |
| Inline edit | Dropdown chọn **`factoryId` (Xưởng)** + **`machineTypeId` (Phòng)** + `fabricType` + `toolResult` + `level` cho mỗi dòng, ô nhập `mockup` (URL, cột đầu) → PATCH `/v1/product-configs/:id`. Xưởng/Phòng là **ref bắt buộc** → không có option rỗng (danh sách nạp qua `getFactories`/`getMachineTypes` 1 lần khi mount). |
| **Xưởng / Phòng** (editable) | Cột **Xưởng** (`factoryId`) + **Phòng** (`machineTypeId`) sửa inline bằng `<select>` (giá trị = id, nhãn `shortName · name`) **và** ở trang chi tiết. Update lạc quan (`factoryId`+`factory` / `machineTypeId`+`machineType`), lỗi thì refetch rollback. **Chỉ ảnh hưởng import đơn về sau** — đơn đã import giữ nguyên `factoryId`/`originalFactoryId` (insertOnly + transfer), KHÔNG backfill. BE `updateProductConfig` **validate** `factoryId` (`factoryService.getFactory`) + `machineTypeId` (`machineTypeService.getMachineType`) → 404 nếu id không tồn tại. |
| **Mockup** | Cột **đầu tiên** — string URL ảnh; hiển thị thumbnail 56×56 (click mở tab mới), **read-only ở bảng danh sách** (đã bỏ hẳn ô nhập URL) — sửa/upload mockup chỉ qua trang chi tiết (§2.4a: upload file, KHÔNG còn dán URL) |
| **Level** | Select 1 trong **10 level cố định** (`PRODUCT_LEVELS` ở shared) — badge màu gradient dễ→khó (xanh lá `#22C55E` → đỏ đậm `#7F1D1D`). Lưu ngay khi chọn |
| **Trang chi tiết sản phẩm** (`apps/web/src/pages/products/detail/index.tsx`, route `/adm/products/:id`) | Nút ✏️ (`Pencil`) mỗi dòng **điều hướng** sang trang riêng (KHÔNG còn popup) qua `PATHS.PRODUCT_DETAIL.replace(':id', it._id)`. Trang tự fetch 1 sản phẩm qua `GET /v1/product-configs/:id` (populate `factory`/`machineType`/`productCategory`) + tự load danh sách Xưởng/Phòng/Danh mục sản phẩm/workshop_config. **Header** cho sửa **Tên viết tắt** (`shortName`, bắt buộc — chặn Lưu + toast lỗi nếu để trống), **SKU sản phẩm** (`sku`, optional — KHÁC SKU biến thể), và **Trạng thái** (`status` — select màu theo `STATUS_META`, xem §2.2) cạnh tiêu đề `fullName` (fullName vẫn read-only ở trang này). **Layout 2 cột**: sidebar trái (sticky) gom mockup (upload file, §2.4a) + level (segmented picker màu 1..10) + **Mã máy in** (`machineNumber`) + Xưởng/Phòng + fabricType/toolResult + guide — cột phải chỉ còn **2 tab**: **Chi tiết sản phẩm** (§2.4, chia section "Phân loại"/"Hiển thị cho khách hàng"/"Đóng gói mặc định"/"Thông số kỹ thuật" ngăn bởi `<Separator>`, printArea dạng checkbox cố định §2.4/§2.4a) và **Biến thể** (§2.5, dạng `<Table>` mỗi dòng 1 biến thể thay vì card xếp dọc, kèm "Tạo nhanh biến thể" + "Nhập nhanh giá"). Header sticky luôn hiện nút **Lưu thay đổi** (disable khi không có thay đổi) + badge "Chưa lưu" khi dirty; 1 PATCH gộp toàn bộ field khi lưu, sau đó vẫn ở lại trang (toast xác nhận). **Dirty guard**: so sánh snapshot JSON form vs baseline lúc load/sau khi lưu — có thay đổi chưa lưu thì `beforeunload` cảnh báo + chặn click `<a>` điều hướng trong app + nút back (`ArrowLeft`) tự `confirm()` trước khi quay về `/adm/products` (cùng pattern dirty-guard ở `CustomerAssignmentConfig.tsx`). |
| **Hướng dẫn** (`guide`) | Free-text ghi chú/hướng dẫn sản phẩm — **cột trong bảng tạm ẩn**; chỉ sửa qua trang chi tiết (textarea). |
| **Xóa tất cả** | Confirm → DELETE `/v1/product-configs/all` (hard-delete `deleteMany({})`) — dùng khi reset từ đầu |
| Import | Dialog paste 7 cột tab-separated → bulk upsert by `fullName` |

### 2.2 Schema `ProductConfigEntity`
```ts
{
  fullName: string;        // Tên đầy đủ (vd: "All-over Print Hockey Jersey"), unique key khi upsert
  shortName: string;       // Tên viết tắt uppercase — sửa được ở trang chi tiết (header)
  sku?: string;            // Mã SKU riêng của sản phẩm (KHÁC SKU biến thể trong variations[]) — unique+sparse toàn hệ thống, sửa ở trang chi tiết (header)
  machineNumber?: string;  // Số máy in ("mã máy in", vd "94", "27"). Empty ⇒ sản phẩm không có tool — sửa ở trang chi tiết (sidebar)
  factoryId: ObjectId;     // ref FactoryEntity (xưởng — vd Mê Linh / Thái Nguyên / US)
  machineTypeId: ObjectId; // ref MachineTypeEntity (phòng — loại máy in: ICL / IEN / HT)
  fabricType?: string;     // workshop_config code (category=fabric_type) — default fabric copy vào order
  toolResult?: string;     // workshop_config code (category=tool_result) — default tool status. KHÔNG còn copy vào order lúc import nữa (xem §2.2 dưới) — chỉ còn ý nghĩa hiển thị/cấu hình.
  mockup?: string;         // URL ảnh mockup — hiển thị cột đầu bảng config (thumbnail + edit inline)
  level?: number;          // Cấp độ 1..10 (PRODUCT_LEVELS ở shared) — badge màu gradient
  guide?: string;          // Hướng dẫn/ghi chú sản phẩm (free-text textarea)

  status: string;                // ProductConfigStatus: active (hiện catalog+quản trị) | inactive (ẩn catalog, hiện quản trị) | hidden (ẩn cả 2, KHÔNG xóa DB) — mặc định active
  // Chi tiết sản phẩm (catalog cho khách hàng) — xem §2.4/§2.5
  productCategoryId?: ObjectId;  // ref ProductCategoryEntity (module riêng — §4), virtual populate `productCategory`
  printMethod?: string;          // workshop_config code (category=print_method)
  printArea?: string[]; // Danh sách vị trí in — mảng key CỐ ĐỊNH (PRODUCT_PRINT_AREA_KEYS, KHÔNG free-text), map 1-1 sang order.designs.{key}
  sizeChartUrl?: string;         // Ảnh/URL bảng size
  description?: string;          // Mô tả — hiển thị Customer Portal
  itemSpecifics?: { label: string; value: string }[]; // Thông số kỹ thuật tự do
  weight?: number; width?: number; height?: number; length?: number; // Đóng gói mặc định
  variations?: {
    sku: string;          // Unique TOÀN HỆ THỐNG (index unique+sparse trên `variations.sku`) — LUÔN tự sinh `{SKU sản phẩm}-{thuộc tính}`, không cho sửa tay qua UI
    attributes?: { label: string; value: string }[]; // Thuộc tính tự do (VD: "Màu"→"Đỏ", "Size"→"M") — KHÔNG định nghĩa cứng field màu/size
    cost?: number;         // Giá vốn — KHÔNG bao giờ trả ra Customer Portal
    nonShipCost?: number;  // Giá vốn không gồm ship — KHÔNG bao giờ trả ra Customer Portal
    retailPrice?: number;  // Giá bán niêm yết — hiển thị Customer Portal
    weight?: number; width?: number; height?: number; length?: number; // Override đóng gói
    status: string;        // Status.Active/Inactive
  }[];
}
```

> **Lưu ý:** `ProductConfigEntity` bị ràng buộc `assertSameType<ProductConfig, ProductConfigEntity>()` (2 chiều) — thêm field mới **BẮT BUỘC** sửa đồng bộ cả `packages/shared/dtos/product-config.dto.ts` (`ProductConfigZod` + Create/Update) lẫn entity, nếu không sẽ fail compile. `service.updateProductConfig` spread `...dto` nên field mới tự pass-through, không cần sửa service. 10 level cố định + màu định nghĩa ở `packages/shared/constants/product-level.ts` (`PRODUCT_LEVELS`, `PRODUCT_LEVEL_MAP`). **`sku`** (mã SKU riêng của sản phẩm, KHÁC SKU biến thể) có unique+sparse index riêng (`ProductConfigSchema.index({ sku: 1 }, ...)`) — trùng SKU sản phẩm khác → 400 "SKU sản phẩm đã tồn tại ở sản phẩm khác" (`isDuplicateProductSkuError()` trong `product-config.service.ts`, cùng pattern với `isDuplicateVariationSkuError()`); `create`/`updateProductConfig` tự uppercase+trim `sku` giống `shortName`. **`status`** (`ProductConfigStatus` — `packages/shared/enums/product-config-status.ts`) mặc định `active` qua Mongoose schema default (data cũ chưa có field này coi như `active` — filter dùng `$ne`/`$in [...,null]` để tương thích ngược); `getProductConfigs()` mặc định loại `hidden` trừ khi client truyền `status` cụ thể (`GetProductConfigsDto.status`); `CustomerCatalogService.getCatalog()` CHỈ trả `active`.

### 2.4 Chi tiết sản phẩm (catalog cho khách hàng)

Tab **"Chi tiết sản phẩm"** ở trang chi tiết (`/adm/products/:id`) — `productCategoryId` chọn từ module **Product Category riêng** (§4, xem tab riêng ở Products, đa cấp độ), `printMethod` chọn từ category `print_method` trong `workshop_config` (quản lý ở trang `/workshop-config`, xem `WorkshopConfig.md`), `description` free-text, `itemSpecifics` là danh sách key-value tự do (thêm/xoá dòng), 4 field đóng gói mặc định (weight/width/height/length).

### 2.4a Upload ảnh (Mockup + Bảng size) — KHÔNG còn dán URL, lưu LOCAL DISK

`mockup` (sidebar, §2.1) và `sizeChartUrl` (tab "Chi tiết sản phẩm") đều **upload file thật** qua component `ImageUploadField` (`apps/web/src/pages/products/detail/index.tsx`):

1. Bấm vào ảnh preview (hoặc khung trống) → mở file picker → chọn ảnh → **CHỈ preview local** ngay lập tức (`URL.createObjectURL`, state `mockupFile`/`sizeChartFile` giữ `File` gốc) — **KHÔNG upload ngay**, badge amber "Ảnh mới — sẽ upload khi bấm Lưu" hiện dưới ảnh, form tự động thành `dirty`.
2. Chỉ khi bấm **Lưu thay đổi** (`handleSave`), nếu có `mockupFile`/`sizeChartFile` đang chờ → gọi `POST /v1/product-configs/upload-image` (multipart, field `type`=`'mockup'`|`'size-chart'` + `file`) TRƯỚC, lấy URL trả về rồi mới gộp vào cùng 1 PATCH `updateProductConfig` với các field khác. Lỗi upload thì dừng lại, KHÔNG PATCH (giữ nguyên `mockup`/`sizeChartUrl` cũ).

**Backend** (`product-config.service.ts` + `product-config.controller.ts`) — **lưu LOCAL DISK trên server API, KHÔNG qua S3/Backblaze** (khác hẳn `/v1/upload/image` ở module `upload/` hiện có — module đó cần `AWS_S3_*`/`BACKBLAZE_*` credentials mà môi trường dev **chưa cấu hình** (rỗng trong `.env.development`) → gây 500 nếu dùng; quyết định chuyển sang local disk sau khi xác nhận với người dùng):
- `POST /v1/product-configs/upload-image` (`uploadProductImage()`) — validate `mimetype` (chỉ jpg/png/webp) + size tối đa 8MB (`BadRequestException` nếu sai) → lưu vào `apps/api/src/assets/uploads/products/{mockup|size-chart}/{myNanoid()}.{ext}` (`fs.promises.mkdir` + `writeFile`) → trả **URL tuyệt đối** trỏ vào endpoint serve bên dưới, dựng từ chính request (`${req.protocol}://${req.headers.host}/api/v1/product-configs/uploaded-image/{folder}/{filename}`) — bắt buộc tuyệt đối vì FE/API khác origin.
- `GET /v1/product-configs/uploaded-image/:folder/:filename` (`serveProductImage()`, **public** `@Auth([], [], { public: true })` — bắt buộc vì `<img src>` không gửi kèm JWT) — đọc file qua `StreamableFile`/`createReadStream`, `resolveProductImagePath()` chặn path traversal (whitelist `folder` ∈ {mockup, size-chart} + regex filename khớp đúng format tự sinh).
  > ⚠️ **KHÔNG dùng `ServeStaticModule` sẵn có** (`rootPath: ./src/assets` ở `app.module.ts`) để serve ảnh upload — đã thử và **KHÔNG hoạt động**: `@nestjs/serve-static`'s `FastifyLoader` đăng ký `@fastify/static` với `wildcard: false`, nghĩa là nó chỉ tự động tạo route cho các file **ĐÃ TỒN TẠI lúc server khởi động** (quét thư mục 1 lần khi boot); file tạo ra lúc runtime (mọi lượt upload) không có route, request rơi vào SPA fallback (`index.html` rỗng của `serve-static` — trả về 200 OK nhưng Content-Length 0, KHÔNG phải 404) → ảnh "upload thành công nhưng không hiển thị được". Do đó bắt buộc phải có endpoint serve riêng đọc file động mỗi request thay vì dựa vào static middleware.
  > ⚠️ **Route serve BẮT BUỘC có `@Header('Cross-Origin-Resource-Policy', 'cross-origin')`** — `helmet()` (`main-nest.ts`) mặc định set `Cross-Origin-Resource-Policy: same-origin` toàn cục; vì web app (`:5173`) và API (`:3007`) khác origin, trình duyệt sẽ **chặn hiển thị ảnh khi nhúng qua `<img>`** dù mở thẳng URL trong tab mới vẫn load bình thường (CORP chỉ chặn cross-origin embed, không chặn navigation trực tiếp — dễ gây nhầm lẫn khi debug). Override riêng route này thay vì đổi config helmet toàn cục.
- Thư mục `src/assets/uploads/` đã thêm vào `.gitignore` (file upload là runtime data, không commit). Deploy (`deploy.sh`) chỉ `git reset --hard` (KHÔNG `git clean`) nên file untracked này sống sót qua deploy bình thường trên cùng server; KHÔNG có redundancy như S3 nếu server bị rebuild/di dời.
- Mỗi sản phẩm chỉ 1 ảnh mockup + 1 ảnh bảng size (upload mới ghi đè giá trị field trong form, **KHÔNG xoá file cũ** trên đĩa — chấp nhận rác tích lũy, giống hành vi cũ khi còn dùng S3).

**Frontend:** `RepositoryRemote.productConfig.uploadProductImage(formData)` (`apps/web/src/services/productConfig.ts`) gọi endpoint trên — **tách biệt hoàn toàn** với `RepositoryRemote.upload.uploadImage()` (S3, vẫn còn trong codebase cho mục đích khác, không dùng cho product mockup/size-chart nữa).

**`printArea`** (vị trí in) là **mảng key CỐ ĐỊNH** (KHÔNG free-text, KHÔNG cho tự gõ) — danh mục toàn bộ vị trí in khả dĩ định nghĩa **constant trong code** ở `packages/shared/constants/product-print-area.ts`:
- `PRODUCT_PRINT_AREAS: {key, label}[]` — derive **tự động** từ `DesignFieldsZod.shape` (`packages/shared/dtos/production-order.dto.ts`, field `order.designs`) + map nhãn tiếng Việt cố định (`PRINT_AREA_LABELS`, TypeScript ép kiểu `Record<ProductPrintAreaKey, string>` nên thêm/xoá key trong `DesignFields` mà quên cập nhật nhãn sẽ **fail compile**).
- `ProductPrintAreaKeyZod` (`z.enum(...)`) — validator chỉ chấp nhận đúng các key này; `ProductConfig.printArea` = `ProductPrintAreaKeyZod.array().max(30)` + `.refine()` chặn trùng lặp.
- **Lý do chọn constant thay vì free-text/object** (`key`+`label`+`designKey` tự gõ ở bản đầu): `designKey` phải khớp CHÍNH XÁC 1 field trong `DesignFields` mới có ý nghĩa (nếu không sẽ trỏ tới field design không tồn tại) — gõ tay dễ sai chính tả và không thể phát hiện lỗi cho tới khi tích hợp API thực tế. Khoá cứng theo danh mục loại bỏ hẳn lớp lỗi này; nhãn hiển thị là hàm thuần của key (không cần lưu lặp lại theo từng sản phẩm).
- UI trang chi tiết (tab "Chi tiết sản phẩm"): **checkbox grid** liệt kê toàn bộ `PRODUCT_PRINT_AREAS`, admin chỉ tick chọn vị trí sản phẩm này hỗ trợ (KHÔNG có ô nhập tay).
- API catalog khách hàng (`CustomerCatalogService.getCatalog()`) resolve mỗi key thành `{key, label}` qua `PRODUCT_PRINT_AREA_LABEL_MAP` ngay lúc trả response (xem `CustomerCatalogPrintAreaZod`) — đối tác POD nhận được cả key máy đọc lẫn nhãn người đọc, không cần tự tra bảng constant nội bộ.

### 2.5 Biến thể (`variations`)

Tab **"Biến thể"** (ở trang chi tiết, dạng bảng — xem §2.1) — mỗi sản phẩm có danh sách biến thể, mỗi biến thể có SKU riêng **unique toàn hệ thống** (Mongo unique+sparse index trên `variations.sku`; trùng SKU với sản phẩm khác → 400 "SKU biến thể đã tồn tại ở sản phẩm khác", xử lý ở `product-config.service.ts` qua `isDuplicateVariationSkuError()`). **KHÔNG định nghĩa cứng field màu/size** — `attributes` là danh sách key-value tự do (cùng shape với `itemSpecifics`: `{label, value}`), admin tự đặt tên thuộc tính (VD: "Màu"/"Đỏ", "Size"/"M", hoặc bất kỳ tên nào khác); UI sửa qua popover `VariationAttributesEditor` (nút hiện tóm tắt `label: value · label: value`, click mở form thêm/sửa/xoá dòng) trong cột "Thuộc tính" của bảng biến thể. `cost`/`nonShipCost` là giá vốn nội bộ — **tuyệt đối không trả ra Customer Portal** (xem `CustomerCatalogVariationZod` chỉ có `attributes`/`retailPrice`/`discountedPrice`). `retailPrice` là giá bán niêm yết dùng làm gốc tính discount ở module Promotion (`Promotion.md`). `status` Active/Inactive để tạm ẩn biến thể khỏi catalog khách hàng mà không cần xoá.

**SKU tự sinh (KHÔNG sửa tay qua UI):** cột SKU trong bảng biến thể ở trang chi tiết luôn hiển thị read-only — biến thể MỚI (chưa có sku lưu DB) tự tính preview theo `computeVariationSku()` = `{sku sản phẩm}-{giá trị thuộc tính 1}-{giá trị thuộc tính 2}…`, lưu đúng giá trị này khi bấm Lưu; biến thể ĐÃ CÓ sku (load từ DB) luôn hiển thị nguyên giá trị DB, KHÔNG tự tính lại dù sau đó sửa `attributes` — mục đích ép theo quy ước mặc định nhưng vẫn cho phép admin sửa trực tiếp trong database (VD: mapping SKU với hệ thống cũ) mà không bị UI ghi đè lại. **SKU luôn "không dấu"** — `removeDiacritics()` (`apps/web/src/pages/products/detail/index.tsx`) normalize NFD + bỏ combining marks + map riêng `đ/Đ`→`d` (không decompose qua NFD) + uppercase + chỉ giữ `A-Z0-9` (loại khoảng trắng/ký tự đặc biệt), áp dụng cho cả SKU sản phẩm lẫn từng giá trị thuộc tính trước khi ghép. Nếu sản phẩm chưa có `sku` (top-level), UI hiện cảnh báo màu amber khuyến khích đặt SKU sản phẩm trước để tránh trùng SKU biến thể giữa các sản phẩm khác nhau.

**Placeholder linh động theo thứ tự** — cả popover "Thuộc tính biến thể" (1 dòng/biến thể) lẫn "Tạo nhanh biến thể" (bulk) dùng chung `getAttributePlaceholder(idx)`/`getBulkDimPlaceholder(idx)`: dòng 1 gợi ý "Size", dòng 2 "Mẫu/Màu", dòng 3 "Loại", dòng 4 trở đi dùng nhãn chung "Tên biến thể" — chỉ là placeholder gợi ý (không ép buộc thứ tự thực tế phải theo đúng nghĩa này).

**Tạo nhanh biến thể (`BulkGenerateVariantsPopover`):** nút "Tạo nhanh biến thể" cạnh "Thêm biến thể" mở popover cho nhập nhiều "thuộc tính" (tên + danh sách giá trị cách nhau dấu phẩy, VD: Màu = "Đỏ, Xanh, Vàng"; Size = "S, M, L") → sinh **tổ hợp cartesian** của tất cả thuộc tính (3×3 = 9 biến thể) rồi **thêm vào cuối** danh sách hiện có (không xoá biến thể cũ).

**Nhập nhanh giá:** thanh nhỏ phía trên bảng biến thể (chỉ hiện khi đã có ≥1 biến thể) — 3 ô số (Giá vốn / Vốn không ship / Giá bán) + nút "Áp dụng cho N biến thể" → `confirm()` rồi **ghi đè** field nào có nhập giá trị lên **toàn bộ** biến thể hiện tại (để trống ô nào = giữ nguyên giá cũ của từng dòng cho field đó).

Cột `fabricType` cho phép admin set sẵn loại vải mặc định — khi import order khớp `type` → product, BE auto-copy vào order (chỉ insert, không ghi đè) để Workshop view group được.

Cột `toolResult` **KHÔNG còn được auto-copy vào order lúc import nữa** (API OnosPod lẫn CSV) — đơn mới luôn tạo với `toolResult` rỗng để tool tự động soát (`GET /v1/orders/design-review/next`) nhận diện đúng đơn chưa soát, xem `Orders.md §3.3`. Cột này ở Products chỉ còn ý nghĩa cấu hình/hiển thị, KHÔNG ảnh hưởng đơn mới. UI bảng config vẫn giữ dropdown chọn fabric / tool inline (không đổi UI Products).

### 2.3 Import flow (`ImportProductConfigDialog.tsx`)
```
User paste TSV vào textarea
  → parseRows() detect header bằng keyword ("Tên đầy đủ", "Phòng"…) → skip dòng đầu nếu match
  → Preview số dòng hợp lệ
  → Submit → POST /v1/product-configs/import
  → BE upsert by fullName → trả về { imported, updated, skipped[] }
  → Toast: "Imported X, updated Y, Z cảnh báo" + console.warn nếu có skip
```

Schema TSV (7 cột, tab-separated):
```
Tên đầy đủ | Tên viết tắt | Máy | Xưởng | Loại vải | Kết quả Tool | Phòng
```
- **Máy** (`machineNumber`) — vd "94", "27". Empty ⇒ default `toolResult = no-tool`. **Không khớp ⇒ auto-create** entry trong `workshop_config.machine` (code `machine-{slug}`, color xám `#6B7280`); ProductConfig lưu workshop_config code. FE resolve code → name + color qua `workshopConfigStore` để render badge.
- **Xưởng** (`factoryLabel`) — match `FactoryService.findByLabel()`: tolerant với prefix "Xưởng " và case (vd "MÊ LINH" match "Xưởng Mê Linh"). Match shortName trước, fallback regex name.
- **Loại vải** (`fabricLabel`) — match `workshop_config` (category=fabric_type) qua `name` case-insensitive. **Không khớp ⇒ auto-create** entry mới (slugified code, icon `Shirt`, isActive=true) rồi gán cho product. Sau import FE force-reload `workshopConfigStore` để dropdown thấy fabric mới.
- **Kết quả Tool** (`toolResultLabel`) — match workshop_config (category=tool_result). Empty ⇒ default `has-tool` nếu Máy có giá trị. Empty + Máy trống ⇒ default `no-tool`.
- **Phòng** (`departmentLabel`) — match `MachineTypeService.findByLabel()`: shortName trước, fallback name case-insensitive (vd "IN và CẮT LASER" match "In và cắt laser"). Không khớp ⇒ skip dòng.

---

## 3. Tab `Xưởng` (`apps/web/src/pages/products/FactoryTab.tsx`)

### 3.1 Layout
3 bảng xếp dọc (`space-y-6`) — Xưởng / Loại máy dùng CHUNG 1 form generic (`FormState.type: 'factory' | 'machineType'`, `renderTable()` tái dùng cho cả 2), Loại vải render riêng (icon picker):
- **Xưởng** (Factory) — CRUD shortName/name/isActive
- **Loại máy** (MachineType / Phòng) — CRUD shortName/name/isActive
- **Loại vải** (Fabric — workshop_config category=fabric_type) — CRUD code/name/icon/isActive, dùng `IconPicker` và slugify tự động. Sync `workshopConfigStore`. Đây là **cùng dataset** với tab Loại vải ở trang Workshop Config, đặt ở đây để admin tiện thao tác sau khi import. Có nút **"Reset từ seed"** → `POST /v1/workshop-config/reset/fabric_type` hard-delete toàn bộ category rồi re-insert 22 fabric từ `WORKSHOP_CONFIG_SEED` (POLY 2 DA, MÈ 64, LỤA 4B, LỤA VÂN GỖ, THUN LẠNH, NỈ BÔNG, MÈ CARO, LỤA NGỌC TRAI, LƯỚI, THÔ MỘC, LỤA, CANVAS, THUN BỘT, PHI BÓNG, 60% COTTON 40% POLY, LÔNG- CHĂN, ÁO: LỤA 4B- QUẦN: MÈ CARO, VẢI MÈ MỚI, MIX VẢI + LƯỚI, MÈ CA SẤU, THÊU, GIẢ LEN).

### 3.2 Factory CRUD
| Field | Type | Validation |
|-------|------|------------|
| `name` | string | Required, trim |
| `shortName` | string | Required, uppercase, unique |
| `isActive` | boolean | Default true (switch toggle) |

### 3.3 MachineType CRUD
| Field | Type | Validation |
|-------|------|------------|
| `name` | string | Required, trim |
| `shortName` | string | Required, uppercase, unique |
| `isActive` | boolean | Default true |

### 3.4 Auto-seed
Khi BE khởi động, `FactoryService.onModuleInit()` + `MachineTypeService.onModuleInit()` insert các bản ghi mặc định nếu **shortName chưa tồn tại** (per-record check, không check total). Mặc định:
- **Factory:** PT, ZK, GG
- **MachineType:** DTG, DTF, EMB, SUB

---

## 4. Tab `Danh mục` (`apps/web/src/pages/products/ProductCategoryTab.tsx`)

Tab riêng cấp ngang hàng Config/Xưởng (KHÔNG lồng trong tab Xưởng — dễ tìm hơn). CRUD 1 bảng đơn giản, cùng pattern Factory/MachineType nhưng KHÔNG dùng chung generic form (component độc lập, tự quản state).

Backend module riêng `apps/api/src/modules/product-category/` **KHÔNG dùng workshop_config** — cùng pattern hệt Factory/MachineType (entity + repository + service + controller + module, xem `factory.entity.ts` làm template). Lý do tách riêng: danh mục sản phẩm là khái niệm catalog/bán hàng (không phải cấu hình vận hành xưởng), cần tham chiếu ổn định qua `_id` từ cả `ProductConfig` (§2.4) lẫn `Promotion` (`scope='category'`, xem `Promotion.md`).

**Đa cấp độ (cây danh mục):** `parentId` tự tham chiếu (self-ref, optional — không có = danh mục gốc) cho phép lồng không giới hạn độ sâu (VD: Áo/Quần → Áo → Áo thun). API vẫn trả **FLAT list** (không nest lồng nhau trong response) — FE tự dựng cây + tính `depth` qua `apps/web/src/utils/categoryTree.ts` (`sortCategoryTree()`, depth-first, cha trước con, có guard chống vòng lặp dữ liệu lỗi). `ProductConfig.productCategoryId` (§2.4) có thể trỏ tới **BẤT KỲ cấp độ nào** trong cây (không bắt buộc node lá).

```ts
// ProductCategoryEntity
{
  name: string;         // Required, trim
  shortName: string;    // Required, uppercase, unique — index
  isActive: boolean;    // Default true
  parentId?: ObjectId;  // ref ProductCategoryEntity (self) — undefined = danh mục gốc
}
```

| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| GET | `/v1/product-categories` | Admin/Manager | List + phân trang + filter `isActive`/`search` (flat, chưa nest) |
| POST | `/v1/product-categories` | Admin/Manager | Tạo — trùng `shortName` → 400; `parentId` không tồn tại → 404 |
| PATCH | `/v1/product-categories/:id` | Admin/Manager | Update — validate `parentId` tồn tại (404) + **chặn vòng lặp** (`assertNoCycle()` trong `product-category.service.ts`: đi ngược chuỗi cha của `parentId` mới, gặp lại chính node đang sửa → 400 "Không thể chọn danh mục con của chính nó làm danh mục cha") + `parentId === id` → 400 ngay lập tức |

`ProductCategoryService.onModuleInit()` seed 4 mặc định nếu **shortName chưa tồn tại**: APPAREL (Áo/Quần), MUG (Ly/Cốc), HOME-DECOR (Trang trí nhà), ACCESSORY (Phụ kiện) — đều là danh mục gốc (không `parentId`).

`ProductConfigService.createProductConfig()`/`updateProductConfig()` validate `productCategoryId` tồn tại (404 nếu không, qua `ProductCategoryService.getProductCategory()`) khi client gửi giá trị — tương tự validate `factoryId`/`machineTypeId`. Validate này **không quan tâm cấp độ** — danh mục gốc hay danh mục con đều hợp lệ.

**UI:** bảng ở `ProductCategoryTab.tsx` render theo thứ tự cây (`sortCategoryTree`) + indent theo `depth` (thụt lề `depth*20px` + ký hiệu `└`); dialog thêm/sửa có select "Danh mục cha" (loại trừ chính node đang sửa, cây cũng indent bằng dấu `—` lặp theo depth). Dropdown "Danh mục sản phẩm" ở trang chi tiết sản phẩm (§2.4) dùng chung `sortCategoryTree` để hiện cây khi chọn.

> **Giới hạn đã biết:** giống các field ref optional khác trong repo (VD: `productCategoryId` ở ProductConfig), gửi PATCH với `parentId` rỗng/`undefined` sẽ KHÔNG xoá được `parentId` đã set trước đó (JSON bỏ qua key `undefined` nên field cũ giữ nguyên trong DB) — muốn đưa 1 danh mục con về lại gốc cần sửa trực tiếp trong database. Chưa cần thiết phải sửa (chưa có yêu cầu thực tế), chỉ lưu ý nếu sau này cần bổ sung.

---

## 5. Backend Modules

### 5.1 `product-config/`
| File | Mô tả |
|------|-------|
| `product-config.entity.ts` | Schema + virtual `factory`, `machineType`, `productCategory` |
| `product-config.repository.ts` | Extends `DatabaseRepositoryAbstract` |
| `product-config.service.ts` | Logic CRUD + `bulkUpsert()` |
| `product-config.controller.ts` | 7 endpoints: list / get-by-id / create / update / delete / delete-all / import |

### 5.2 `factory/`, `machine-type/` & `product-category/`
- Cùng pattern: entity + repo + service + controller (xem §4 cho `product-category/`)
- Service có method `findByShortName()` để Product Config resolve trong import flow
- `findByShortName()` được cache (Redis TTL 5 phút) vì lookup nhiều khi import

### 5.3 Cache
- Key: `factories:all`, `machineTypes:all`, `productConfigs:type:{shortName}`
- Invalidate khi create/update/delete

---

## 6. API endpoints

### 6.1 Product Config
| Method | Path | Body / Query | Mô tả |
|--------|------|--------------|-------|
| GET | `/v1/product-configs` | `?page&limit&search&factoryId&machineTypeId` | List + filter |
| GET | `/v1/product-configs/:id` | — | Lấy 1 sản phẩm (populate `factory`/`machineType`/`productCategory`) — dùng bởi trang chi tiết `/adm/products/:id` |
| POST | `/v1/product-configs` | CreateProductConfigDto | Tạo |
| PATCH | `/v1/product-configs/:id` | UpdateProductConfigDto | Update |
| DELETE | `/v1/product-configs/:id` | — | Soft delete 1 dòng |
| DELETE | `/v1/product-configs/all` | — | Hard delete toàn bộ (SuperAdmin/Admin) — trả về `{ removed }` |
| POST | `/v1/product-configs/import` | `{ rows: [] }` | Bulk upsert by fullName |

### 6.2 Factory & MachineType
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/v1/factories` | List all (cache) |
| POST | `/v1/factories` | Create |
| PATCH | `/v1/factories/:id` | Update |
| DELETE | `/v1/factories/:id` | Soft delete |
| GET | `/v1/machine-types` | List all (cache) |
| POST | `/v1/machine-types` | Create |
| PATCH | `/v1/machine-types/:id` | Update |
| DELETE | `/v1/machine-types/:id` | Soft delete |

### 6.3 ProductCategory (§4)
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/v1/product-categories` | List + phân trang |
| POST | `/v1/product-categories` | Create |
| PATCH | `/v1/product-categories/:id` | Update |

---

## 7. Quan hệ với Order module

Khi `importOrders()` chạy, mỗi order sẽ:
1. Lookup `ProductConfig` theo `type` (shortName)
2. Nếu match → set `productConfigId`, `factoryId`, `machineTypeId` từ config + `isMapped=true`
3. Nếu không match → `isMapped=false`, frontend hiển thị badge "Chưa map"

Tỉ lệ map tốt là tiền đề cho:
- Dashboard `byFactory` chia chính xác
- Workflow điều phối xưởng đúng

---

## 8. Permissions

| Role | Truy cập |
|------|----------|
| Admin | ✅ full CRUD |
| Manager | ✅ full CRUD |
| User thường | ❌ |
