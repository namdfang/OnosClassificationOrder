# Collections (Bộ sưu tập sản phẩm) — Function Description

> **File FE:** `apps/web/src/pages/products/CollectionTab.tsx` (tab "Collection" trong trang Sản phẩm) + `apps/web/src/services/collection.ts`
> **File BE:** `apps/api/src/modules/collection/` (entity + repository + service + controller + module)
> **Route:** `/adm/products` (tab Collection)
> **API:** `/v1/collections`
> **Shared:** `packages/shared/dtos/collection.dto.ts`

## 1. Overview

**Collection** = trục nhóm sản phẩm để **khách hàng duyệt/chọn khi lên đơn** (VD "3D", "Summer") — thay cho field `collection` string đơn của hệ thống cũ (OnosPod). Phân định rõ với `ProductCategory`:

| | ProductCategory | Collection |
|---|---|---|
| Mục đích | Phân loại kỹ thuật/in nội bộ + phạm vi Promotion (`scope='category'`) | Nhóm trưng bày cho khách duyệt/lọc catalog |
| Quan hệ với sản phẩm | 1 sản phẩm 1 category (`productCategoryId`) | 1 sản phẩm NHIỀU collection (`collectionIds[]`) |

Sản phẩm gắn collection qua `ProductConfigEntity.collectionIds: string[]` (badge toggle chọn nhiều trong **trang sửa sản phẩm** `/adm/products/:id/edit`, tab "Chi tiết sản phẩm" — xem `Products.md §2.4`).

## 2. Luồng hoạt động

1. Admin vào `/adm/products` → tab **Collection** → CRUD (tạo/sửa, tắt bằng `isActive` — không có delete).
2. Mở trang sửa 1 sản phẩm (`/adm/products/:id/edit`) → tab "Chi tiết sản phẩm" → toggle các collection.
3. Customer Portal Catalog lọc theo collection qua `GET /v1/customer/catalog?collectionId=` (filter `collectionIds` — đã wire BE `customer-catalog.service.ts`, FE catalog khách chưa thêm dropdown, để phase "khách lên đơn theo sản phẩm").

## 3. API / Schema

```ts
// CollectionEntity — collection 'collections'
{
  name: string;         // Required, trim
  shortName: string;    // Required, uppercase, UNIQUE — index
  image?: string;       // URL ảnh đại diện
  description?: string;
  sortOrder: number;    // default 0 — sort mặc định (sortOrder asc, createdAt desc)
  isActive: boolean;    // default true
}
```

| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| GET | `/v1/collections` | Admin/Manager | List + phân trang + filter `isActive`/`search` (name/shortName) |
| POST | `/v1/collections` | Admin/Manager | Tạo — trùng `shortName` → 400 |
| PATCH | `/v1/collections/:id` | Admin/Manager | Update |

`ProductConfigService.createProductConfig()`/`updateProductConfig()` validate từng `collectionIds[i]` tồn tại qua `CollectionService.getCollection()` (404 nếu sai) — mirror pattern `productCategoryId`.

## 4. UI Components

- `CollectionTab.tsx` — bảng (Ảnh thumbnail 40px · Tên · Viết tắt badge · Mô tả clamp-2 · Thứ tự · Trạng thái) + dialog create/edit (name, shortName uppercase, image URL, description, sortOrder, switch isActive). Mirror `ProductCategoryTab.tsx`.
- Chọn collection cho sản phẩm: badge toggle trong trang sửa sản phẩm `apps/web/src/pages/products/edit/index.tsx` tab "Chi tiết sản phẩm" (options fetch cùng lượt với product).

## 5. Backend logic

Module `collection/` mirror 100% pattern `product-category/` (entity/repository/service/controller/module, đăng ký ở `app.module.ts`; `ProductConfigModule` import `CollectionModule` để validate ref). Không seed mặc định.

## 6. Performance notes

Collection nhỏ (< vài chục row) — không cache, fetch limit 200 một lần ở FE.

## 7. Permissions

Admin/Manager full CRUD (cùng gate trang `/adm/products`). Không có permission-catalog riêng — tab nằm trong trang Sản phẩm.
