# Plan — RBAC + Workshop Config + Orders multi-role

> **Tạo:** 2026-06-13
> **Phạm vi:** Thêm hệ thống phân quyền động, module quản lý cấu hình xưởng, mở rộng Orders với view theo role, audit log, user management.
> **Ước tính:** ~8 ngày dev (7 phase tuần tự, có thể song song một số phần).

---

## Mục tiêu

1. **RBAC động** — Admin tạo/sửa/xóa role + cấu hình permission per role (cả menu UI + edit field BE).
2. **Workshop Config** — danh mục dùng chung cho 7 trường nghiệp vụ.
3. **Order schema mở rộng** — 8 trường nghiệp vụ mới + lifecycle visibility.
4. **Order UI đa role** — Admin giữ view cũ; Support/Designer/Fulfill có bảng workshop riêng.
5. **Inline / bulk update** với BE re-check permission.
6. **Audit log** — mọi thay đổi field đều ghi lại.
7. **User management** — gán role, quản lý account.

---

# Phase 0 — RBAC redesign (foundation, phải làm trước)

## 0.1 Vấn đề hiện tại
- Đang có **`RoleType` enum cứng** (17 role legacy từ Printsel) + `CustomRoleEntity` (DB).
- User muốn 4 role nhưng cho phép CRUD → phải dẹp enum cứng, đưa hết vào DB.

## 0.2 Đề xuất

### Bước A — Trim `RoleType` xuống còn 4 (chỉ làm seed key)
```ts
// packages/shared/enums/role-type.ts
export enum RoleType {
  Admin = 'Admin',
  Support = 'Support',
  Designer = 'Designer',
  Fulfill = 'Fulfill',
}
```

### Bước B — Hợp nhất `role/` và `custom-role/` thành 1 module `role/` mới
```ts
RoleEntity {
  code: string           // 'admin' | 'support' | 'designer' | 'fulfill' | custom slug
  name: string           // hiển thị
  description?: string
  isSystem: boolean      // true cho 4 role mặc định → không xóa được
  permissions: string[]  // mảng permission code
  order: number
}
```

### Bước C — Permission Catalog cố định trong `packages/shared/constants/permissions.ts`

| Group | Code | Mô tả |
|-------|------|-------|
| Page | `page.dashboard` | Vào /dashboard |
| Page | `page.orders` | Vào /orders |
| Page | `page.products` | Vào /products |
| Page | `page.workshop-config` | Vào /workshop-config |
| Page | `page.users` | Vào /users |
| Page | `page.roles` | Vào /roles |
| Order | `order.import` | Import đơn |
| Order | `order.delete` | Xóa đơn |
| Order | `order.view-admin-table` | Thấy bảng admin (cũ) |
| Order | `order.view-workshop-table` | Thấy bảng workshop (mới) |
| Order field | `order.field.printStatus.view` | Xem Trạng thái in |
| Order field | `order.field.printStatus.edit` | Sửa Trạng thái in |
| Order field | `order.field.printStatusNote.view/edit` | Note trạng thái in |
| Order field | `order.field.toolResult.view/edit` | Kết quả Tool |
| Order field | `order.field.toolResultNote.view/edit` | Note kq Tool |
| Order field | `order.field.errorFile.view/edit` | File sửa lỗi |
| Order field | `order.field.errorFileNote.view/edit` | Ghi chú file lỗi |
| Order field | `order.field.assignee.view/edit` | Người thực hiện |
| Order field | `order.field.assigneeNote.view/edit` | Note người thực hiện |
| Workshop | `workshop.manage` | CRUD workshop config |
| User | `user.manage` | CRUD user + assign role |
| Role | `role.manage` | CRUD role + permissions |
| Audit | `order.log.view` | Xem log đơn hàng |

### Bước D — 4 role mặc định + preset permission (seed `onModuleInit`)

| Permission | Admin | Support | Designer | Fulfill |
|------------|:-----:|:-------:|:--------:|:-------:|
| Tất cả page.* | ✅ | dashboard/orders/products | dashboard/orders | dashboard/orders |
| order.import | ✅ | ✅ | ❌ | ❌ |
| order.delete | ✅ | ❌ | ❌ | ❌ |
| order.view-admin-table | ✅ | ❌ | ❌ | ❌ |
| order.view-workshop-table | ✅ | ✅ | ✅ | ✅ |
| printStatus.view | ✅ | ✅ | ❌ | ✅ |
| printStatus.edit | ✅ | ❌ | ❌ | ✅ |
| printStatusNote.view/edit | ✅ | view | ❌ | ✅ |
| toolResult.view | ✅ | ✅ | ✅ | ❌ |
| toolResult.edit | ✅ | ❌ | ✅ | ❌ |
| toolResultNote.view/edit | ✅ | view | ✅ | ❌ |
| errorFile.view/edit | ✅ | view | ✅ | ❌ |
| assignee.view/edit | ✅ | view | ✅ | ❌ |
| workshop.manage | ✅ | ❌ | ❌ | ❌ |
| user.manage / role.manage | ✅ | ❌ | ❌ | ❌ |
| order.log.view | ✅ | ✅ | ❌ | ❌ |

### Bước E — Decorator BE mới
```ts
@RequirePermission('order.field.printStatus.edit')
async updatePrintStatus(...) {}
```
Guard đọc `req.user.permissions` (load từ role khi auth) → 403 nếu thiếu.

### Bước F — User model
Thêm `roleId: ref RoleEntity` (1-1), bỏ `roleType` enum + `customRoleId` cũ.

## 0.3 Migration script
1. Tạo 4 RoleEntity (Admin/Support/Designer/Fulfill) với preset.
2. User cũ: `roleType === 'Admin'` → `roleId = AdminRole._id`; còn lại default `Fulfill`.
3. Xóa Permission entity cũ + ts code legacy không dùng.

## 0.4 Files đụng
- ✏️ `packages/shared/enums/role-type.ts` (trim 4)
- ➕ `packages/shared/constants/permissions.ts` (catalog)
- ➕ `packages/shared/dtos/role.dto.ts` (mới, gộp custom-role.dto)
- ✏️ `apps/api/src/modules/role/` (rebuild)
- ❌ `apps/api/src/modules/custom-role/` (xóa, merge vào role/)
- ❌ `apps/api/src/modules/permission/` (xóa, dùng catalog tĩnh)
- ✏️ `apps/api/src/modules/user/user.entity.ts` (đổi roleId)
- ✏️ `apps/api/src/modules/auth/auth.service.ts` (load permissions vào JWT payload)
- ✏️ `apps/api/src/decorators/auth.decorator.ts` + Guard
- ➕ `apps/api/src/modules/role/migration.ts` (seed)

---

# Phase 1 — Workshop Config module

## 1.1 Entity duy nhất (polymorphic)
```ts
@DatabaseEntity({ collection: 'workshopConfigs' })
class WorkshopConfigEntity {
  category: 'print_status' | 'print_status_note' | 'tool_result'
          | 'tool_result_note' | 'error_file_type' | 'assignee' | 'assignee_note'
  code: string         // slug unique trong category, dùng làm value lưu trong Order
  name: string         // label hiển thị
  color?: string       // hex, chỉ category có màu mới set
  icon?: string        // lucide name (vd 'Wrench', 'AlertCircle')
  order: number        // sort
  isActive: boolean
}
// unique index (category, code)
```

## 1.2 7 category & rule hiển thị

| Category | Mode | Giá trị seed |
|----------|------|---------------|
| `print_status` | **color badge** | Chưa in (gray) / Đã in máy 1, 2, 3, 4, 94 (5 màu khác nhau) |
| `print_status_note` | **icon** | Đã in lần 1/2/3/4, Chưa in |
| `tool_result` | **icon** | Có Tool, Không có Tool |
| `tool_result_note` | **color badge** | Không có tool (gray), Lỗi (red), Ok (green), Không có file PDF (orange) |
| `error_file_type` | **icon** | Không khớp, Thân trước, Thân sau, Trụ, 2 tay, Nẹp áo, Cổ viền, Dấu, Quần, Không may viền tay áo, Hỏi des khách, Temp |
| `assignee` | **icon** | Huy, H Anh, An, K Anh, Hạnh, Nga, Phương Anh, Hương |
| `assignee_note` | **icon** | Không có tool, Lỗi, Ok |

## 1.3 API
| Method | Path | Permission |
|--------|------|------------|
| GET | `/v1/workshop-config?category=X` | mọi user login (cần để render bảng) |
| GET | `/v1/workshop-config/all` | trả 1 map { category: [items] } — load 1 lần khi vào app |
| POST | `/v1/workshop-config` | `workshop.manage` |
| PATCH | `/v1/workshop-config/:id` | `workshop.manage` |
| DELETE | `/v1/workshop-config/:id` | `workshop.manage` (soft, không xóa nếu đang được Order tham chiếu) |
| POST | `/v1/workshop-config/reorder` | `workshop.manage` (drag & drop) |

## 1.4 FE page `/workshop-config`
- 7 tabs cho 7 category.
- Mỗi tab: list rows + form thêm (name + color picker / icon picker tùy mode) + reorder drag.
- Reuse 1 component `WorkshopConfigCategoryEditor` với prop `category` + `mode: 'color' | 'icon'`.

## 1.5 FE store
```ts
useWorkshopConfigStore: {
  loaded: boolean
  byCategory: Record<Category, WorkshopConfigItem[]>
  load(): Promise<void>            // gọi 1 lần sau login
  resolve(category, code): WorkshopConfigItem | undefined
}
```

## 1.6 Files mới
- ➕ `apps/api/src/modules/workshop-config/*`
- ➕ `packages/shared/dtos/workshop-config.dto.ts`
- ➕ `packages/shared/enums/workshop-config-category.ts`
- ➕ `apps/web/src/pages/workshop-config/index.tsx` + `CategoryEditor.tsx` + `ColorPicker.tsx` + `IconPicker.tsx`
- ➕ `apps/web/src/store/workshopConfigStore.ts`

---

# Phase 2 — Order schema mở rộng + lifecycle

## 2.1 Thêm fields `OrderEntity`
```ts
// Workshop fields (lưu code, không lưu name)
printStatus?: string        // ref workshop_config code
printStatusNote?: string
toolResult?: string
toolResultNote?: string
errorFile?: string
errorFileNote?: string      // free text
assignee?: string
assigneeNote?: string

// Lifecycle (derived)
readyForFulfill: boolean    // = (toolResultNote === 'ok'), set bằng pre-save hook, index
```

## 2.2 Visibility rule (BE auto filter theo role)
| Role | Filter mặc định |
|------|------------------|
| Admin | `{ deletedAt: null }` |
| Support | `{ deletedAt: null }` |
| Designer | `{ deletedAt: null, createdAt: today }` |
| Fulfill | `{ deletedAt: null, readyForFulfill: true, createdAt: today }` |

User có thể override `createdAt` range qua filter UI (trừ rule `readyForFulfill` cho Fulfill — luôn enforce ở BE).

## 2.3 API mới
| Method | Path | Body | Mục đích |
|--------|------|------|---------|
| PATCH | `/v1/orders/:id/field` | `{ field, value }` | Inline update 1 field |
| PATCH | `/v1/orders/bulk-field` | `{ ids: string[], field, value }` | Bulk update |
| GET | `/v1/orders/:id/logs` | — | Lịch sử thay đổi |

Backend `updateField()`:
```
1. Check permission `order.field.${field}.edit`
2. Validate value tồn tại trong workshop_config (nếu là field có config)
3. Load order cũ → record before
4. Update field + recompute readyForFulfill (nếu field === 'toolResultNote')
5. Push OrderLog { field, before, after, userId, roleId, ip, ua }
6. Invalidate cache
7. Return updated order
```

## 2.4 Files đụng
- ✏️ `apps/api/src/modules/order/order.entity.ts` (thêm 9 fields)
- ✏️ `apps/api/src/modules/order/order.service.ts` (visibility filter + updateField + bulk)
- ✏️ `apps/api/src/modules/order/order.controller.ts` (2 endpoint mới)
- ✏️ `packages/shared/dtos/production-order.dto.ts` (extend Zod + UpdateFieldDto)

---

# Phase 3 — Audit Log module

## 3.1 Entity
```ts
@DatabaseEntity({ collection: 'orderLogs' })
class OrderLogEntity {
  orderId: string          // index
  userId: string
  roleCode: string         // snapshot role tại thời điểm
  action: 'create' | 'update' | 'delete' | 'import' | 'bulk_update'
  field?: string
  before?: any             // mixed
  after?: any
  ip?: string
  userAgent?: string
  // createdAt từ BaseEntity
}
```

## 3.2 API
- `GET /v1/orders/:id/logs?page=1&pageSize=50` — permission `order.log.view`.

## 3.3 FE
- Click icon `History` trên row → mở `OrderLogTimelineDialog` hiển thị timeline reverse-chrono: ai → khi nào → field → before → after.

## 3.4 Files
- ➕ `apps/api/src/modules/order-log/` (module + entity + repo + service)
- ➕ `apps/web/src/components/orders/OrderLogTimelineDialog.tsx`
- ➕ `packages/shared/dtos/order-log.dto.ts`

---

# Phase 4 — Frontend: Orders multi-role view

## 4.1 Router quyết định bảng nào
```tsx
function OrdersPage() {
  const { hasPermission } = useAuth();
  const showAdminTable = hasPermission('order.view-admin-table');
  return showAdminTable ? <OrderTableAdmin /> : <OrderTableWorkshop />;
}
```

Hoặc tab switcher cho user có cả 2 permission (Admin xem cả 2 bảng).

## 4.2 `OrderTableWorkshop.tsx` — bảng mới

20 cột theo đúng thứ tự đề bài. Mỗi cột render conditional theo permission:
```tsx
const cols = [
  { key: 'productionId',    label: 'Production ID',    render: TextCell, perm: null },
  { key: 'userSku',         label: 'User SKU',         render: TextCell, perm: null },
  { key: 'size',            label: 'Size',             render: TextCell, perm: null },
  { key: 'printStatus',     label: 'Trạng thái in',    render: ColorBadgeSelectCell, perm: 'printStatus' },
  { key: 'printStatusNote', label: 'Note Trạng thái in', render: IconSelectCell, perm: 'printStatusNote' },
  { key: 'toolResult',      label: 'Kết quả Tool',     render: IconSelectCell, perm: 'toolResult' },
  { key: 'toolResultNote',  label: 'Note kq Tool 1',   render: ColorBadgeSelectCell, perm: 'toolResultNote' },
  { key: 'errorFile',       label: 'File sửa lỗi',     render: IconSelectCell, perm: 'errorFile' },
  { key: 'errorFileNote',   label: 'Ghi chú file lỗi', render: TextEditCell, perm: 'errorFileNote' },
  { key: 'color',           label: 'Color',            render: TextCell, perm: null },
  { key: 'assignee',        label: 'Người thực hiện',  render: IconSelectCell, perm: 'assignee' },
  { key: 'assigneeNote',    label: 'Note người thực hiện', render: IconSelectCell, perm: 'assigneeNote' },
  { key: 'type',            label: 'Type',             render: TextCell },
  { key: 'mockupUrl',       label: 'Mockup',           render: ImageThumbCell },
  { key: 'designs.front',   label: 'Design Front',     render: ImageThumbCell },
  { key: 'orderId',         label: 'Order ID',         render: TextCell },
  { key: 'inProductionAt',  label: 'In Production At', render: DateTimeCell },
  { key: 'typeFullName',    label: 'Type.1',           render: TextCell },  // = productConfig.fullName
  { key: 'factory.name',    label: 'Nhà máy',          render: TextCell },
  { key: 'machineType.name',label: 'Phòng',            render: TextCell },
];
const visibleCols = cols.filter(c => !c.perm || hasPermission(`order.field.${c.perm}.view`));
```

## 4.3 Cell components

- **`ColorBadgeSelectCell`** — badge nền màu `WorkshopConfig.color`. Click → popover Select (Command palette style) → chọn → tự gọi PATCH `/orders/:id/field`. Toast success/error. Skeleton trong khi save.
- **`IconSelectCell`** — icon Lucide + tooltip name. Click → cùng flow.
- **`TextEditCell`** — inline input cho free text (errorFileNote), debounce 500ms.
- **`ImageThumbCell`** — thumb 40px, click mở `ImagePreviewDialog`.

Cell tự check `hasPermission('order.field.${field}.edit')`:
- Có → click sửa được.
- Không → readonly hiển thị.

## 4.4 Filter bar workshop
Filter mới cho mỗi field có config (load options từ `workshopConfigStore`):
- printStatus (multi)
- toolResultNote (multi)
- assignee (multi)
- errorFile (multi)
- + date range, search productionId / userSku

Filter chỉ hiển thị nếu user có `*.view` permission cho field đó.

## 4.5 Bulk edit
- Checkbox đầu mỗi row + select-all.
- Khi có row được chọn → toolbar nổi lên: "Đã chọn N — Cập nhật trường... [Select] Giá trị... [Select] [Áp dụng]".
- POST `/orders/bulk-field` + toast.

## 4.6 Sidebar dynamic
`MainLayout` đọc `permissions` từ authStore → ẩn/hiện menu item:
```tsx
const menu = [
  { path: '/dashboard', label: 'Dashboard', perm: 'page.dashboard' },
  { path: '/orders', label: 'Đơn hàng', perm: 'page.orders' },
  { path: '/products', label: 'Sản phẩm', perm: 'page.products' },
  { path: '/workshop-config', label: 'Quản lý xưởng', perm: 'page.workshop-config' },
  { path: '/users', label: 'Người dùng', perm: 'page.users' },
  { path: '/roles', label: 'Phân quyền', perm: 'page.roles' },
].filter(m => hasPermission(m.perm));
```

## 4.7 Files
- ➕ `apps/web/src/pages/orders/OrderTableWorkshop.tsx`
- ➕ `apps/web/src/components/orders/cells/` (5 cell component)
- ➕ `apps/web/src/components/orders/BulkEditToolbar.tsx`
- ➕ `apps/web/src/components/orders/WorkshopFilterBar.tsx`
- ✏️ `apps/web/src/pages/orders/index.tsx` (route theo permission)
- ✏️ `apps/web/src/layouts/mainLayout/MainLayout.tsx` (sidebar dynamic)
- ➕ `apps/web/src/hooks/usePermission.ts`

---

# Phase 5 — User Management + Role Editor

## 5.1 `/users` (rebuild)
- Bảng list user: name, email, role badge, isActive, lastLogin.
- Form thêm/sửa: email, fullName, password (chỉ khi create), select role.
- Toggle active/inactive.
- Reset password endpoint.

## 5.2 `/roles` (rebuild)
- Bảng list role (4 system + custom).
- Click row → mở `RoleEditor` drawer chia 3 panel:
  1. Info: code, name, description.
  2. **Page permissions** — checkbox list.
  3. **Order field permissions** — matrix 8 row (field) × 2 col (view, edit).
  4. **Other** — workshop.manage, user.manage, role.manage, order.import/delete/log.
- Save → POST/PATCH role.
- Nếu là `isSystem` → khóa code + không cho xóa.

## 5.3 Files
- ✏️ `apps/web/src/pages/users/` (rebuild đơn giản)
- ✏️ `apps/web/src/pages/roles/` (rebuild với matrix)
- ➕ `apps/web/src/components/roles/PermissionMatrix.tsx`

---

# Phase 6 — Documentation & wrap-up

Update các file doc theo rule trong CLAUDE.md:

| Doc | Update |
|-----|--------|
| `Auth.md` | Mô tả RBAC mới, bỏ enum cứng, 4 role + Permission Catalog, role editor matrix |
| `Orders.md` | Thêm 8 field workshop, lifecycle stage, multi-role rendering, inline/bulk update, audit log |
| `Products.md` | Không đụng |
| `Dashboard.md` | Không đụng (trừ khi muốn bổ sung chart theo printStatus) |
| ➕ `WorkshopConfig.md` (mới) | 7 category, schema, API, FE editor |
| ➕ `OrderLog.md` (mới) | Audit log entity, API, FE timeline |
| `CLAUDE.md` | Thêm 2 dòng mapping cho WorkshopConfig + OrderLog |

---

# Lộ trình đề xuất (sequential)

1. **Phase 0** RBAC (2 ngày) — foundation, không bypass được.
2. **Phase 1** WorkshopConfig (1 ngày).
3. **Phase 2 + 3** Order schema + Audit log (1.5 ngày).
4. **Phase 5** User + Role editor UI (1 ngày).
5. **Phase 4** Orders multi-role view + cells (2 ngày — phần nặng nhất).
6. **Phase 6** Docs (0.5 ngày).

**Tổng ~8 ngày dev.** Có thể song song 4 + 5 sau khi 0–3 xong.

---

# Quyết định mặc định (làm theo nếu không có chỉ đạo khác)

| Vấn đề | Quyết định |
|--------|-----------|
| "Kết quả Tool" có config không | Có — category `tool_result` (icon), 2 giá trị seed "Có Tool" / "Không có Tool" |
| Designer chỉ thấy đơn hôm nay | Default today, có filter đổi range |
| Support có import đơn không | Có (theo đề bài) |
| Fulfill có thấy đơn chưa Ok không | Không, BE enforce `readyForFulfill=true` |
| Bulk update có cần re-confirm | Có dialog confirm trước khi áp dụng |
| Xóa role system | Không cho phép (isSystem=true) |
| Xóa workshop config đang dùng | Block + báo "Đang được N đơn dùng" |
| Audit log retention | Không xóa, không TTL (workshop volume nhỏ) |

---

# Tracking

- [ ] Phase 0 — RBAC redesign
- [x] Phase 1 — Workshop Config module
- [x] Phase 2 — Order schema mở rộng + lifecycle
- [x] Phase 3 — Audit Log module
- [x] Phase 4 — Orders multi-role view
- [x] Phase 5 — User Management + Role Editor
- [ ] Phase 6 — Documentation & wrap-up
