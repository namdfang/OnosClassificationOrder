# Catalogs (Products) — Function Description

> **Folder:** `apps/web/src/pages/catalogs/`
> **Route chính:** `/catalog`, `/products/*`

---

## 1. Overview

Module **Catalogs** quản lý toàn bộ sản phẩm trong hệ thống Printsel: danh sách sản phẩm, tạo/sửa/xóa sản phẩm, quản lý variants, gán provider, match sản phẩm với đơn hàng, và nhân bản đơn hàng.

---

## 2. Cấu trúc Pages

```
pages/catalogs/
├── index.tsx                    → Trang danh sách sản phẩm (Catalog)
├── products/
│   ├── index.tsx                → Product Manager (admin table view)
│   ├── ProductDetail.tsx        → Chi tiết sản phẩm (customer-facing)
│   ├── ProductMatch.tsx         → Match sản phẩm với đơn hàng
│   └── ProductDuplicate.tsx     → Nhân bản đơn hàng
└── productForm/
    ├── index.tsx                → Form tạo/sửa sản phẩm (orchestrator)
    ├── BasicInformation.tsx     → Tab: Thông tin cơ bản
    ├── ProductDetail.tsx        → Tab: Mô tả & thông số
    ├── SalesInformation.tsx     → Tab: Bảng variants & giá
    ├── Providers.tsx            → Tab: Quản lý providers
    ├── variationItem.tsx        → Component variant option
    ├── BatchEdit.tsx            → Sửa hàng loạt variants
    ├── SelectProviderModal.tsx  → Modal chọn provider
    ├── EditStockQuantity.tsx    → Modal sửa số lượng tồn kho
    └── ViewLogs.tsx             → Modal xem lịch sử thay đổi variant
```

---

## 3. Trang danh sách sản phẩm (Catalog)

**File:** `pages/catalogs/index.tsx`
**Route:** `/catalog`

### Luồng hoạt động

```
User truy cập /catalog
  → fetchCategories() lấy danh sách danh mục (parent + children)
  → fetchProducts() lấy sản phẩm theo filter
  → Render: BreadCrumb → Filter bar → Category menu (trái) + Product grid (phải)
```

### Layout

- **Bên trái**: Menu danh mục dạng cây (parent → children), click để filter
- **Bên phải**: Grid sản phẩm dạng card (`ProductItem`), có phân trang

### Bộ lọc

| Filter | Mô tả |
|--------|-------|
| Search | Tìm theo tên sản phẩm |
| Hidden status | All / Hidden / Visible (chỉ Admin & ProductManager) |
| Provider | Lọc theo nhà cung cấp |
| Category | Lọc theo danh mục (menu bên trái) |

### Chức năng

- **Xem sản phẩm**: Click card → navigate đến `/product/:id/:slug`
- **Tạo sản phẩm**: Nút "Create new product" → `/products/create`
- **Sửa sản phẩm**: Hover card → nút Edit → `/products/edit/:id`
- **Xóa sản phẩm**: Hover card → nút Delete → confirm → API delete
- **Copy link**: Hover card → nút Copy
- **Export sản phẩm**: Download file Excel (chỉ Admin/Logistics/Accountant)
  - Export All: toàn bộ sản phẩm
  - Export theo filter hiện tại

### API

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/v1/categories/all` | Lấy tất cả danh mục |
| GET | `/v1/products` | Lấy sản phẩm có phân trang & filter |
| DELETE | `/v1/products/:id` | Xóa sản phẩm |
| GET | `/v1/products/export` | Export sản phẩm ra Excel |

---

## 4. Product Manager (Admin)

**File:** `pages/catalogs/products/index.tsx`
**Route:** `/catalog/products`

### Mô tả

Trang quản lý sản phẩm dạng bảng dành cho admin, cho phép thao tác nhanh trên nhiều sản phẩm.

### Bảng (Columns)

| Cột | Nội dung |
|-----|----------|
| Product | Ảnh thumbnail |
| Name | Tên sản phẩm |
| Category | Tên danh mục |
| Code | Mã sản phẩm |
| Status | In Stock / Out of Stock (có filter) |
| Actions | Edit, View, Hidden, Delete |

### Actions

- **Edit**: Navigate → `/products/edit/:id`
- **View**: Navigate → `/product/:id/:slug`
- **Hidden/Unhidden**: Toggle visibility sản phẩm (API call)
- **Delete**: Xóa sản phẩm (confirm dialog)

---

## 5. Chi tiết sản phẩm (Product Detail)

**File:** `pages/catalogs/products/ProductDetail.tsx`
**Route:** `/product/:id/:title`

### Luồng hoạt động

```
User truy cập /product/:id/:title
  → fetchProduct(id) lấy chi tiết sản phẩm
  → Render: ProductMedia (carousel ảnh) + Thông tin sản phẩm
```

### Layout

- **Bên trái**: Carousel ảnh sản phẩm (`ProductMedia`) với thumbnails
- **Bên phải**: Thông tin chi tiết
  - Tên sản phẩm, mã code
  - Chọn Provider (Select)
  - Chọn Variant options (dynamic Select cho mỗi option group)
  - Hiển thị: giá, mã variant, phí shipping, số lượng tồn kho
- **Bên dưới**: Tabs Description / Variants (`ProductDescription`)

### Variant Selection Flow

```
User chọn provider
  → Filter variants theo providerId
  → Hiển thị dynamic Select cho mỗi option (Color, Size, etc.)
  → User chọn options → tìm variant tương ứng
  → Hiển thị: price, variant code, shipping fee, stock quantity
```

---

## 6. Form tạo/sửa sản phẩm (Product Form)

**File:** `pages/catalogs/productForm/index.tsx`
**Route:** `/products/create` hoặc `/products/edit/:id`

### Luồng tạo sản phẩm

```
1. User vào /products/create
2. fetchProviders() → lấy danh sách providers
3. User điền 3 phần:
   a. BasicInformation: ảnh, tên, danh mục, SKU, code
   b. ProductDetail: mô tả, thời gian sản xuất/shipping, phí
   c. Providers: chọn providers → định nghĩa variants cho mỗi provider
4. Submit → transform data → createProduct() API
5. Redirect về /catalog
```

### Luồng sửa sản phẩm

```
1. User vào /products/edit/:id
2. fetchProduct(id) → load data hiện tại
3. Transform API data → form state (populate fields)
4. User chỉnh sửa
5. Submit → so sánh với originalData → chỉ gửi variants có thay đổi (isUpdated: true)
6. editProduct(id, data) API
7. Redirect về /catalog
```

### 6.1 BasicInformation

**File:** `productForm/BasicInformation.tsx`

| Field | Type | Mô tả |
|-------|------|-------|
| Images | Drag & Drop Upload | Kéo thả ảnh, sắp xếp lại thứ tự (dnd-kit), preview |
| Title | Input | Tên sản phẩm |
| Category | Select | Chọn danh mục (fetch từ API) |
| SKU | Input | Mã SKU |
| Code | Input | Mã sản phẩm |

### 6.2 ProductDetail (Description)

**File:** `productForm/ProductDetail.tsx`

| Field | Type | Mô tả |
|-------|------|-------|
| Description | ReactQuill (WYSIWYG) | Mô tả sản phẩm, hỗ trợ upload ảnh |
| Production time | Input (start - end) | Thời gian sản xuất (ngày) |
| Shipping time | Input (start - end) | Thời gian vận chuyển (ngày) |
| Shipping fee | InputNumber | Phí vận chuyển |
| Weight | InputNumber | Cân nặng |
| Extra item fee | InputNumber | Phí thêm sản phẩm |
| Label fee | InputNumber | Phí label |
| Handling fee | InputNumber | Phí xử lý |
| Note | TextArea | Ghi chú |

### 6.3 Providers

**File:** `productForm/Providers.tsx`

**Chức năng:**
- Chọn providers cho sản phẩm qua `SelectProviderModal`
- Mỗi provider có bảng variants riêng (`SalesInformation`)
- Gán seller (beta, chỉ cho Stock providers)

**Luồng:**
```
1. Click "Add Provider" → SelectProviderModal mở
2. Chọn 1 hoặc nhiều providers → confirm
3. Mỗi provider hiển thị dạng card/tab
4. Định nghĩa variants cho provider:
   a. Thêm Variation (e.g., Color, Size) qua VariationItem
   b. Thêm options cho mỗi variation (e.g., Red, Blue, S, M, L)
   c. Hệ thống tự tạo bảng variants (tổ hợp tất cả options)
5. Điền giá, SKU, phí cho mỗi variant trong SalesInformation
```

### 6.4 SalesInformation (Bảng Variants)

**File:** `productForm/SalesInformation.tsx`

Bảng dynamic hiển thị tất cả tổ hợp variant:

| Cột | Mô tả |
|-----|-------|
| [Option columns] | Dynamic: Color, Size, etc. (tùy theo variants đã định nghĩa) |
| Price | Giá bán (InputNumber, editable) |
| Provider Price | Giá nhà cung cấp |
| Weight | Cân nặng (chỉ Stock providers, beta) |
| Shipping Fee | Phí vận chuyển |
| Extra Item Fee | Phí thêm SP |
| SKU | Mã SKU |
| Actions | Edit stock, View logs |

**Tính năng đặc biệt:**
- **Batch Edit**: Chọn nhiều variants → sửa giá/phí hàng loạt
- **Edit Stock Quantity**: Modal sửa số lượng tồn kho (với ghi chú)
- **View Logs**: Xem lịch sử thay đổi variant (user, field, before/after, timestamp)

### 6.5 VariationItem

**File:** `productForm/variationItem.tsx`

Component quản lý 1 nhóm variant:
- Input tên variant (e.g., "Color")
- Thêm/xóa options (e.g., "Red", "Blue", "Green")
- Validate: không trùng tên variant, không trùng option
- Collapse/expand khi đã hoàn thành

### 6.6 BatchEdit

**File:** `productForm/BatchEdit.tsx`

Modal sửa hàng loạt:
- Chọn tổ hợp variant cần sửa (e.g., tất cả Color=Red)
- Điền giá/phí mới → áp dụng cho tất cả variants khớp
- Dynamic fields tùy theo provider type

---

## 7. Product Match (Match sản phẩm với đơn hàng)

**File:** `pages/catalogs/products/ProductMatch.tsx`
**Route:** `/orders/match-product`

### Mô tả

Khi đơn hàng import vào hệ thống (từ CSV hoặc marketplace), cần match từng line item với sản phẩm trong catalog để xác định variant, artwork, mockup.

### Luồng hoạt động

```
1. Load order detail (getDetailOrder)
2. Hiển thị bảng line items với thông tin từ đơn gốc
3. Với mỗi line item:
   a. Chọn sản phẩm hệ thống → SelectProductModal
   b. Chọn variant (provider, options) → ProductSystem
   c. Chọn artwork (front/back) → SelectArtworkModal
   d. Nhập/chọn mockup URL → SelectMockupModal hoặc input URL
4. Validate:
   - Tất cả line items phải có variantId
   - ONOS provider: cần 1 mockup
   - FLASHSHIP provider: cần 1-2 mockups
   - Print area: validate artwork theo 1-side / 2-side
5. Submit → ProductMatch API
6. Redirect về order detail
```

### Bảng Line Items

| Cột | Nội dung |
|-----|----------|
| # | STT |
| External data | Ảnh, tên, variant từ đơn gốc |
| System product | Sản phẩm đã match (ProductSystem component) |
| Front artwork | Ảnh mặt trước |
| Back artwork | Ảnh mặt sau |
| Mockup | Ảnh mockup |
| Price | Giá variant |
| Status | Trạng thái match (success/pending) |

---

## 8. Product Duplicate (Nhân bản đơn hàng)

**File:** `pages/catalogs/products/ProductDuplicate.tsx`
**Route:** `/orders/duplicate-product`

Tương tự ProductMatch nhưng:
- Cho phép sửa **External ID** cho đơn nhân bản
- Submit → `duplicateOrders()` API thay vì ProductMatch
- Tạo đơn hàng mới với sản phẩm đã match

---

## 9. Components hỗ trợ

### ProductItem (`components/products/ProductItem.tsx`)
- Card sản phẩm trong grid view
- Hiển thị: ảnh, tên, giá min, summary (color/size/areas), số providers
- Hover: hiện nút Edit, Copy, Delete
- Badge "Inactive" nếu sản phẩm bị ẩn

### ProductFilterForm (`components/products/ProductFilterForm.tsx`)
- Form lọc sản phẩm: search, hidden status, provider
- Hidden filter chỉ hiện cho Admin & ProductManager

### ProductManagerFilterForm (`components/products/ProductManagerFilterForm.tsx`)
- Filter nâng cao cho admin: search, provider, category, hidden, date range
- Date presets: Today, Yesterday, 7/14/30 days

### ProductMedia (`components/products/ProductMedia.tsx`)
- Carousel ảnh sản phẩm với thumbnail sidebar
- Hiển thị thời gian sản xuất & shipping

### ProductDescription (`components/products/ProductDescription.tsx`)
- Tabs: Description (HTML) / Variants (bảng)
- Preview ảnh khi click trong description

### ProductVariant (`components/products/ProductVariant.tsx`)
- Bảng tất cả variants: Code (copy), Price, Provider (filter), SKU (copy), Options

### ProductSystem (`components/products/ProductSystem.tsx`)
- Component chọn variant trong flow match sản phẩm
- Chọn provider → chọn options → auto fill giá

### SelectProductModal (`components/products/selectProductModal/`)
- Modal chọn sản phẩm từ catalog
- Category filter, search, pagination, grid card view

### SelectArtworkModal (`components/products/selectArtworkModal/`)
- Modal chọn artwork/design
- Upload drag & drop, search, áp dụng front/back

---

## 10. API Endpoints

### Catalog Service

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/v1/categories/all` | Lấy tất cả danh mục |
| GET | `/v1/categories` | Lấy danh mục có phân trang |
| POST | `/v1/categories` | Tạo danh mục |
| PATCH | `/v1/categories/:id` | Sửa danh mục |
| DELETE | `/v1/categories/:id` | Xóa danh mục |
| GET | `/v1/products` | Lấy sản phẩm có filter & pagination |
| POST | `/v1/products` | Tạo sản phẩm |
| PATCH | `/v1/products/:id` | Sửa sản phẩm |
| GET | `/v1/products/detail/:id` | Chi tiết sản phẩm |
| DELETE | `/v1/products/:id` | Xóa sản phẩm |
| POST | `/v1/products/hidden/:id` | Toggle ẩn/hiện sản phẩm |

### Product Service

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/v1/product-variants/bulk` | Validate variants theo code |
| GET | `/v1/products/statistic` | Thống kê sản phẩm |
| GET | `/v1/product-variants` | Lấy tất cả variants |
| GET | `/v1/product-variants/:id` | Chi tiết variant |
| PATCH | `/v1/product-variants/:id` | Sửa variant |
| POST | `/v1/products/find-variants-by-hash` | Tìm variants theo hash |
| GET | `/v1/product-variants/logs/:id` | Lịch sử thay đổi variant |

---

## 11. Data Models chính

### Product

```
Product {
  _id, code, title, slug, sku
  categoryId → Category
  description (HTML)
  images[] → ResImage
  providers[] → { providerId, Provider, variants[] }
  productionTime { start, end }
  shippingTime { start, end }
  shippingFee, weight, extraItemFee, labelFee, handlingFee
  note, isHidden, status
  createdAt, updatedAt
}
```

### ProductVariant

```
ProductVariant {
  _id, productId, providerId, code, sku
  price, providerPrice
  stockQuantity, weight
  shippingFee, extraItemFee
  options[] (e.g., ["Red", "Large"])
  status (Active/Inactive)
  logs[] → { userId, field, before, after, timestamp }
}
```

### Category

```
Category {
  _id, name, code, description
  imageId → ResImage
  parentId → Category (hierarchical)
}
```

---

## 12. Phân quyền

| Tính năng | Roles |
|-----------|-------|
| Xem Catalog | Tất cả (theo permissionMap) |
| Tạo sản phẩm | Tất cả có quyền |
| Sửa/xóa sản phẩm | Theo permissionMap |
| Export sản phẩm | Admin, Logistics, Accountant |
| Ẩn/hiện sản phẩm | Admin, ProductManager |
| Xem hidden filter | Admin, ProductManager |
| Product Manager page | Theo permissionMap (PRODUCT_MANAGER) |
| Gán seller cho provider | Beta (Stock providers only) |

---

## 13. Đặc điểm kỹ thuật

- **Variant generation**: Tự động tạo tổ hợp từ tất cả options (Cartesian product)
- **Drag & drop images**: Sử dụng `@dnd-kit` để sắp xếp thứ tự ảnh
- **Rich text editor**: ReactQuill với upload ảnh inline
- **Dynamic columns**: Bảng SalesInformation tự sinh cột theo variant options
- **Batch operations**: Sửa giá/phí cho nhiều variants cùng lúc
- **State sync**: Filter state sync với URL params (bookmarkable)
- **Lazy validation**: Validate provider-specific rules (ONOS, FLASHSHIP) khi submit
