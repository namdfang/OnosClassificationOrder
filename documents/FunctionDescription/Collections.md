# Collections — Function Description

> **File FE:** `apps/web/src/pages/products/CollectionTab.tsx` (tab "Collection" trong trang Sản phẩm), `apps/web/src/services/collection.ts`, chọn collection cho sản phẩm ở `apps/web/src/pages/products/detail/index.tsx` (section ② — badge multi-select)
> **File BE:** `apps/api/src/modules/collection/` (entity + repository + service + controller + module)
> **Route:** `/adm/products` (tab Collection)
> **API:** `/v1/collections`
> **Shared:** `packages/shared/dtos/collection.dto.ts`

## 1. Overview

**Collection** = bộ sưu tập sản phẩm cho catalog (VD "Summer 2026", "Best seller") — nhóm gán tay, **phẳng** (không phân cấp), 1 sản phẩm thuộc **NHIỀU** collection qua `ProductConfig.collectionIds` (mảng ref, tối đa 20). KHÁC `ProductCategory` (phân loại cấu trúc, cây đa cấp, 1 sản phẩm 1 danh mục).

Mục đích: nền tảng cho tính năng khách hàng đặt đơn theo sản phẩm/CSV về sau (lọc catalog theo collection). **Đã dùng thật ở Customer Portal Catalog** — hàng card "Bộ sưu tập" + filter `collectionId` ở `/customer/catalog` (xem [`CustomerPortal.md §7`](CustomerPortal.md)).

## 2. Luồng hoạt động

1. Admin/Manager tạo collection ở tab **Collection** trang `/adm/products` (bảng + dialog, cùng pattern `ProductCategoryTab`).
2. Ở trang chi tiết sản phẩm (`/adm/products/:id`, section ② Chi tiết sản phẩm) — dãy badge collection, click toggle chọn/bỏ, lưu cùng PATCH gộp của trang.
3. BE validate mỗi `collectionId` tồn tại khi create/update product config (`ProductConfigService` gọi `CollectionService.getCollection()` → 404 nếu không có; `ProductConfigModule` import `CollectionModule`).

## 3. API / Schema

```ts
// CollectionEntity (collection 'collections')
{
  name: string;         // Required, trim
  shortName: string;    // Required, uppercase, unique — index
  image?: string;       // Ảnh đại diện (URL)
  description?: string;
  sortOrder: number;    // Thứ tự hiển thị (nhỏ → lớn), default 0
  isActive: boolean;    // Default true
}
```

| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| GET | `/v1/collections` | Admin/Manager | List + phân trang + filter `isActive`/`search` — sort mặc định `sortOrder asc, createdAt desc` |
| POST | `/v1/collections` | Admin/Manager | Tạo — trùng `shortName` → 400 |
| PATCH | `/v1/collections/:id` | Admin/Manager | Update |

Không có DELETE — tắt `isActive` để ẩn (sản phẩm đang gán vẫn giữ id).

## 4. UI Components

- `CollectionTab.tsx` — bảng (ảnh thumbnail / tên+mô tả / viết tắt / thứ tự / trạng thái) + dialog thêm/sửa. i18n namespace `products` key `collectionTab.*`.
- Trang chi tiết sản phẩm — `detail.collectionsField.*`: badge toggle multi-select, empty-state trỏ về tab Collection.

## 5. Backend logic

Mirror `product-category/` (entity/repository/service/controller/module) — không seed mặc định, không phân cấp. `CollectionModule` đăng ký ở `app.module.ts`, export service+repository cho `ProductConfigModule` validate ref.

## 6. Performance notes

Danh sách nhỏ (< vài trăm) — FE load 1 lần `?page=1&limit=200`, không cache đặc biệt.

## 7. Permissions

| Role | Truy cập |
|------|----------|
| Admin / Manager | ✅ full CRUD |
| Khác | ❌ |
