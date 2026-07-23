# Promotion — Function Description

> **File FE:** `apps/web/src/pages/promotions/index.tsx`, `PromotionEditDialog.tsx`
> **File BE:** `apps/api/src/modules/promotion/`
> **Shared:** `packages/shared/dtos/promotion.dto.ts`
> **Route:** `/adm/promotions`
> **API:** `/v1/promotions/*`
> **Liên quan:** [`Products.md`](Products.md) §2.5 (biến thể/`retailPrice`) + §4 (`ProductCategory` — `scope='category'` tham chiếu module này, KHÔNG dùng workshop_config), [`CustomerPortal.md`](CustomerPortal.md) §7 (Catalog hiển thị giá đã áp discount), tier khách hàng (`CustomerTierZod`, VIP 0..5) trong `packages/shared/dtos/customer.dto.ts` — xem `CustomerFactoryAssignment.md`.

---

## 1. Overview

Module **Promotion** cho phép Admin/Manager tạo và quản lý chương trình giảm giá áp dụng theo **tier khách hàng** (VIP 0..5, tier được Admin gán tay ở dialog "Danh sách khách hàng" trong `/adm/settings` — xem `CustomerFactoryAssignment.md`).

**Phạm vi hiện tại (Phase 1 — CHỈ tham khảo/quản lý):**
- Admin tạo/sửa/xoá chương trình giảm giá, xem thống kê nhanh (tổng số, đang hoạt động, sắp hết hạn).
- Giá đã áp discount hiển thị **tham khảo** ở trang Catalog Customer Portal (`/customer/catalog`).
- **CHƯA tích hợp vào form đặt đơn** (`/customer/orders/new`) — form này giữ nguyên hành vi cũ (nhập tay `type`/`color`/`size`/`quantity`, không tính tiền). Tích hợp tính giá vào checkout thực tế là việc của phase sau nếu cần.

---

## 2. Schema `PromotionEntity`

```ts
{
  name: string;                    // Tên chương trình
  code?: string;                   // Mã coupon — unique+sparse, hiện chỉ để hiển thị/tham khảo
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;           // % (0..100) hoặc số tiền cố định
  scope: 'all' | 'category' | 'product';  // Phạm vi áp dụng
  scopeCategoryId?: ObjectId;      // ref ProductCategoryEntity (Products.md §4) — khi scope='category'
  scopeProductConfigIds?: string[]; // ProductConfig ids — khi scope='product'
  applicableTiers?: number[];      // VIP 0..5 — rỗng/undefined = áp dụng MỌI tier (kể cả khách lẻ)
  minQuantity?: number;
  startDate?: Date;
  endDate?: Date;
  status: '1' | '0' | '-1';        // Status.Active/Inactive
}
```

Validate ở `PromotionZod` (`packages/shared/dtos/promotion.dto.ts`, `.superRefine`): `discountValue <= 100` khi `discountType='percentage'`; `scopeCategoryId` bắt buộc khi `scope='category'`; `scopeProductConfigIds` bắt buộc khi `scope='product'`; `endDate` phải sau `startDate`.

---

## 3. Logic resolve giá (`promotion.service.ts`)

- `getActiveInDateRange()` — lấy mọi promotion `status=Active` và (không có `startDate`/`endDate` hoặc thời điểm hiện tại nằm trong khoảng).
- `promotionMatches(promotion, { productConfigId, productCategoryId, tier, quantity })` — hàm thuần kiểm tra 1 promotion có khớp sản phẩm/tier/số lượng hay không (KHÔNG check ngày — caller lọc trước bằng `getActiveInDateRange`). `tier=null` (khách lẻ) chỉ khớp promotion có `applicableTiers` rỗng/undefined.
- `applyPromotionDiscount(basePrice, promotion)` — áp discount, làm tròn 2 chữ số thập phân, không âm.
- Cả 2 hàm được export và tái dùng trực tiếp ở `CustomerCatalogService` (`customer-portal/customer-catalog.service.ts`) — với mỗi biến thể sản phẩm, chọn promotion cho giá **thấp nhất** (tốt nhất cho khách) trong số các promotion khớp.

---

## 4. API endpoints

| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| GET | `/v1/promotions` | Admin/Manager | List, phân trang, filter `status`/`scope`/`tier`/`search` (tên hoặc mã coupon) |
| GET | `/v1/promotions/stats` | Admin/Manager | `{ total, active, expiringSoon (7 ngày), byTier }` |
| POST | `/v1/promotions` | Admin/Manager | Tạo — trùng `code` → 400 |
| PATCH | `/v1/promotions/:id` | Admin/Manager | Update |
| DELETE | `/v1/promotions/:id` | Admin/Manager | Soft delete |

---

## 5. UI Components

- **`pages/promotions/index.tsx`** — bảng danh sách (tên/mã/giảm giá/phạm vi/tier/hiệu lực/trạng thái) + 3 stat card + search + nút Tạo. Cùng convention với `ProductConfigTab.tsx` (`PaginationBar`, `handleAxiosError`).
- **`PromotionEditDialog.tsx`** — form tạo/sửa: chọn loại giảm giá + giá trị, phạm vi (all/category/product — hiện picker tương ứng), chọn tier áp dụng (chip toggle VIP 0..5), số lượng tối thiểu, ngày hiệu lực, switch Active/Inactive.

---

## 6. Quan hệ với module khác

- **Products** — `scope='product'` tham chiếu `ProductConfig._id`; `scope='category'` tham chiếu `ProductCategory._id` (module riêng, `Products.md §4` — KHÔNG dùng workshop_config).
- **Customer Portal Catalog** (`CustomerPortal.md §7`) — nơi DUY NHẤT hiển thị giá đã áp discount cho khách hàng; ẩn tuyệt đối `cost`/`nonShipCost`.
- **Customer tier** — dùng chung `CustomerTierZod` (VIP 0..5) đã có sẵn ở `CustomerEntity.tier`, KHÔNG tạo tier system riêng.

---

## 7. Permissions

| Role | Truy cập |
|------|----------|
| SuperAdmin / Admin / Manager | ✅ full CRUD (permission `page.promotions`, nằm trong `ALL_PERMISSION_CODES`) |
| Khác | ❌ |
