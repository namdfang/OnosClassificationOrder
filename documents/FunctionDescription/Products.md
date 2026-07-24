# Products — Function Description

> **File FE:** `apps/web/src/pages/products/index.tsx`
> **File BE:** `apps/api/src/modules/product-config/`, `factory/`, `machine-type/`, `product-category/`, `collection/`
> **Route:** `/adm/products`
> **API:** `/v1/product-configs`, `/v1/factories`, `/v1/machine-types`, `/v1/product-categories`, `/v1/collections`
> **Liên quan:** Chương trình giảm giá theo tier khách hàng — [`Promotion.md`](Promotion.md). Catalog cho Customer Portal (giá tham khảo đã áp discount) — [`CustomerPortal.md`](CustomerPortal.md) §7. Collection (bộ sưu tập) — [`Collections.md`](Collections.md).

---

## 1. Overview

> **⚠️ Naming:** `product-config` giờ là **module Sản phẩm thực thụ** (catalog + variations + giá + vị trí in cho khách lên đơn), KHÔNG chỉ là "config mapping xưởng" như tên gợi ý. **Quyết định 2026-07: GIỮ NGUYÊN tên module/collection (`productConfigs`) + field `orders.productConfigId`** — không rename để tránh blast radius (order mapping, dashboard aggregate, customer portal). Ai đọc code lần đầu: cứ hiểu `ProductConfigEntity` = Product.

Module **Products** quản lý 5 entity liên quan đến cấu hình sản xuất + catalog:

- **Product Config** — map `fullName` (tên đầy đủ sản phẩm) → `factory` + `machineType` (phòng / loại máy in) + `machineNumber` (số máy) + default `fabricType` + default `toolResult` + chi tiết catalog (§2.4/§2.5) + vị trí in structured (§2.6)
- **Factory** — danh sách xưởng sản xuất (mặc định ML/TN/US)
- **Machine Type** — danh sách "Phòng" / loại máy in (ICL / IEN / HT…)
- **Product Category** (§4) — danh mục sản phẩm, module riêng (KHÔNG dùng workshop_config), ProductConfig tham chiếu qua `productCategoryId`
- **Collection** — bộ sưu tập khách duyệt khi lên đơn, module riêng (xem [`Collections.md`](Collections.md)), ProductConfig tham chiếu nhiều-nhiều qua `collectionIds[]`

UI chia 4 tab:
- **Config tab** — CRUD product config + import từ Google Sheets + xóa toàn bộ
- **Danh mục tab** (`ProductCategoryTab.tsx`) — CRUD product category (§4), tab riêng cho dễ tìm
- **Collection tab** (`CollectionTab.tsx`) — CRUD collection (xem `Collections.md`)
- **Xưởng tab** — CRUD factory / machine type (2 bảng xếp dọc, xem §3)

---

## 2. Tab `Config` (`apps/web/src/pages/products/ProductConfigTab.tsx`)

### 2.1 Tính năng
| Chức năng | Mô tả |
|-----------|-------|
| List | Bảng có **phân trang** (`<PaginationBar>`, mặc định `pageSize=20`, đọc `total` từ response), sort theo `createdAt` desc. Search/Xóa tất cả reset về trang 1 |
| Search | Substring match `fullName` hoặc `shortName` (case-insensitive) |
| Filter | Query string `factoryId`, `machineTypeId` |
| Inline edit | Dropdown chọn **`factoryId` (Xưởng)** + **`machineTypeId` (Phòng)** + `fabricType` + `toolResult` + `level` cho mỗi dòng, ô nhập `mockup` (URL, cột đầu) → PATCH `/v1/product-configs/:id`. Xưởng/Phòng là **ref bắt buộc** → không có option rỗng (danh sách nạp qua `getFactories`/`getMachineTypes` 1 lần khi mount). |
| **Xưởng / Phòng** (editable) | Cột **Xưởng** (`factoryId`) + **Phòng** (`machineTypeId`) sửa inline bằng `<select>` (giá trị = id, nhãn `shortName · name`) **và** trong trang sửa sản phẩm. Update lạc quan (`factoryId`+`factory` / `machineTypeId`+`machineType`), lỗi thì refetch rollback. **Chỉ ảnh hưởng import đơn về sau** — đơn đã import giữ nguyên `factoryId`/`originalFactoryId` (insertOnly + transfer), KHÔNG backfill. BE `updateProductConfig` **validate** `factoryId` (`factoryService.getFactory`) + `machineTypeId` (`machineTypeService.getMachineType`) → 404 nếu id không tồn tại. |
| **Mockup** | Cột **đầu tiên** — string URL ảnh; hiển thị thumbnail 56×56 (click mở tab mới) + ô `Input` sửa inline, lưu on-blur khi đổi |
| **Level** | Select 1 trong **10 level cố định** (`PRODUCT_LEVELS` ở shared) — badge màu gradient dễ→khó (xanh lá `#22C55E` → đỏ đậm `#7F1D1D`). Lưu ngay khi chọn |
| **Trang sửa sản phẩm** (`apps/web/src/pages/products/edit/index.tsx`, route `PATHS.PRODUCT_EDIT = '/adm/products/:id/edit'`) | Nút ✏️ (`Pencil`) mỗi dòng **điều hướng sang TRANG riêng full-width** (KHÔNG còn dialog — `ProductConfigEditDialog.tsx` đã xóa 2026-07). Trang tự fetch `GET /v1/product-configs/:id` + options (factories/machineTypes/categories/collections song song, workshop_config qua store). **UX 1-trang-dọc + anchor nav, TOÀN BỘ text form = TIẾNG ANH**: header sticky (back + thumb ảnh chính + tên + đếm variants/print areas + nút Cancel/Save luôn hiện) kèm **thanh tab sticky chỉ là ANCHOR** — 4 section đánh số 1..4 (`SECTIONS`: Production / Product Details §2.4 / Variants & Price §2.5 / Print Areas §2.6), **mỗi section 1 màu nhận diện riêng** (icon tile indigo/sky/violet/amber + viền trái `border-l-4` cùng màu + header strip `bg-muted/40`, body trang nền `bg-muted/20` để card nổi rõ). Click tab → smooth-scroll tới section (`scroll-mt-36`), cuộn tay → **scrollspy** IntersectionObserver (rootMargin `-20% 0px -55%`) tự sáng tab; khi click có khóa scrollspy 800ms (`clickScrollUntil`). Full-bleed qua negative margin bù padding `<main>` MainLayout. **Ảnh sản phẩm = gallery nhiều ảnh** (`productForm/MockupImagesEditor.tsx`): dán URL hoặc **upload** (`POST /v1/upload/image` + `ImageType.Mockup`, chọn nhiều file), ảnh đầu = Primary (badge, hover ảnh khác để Set primary/Remove) — lưu `mockup` = ảnh đầu + `images[]` = phần còn lại. **`guide` + `description` dùng rich text editor** (`components/common/RichTextEditor.tsx`, react-quill theme snow, lưu HTML; helper `cleanHtml` coi `<p><br></p>` là rỗng). **Đã BỎ field "Vị trí in (ghi chú tự do)" (`printArea`) khỏi form** (trùng vai trò section Print Areas — field vẫn còn trong schema/DB cho data cũ, form không gửi nên không đè). Validate fail phần variants khi Save → tự scroll về section đó. Save → 1 PATCH gộp → toast → quay về `/adm/products`. Fetch lỗi/id sai → toast + navigate về danh sách. |
| **Hướng dẫn** (`guide`) | Free-text ghi chú/hướng dẫn sản phẩm — **cột trong bảng tạm ẩn**; chỉ sửa qua trang sửa sản phẩm (textarea). |
| Delete (1 dòng) | Nút xóa **tạm ẩn** (cả bảng lẫn trang sửa) — endpoint `DELETE /v1/product-configs/:id` vẫn còn, bật lại khi cần |
| **Xóa tất cả** | Confirm → DELETE `/v1/product-configs/all` (hard-delete `deleteMany({})`) — dùng khi reset từ đầu |
| Import | Dialog paste 7 cột tab-separated → bulk upsert by `fullName` |

### 2.2 Schema `ProductConfigEntity`
```ts
{
  fullName: string;        // Tên đầy đủ (vd: "All-over Print Hockey Jersey"), unique key khi upsert
  shortName: string;       // Tên viết tắt uppercase
  slug?: string;           // Slug SEO/URL (parity hệ cũ) — optional, chưa enforce unique
  sku?: string;            // SKU sản phẩm (parity hệ cũ, VD "THHW-SHIRT") — PREFIX sinh SKU biến thể, fallback shortName
  machineNumber?: string;  // Số máy in (vd "94", "27"). Empty ⇒ sản phẩm không có tool
  factoryId: ObjectId;     // ref FactoryEntity (xưởng — vd Mê Linh / Thái Nguyên / US)
  machineTypeId: ObjectId; // ref MachineTypeEntity (phòng — loại máy in: ICL / IEN / HT)
  fabricType?: string;     // workshop_config code (category=fabric_type) — default fabric copy vào order
  toolResult?: string;     // workshop_config code (category=tool_result) — default tool status. KHÔNG còn copy vào order lúc import nữa (xem §2.2 dưới) — chỉ còn ý nghĩa hiển thị/cấu hình.
  mockup?: string;         // URL ảnh mockup CHÍNH (= ảnh đầu gallery trang sửa) — hiển thị cột đầu bảng config
  images?: string[];       // Gallery ảnh PHỤ (không gồm mockup) — upload (POST /v1/upload/image, ImageType.Mockup) hoặc dán link, max 20
  level?: number;          // Cấp độ 1..10 (PRODUCT_LEVELS ở shared) — badge màu gradient
  guide?: string;          // Hướng dẫn sản xuất — HTML từ rich text editor (react-quill), max 20000

  // Chi tiết sản phẩm (catalog cho khách hàng) — xem §2.4/§2.5/§2.6
  productCategoryId?: ObjectId;  // ref ProductCategoryEntity (module riêng — §4), virtual populate `productCategory`
  collectionIds?: string[];      // ref CollectionEntity (nhiều-nhiều) — xem Collections.md
  printMethod?: string;          // workshop_config code (category=print_method)
  printArea?: string;            // Vị trí in (free-text, ghi chú — structured xem `printAreas` §2.6)
  sizeChartUrl?: string;         // Ảnh/URL bảng size
  description?: string;          // "Item description" — HTML từ rich text editor, hiển thị Customer Portal (⚠️ catalog khách hiện render text thuần, cần đổi sang render HTML khi làm phase đặt đơn)
  shortDescription?: string;     // "Short description" — HTML (parity hệ cũ)
  templateDescription?: string;  // "Template description" — HTML hướng dẫn file in/template (parity hệ cũ)
  maxProductionTime?: number;    // "Max Production time" (ngày) — block "Shipping time" (parity hệ cũ)
  maxShippingTime?: number;      // "Max shipping time" (ngày)
  hideForSeller?: boolean;       // toggle "Hide product for seller" (parity hệ cũ visible=false) — CHƯA wire vào catalog filter, phase đặt đơn sẽ dùng
  enableDesignCheck?: boolean;   // toggle "Enable design check" — chưa wire logic, giữ parity
  enableAffiliate?: boolean;     // toggle "Enable affiliate commission" — chưa wire logic, giữ parity
  itemSpecifics?: { label: string; value: string }[]; // Thông số kỹ thuật tự do
  weight?: number; width?: number; height?: number; length?: number; // Đóng gói mặc định
  optionNames?: string[];        // Tên nhóm option user TỰ ĐỊNH NGHĨA (VD ['Color','Size'] hay ['Ship By Label']) — max PRODUCT_OPTION_GROUP_MAX=3
  variations?: {
    sku: string;          // Unique TOÀN HỆ THỐNG (index unique+sparse trên `variations.sku`)
    options?: string[];    // Giá trị option ALIGN THEO INDEX với optionNames (VD ['Black','M']). BE validate độ dài + tổ hợp không trùng
    color?: string; size?: string; // DEPRECATED — legacy, đã migrate sang options (onModuleInit), không đọc nữa
    // ─ Cột giá KHỚP bảng "Variations & Price" hệ cũ (2 bên trùng field + tên) ─
    cost?: number;           // "Cost" (hệ cũ base_price) — nội bộ, KHÔNG trả ra Customer Portal
    expUsShipCost?: number;  // "EXP US/TIKTOK US" vế trái — phí ship Express US (hệ cũ auto onosexpress, giờ nhập tay) — nội bộ
    tiktokShipCost?: number; // "EXP US/TIKTOK US" vế phải — phí ship TikTok SBTT — nội bộ
    nonShipCost?: number;    // "Non-Ship" (nonship_price) — nội bộ, KHÔNG trả ra Customer Portal
    wholesalePrice?: number; // "Wholesale" (wholesale_price) — nội bộ
    retailPrice?: number;    // "EXP US $" (sale_price) — cũng là giá niêm yết catalog khách (duy nhất field giá được expose)
    tiktokPrice?: number;    // "TT US $" (tiktok_final_price) — nội bộ
    weight?: number; width?: number; height?: number; length?: number; // Override đóng gói
    status: string;        // Status.Active/Inactive
  }[];  // max PRODUCT_VARIANTS_MAX=200
  printAreas?: {           // Vị trí in STRUCTURED (§2.6) — nền cho khách lên đơn CSV
    key: string;           // ∈ 18 khóa DesignFields ('front','back','chestLeft'...) = cột design_<key> khi lên đơn — không trùng key trong 1 sản phẩm
    name: string;          // Tên hiển thị ("Mặt trước")
    templateUrl?: string;  // Link PSD/template
    widthPx?: number; heightPx?: number;
    isRequired: boolean;   // Khách BẮT BUỘC nộp design vị trí này
    isEmbroidery: boolean; // Vùng thêu — require .png khi xử lý
  }[];
}
```

> **Lưu ý:** `ProductConfigEntity` bị ràng buộc `assertSameType<ProductConfig, ProductConfigEntity>()` (2 chiều) — thêm field mới **BẮT BUỘC** sửa đồng bộ cả `packages/shared/dtos/product-config.dto.ts` (`ProductConfigZod` + Create/Update) lẫn entity, nếu không sẽ fail compile. `service.updateProductConfig` spread `...dto` nên field mới tự pass-through, không cần sửa service. 10 level cố định + màu định nghĩa ở `packages/shared/constants/product-level.ts` (`PRODUCT_LEVELS`, `PRODUCT_LEVEL_MAP`).

### 2.4 Chi tiết sản phẩm (catalog cho khách hàng)

Tab **"Chi tiết sản phẩm"** trong trang sửa sản phẩm — `productCategoryId` chọn từ module **Product Category riêng** (§4, xem tab riêng ở Products), **Collection chọn nhiều** (badge toggle, options từ `/v1/collections`, xem `Collections.md`), `printMethod` chọn từ category `print_method` trong `workshop_config` (quản lý ở trang `/workshop-config`, xem `WorkshopConfig.md`), `printArea`/`description` free-text, `sizeChartUrl` là URL ảnh, `itemSpecifics` là danh sách key-value tự do (thêm/xoá dòng), 4 field đóng gói mặc định (weight/width/height/length).

### 2.5 Biến thể (`optionNames` + `variations`) — options tự định nghĩa

> **File FE:** `apps/web/src/pages/products/productForm/` — `VariationItem.tsx` (1 nhóm option) + `VariantsTable.tsx` (bảng variants) + `BatchEditDialog.tsx` (sửa hàng loạt) + `variantUtils.ts` (`buildCombos`/`generateVariants`/`deriveGroups`/`isOrphanVariant`).

Model kiểu Shopify — thay cho 2 trường cố định Color/Item Size của hệ cũ:

1. **Nhóm option tự định nghĩa** (`VariationItem`): user thêm tối đa `PRODUCT_OPTION_GROUP_MAX=3` nhóm, mỗi nhóm có tên (VD "Color", "Ship By Label") + danh sách option (chip, thêm bằng Enter/dấu phẩy, hỗ trợ dán "Red, Blue, Green"). Validate: không trùng tên nhóm (case-insensitive, cả FE lẫn BE `assertProductStructureValid`), không trùng option trong nhóm. Collapse/expand từng nhóm.
2. **Sinh bảng variants** (nút "Sinh biến thể (N)"): tổ hợp cartesian mọi nhóm (`buildCombos` — chặn khi nhóm chưa có tên/option, chặn > `PRODUCT_VARIANTS_MAX=200` tổ hợp). **DIFF-PRESERVE** (`generateVariants`): tổ hợp đã có **giữ nguyên giá/SKU đã nhập**, tổ hợp mới thêm dòng trống, variants "mồ côi" (option bị xóa/sửa) **KHÔNG tự xóa** — giữ cuối bảng tô amber + icon ⚠, user tự quyết xóa. **Auto SKU** `{shortName}-{OPT1}-{OPT2}` (slugify uppercase, chống trùng bằng hậu tố `-2`), sửa tay được, regenerate không đè SKU đã sửa.
3. **`variations[].options`** align theo INDEX với `optionNames` — BE validate độ dài bằng nhau + tổ hợp không trùng (`assertProductStructureValid`; partial update chỉ gửi `variations` → validate theo `optionNames` đang lưu DB). SKU **unique toàn hệ thống** (Mongo unique+sparse index trên `variations.sku`; trùng → 400 qua `isDuplicateVariationSkuError()`).
4. **BatchEdit** (`BatchEditDialog`): lọc theo giá trị option từng nhóm (multi-select chip, bỏ trống nhóm = mọi giá trị) + live count khớp; fields = `NUMERIC_FIELDS` (Cost / EXP US ship / TIKTOK US ship / Non-Ship / Wholesale / EXP US $ / TT US $ / Weight / W / H / L) + status — **ô BỎ TRỐNG = GIỮ NGUYÊN giá trị cũ**, chỉ ghi đè ô có nhập. KHÔNG có dynamic fields theo provider (hệ thống chỉ có 1 nguồn sản xuất nội bộ — quyết định 2026-07).
4b. **Bảng variants KHỚP CỘT hệ cũ** (yêu cầu 2026-07): `[option cols] | SKU | Cost | EXP US/TIKTOK US (2 input ship cost) | Non-Ship | Wholesale | EXP US $ | TT US $ | Package (Weight/Width/Height/Length 4 input gọn) | Active | 🗑`. SKU prefix sinh tự động = `sku` sản phẩm (fallback `shortName`).
5. **Migration legacy** (`ProductConfigService.onModuleInit`, idempotent): variations cũ còn `color`/`size` rời → set `optionNames=['Color','Size']` + `options=[color||'As Design', size||'One Size']` (aggregation updateMany, giữ nguyên field `color`/`size` deprecated). FE `deriveGroups()` có fallback tương tự nếu doc chưa migrate.

`cost`/`nonShipCost` là giá vốn nội bộ — **tuyệt đối không trả ra Customer Portal** (xem `CustomerCatalogVariationZod` chỉ có `retailPrice`/`discountedPrice`, giờ kèm `options` + item-level `optionNames`). `retailPrice` là giá bán niêm yết dùng làm gốc tính discount ở module Promotion (`Promotion.md`). `status` Active/Inactive để tạm ẩn biến thể khỏi catalog khách hàng mà không cần xoá. Giá theo tier khách VIP KHÔNG lưu ở variation — module Promotion lo.

### 2.6 Vị trí in structured (`printAreas`)

Tab **"Vị trí in"** trong trang sửa sản phẩm (`productForm/PrintAreasEditor.tsx`) — mỗi vị trí: `key` chọn từ **18 khóa DesignFields** (`front`, `back`, `chestLeft`… — Zod `DesignFieldsZod.keyof()`, không trùng key trong 1 sản phẩm, label VN `PRINT_AREA_LABELS`), tên hiển thị (auto-fill theo key, sửa được), `templateUrl` (PSD), `widthPx`/`heightPx`, cờ `isRequired` (khách bắt buộc nộp design) + `isEmbroidery` (require .png). **Đây là nền cho phase "khách lên đơn CSV"**: cột `design_<key>` trong CSV validate thẳng theo `printAreas` của sản phẩm — cùng convention `design_*` của import OnosPod (`Orders.md §3.6`). Field `printArea` (free-text) cũ vẫn giữ làm ghi chú.

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

```ts
// ProductCategoryEntity
{
  name: string;       // Required, trim
  shortName: string;  // Required, uppercase, unique — index
  isActive: boolean;  // Default true
}
```

| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| GET | `/v1/product-categories` | Admin/Manager | List + phân trang + filter `isActive`/`search` |
| POST | `/v1/product-categories` | Admin/Manager | Tạo — trùng `shortName` → 400 |
| PATCH | `/v1/product-categories/:id` | Admin/Manager | Update |

`ProductCategoryService.onModuleInit()` seed 4 mặc định nếu **shortName chưa tồn tại**: APPAREL (Áo/Quần), MUG (Ly/Cốc), HOME-DECOR (Trang trí nhà), ACCESSORY (Phụ kiện).

`ProductConfigService.createProductConfig()`/`updateProductConfig()` validate `productCategoryId` tồn tại (404 nếu không, qua `ProductCategoryService.getProductCategory()`) khi client gửi giá trị — tương tự validate `factoryId`/`machineTypeId`.

---

## 5. Backend Modules

### 5.1 `product-config/`
| File | Mô tả |
|------|-------|
| `product-config.entity.ts` | Schema + virtual `factory`, `machineType`, `productCategory` |
| `product-config.repository.ts` | Extends `DatabaseRepositoryAbstract` |
| `product-config.service.ts` | Logic CRUD + `bulkUpsert()` |
| `product-config.controller.ts` | 6 endpoints: list / create / update / delete / import / lookup-by-type |

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
| GET | `/v1/product-configs/:id` | — | 1 sản phẩm theo id (trang sửa sản phẩm `/adm/products/:id/edit`) |
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

### 6.4 Collection
Xem [`Collections.md`](Collections.md) — `GET/POST /v1/collections` + `PATCH /v1/collections/:id` (Admin/Manager), cùng pattern ProductCategory.

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
