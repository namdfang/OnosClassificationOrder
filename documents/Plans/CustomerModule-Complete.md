# Kế hoạch: Hoàn thiện Module Khách hàng (Admin CRUD + hợp nhất + Portal)

> **Trạng thái:** CHƯA IMPLEMENT — đã chốt toàn bộ quyết định (§8), chờ lệnh "implement".
> **Ngày lập:** 2026-08-04 · **Cập nhật:** 2026-08-04 (chốt §8 + bổ sung §6 tách biệt role Customer)
> **Phạm vi:** Hoàn thiện module khách hàng TRƯỚC, làm nền cho phase sau (CSV + Public API — xem `CustomerOrderIntake-CSV-API.md`).
> **Mục tiêu:** (1) trang quản trị mới CRUD khách hàng đầy đủ; (2) hợp nhất danh sách khách từ `/adm/settings/customer-factory` về 1 nơi; (3) khách đăng nhập portal **giao diện hoàn toàn riêng**, tự lên đơn → tự vào quy trình sản xuất; (4) role Customer **KHÔNG vào được bất kỳ path/API nào của xưởng**.

---

## 0. Hiện trạng (đã xác minh trong code)

**Bảng `customers` là DUY NHẤT và đã dùng chung** cho cả 3 mục đích (gán xưởng, tier VIP, tài khoản portal) — phần "hợp nhất" KHÔNG cần migrate dữ liệu, chỉ dời UI về 1 chỗ.

| Đã có | Ở đâu |
| --- | --- |
| Entity đủ field: `userSku, userEmail, source(sync/manual/register), tier, password, fullName, phone, status, notificationsReadAt` | `apps/api/src/modules/customer/customer.entity.ts` |
| 5 endpoint Admin: `GET /customers` (chỉ search, KHÔNG phân trang), `POST /customers` (chỉ sku+email), `POST /customers/sync`, `PATCH /customers/:id/tier`, `POST /customers/import-tiers` | `customer.controller.ts` |
| UI quản khách = **dialog** `CustomerListDialog.tsx` trong `/adm/settings/customer-factory` | `apps/web/src/components/settings/` |
| Portal khách: login / register (claim record theo cặp sku+email) / danh sách đơn / đặt đơn form / tracking / catalog. Đặt đơn đã tự vào quy trình SX qua `importOrders()` | `apps/web/src/pages/customer/` + `apps/api/src/modules/customer-portal/` |
| FE đã tách 2 luồng auth: `PrivateRoute` (authStore nhân viên) vs `CustomerPrivateRoute` (customerAuthStore), token phân luồng theo URL ở `apis/index.tsx`; layout khách riêng `CustomerLayout.tsx` KHÔNG dùng Sidebar xưởng | `apps/web/src/App.tsx` |
| JWT branch `RoleType.Customer` đã chặn `status=Inactive` | `auth/jwt.strategy.ts` |

**Chưa có:** trang quản trị riêng; sửa fullName/phone; reset password; khóa/mở tài khoản; xóa (mềm); phân trang + filter list; xem đơn từng khách; portal chưa có trang "Tài khoản"; **BE còn lỗ hổng role Customer lọt endpoint xưởng roles-rỗng (xem §6)**.

---

## 1. Backend — mở rộng module `customer` (không tạo module mới)

### 1.1. Nâng cấp `GET /customers` (backward-compatible)

- Thêm query: `page`, `limit` (mặc định 20), `tier` (số hoặc `'none'`), `status`, `source`, `hasAccount` (`password != ''`), `deleted` (mặc định **loại** khách đã xóa mềm; `deleted=true` → chỉ hiện khách đã xóa), `sort`.
- **Enrich mỗi row** (chỉ tính cho trang hiện tại, match `$in` các cặp key — KHÔNG lookup toàn bảng orders):
  - `orderCount` + `lastOrderAt` (aggregation phụ trên `orders`).
  - `assignedFactoryId` (blob `customer_assignment_config`), `assignedDesignerId` (blob `designer_assignment_config.customers`).
- Gọi không tham số → hành vi cũ, đã loại khách xóa mềm (kanban gán xưởng dùng tiếp không sửa).

### 1.2. Endpoint mới (tất cả `@Auth([RoleType.Admin])` — SuperAdmin qua sẵn cơ chế Admin)

| Method | Path | Mô tả |
| --- | --- | --- |
| PATCH | `/customers/:id` | Sửa `fullName`, `phone`, `tier`. **ĐÃ CHỐT: `userSku` + `userEmail` KHÓA HẲN** — không nhận 2 field này (Zod strip), FE hiển thị read-only kèm chú thích "khóa định danh, không thể sửa". |
| POST | `/customers/:id/reset-password` | **ĐÃ CHỐT: 2 chế độ** — body `{ password?: string }`: có `password` (min 6) → Admin tự đặt; KHÔNG có → hệ thống generate random 12 ký tự, **trả plain đúng 1 lần trong response** (không lưu plain, không log). Hash cùng cơ chế `customerService.register()`. |
| PATCH | `/customers/:id/status` | `Active` ↔ `Inactive`. Inactive → chặn đăng nhập ngay (JWT strategy sẵn có). |
| DELETE | `/customers/:id` | **ĐÃ CHỐT: XÓA MỀM** — set `deletedAt = now` (field mới trên entity, default `null`), KHÔNG xóa document. Đồng thời **tự gỡ** customerId khỏi 3 config blob (`customer_assignment_config`, `customer_priority_config`, `designer_assignment_config.customers`); response liệt kê config đã gỡ. Khách xóa mềm: bị chặn đăng nhập (thêm check `deletedAt` cạnh check Inactive trong `jwt.strategy.ts` + `validateLogin`), ẩn khỏi mọi list/kanban, **`sync` bỏ qua không hồi sinh** (unique index cặp key vẫn giữ record → sync coi như existing, skip). |
| POST | `/customers/:id/restore` | Khôi phục khách đã xóa mềm (`deletedAt = null`). Config gán xưởng/designer KHÔNG tự gán lại — Admin kéo lại ở kanban nếu cần. |

### 1.3. Mở rộng `POST /customers` (thêm tay)

Nhập đầy đủ ngay: `userSku`, `userEmail`, `fullName`, `phone`, `tier`, `password` (optional — có thì khách đăng nhập được luôn, `source='manual'`). Validate trùng cặp key với cả record đã xóa mềm → báo lỗi gợi ý "Khôi phục" thay vì tạo mới.

## 2. Shared DTOs — `packages/shared/dtos/customer.dto.ts`

- `CustomerZod` + entity: thêm `deletedAt: z.coerce.date().nullish()`.
- `GetCustomersZod` mở rộng: `page/limit/tier/status/source/hasAccount/deleted/sort` + `CustomerAdminRowZod = CustomerZod.extend({ orderCount, lastOrderAt, assignedFactoryId, assignedDesignerId, hasAccount })`.
- Mới: `UpdateCustomerZod` (KHÔNG có userSku/userEmail) / `ResetCustomerPasswordZod` (`password` optional) + `ResetCustomerPasswordResZod` (`generatedPassword` optional) / `UpdateCustomerStatusZod` / `DeleteCustomerResZod` (`removedFromConfigs: string[]`) / `RestoreCustomerResZod`.
- `CreateCustomerZod` mở rộng như §1.3; Portal (§5): `UpdateCustomerMeZod` (`fullName`, `phone`) + `ChangeCustomerPasswordZod` (`currentPassword`, `newPassword`).
- `permission-catalog.ts`: `{ code: 'page.customers', label: 'Quản trị khách hàng', group: 'page' }` — **ĐÃ CHỐT: chỉ preset Admin** (SuperAdmin full quyền sẵn); KHÔNG thêm cho Support.

## 3. Frontend — trang mới `/adm/customers`

### 3.1. Khung

- `paths.ts`: `CUSTOMERS: '/adm/customers'`; `routerConfig.ts`: lazy route; `Sidebar.tsx`: entry "Khách hàng" (perm `page.customers`, group quản trị cạnh Users). i18n namespace mới `customers` (vi + en).

### 3.2. Trang chính `apps/web/src/pages/customers/index.tsx`

- **Toolbar:** search (sku/email/tên/phone) · filter tier (0..5 + Khách lẻ) · filter tài khoản (Chưa đăng ký / Hoạt động / Đã khóa) · toggle "Đã xóa" (xem + khôi phục khách xóa mềm) · nút **Sync từ đơn hàng** (dời từ dialog cũ) · **Import tier** (tái dùng flow cũ) · **Thêm khách hàng**.
- **Bảng** (phân trang server-side): SKU · Email · Tên · SĐT · Tier (badge màu, click đổi nhanh) · Tài khoản (chip 3 trạng thái) · Nguồn · Xưởng gán · Designer gán · Số đơn / đơn gần nhất · Hành động.
- **Hành động:** Sửa (sku/email read-only) · Reset mật khẩu · Khóa/Mở · Xóa (confirm 2 bước, liệt kê config sẽ gỡ) · [tab Đã xóa] Khôi phục.
- **Click row** → dialog "Đơn hàng của khách" (pattern `CancelledOrdersDialog`), gọi API orders filter cặp `userSku`/`userEmail` (nếu `GetOrdersDto` chưa nhận 2 param này → thêm, sửa nhỏ `buildVisibilityFilter`).

### 3.3. Dialogs (`apps/web/src/pages/customers/`)

- `CustomerEditDialog.tsx` — create/edit chung; edit: sku/email disabled.
- `ResetPasswordDialog.tsx` — 2 chế độ: nhập tay ×2 HOẶC nút "Tạo ngẫu nhiên" → hiện password 1 lần kèm nút copy + cảnh báo "chỉ hiển thị 1 lần".
- Xóa/Khôi phục: confirm dialog chung của project.

## 4. Hợp nhất từ `/adm/settings/customer-factory`

- **Không migrate data** (cùng bảng).
- `CustomerAssignmentConfig.tsx`: **bỏ** nút "Danh sách khách" + dialog → nút link "Mở trang Khách hàng" điều hướng `/adm/customers`. Sync + Import tier dời hẳn sang trang mới; kanban chỉ còn kéo-thả gán xưởng.
- Xóa file `CustomerListDialog.tsx`.
- Kanban gán xưởng + kanban ưu tiên giữ nguyên (`GET /customers` không tham số, tự loại khách xóa mềm).

## 5. Portal khách — khép kín vòng tài khoản (giao diện RIÊNG)

- Trang mới `apps/web/src/pages/customer/account/index.tsx` ("Tài khoản của tôi"): tự sửa `fullName`/`phone` + đổi mật khẩu (nhập mật khẩu cũ). Endpoint mới trong `customer-auth.controller.ts`: `PATCH /customer/auth/me` + `POST /customer/auth/change-password` (JWT Customer). Menu entry trong `CustomerLayout.tsx`.
- **ĐÃ CHỐT: giao diện khách hàng tách biệt HOÀN TOÀN giao diện xưởng** — mọi trang khách nằm trong `CustomerLayout` (header/menu riêng, không Sidebar, không component layout xưởng); trang mới cũng vậy. Đây là ranh giới thiết kế bắt buộc cho cả các phase sau.
- **Quên mật khẩu:** chưa có hạ tầng email → quy trình "khách liên hệ → Admin reset qua trang §3". Gửi mail tự động để phase sau.
- Luồng "tự lên đơn → tự vào quy trình sản xuất": đã chạy sẵn, không đụng.

## 6. Chặn cứng role Customer khỏi mọi path/API xưởng (yêu cầu bắt buộc)

**Hiện trạng FE:** đã an toàn theo thiết kế — 2 router guard + 2 token store riêng, token khách chỉ gắn cho URL `/customer/...`; khách mở path xưởng sẽ bị đá về login nhân viên vì không có token nhân viên. Không cần sửa, nhưng §5 phải giữ nguyên ranh giới này.

**Hiện trạng BE — CÓ LỖ HỔNG:** `RolesGuard` (`apps/api/src/guards/roles.guard.ts:28`) cho qua **mọi** token khi decorator khai `@Auth([])` (roles rỗng). Đã audit toàn bộ `apps/api`: hiện có đúng 1 endpoint xưởng như vậy — `GET /orders/:id/logs` (`order.controller.ts:974`) → token Customer gọi được, lộ audit log nội bộ (assignee, lỗi, thao tác nhân viên).

**Giải pháp (chặn tận gốc, không vá từng endpoint):** thêm rule chung trong `RolesGuard`, đặt TRƯỚC nhánh `isEmpty(roles) → true`:

```ts
// Role Customer là token "ngoài" — chỉ được vào API dành riêng cho khách.
// Mọi route khác deny mặc định, kể cả route roles-rỗng.
if (user?.role?.name === RoleType.Customer) {
  return CUSTOMER_ALLOWED_PREFIXES.some((p) => request.url.includes(p)); // '/customer/' (+ '/open-api/' ở phase sau)
}
```

- Route customer-portal hiện khai `@Auth([RoleType.Customer])` → không ảnh hưởng.
- Endpoint xưởng roles-rỗng (`/orders/:id/logs`) và MỌI endpoint roles-rỗng thêm sau này → Customer tự động bị chặn.
- Ghi rule này vào doc như quy ước vĩnh viễn: "endpoint muốn cho Customer gọi PHẢI nằm dưới prefix `/customer/` (hoặc `/open-api/`)".
- Verify bắt buộc: dùng token Customer thật gọi `GET /orders/:id/logs` + vài API xưởng (`GET /orders`, `GET /designer/sidebar-counts`) → phải 403; gọi `GET /customer/orders` → vẫn 200.

## 7. Docs

- Tạo `documents/FunctionDescription/Customers.md` (trang quản trị + CRUD + xóa mềm + quy ước chặn role Customer §6).
- Cập nhật `CustomerFactoryAssignment.md` (bỏ CustomerListDialog, trỏ trang mới) + `CustomerPortal.md` (trang Tài khoản + 2 endpoint auth + ranh giới layout) + dòng mapping `CLAUDE.md`.

## 8. Quyết định ĐÃ CHỐT (2026-08-04)

1. **`userSku`/`userEmail`: KHÓA HẲN** — không cho sửa ở bất kỳ đâu (giữ toàn vẹn khóa match đơn hàng + claim portal).
2. **Xóa khách: XÓA MỀM** (`deletedAt`) + tự gỡ khỏi 3 config + sync không hồi sinh + có Khôi phục.
3. **Reset password: CẢ 2** — Admin nhập tay HOẶC generate random hiển thị đúng 1 lần.
4. **`/adm/customers`: chỉ Admin/SuperAdmin.**
5. **Giao diện khách tách biệt hoàn toàn** giao diện xưởng (CustomerLayout riêng) + **role Customer bị chặn cứng khỏi mọi path FE và API BE của xưởng** (rule RolesGuard §6).

## 9. Thứ tự thực thi

1. Shared DTOs (+ `deletedAt`) + permission `page.customers`.
2. BE: rule chặn Customer trong `RolesGuard` (§6) — làm ĐẦU TIÊN vì độc lập và đang là lỗ hổng.
3. BE: nâng cấp `GET /customers` (phân trang/filter/enrich/loại xóa mềm) — backward-compatible cho kanban.
4. BE: 5 endpoint mới (§1.2) + mở rộng create (§1.3) + chặn login khách `deletedAt` ở jwt.strategy + validateLogin.
5. FE: trang `/adm/customers` + 2 dialog + route/sidebar/i18n.
6. Hợp nhất: sửa `CustomerAssignmentConfig.tsx`, xóa `CustomerListDialog.tsx`.
7. Portal: trang Tài khoản + 2 endpoint auth.
8. Docs + CLAUDE.md.
9. Verify: tsc/eslint/prettier từng file; test tay DB local: CRUD đủ vòng (tạo khách có password → login portal → đặt đơn → hiện ở drill-down trang quản trị), reset password 2 chế độ, khóa → login chặn, xóa mềm → biến mất khỏi kanban + config tự gỡ + sync không hồi sinh → khôi phục lại OK, **token Customer gọi API xưởng → 403 (§6)**.

---

> Có lệnh "implement" → code theo thứ tự §9. Phase kế tiếp: CSV + Public API (`CustomerOrderIntake-CSV-API.md`) — trang quản trị này sẽ gắn thêm quản lý API key, prefix `/open-api/` thêm vào whitelist §6.
