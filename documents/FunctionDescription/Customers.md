# Quản trị Khách hàng (`/adm/customers`) — Function Description

> **File FE:** `apps/web/src/pages/customers/` (`index.tsx` + `CustomerEditDialog.tsx` + `ResetPasswordDialog.tsx` + `CustomerOrdersDialog.tsx` + `ImportTiersDialog.tsx`) + `apps/web/src/components/common/TierBadge.tsx` + `apps/web/src/services/customer.ts`
> **File BE:** `apps/api/src/modules/customer/` (entity + service + controller) + `apps/api/src/guards/roles.guard.ts` (rule chặn role Customer) + `apps/api/src/modules/auth/jwt.strategy.ts` (chặn login khách xóa mềm)
> **Route:** `/adm/customers` (permission `page.customers` — CHỈ Admin/SuperAdmin)
> **API:** `/v1/customers` (mở rộng) — tất cả `@Auth([RoleType.Admin])`

## 1. Overview

Trang quản trị khách hàng DUY NHẤT — hợp nhất từ dialog "Danh sách khách" cũ ở
`/adm/settings/customer-factory` (đã xóa `CustomerListDialog.tsx`). Cùng bảng
`customers` phục vụ 3 mục đích: gán xưởng theo khách + tier VIP + tài khoản
Customer Portal — nên trang này là chỗ CRUD trung tâm; kanban gán xưởng/ưu tiên
ở Settings chỉ còn nhiệm vụ kéo-thả, kèm nút link "Mở trang Khách hàng".

Quyết định thiết kế đã chốt (2026-08-04, xem `documents/Plans/CustomerModule-Complete.md`):

1. **`userSku`/`userEmail` KHÓA HẲN** — khóa định danh (khớp đơn qua
   `customerMatchKey` + claim tài khoản portal), không sửa được ở bất kỳ đâu
   (Zod không nhận, FE read-only).
2. **Xóa = XÓA MỀM** (`deletedAt` kế thừa `DatabaseEntityAbstract`) + tự gỡ
   khỏi 3 config blob + sync không hồi sinh + có Khôi phục.
3. **Reset password 2 chế độ** — Admin nhập tay HOẶC generate random 12 ký tự
   (plain trả về ĐÚNG 1 LẦN, không lưu/không log).
4. **Chỉ Admin/SuperAdmin** (`page.customers` bị loại khỏi preset Manager).
5. **Role Customer bị chặn cứng khỏi mọi API xưởng** (xem §6).

## 2. Luồng hoạt động

- **List**: `GET /customers?page=&limit=&search=&tier=&status=&source=&hasAccount=&deleted=` —
  `page` có mặt → chế độ quản trị (phân trang + enrich); không có `page` →
  hành vi cũ trả toàn bộ (kanban dùng, không đổi). Cả 2 mặc định LOẠI khách
  `deletedAt`; `deleted=true` → chỉ khách đã xóa (toggle "Đã xóa" trên trang).
- **Enrich** (chỉ trang hiện tại, ≤ limit khách): `orderCount`/`lastOrderAt`
  (aggregation orders theo cặp key), `assignedFactoryId` (blob
  `customer_assignment_config`), `assignedDesignerId` (blob
  `designer_assignment_config.customers`), `hasAccount` (`password != ''`).
- **Xóa mềm**: set `deletedAt` → gỡ customerId khỏi `customer_assignment_config`
  + `customer_priority_config` + `designer_assignment_config.customers`
  (response `removedFromConfigs` = key các config đã gỡ, FE map tên qua i18n
  `configNames.*`); token đăng nhập cũ của khách chết ngay (jwt.strategy check
  `deletedAt`); `sync` không hồi sinh (upsert `$setOnInsert` + unique index giữ
  record); đăng ký claim record đã xóa bị chặn. **Khôi phục** (`POST
  /customers/:id/restore` — `$unset deletedAt`): config KHÔNG tự gán lại.
- **Tạo tay mở rộng**: đủ field + `password` optional (có → đăng nhập được
  ngay, `source='manual'`). Trùng cặp key với record đã xóa mềm → báo lỗi gợi ý
  dùng Khôi phục.

## 3. API / Schema

| Method | Path | Mô tả |
| --- | --- | --- |
| GET | `/customers` | List (2 chế độ) — filter `tier` ('0'..'5'/'none'), `status`, `source`, `hasAccount` ('true'/'false'), `deleted` |
| POST | `/customers` | Thêm tay — mở rộng fullName/phone/tier/password |
| PATCH | `/customers/:id` | Sửa `fullName`/`phone`/`tier` (KHÔNG nhận sku/email) |
| POST | `/customers/:id/reset-password` | Body `{password?}` — không có → generate, trả `generatedPassword` 1 lần |
| PATCH | `/customers/:id/status` | Khóa/mở (`Status.Active='1'`/`Inactive='0'`) — Inactive chặn login ngay |
| DELETE | `/customers/:id` | Xóa mềm + gỡ config → `{removedFromConfigs: string[]}` |
| POST | `/customers/:id/restore` | Khôi phục |

DTOs: `packages/shared/dtos/customer.dto.ts` — `CustomerAdminRowZod`
(= `CustomerZod` + enrich fields), `UpdateCustomerZod`,
`ResetCustomerPasswordZod/Res`, `UpdateCustomerStatusZod`,
`DeleteCustomerResZod`, `RestoreCustomerResZod`; `CustomerZod` thêm `deletedAt`.
`GetProductionOrdersZod` thêm `userEmail` (exact, case-insensitive) cặp với
`userSku` cho drill-down (filter tại `order.service.ts` `getOrders`).

## 4. UI Components

`pages/customers/index.tsx`:

- Toolbar: search (SKU/email/tên/SĐT, Enter) + select tier + select tài khoản
  (Tất cả / Đã đăng ký / Chưa đăng ký / Đã khóa) + toggle **Đã xóa** + nút
  **Sync từ đơn hàng** + **Import tier** + **Thêm khách hàng** (2 nút Sync/Import
  DỜI từ toolbar settings cũ sang đây).
- Bảng phân trang server-side (`PaginationBar`): SKU · Email · Tên(+SĐT) · Tier
  (`TierBadge` + native select phủ trong suốt đổi nhanh — pattern dialog cũ) ·
  chip Tài khoản (Chưa đăng ký xám / Hoạt động xanh / Đã khóa đỏ) · Nguồn ·
  Xưởng gán · Designer gán (name lookup: `factory.getFactories()` +
  `designer.listTeam(Status.Active)`) · Số đơn (click → dialog đơn) · Đơn gần
  nhất · Hành động (Sửa / Reset mật khẩu / Khóa-Mở / Xóa; tab Đã xóa → Khôi phục).
- `CustomerEditDialog.tsx` — create/edit chung; edit: sku/email `disabled` +
  note vàng "khóa định danh".
- `ResetPasswordDialog.tsx` — nhập tay ×2 hoặc nút "Tạo ngẫu nhiên" → khối
  emerald hiện password + `CopyButton` + cảnh báo chỉ hiển thị 1 lần.
- `CustomerOrdersDialog.tsx` — drill-down `GET /orders?userSku=&userEmail=`
  (pattern `CancelledOrdersDialog`), cột trạng thái: Đã hủy / Hoàn thành /
  stage hiện tại (`getStageLabel`) / Chưa vào fulfillment.
- `ImportTiersDialog.tsx` — flow import tier cũ tách ra từ `CustomerListDialog`,
  GIỮ nguyên i18n keys `customerListDialog.import.*` (namespace
  `customerFactoryAssignment`).
- `TierBadge` chuyển về `components/common/TierBadge.tsx` (dùng chung 2 kanban +
  trang này).
- i18n namespace mới `customers` (vi + en); entry sidebar `sidebar.customers`
  (`layout.json`) trong group Admin, gate `page.customers`.

## 5. Backend logic

- `CustomerService.list()` — 2 chế độ như §2; `enrichAdminRows()` private.
- `softDelete()` — đọc/ghi 3 config blob qua `SystemConfigService` (CustomerModule
  import `SystemConfigModule`; KHÔNG import CustomerAssignmentModule/
  DesignerAssignmentModule được vì vòng lặp phụ thuộc).
- `resetPassword()`/`changePassword()` dùng `findOneAndUpdate`/`updateOne`
  (KHÔNG `.save()` — eslint `no-restricted-properties`).
- Hash password: `generateHash` (core) — cùng cơ chế `register()`.
- `validateLogin`/`register`/`importTiers`/`updateTier`/`sync` đều đã filter
  `deletedAt`.

## 6. Chặn role Customer khỏi API xưởng (RolesGuard)

`apps/api/src/guards/roles.guard.ts` — rule đặt TRƯỚC nhánh `isEmpty(roles)`:
token `role.name === Customer` mà URL không chứa prefix trong
`CUSTOMER_ALLOWED_PREFIXES` (`['/customer/']`) → **deny ngay**, kể cả endpoint
`@Auth([])` roles-rỗng (lỗ hổng cũ: `GET /orders/:id/logs`). Route hợp lệ vẫn
đi tiếp flow session-Redis + roles như cũ (không bỏ qua thu hồi token).

> **QUY ƯỚC VĨNH VIỄN:** endpoint muốn cho khách hàng gọi PHẢI đặt dưới
> controller prefix `customer/...`. Phase Public API sẽ thêm `'/open-api/'`
> vào whitelist. Admin routes `customers`/`customer-notifications` KHÔNG khớp
> prefix (không có `/` sau "customer") nên vẫn bị chặn đúng.

## 7. Performance notes

- Enrich orders: 1 aggregation `$match {userSku: {$in: [≤100 sku]}}` + `$group`
  theo cặp key — không lookup toàn bảng orders (~25k docs); index `userSku` sẵn có.
- 2 config blob đọc qua cache Redis TTL 1h của `SystemConfigService.get`.

## 8. Permissions

- `page.customers` — preset Admin (SuperAdmin full sẵn); **Manager bị loại**
  (`DEFAULT_ROLE_PERMISSIONS[Manager] = ALL.filter(≠ page.customers)`).
- BE endpoints `@Auth([RoleType.Admin])` → Admin + SuperAdmin (bypass), Manager 403.

## 9. Liên quan

- Trang "Tài khoản của tôi" phía khách (`/customer/account`) + đổi mật khẩu:
  xem `CustomerPortal.md` §2.6.
- Kanban gán xưởng/ưu tiên: `CustomerFactoryAssignment.md` (toolbar đã gọn lại).
- Kế hoạch gốc + quyết định: `documents/Plans/CustomerModule-Complete.md`.
- Phase kế tiếp (CSV + Public API + API key): `documents/Plans/CustomerOrderIntake-CSV-API.md`.
