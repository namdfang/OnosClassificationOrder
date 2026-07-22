# Auth & Identity — Function Description

> **File FE:** `apps/web/src/pages/login/index.tsx`, `apps/web/src/store/authStore.ts`
> **File BE:** `apps/api/src/modules/auth/`, `user/`, `role/`, `custom-role/`, `permission/`, `departments/`
> **Route:** `/adm/login`
> **API:** `/v1/auth/*`
>
> Đây là auth cho **nhân viên** (staff). Khách hàng dùng hệ thống riêng —
> `RoleType.Customer` + JWT branch trong `JwtStrategy` — xem [`CustomerPortal.md`](CustomerPortal.md).

---

## 1. Overview

Module Auth bao gồm toàn bộ luồng xác thực + phân quyền của hệ thống, kế thừa từ Printsel base và **giữ lại sau khi cleanup** (các module business khác đã xóa). Bao gồm:

- **Auth flow** — login bằng email/password, JWT access + refresh token
- **User** — CRUD user, gán role + custom role + department
- **Role** — fixed enum (SuperAdmin / Admin / Manager / User)
- **Custom Role** — role tự định nghĩa, gắn permissions
- **Permission** — danh sách permission constants từ `shared` package
- **Department** — phòng ban, gắn cho user

---

## 2. Luồng Login

```
User vào /login
  → Form shadcn (email + password) + react-hook-form + zod
  → Submit → POST /v1/auth/login { email, password }
  → BE: bcryptjs.compare(password, user.password)
  → BE trả: { accessToken, refreshToken, user, role, permissions[] }
  → FE: authStore.setAuth() → persist localStorage
  → Redirect /dashboard
```

### 2.1 Mật khẩu mặc định (seed)
- Admin: `admin@onos.com` / `Admin@123456`
- ⚠️ Bcrypt → bcryptjs migration đã xong (tránh native binding fail trên macOS arm64)

### 2.2 Refresh token
- AccessToken: 1h
- RefreshToken: 30 ngày, lưu trong DB (`refreshTokens` collection)
- Auto refresh khi accessToken expired (axios interceptor)
- Logout → revoke refreshToken

---

## 3. Backend modules

### 3.1 `auth/`
| File | Mô tả |
|------|-------|
| `auth.controller.ts` | `/login`, `/register`, `/refresh`, `/logout`, `/me` |
| `auth.service.ts` | Login logic, JWT sign, refresh rotation |
| `auth.module.ts` | JwtModule + PassportModule config |

### 3.2 `user/`
- CRUD user
- Field: `email`, `fullName`, `password` (bcryptjs hash), `roleType`, `customRoleId`, `departmentId`, `isActive`, `factoryId?` (ref FactoryEntity), `telegramChatId?`, `hireDate?`
- Endpoint: `/v1/users` (GET list, POST create, PATCH :id, DELETE :id)
- **`factoryId` required khi role=Fulfillment** (BE validate trong `createUser` + `adminUpdateUser`; throw 400 nếu thiếu). Per-factory scope: Fulfillment user chỉ thấy đơn ở `factoryId` hoặc `originalFactoryId` của mình (xem `Orders.md §7`)
- `telegramChatId` + `hireDate` dùng cho `/designer/team` page (Designer/DesignerLeader role)
- `getUserById` projection bao gồm: `_id, status, email, fullName, departmentId, factoryId, fulfillmentStage, telegramChatId, hireDate, role, customRole, rateLimitBypass, forcePassChange` — đảm bảo `AuthUser()` decorator có đủ field cho visibility filter
- ⚠️ **Gotcha quan trọng:** `getUserById` $project + `getMe` $project là 2 aggregation pipeline **độc lập** — field nào không có trong list sẽ silently `undefined` trên user object. Bất kỳ field mới nào trên `UserEntity` mà BE/FE cần access (qua `@AuthUser()` hoặc `authStore.profile`) đều phải add vào **cả 2** $project. Đã có precedent: thiếu `fulfillmentStage` ở `getUserById` → endpoint `/v1/fulfillment/my-tasks` báo "Thiếu stage" dù user đã được gán đúng. Xem `FulfillmentWorkflow.md §5.6`.
- ⚠️ Phase Designer-Task-Workflow Phase 6 **xoá** field `user.assigneeCode` — designer identity model giờ dùng `user._id` trực tiếp (Order.assignee = user._id)

### 3.3 `role/`
- **Static enum** `RoleType` từ `shared`: SuperAdmin / Admin / Manager / User
- Mỗi role có set permission cố định trong code (RolesGuard check)

### 3.4 `custom-role/`
- Role tự định nghĩa do Admin tạo
- Schema: `{ name, description, permissions: PermissionType[] }`
- User có thể có cả `roleType` (fixed) + `customRoleId` (tùy chọn) → permission = union

### 3.5 `permission/`
- List tất cả `PermissionType` từ `shared` package
- Endpoint `/v1/permissions` cho FE render dropdown trong form custom role

### 3.6 `departments/`
- CRUD department: `{ name, code, parentId?, managerId? }`
- Hỗ trợ cây phân cấp (parentId)
- User được gán 1 department

---

## 4. Guards & Decorators

### 4.1 `@Auth()` composite
```ts
@Auth(
  [RoleType.Admin, RoleType.Manager],     // roles allowed
  [PermissionType.ViewProduct],            // permissions required
  { public: false }                        // skip auth if true
)
```
Tự apply:
1. **AuthGuard** — verify JWT
2. **RateLimiterGuard** — chống brute force
3. **PermissionsGuard** — check permissions của custom role + role mặc định
4. **RolesGuard** — check `roleType` của user trong list cho phép

### 4.2 Param decorators
- `@AuthUser()` — inject `UserDocument` đã verify
- `@ClientIp()` — IP từ Fastify req
- `@UserAgent()` — header
- `@AccessToken()` — raw JWT

---

## 5. Frontend (`apps/web`)

### 5.1 `authStore.ts` (Zustand + persist)
```ts
/** Profile từ BE getMe: User + virtual `role` populate (name có thể là custom role → string). */
type UserProfile = User & { role?: { name: string; permissionCodes?: string[]; isSystem?: boolean } };

interface AuthStore {
  token: string | null;
  tokenExpiredAt: number;
  profile: UserProfile | null;
  loading: boolean;
  setToken(data: string): void;
  getToken(isPublic?: boolean): string | null;
  isAuthenticated(): boolean;
  setTokenExpiredAt(data: number): void;
  clearToken(): void; // xóa token + profile, redirect /login
  setProfile(data: UserProfile): void;
  setLoading(data: boolean): void;
}
```

### 5.2 Permission helpers (`apps/web/src/utils/permission.ts`)
- `validatePermission(required)` — check user có quyền không
- `permissionMap` — map route → permission cần thiết
- Sidebar item ẩn/hiện theo permission

### 5.3 Axios interceptor
- Request: attach `Authorization: Bearer {accessToken}`
- Response 401: thử refresh → retry → nếu refresh fail → logout + redirect `/login`

---

## 6. Trang trong web (FE)

| Trang | File | Mô tả |
|-------|------|-------|
| Login | `pages/login/index.tsx` | Form login + logo + tagline |
| Register | `pages/register/index.tsx` | (Demo, có thể tắt) |
| Account | `pages/account/index.tsx` | Profile + đổi password |
| Users | `pages/users/` | Admin quản lý user |
| Roles | `pages/roles/` | Hiển thị role mặc định + permission |
| Custom Roles | `pages/custom-roles/` | CRUD custom role |
| Departments | `pages/departments/` | CRUD department |
| Settings | `pages/settings/` | System config (Admin only) |
| Notifications | `pages/notifications/` | List notification của user |

---

## 7. Permission Catalog (Phase 5)

Hệ thống dùng **catalog tĩnh** trong `packages/shared/constants/permission-catalog.ts` (`PERMISSION_CATALOG`) làm danh sách quyền duy nhất cho cả UI matrix và BE check. Role có field `permissionCodes: string[]` chứa subset code được cấp.

### 7.1 Nhóm permission

| Group | Code mẫu | Mục đích |
|-------|----------|----------|
| `page` | `page.dashboard`, `page.orders`, `page.workshop_config`, `page.users`, `page.roles` | Quyết định sidebar item có hiện hay không. |
| `order` | `order.import`, `order.delete`, `order.view_admin_table`, `order.view_workshop_table` | Hành động cấp module. |
| `order_field` | `order.field.printStatus.{view\|edit}` (× 8 field) | Field-level — Danh sách đơn ẩn/khóa cột. |
| `workshop` | `workshop.manage` | CRUD Workshop Config. |
| `admin` | `user.manage`, `role.manage` | Quản trị user/role. |
| `audit` | `order.log.view` | Xem timeline thay đổi đơn hàng. |

### 7.2 Preset role mặc định (`DEFAULT_ROLE_PERMISSIONS`)

| Role | Page | Order action | Field view | Field edit | Khác |
|------|------|--------------|-----------|-----------|------|
| SuperAdmin / Admin / Manager | tất cả | tất cả | tất cả | tất cả | tất cả |
| Support | dashboard / orders / products | `order.import`, `order.view_workshop_table` | tất cả | ❌ | `order.log.view` |
| **DesignerLeader** | dashboard / orders / workshop_config / **designer_team** / **designer_stats** / my_tasks | `order.import`, `order.transfer`, `order.delete`, `order.view_workshop_table` | tất cả designer/order field + designerStatus | `assignee` + `toolResultNote` + `productionErrorSource` + machineNumber + tool/errorFile* + assigneeNote | `designer.team.manage`, `designer.task.assign`, `designer.task.override`, `order.log.view` |
| **Designer** (sub) | dashboard / orders / **my_tasks** | `order.view_workshop_table` | tool* / errorFile* / assigneeNote* / designerStatus / productionError | tool / errorFile* / errorFileNote / assigneeNote / machineNumber (**KHÔNG** edit assignee + toolResultNote — BE auto derive khi state machine `complete`) | `designer.task.transition` |
| Fulfillment | dashboard / orders | `order.view_workshop_table`, `order.transfer` | printStatus* / machineNumber / productionError* / **productionErrorSource** | printStatus* / machineNumber / productionError* / **productionErrorSource** | ❌ |

> `*` = cả 2 sub-permission `view` + `edit` của field đó.

**Phase Designer-Task-Workflow** đổi role landscape:
- Thêm role `DesignerLeader` (quản lý sub-designer + assign + xem stats)
- Role `Designer` cũ trở thành **sub-designer** — quyền giảm: bỏ `assignee.edit` + `toolResultNote.edit` (BE auto derive qua state machine), thêm `designer.task.transition`
- Migration: chạy `POST /v1/designer/migrate-leader` (Admin) một lần để promote 1 user Designer cũ duy nhất → DesignerLeader role + đổi email sang `designerleader@onospod.com`

**Field-level perm mới** (Phase Fulfillment per-factory + ProductionErrorSource):
- `order.field.designerStatus.view` — read-only badge trong workshop table
- `order.field.productionErrorSource.view/.edit` — picker designer/factory

### 7.3 RoleEntity (Phase 5 extension)

```ts
@DatabaseEntity({ collection: 'roles' })
class RoleEntity {
  name: RoleType;
  description?: string;
  permissionIds: string[];      // legacy — vẫn giữ cho tương thích
  permissionCodes: string[];    // NEW — codes từ PERMISSION_CATALOG
  isSystem: boolean;            // NEW — true cho 4+ role mặc định
  status: Status;
}
```

`RoleService.onModuleInit()` seed **7 system role** (SuperAdmin, Admin, Manager, Support, **DesignerLeader**, Designer, Fulfillment) với preset tương ứng. Phase Designer-Task-Workflow đổi `SYSTEM_ROLES`: thêm DesignerLeader đứng trước Designer. Role đã tồn tại trên DB **bị overwrite về preset mới mỗi boot** (sync catalog là source of truth) — admin muốn role custom phải tạo role mới với `isSystem=false`.

### 7.4 Endpoints quản lý role (mới)

| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| GET | `/v1/roles` | Admin / Manager / Accountant | List role + populate permissionCodes |
| POST | `/v1/roles` | Admin / SuperAdmin | Tạo role custom |
| PATCH | `/v1/roles/:id` | Admin / SuperAdmin | Update mô tả / status |
| PATCH | `/v1/roles/:id/permissions` | Admin / SuperAdmin | Thay toàn bộ `permissionCodes` (validate code có trong catalog) |
| POST | `/v1/roles/:id/reset-permissions` | Admin / SuperAdmin | Reset về preset mặc định (chỉ hoạt động với role hệ thống) |
| DELETE | `/v1/roles/:id` | Admin / SuperAdmin | Soft delete — bị chặn nếu `isSystem=true` |

### 7.5 Endpoints quản lý user (mới)

| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| POST | `/v1/users` | Admin / SuperAdmin | Tạo user mới (fullName, email, password, roleId) |
| PATCH | `/v1/users/:userId` | Admin / SuperAdmin | Update bất kỳ target user (đổi role, đổi tên...) |
| DELETE | `/v1/users/:userId` | Admin / SuperAdmin | Soft delete — chặn xóa chính mình |
| POST | `/v1/users/:userId/toggle-active` | Admin / SuperAdmin | Toggle Status.Active ↔ Inactive |

---

## 8. Frontend UI Phase 5

### 8.1 `/users` (rebuild)
- Table list user (Name, Email, Role badge + **Factory badge** khi role=Fulfillment, Switch trạng thái, action Sửa / Xóa).
- Dialog Thêm/Sửa: fullName, email, password (chỉ khi tạo), select role, **conditional Factory dropdown** (chỉ hiện khi role được chọn === Fulfillment, required, load từ `/v1/factories`).
- Form validate: nếu role=Fulfillment mà chưa pick factoryId → toast error + block submit. BE cũng enforce (defense).
- Reset `factoryId` về `''` khi user đổi role sang ≠ Fulfillment (tránh data thừa).
- Service: `RepositoryRemote.users.{createUser, adminUpdateUser, adminDeleteUser, toggleActive}` + `RepositoryRemote.factory.getFactories()`.

> Designer team (sub-designer) management dùng page riêng `/designer/team` — xem `DesignerTaskWorkflow.md §4.1`. Page `/users` tổng dành cho mọi role; admin tạo sub-designer ở đâu cũng được, nhưng `/designer/team` UX tối ưu hơn (random password gen, hireDate, telegramChatId, count task active).

### 8.2 `/roles` (rebuild)
- Table list role (Name, Description, số permissions, badge System).
- Click row → `<Sheet>` (drawer phải) với `PermissionMatrix` component.
- `PermissionMatrix` (`components/roles/PermissionMatrix.tsx`):
  - Render 5 group checkbox list (`page` / `order` / `workshop` / `admin` / `audit`).
  - Render bảng matrix 8 × 2 cho `order_field` (cột view / edit).
  - Track `Set<string>` codes, toggle qua callback `onChange`.
- Footer drawer: Reset preset (chỉ enable nếu `isSystem=true`) + Hủy + Lưu.
- Save → `PATCH /v1/roles/:id/permissions`.

### 8.3 Sidebar dynamic
- `NAV_GROUPS` chia **4 nhóm**: 1 nhóm **không header** (`title: ''`) ở trên cùng gồm 3 menu bung `Dashboard` · `Quản lý đơn` · `Công việc`; rồi 3 nhóm có header `Danh mục` · `Quản trị` · `Cá nhân`. Header rỗng không render (`showLabels && group.title`), key nhóm fallback `group-${idx}`. Mỗi `NavItem` có `perm?: string` từ `page.*`; item có `children` → menu bung/gộp (SidebarParent), item lẻ → leaf.
- Menu `Công việc` (parent, không perm) gộp `Task của tôi` (`page.my_tasks`) + `Task Fulfillment` (`page.fulfillment_my_tasks`). `Team Designer` (`page.designer_team`) nằm trong menu `Nhân sự & phân quyền` (nhóm Quản trị).
- `NavChild` field gating: `perm?: string` (1 quyền), `anyPerm?: string[]` (OR — hiện khi có BẤT KỲ quyền nào), `hideForRoles?: string[]` (ẩn theo tên role, bổ sung cho perm).
- Hàm `filterMenuByPermissions(groups, codes, isAdmin, roleName?)` lọc theo `profile.role.permissionCodes`. `allow(perm, anyPerm)`: Admin bypass → `anyPerm` (OR) → `perm` (đơn). Parent giữ lại nếu còn ≥1 child; nhóm rỗng bị bỏ.
- Admin / SuperAdmin bypass (full menu) — tránh khóa cứng nếu seed lỗi.
- `getUserById` projection thêm `role.permissionCodes` + `role.isSystem` để FE nhận đủ data từ `/v1/auth/me`.
- **Menu `Dashboard`** (nhóm Tổng quan) là parent bung ra 7 child = 7 tab, mỗi child link `/dashboard?tab=<key>` (`factory/stats/status/lifecycle/tool-check/person-error/designer`). Tab ngang ở page vẫn giữ; bấm submenu chỉ deep-link tới đúng tab. Gating child: `tool-check`→`page.tool_check`, `person-error`→`anyPerm:[page.designer_stats, page.tool_check]`, `designer`→`page.designer_stats`; 4 tab còn lại luôn hiện (theo `page.dashboard` của parent). `home/index.tsx` tự gắn `?tab=<activeTab>` khi vào `/dashboard` trần để submenu highlight đúng.
- **Menu `Quản lý đơn`** (nhóm Đơn hàng) 5 child: `Danh sách đơn` (`/orders/workshop`), `Nhật ký bù lỗi` (`/orders/error-log`, `hideForRoles:['Support']`), `Quét mã` (`page.scan_error`), `Import Order` + `Import File Cutting` (`order.import`).
- **Menu `Nhân sự & phân quyền`** (nhóm Quản trị) gộp `Team Designer` (`page.designer_team`) + `Người dùng`/`Phòng ban` (`user.manage`) + `Vai trò`/`Vai trò tùy chỉnh` (`role.manage`); `Cài đặt` để riêng (`role.manage`).
- Active state detect qua `isLinkActive(linkPath, currentPath, currentSearch)` — so sánh path + query subset, nên link có `?tab=` vẫn highlight đúng.

> ⚠️ Cache Redis `user:${id}` và `user:info:${id}` giữ payload cũ. Sau khi deploy Phase 5, admin gọi `POST /v1/users/:id/clear-user-cache` hoặc đợi TTL để FE thấy permission mới.

---

## 9. Legacy permission cheat sheet (sẽ deprecate ở Phase 0)

| Role | Quyền |
|------|-------|
| **SuperAdmin** | Tất cả + manage admins |
| **Admin** | Tất cả module business + user/role/department |
| **Manager** | Products + Orders + Dashboard, read-only user |
| **User** | Chỉ profile cá nhân |

Permission constants (subset) trong `shared/enums/permission.enum.ts`:
- `ViewProduct`, `CreateProduct`, `UpdateProduct`, `DeleteProduct`
- `ViewOrder`, `CreateOrder`, `UpdateOrder`, `DeleteOrder`, `ImportOrder`
- `ViewDashboard`
- `ViewUser`, `ManageUser`, `ManageRole`, `ManageDepartment`

---

## 8. Bảo mật notes

- Password hash: **bcryptjs** (saltRounds=10) — không dùng native bcrypt
- JWT secret: env `JWT_SECRET` (BẮT BUỘC override khi prod)
- Refresh token rotation: mỗi lần refresh → tạo token mới, revoke token cũ
- Rate limit: 10 req/s mặc định, 5 req/min cho `/login`
- Không log password / token (Winston filter)
