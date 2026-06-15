# Pricing Management — Function Description

> **Folder BE:** `apps/api/src/modules/pricing/`
> **Folder FE:** `apps/web/src/pages/pricing/`, `apps/web/src/components/pricing/`
> **Route chính:** `/pricing`

---

## 1. Overview

Module **Pricing** cho phép Admin quản lý giá linh hoạt theo nhóm khách hàng (Price Group) và giá riêng từng customer (Customer Price Override). Khi tạo đơn hàng, hệ thống tự động resolve giá theo thứ tự ưu tiên:

```
1. Customer Price Override  (per-user, per-variant)   ← Cao nhất
2. Price Group Item         (per-group, per-variant)
3. Default variant.price                               ← Mặc định
```

---

## 2. Cấu trúc Files

### Backend

```
modules/pricing/
├── pricing.module.ts              → NestJS module definition
├── pricing.controller.ts          → 12 REST endpoints
├── pricing.service.ts             → Business logic + resolvePrice() core
├── price-group.entity.ts          → Mongoose schema: price_groups collection
├── price-group.repository.ts      → Data access cho PriceGroup
├── price-group-item.entity.ts     → Mongoose schema: price_group_items collection
├── price-group-item.repository.ts → Data access cho PriceGroupItem
├── customer-price.entity.ts       → Mongoose schema: customer_prices collection
└── customer-price.repository.ts   → Data access cho CustomerPrice
```

### Frontend

```
pages/pricing/
├── index.tsx                      → Trang chính: Tabs Price Groups / Customer Overrides
├── PriceGroupTab.tsx              → Tab 1: CRUD Price Groups
└── CustomerOverrideTab.tsx        → Tab 2: Quản lý customer overrides

components/pricing/
├── PriceGroupTable.tsx            → Bảng price groups (expandable row → items)
├── PriceGroupFormModal.tsx        → Modal tạo/sửa price group
├── PriceGroupItemTable.tsx        → Bảng variant prices trong 1 group
├── SelectVariantModal.tsx         → Modal chọn product → provider → variants + set giá (dùng chung cho Price Group & Customer Override)
└── CustomerPriceTable.tsx         → Bảng customer overrides phân cấp (User → Product → Variant) với inline editing

components/users/
└── UserPricingDrawer.tsx          → Drawer pricing trong Users table
```

### Shared

```
packages/shared/dtos/pricing.dto.ts → Zod schemas + DTO classes
```

---

## 3. Data Model

### 3.1 Price Group (`price_groups`)

| Field | Type | Mô tả |
|-------|------|-------|
| `name` | string | Tên nhóm giá (VIP, Gold, Silver...) |
| `code` | string | Mã nhóm, unique, uppercase |
| `description` | string? | Mô tả nhóm |
| `status` | Status | Active / Inactive |

**Indexes:** `{ name: 1 }`, `{ code: 1 }` (unique)

### 3.2 Price Group Item (`price_group_items`)

| Field | Type | Mô tả |
|-------|------|-------|
| `priceGroupId` | ref → PriceGroup | Thuộc nhóm giá nào |
| `variantId` | ref → ProductVariant | Variant nào |
| `productId` | ref → Product | Product nào (denormalized) |
| `providerId` | ref → Provider? | Nhà cung cấp nào (denormalized) |
| `price` | number | Giá nhóm |
| `shippingFee` | number? | Phí ship override |
| `extraItemFee` | number? | Phí item thêm override |

**Indexes:** `{ priceGroupId: 1, variantId: 1 }` (unique compound), `{ priceGroupId: 1, productId: 1 }`

### 3.3 Customer Price Override (`customer_prices`)

| Field | Type | Mô tả |
|-------|------|-------|
| `userId` | ref → User | Customer nào |
| `variantId` | ref → ProductVariant | Variant nào |
| `productId` | ref → Product | Product nào (denormalized) |
| `providerId` | ref → Provider? | Nhà cung cấp nào (denormalized) |
| `price` | number | Giá riêng cho customer |
| `shippingFee` | number? | Phí ship override |
| `extraItemFee` | number? | Phí item thêm override |
| `note` | string? | Ghi chú |

**Indexes:** `{ userId: 1, variantId: 1 }` (unique compound), `{ userId: 1, productId: 1 }`, `{ variantId: 1 }`

### 3.4 User Entity (mở rộng)

Thêm field `priceGroupIds` (array ref → PriceGroup) vào `UserEntity` để gán user vào **nhiều nhóm giá**. Khi resolve giá, nếu user thuộc nhiều group, hệ thống chọn **giá thấp nhất** từ các group.

---

## 4. Trang Pricing Management

**Route:** `/pricing`

### Layout

```
BreadCrumb: Home > Pricing Management
SectionTitle: "Pricing Management"
┌──────────────────────┬────────────────────────┐
│  Tab: Price Groups   │  Tab: Customer Overrides│
└──────────────────────┴────────────────────────┘
(Tab content)
```

### 4.1 Tab: Price Groups

#### Luồng hoạt động

```
Admin truy cập /pricing → Tab "Price Groups"
  → fetchPriceGroups() lấy danh sách groups
  → Render: Search bar + Create button → PriceGroupTable
  → Click expand row → hiển thị PriceGroupItemTable (variant prices trong group)
```

#### Bộ lọc

| Filter | Mô tả |
|--------|-------|
| Search | Tìm theo name hoặc code |

#### Chức năng

- **Tạo Price Group**: Nút "Create Group" → PriceGroupFormModal (name, code, description)
- **Sửa Price Group**: Dropdown menu → Edit → PriceGroupFormModal
- **Xóa Price Group**: Dropdown menu → Delete (kiểm tra nếu còn user đang gán thì báo lỗi)
- **Expand row**: Click chevron → hiển thị bảng variant prices trong group
- **Thêm variant prices**: Nút "Add Variant Prices" → SelectVariantModal
  - Chọn Product → hiển thị danh sách providers (Segmented tabs nếu nhiều provider)
  - Chọn Provider → hiển thị bảng variants của provider đó
  - **Batch Edit**: Nhập price/shippingFee/extraItemFee → "Apply to Selected" áp dụng cho các variants đã chọn
  - Checkbox chọn variants + nhập giá mới cho từng variant (inline InputNumber)
  - Submit → bulk upsert vào group (kèm providerId)
- **Xóa variant price**: Nút Trash → confirm → xóa item khỏi group

#### Bảng Price Group

| Column | Mô tả |
|--------|-------|
| Name | Tên nhóm giá |
| Code | Mã nhóm (Tag blue) |
| Description | Mô tả |
| Users | Số user đang thuộc group |
| Items | Số variant prices đã set |
| Status | Active / Inactive (Tag) |
| Updated | Ngày cập nhật |
| Actions | Dropdown: Edit, Delete |

#### Bảng Price Group Items (expandable)

| Column | Mô tả |
|--------|-------|
| Product | Tên product |
| Provider | Tên nhà cung cấp |
| Variant | Tên variant + options (Tags) |
| Default Price | Giá gốc variant (gray) |
| Group Price | Giá nhóm (green, bold) |
| Shipping | Phí ship override |
| Extra Item | Phí item thêm override |
| Action | Nút xóa |

### 4.2 Tab: Customer Overrides

#### Luồng hoạt động

```
Admin chọn Tab "Customer Overrides"
  → fetchCustomerPrices() lấy tất cả overrides (limit=500)
  → Group theo User → Product → Variant trên frontend
  → Render: Filter by customer + Add Override button → CustomerPriceTable (hierarchical)
```

#### Bộ lọc

| Filter | Mô tả |
|--------|-------|
| Customer | Dropdown chọn user (search by name/email) |

#### Chức năng

- **Thêm Override (top-level)**: Nút "Add Override" → Modal chọn Customer → SelectVariantModal
  - Bước 1: Chọn Customer trong modal nhỏ → nhấn "Continue"
  - Bước 2: SelectVariantModal mở ra → Chọn Product → Provider (Segmented tabs) → Variants table
  - Inline InputNumber cho price/shippingFee/extraItemFee + Batch Edit
  - Submit → bulk upsert customer prices (kèm userId, providerId)
- **Thêm Override (per-user)**: Nút "Add Prices" trên hàng user trong bảng → mở SelectVariantModal trực tiếp cho user đó
- **Sửa giá inline**: Thay đổi price/shippingFee/extraItemFee trực tiếp trong bảng variant → icon Save xuất hiện → click Save → upsert
- **Xóa Override**: Nút Trash → confirm → xóa

#### Bảng Customer Prices (Hierarchical Expandable)

**Level 1 — User rows:**

| Column | Mô tả |
|--------|-------|
| Customer | Tên + email |
| Products | Số product có override (Tag) |
| Overrides | Tổng số override (Tag blue) |
| Action | Nút "Add Prices" |

**Level 2 — Product rows (expand từ User):**

| Column | Mô tả |
|--------|-------|
| Product | Tên product |
| Variants | Số variant có override (Tag) |

**Level 3 — Variant rows (expand từ Product, inline editing):**

| Column | Mô tả |
|--------|-------|
| Provider | Tên nhà cung cấp |
| Variant | Tên variant + options (Tags) |
| SKU | Mã SKU |
| Default | Giá gốc variant (gray) |
| Override Price | InputNumber — giá override (editable) |
| Shipping | InputNumber — phí ship (editable) |
| Extra Item | InputNumber — phí item thêm (editable) |
| Actions | Save (khi có thay đổi), Delete |

---

## 5. User Pricing Drawer

**Truy cập:** Users table → Dropdown menu → "Pricing"

### Layout

```
Drawer (right, 680px width):
  Title: User name + email
  ┌──────────────────────────────────────────┐
  │ Price Group: [Select dropdown ▾]         │
  │ Description of selected group            │
  ├──────────────────────────────────────────┤
  │ Customer Price Overrides (count)         │
  │ [+ Add Override]                         │
  │ ┌────────┬────────┬───────┬─────┬──────┐ │
  │ │Product │Variant │Default│Price│Action│ │
  │ └────────┴────────┴───────┴─────┴──────┘ │
  ├──────────────────────────────────────────┤
  │ Price Resolution Priority:               │
  │ 1. Customer Override                     │
  │ 2. Price Group                           │
  │ 3. Default variant price                 │
  └──────────────────────────────────────────┘
```

### Chức năng

- **Gán Price Groups**: Multi-select dropdown → chọn nhiều groups → auto save vào user.priceGroupIds qua API `/pricing/users/:userId/groups`
- **Bỏ Price Groups**: Clear dropdown → set priceGroupIds = []
- **Thêm Override**: Nút "Add Override" → SelectVariantModal (bulk select variants + set giá, auto gắn userId)
- **Xóa Override**: Nút Trash → confirm → xóa

---

## 6. Price Resolution (Core Logic)

### Luồng resolve giá

```
resolvePrice(userId, variantId)
  │
  ├── Check Redis cache (key: pricing:{userId}:{variantId})
  │   └── Hit → return cached result
  │
  ├── Step 1: Query customer_prices (userId + variantId)
  │   └── Found → return { price, source: 'customer_override' }
  │
  ├── Step 2: Get user.priceGroupIds → Query price_group_items (groupIds + variantId) → pick lowest price
  │   └── Found → return { price, source: 'price_group' }
  │
  └── Step 3: Get variant.price (default)
      └── return { price, source: 'default' }
```

### Redis Cache Strategy

| Key pattern | TTL | Invalidate khi |
|-------------|-----|----------------|
| `pricing:{userId}:{variantId}` | 1 hour | Update/delete customer price, Update/delete group item (nếu user thuộc group), Thay đổi user.priceGroupIds |

### Batch Resolution

`resolvePrices(userId, variantIds[])` — resolve nhiều variants cùng lúc, dùng khi tạo order.

---

## 7. API Endpoints

### Price Groups

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/v1/pricing/groups` | Admin | Danh sách price groups (phân trang, search) |
| POST | `/v1/pricing/groups` | Admin | Tạo price group |
| PATCH | `/v1/pricing/groups/:id` | Admin | Sửa price group |
| DELETE | `/v1/pricing/groups/:id` | Admin | Xóa price group (kiểm tra user count) |

### Price Group Items

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/v1/pricing/groups/:groupId/items` | Admin | Danh sách variant prices trong group |
| POST | `/v1/pricing/groups/:groupId/items` | Admin | Bulk upsert variant prices (max 500) |
| DELETE | `/v1/pricing/groups/:groupId/items/:itemId` | Admin | Xóa 1 variant price khỏi group |

### Customer Price Overrides

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/v1/pricing/customer-prices` | Admin | Danh sách overrides (filter by userId, productId) |
| POST | `/v1/pricing/customer-prices` | Admin | Upsert 1 override (user + variant) |
| POST | `/v1/pricing/customer-prices/bulk` | Admin | Bulk upsert overrides (max 500) |
| DELETE | `/v1/pricing/customer-prices/:id` | Admin | Xóa 1 override |

### User-Group Assignment

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/v1/pricing/users/:userId/groups` | Admin, Manager | Lấy danh sách price groups của user |
| POST | `/v1/pricing/users/:userId/groups` | Admin, Manager | Gán price groups cho user (body: `{ groupIds: [] }`) |

### Price Resolution

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| POST | `/v1/pricing/resolve` | Authenticated | Resolve giá cho list variantIds (current user) |

---

## 8. Edge Cases

| Case | Xử lý |
|------|--------|
| Xóa Price Group đang có user | Báo lỗi: "Cannot delete: X users are assigned to this group" |
| Duplicate group code/name | Báo lỗi: "Price group code or name already exists" |
| Upsert customer price đã tồn tại | Update giá mới (upsert by userId + variantId) |
| Variant không tồn tại khi resolve | Throw NotFoundException |
| Đơn hàng đã tạo, giá thay đổi sau | Không ảnh hưởng — giá đã snapshot vào lineItem.basePrice |
| User đổi Price Group | Cache invalidated tự động |

---

## 9. Liên kết với module khác

| Module | Liên kết |
|--------|----------|
| **User** | `user.priceGroupIds` array ref → PriceGroup, virtual `priceGroups` (many-to-many) |
| **User UI** | UsersTable dropdown → "Pricing" → UserPricingDrawer |
| **Order** | `processLineItems()` gọi `pricingService.resolvePrice()` để lấy giá thực |
| **Product Variant** | Nguồn giá mặc định (fallback) |
| **Redis Cache** | Cache resolved prices với TTL 1 hour |
