# Printsel — Coding Rules

> Đọc file này trước khi code bất kỳ thứ gì. Tuân thủ 100% các quy tắc bên dưới.

---

## Monorepo Structure

```
apps/
  api/        → NestJS + Fastify backend
  web/        → React + Vite frontend
packages/
  shared/     → Shared DTOs, enums, constants, Zod schemas (used by both FE & BE)
```

- **Package manager:** pnpm workspaces
- **Shared types:** Frontend và Backend cùng import từ `shared` package. Khi tạo mới DTO/enum/constant, đặt trong `packages/shared/`.

---

## Frontend Rules (apps/web)

### Tech Stack
- React 18 + TypeScript + Vite
- Ant Design 5 (ConfigProvider theme tokens — KHÔNG dùng inline styles cho component Ant Design)
- Tailwind CSS (layout, spacing, custom styles)
- Zustand (state management)
- React Router v6 (lazy loading routes)
- Lucide React (icons — KHÔNG dùng @ant-design/icons)
- Framer Motion (page transitions only — KHÔNG thêm animation vào Modal, Popover, Dropdown, Tooltip vì Ant Design đã có sẵn)

### Project Structure
```
src/
├── apis/          → Axios instance, callApi wrapper
├── assets/        → Images, icons, styles
├── components/    → Reusable UI components
├── constants/     → PATHS, CONFIG, routerConfig, status maps
├── hooks/         → Custom hooks (useDebounce, etc.)
├── layouts/       → MainLayout (Sidebar + Header + Content)
├── pages/         → Route-level page components
├── services/      → RepositoryRemote (API layer)
├── store/         → Zustand stores
├── theme/         → Ant Design theme config + globals.css
├── types/         → TypeScript interfaces
└── utils/         → Helper functions
```

### Component Rules
- Functional components only. Dùng `function ComponentName()` hoặc `const ComponentName: React.FC<Props>`.
- Props type: interface với suffix `Props` (e.g., `FilterFormProps`).
- Default export cho page components, named export cho utilities.
- File naming: **PascalCase** cho components (e.g., `FilterForm.tsx`, `StatCard.tsx`).

### State Management
- Zustand stores với `persist` middleware cho data cần giữ qua sessions.
- Store interface naming: `[Name]Store` (e.g., `AuthStore`, `ThemeStore`).
- File naming: **camelCase** + suffix `Store` (e.g., `authStore.ts`).

### API Calls
- **Luôn** dùng `RepositoryRemote` — KHÔNG gọi axios trực tiếp.
- Service files ở `src/services/`, grouped by domain (auth, order, catalog...).
- URL format: `/${CONFIG.API_VERSION}/[endpoint]`.

### Error Handling
- **Mọi async operation** phải wrap trong `try-catch` với `handleAxiosError(error)`.
- KHÔNG dùng `console.log` cho errors trong production code.

### Styling
- **Tailwind** cho layout, spacing, colors, responsive.
- **Ant Design theme tokens** cho component styling (borderRadius, colors...).
- **globals.css** cho CSS overrides mà Design Token không hỗ trợ.
- KHÔNG dùng styled-components.
- KHÔNG dùng inline styles trừ khi bắt buộc (e.g., dynamic values).
- Dark mode: dùng `dark:` prefix trong Tailwind classes.
- Color system: primary = indigo (`#6366F1`), dùng `primary-*` Tailwind classes.

### Routing
- Mọi path phải define trong `constants/paths.ts` object `PATHS`.
- Lazy load page components trong `routerConfig.ts`.
- Permission check: dùng `validatePermission()` và `permissionMap`.

### Import Order
```typescript
// 1. React + third-party
import React, { useEffect, useState } from 'react';
import { Button, Table } from 'antd';
import type { TablePaginationConfig } from 'antd';
import dayjs from 'dayjs';
import { Search } from 'lucide-react';

// 2. Constants
import { PATHS } from '@/constants/paths';

// 3. Store
import { useAuthStore } from '@/store/authStore';

// 4. Services
import { RepositoryRemote } from '@/services';

// 5. Components
import FilterForm from '@/components/common/FilterForm';

// 6. Utils
import { handleAxiosError } from '@/utils';
```

### Icons
- **Chỉ dùng Lucide React**. Import từ `lucide-react`.
- Size mặc định: `size={16}` cho inline, `size={18}` cho menu, `size={20}` cho header.

### Animation
- Page transitions: Framer Motion `motion.div` trong MainLayout.
- CSS transitions: chỉ dùng `transition-*` Tailwind classes cho hover/focus.
- **KHÔNG** thêm CSS `animation` hoặc `@keyframes` cho Ant Design overlay components (Modal, Popover, Dropdown, Tooltip, Drawer) — chúng đã có animation riêng, thêm vào sẽ gây nhấp nháy.

### Form Handling
- Dùng Ant Design `Form` với `Form.Item`.
- Define `FieldType` interface cho type-safe form values.
- Validation: Ant Design built-in rules + custom validators.

---

## Backend Rules (apps/api)

### Tech Stack
- NestJS + Fastify adapter
- MongoDB + Mongoose (ODM)
- Zod validation (DTOs qua `@anatine/zod-nestjs`)
- Winston logger
- Redis (caching via `RedisCacheService`)
- BullMQ (job queue)
- RabbitMQ (messaging)

### Module Structure
**Mỗi feature module BẮT BUỘC có đủ các file:**
```
modules/[feature]/
├── [feature].module.ts       → NestJS module
├── [feature].controller.ts   → HTTP endpoints
├── [feature].service.ts      → Business logic
├── [feature].repository.ts   → Data access
├── [feature].entity.ts       → Mongoose schema
└── [feature]-log.entity.ts   → (Optional) Audit log
```

- Folder/file naming: **kebab-case** (e.g., `dropship-order/`, `product-variant.service.ts`).
- Một controller per module.
- Entity name: **PascalCase** + suffix `Entity` (e.g., `UserEntity`, `OrderEntity`).

### Controller Rules
```typescript
@Get()
@Auth([RoleType.Admin])
@ApiOperation({ summary: 'Get all users' })
@HttpCode(HttpStatus.OK)
@ApiOkResponse({ type: GetUsersResDto })
async getUsers(
  @Query() getUsersDto: GetUsersDto,
  @AuthUser() user: UserDocument,
): Promise<GetUsersResDto> {
  this.logger.info({ message: JSON.stringify({ method: 'GET', url: '/users', userId: user._id }) });
  return { success: true, ...(await this.userService.getUsers(getUsersDto)) };
}
```

- **Logging BẮT BUỘC** ở mọi endpoint — dùng Winston `this.logger.info()`.
- Response format: `{ success: boolean, data, total?, message? }`.
- Dùng decorators: `@AuthUser()`, `@ClientIp()`, `@UserAgent()`, `@AccessToken()`.

### Auth & Guards
```typescript
@Auth(
  [RoleType.Admin, RoleType.Manager],   // roles
  [PermissionType.ViewProduct],          // permissions
  { public: false }                      // options
)
```
- `@Auth()` tự apply: AuthGuard → RateLimiterGuard → PermissionsGuard → RolesGuard.
- Public routes: `@Auth([], [], { public: true })`.
- Role/Permission types: import từ `shared` package.

### Entity/Schema Definition
```typescript
@DatabaseEntity({ collection: 'users' })
export class UserEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ ref: 'RoleEntity' })
  roleId: string;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
UserSchema.virtual('role', { ref: 'RoleEntity', localField: 'roleId', foreignField: '_id', justOne: true });

export type UserDocument = HydratedDocument<UserEntity> & { role?: RoleDocument };
```

- References: string IDs với `@Prop({ ref: 'EntityName' })`, populate khi cần.
- Virtuals cho relationships.
- Document type: `HydratedDocument<Entity> & { virtual fields }`.

### DTO & Validation (Zod)
```typescript
// 1. Define Zod schema (trong shared package)
export const CreateUserZod = z.object({
  email: EmailZod,
  fullName: NameZod,
  password: PasswordZod,
});
export type CreateUser = z.infer<typeof CreateUserZod>;

// 2. Create DTO class (trong shared package)
export class CreateUserDto extends createZodDto(extendApi(CreateUserZod)) {}

// 3. Response DTO
export class CreateUserResDto extends createZodDto(extendApi(ResZod.extend({ data: UserZod }))) {}
```

- **Mọi endpoint** phải có Request DTO + Response DTO.
- KHÔNG dùng `any` type.
- Reuse Zod validators từ `shared/constants` (IDZod, NameZod, EmailZod, PriceZod...).

### Repository Pattern
```typescript
export class UserRepository extends DatabaseRepositoryAbstract<UserEntity, UserDocument> {
  constructor(@InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>) {
    super(userModel);
  }
}
```
- Mọi data access qua Repository — KHÔNG gọi Model trực tiếp trong Service.

### Error Handling
- Throw custom exceptions: `BadRequestException`, `NotFoundException`, etc.
- Global filters tự handle response format.
- KHÔNG try-catch trong controller — để NestJS exception filters xử lý.

### Caching
- Redis cache cho read operations.
- Cache key format: `entity:${id}`.
- **Luôn invalidate cache** khi update/delete entity.

---

## Shared Package Rules (packages/shared)

### What goes here
- DTOs (Zod schemas + class DTOs)
- Enums (RoleType, Status, OrderStatus, PermissionType...)
- Constants (validation lengths, Zod validators)
- Types (PageQuery, PageRes, BaseEntity)

### What does NOT go here
- Business logic
- Framework-specific code (NestJS decorators, React components)
- Configuration

### Naming
- DTO files: `[feature].dto.ts`
- Enum files: `[name].enum.ts`
- Constant files: descriptive name (e.g., `validation.ts`)

---

## General Rules

### TypeScript
- **Strict mode** — no `any` type trừ khi thật sự cần thiết.
- Dùng `import type { }` cho type-only imports.
- Interface naming: PascalCase, mô tả rõ ràng (e.g., `GetUsersResDto`, `FilterFormProps`).
- Enum pattern: `const` object with `as const` assertion.

### Git
- Commit message: English, concise, bắt đầu bằng verb (add, fix, update, remove, refactor).
- KHÔNG commit files chứa secrets (.env, credentials).

### Code Quality
- KHÔNG để `console.log` trong production code (dùng logger ở backend).
- KHÔNG tạo file mới nếu có thể edit file hiện tại.
- KHÔNG thêm comments/docstrings cho code self-explanatory.
- KHÔNG thêm error handling cho scenarios không thể xảy ra.
- KHÔNG tạo abstractions cho operations chỉ dùng 1 lần.

---

## Documentation Rules (documents/FunctionDescription)

> Mỗi tính năng / module có 1 file mô tả riêng trong `documents/FunctionDescription/`. **Doc phải đồng bộ với code.**

### Quy tắc cập nhật doc khi thay đổi code

- **Khi sửa bất kỳ file nào thuộc 1 tính năng** (FE page, BE module, shared DTO, helper liên quan) → **BẮT BUỘC** mở file doc tương ứng và cập nhật phần bị ảnh hưởng (schema, endpoint, UI component, flow, performance note...).
- **Khi thêm tính năng mới** → tạo 1 file `[FeatureName].md` mới trong `documents/FunctionDescription/` theo cùng cấu trúc các file hiện có (Overview → Luồng hoạt động → API/Schema → UI Components → Performance → Permissions), rồi **thêm 1 dòng vào bảng "Feature → Doc mapping" bên dưới**.
- **Khi xóa tính năng** → xóa file doc tương ứng và xóa dòng mapping.
- **Khi đổi tên file/route/endpoint** → grep `documents/FunctionDescription/*.md` và update các tham chiếu cũ.

### Feature → Doc mapping

> Bảng này là **bảng tra cứu chính**. Trước khi sửa code trong "Files / Folders liên quan", phải đọc file Doc tương ứng để hiểu context, và sau khi sửa phải update doc.

| Tính năng | Doc | Files / Folders liên quan |
|-----------|-----|----------------------------|
| **Dashboard** (5 tabs: Stats + Status + Factory + Lifecycle + Designer) | [`documents/FunctionDescription/Dashboard.md`](documents/FunctionDescription/Dashboard.md) | `apps/web/src/pages/home/` (`index.tsx` tabs, `OrderStatsTab.tsx`, `OrderStatusTab.tsx`, `OrderFactoryTab.tsx`, `DesignerStatsTab.tsx`, `status/*.tsx`), `apps/api/src/modules/order/order.service.ts` → `getDashboard()` + `getStatusOverview()` + `getFactoryOverview()`, `apps/api/src/modules/designer/designer-stats.service.ts`, `packages/shared/dtos/production-order.dto.ts`, `packages/shared/dtos/order-status.dto.ts`, `packages/shared/dtos/designer.dto.ts` |
| **Vòng đời đơn** (Lifecycle dashboard — **MỌI tài khoản**, Fulfillment khóa xưởng; phễu rắn bò 8 chặng soát tool→thiết kế→6 stage fulfillment; lọc theo ngày vào sản xuất `inProductionAt`; snapshot + throughput theo kỳ. **Strip gọn** trên đầu Dashboard trên mọi tab: mặc định mini-phễu backlog, nhập `productionId` → hành trình 1 đơn) | [`documents/FunctionDescription/OrderLifecycle.md`](documents/FunctionDescription/OrderLifecycle.md) | `apps/web/src/pages/home/LifecycleTab.tsx` + `apps/web/src/pages/home/LifecycleStrip.tsx` (`index.tsx`: `<LifecycleStrip/>` trên đầu + `canSeeLifecycle=true`), `apps/web/src/services/order.ts` → `getLifecycleOverview` + `getLifecycleTrack` + `getCancelledOrders`, `apps/web/src/components/orders/CancelledOrdersDialog.tsx` (drill-down đơn hủy, mở từ LifecycleStrip chip "Hủy" + KPI "Đơn đã hủy" ở `OrderStatsTab.tsx`), `apps/api/src/modules/order/order.service.ts` → `getLifecycleOverview()` (+ `totals.cancelledInRange`) + `getLifecycleTrack()` + `getCancelledOrders()` + `toolCheckedAt` set tại updateField/bulkUpdateField/importRework + backfill `onModuleInit`, `apps/api/src/modules/order/order.entity.ts` (`toolCheckedAt`, `cancelledAt`, `cancelReason`), `apps/api/src/modules/order/order.controller.ts` → `GET /lifecycle-overview` + `GET /lifecycle-track/:code` + `GET /cancelled-list` (`@Auth` ORDER_VIEW_ROLES), `packages/shared/dtos/production-order.dto.ts` (`toolCheckedAt` + `LIFECYCLE_STAGE_KEYS` + Lifecycle Overview DTOs incl. `waitingToStart` + `cancelledInRange` + LifecycleTrack DTOs + `GetCancelledOrders`/`CancelledOrderRow` DTOs). **Loại đơn hủy (`cancelledAt`) khỏi mọi công đoạn + thống kê** — xem `documents/Plans/CancelledOrders-ExcludeFromStages.md`. |
| **Products** (Config + Xưởng) | [`documents/FunctionDescription/Products.md`](documents/FunctionDescription/Products.md) | `apps/web/src/pages/products/`, `apps/api/src/modules/product-config/`, `apps/api/src/modules/factory/`, `apps/api/src/modules/machine-type/`, shared DTOs `product-config.dto.ts`, `factory.dto.ts`, `machine-type.dto.ts` |
| **Orders** (List + Nhật ký bù lỗi + Workshop + Import + Cutting File Mapping) | [`documents/FunctionDescription/Orders.md`](documents/FunctionDescription/Orders.md) | `apps/web/src/pages/orders/` (`index.tsx`, `ListOrderTab.tsx`, `ErrorLogTab.tsx`, `OrderTableWorkshop.tsx`, `ImportOrderTab.tsx`, `ImportCuttingFilesTab.tsx`, `DesignerSummaryPanel.tsx`), `apps/web/src/components/orders/cells/` (incl. `AssigneeSelectCell`, `ProductionErrorSelectCell`, `ProductionErrorOtherDialog`, `ErrorSourceCell`), `apps/web/src/components/orders/BulkEditToolbar.tsx`, `apps/web/src/components/orders/AssignDesignerDialog.tsx`, `apps/web/src/components/orders/workshopTableConfig.tsx`, `apps/web/src/components/orders/OrderDetailDialog.tsx` (modal preview cuttingFile qua iframe Drive), `apps/api/src/modules/order/` (trừ `getDashboard`; bao gồm `getErrorLog` + `productionFirstErrorAt` hook + backfill onModuleInit + `drive-file-name.service.ts` + `previewCuttingFiles`/`applyCuttingFiles`), `packages/shared/dtos/production-order.dto.ts` (trừ Dashboard zods; bao gồm `productionFirstErrorAt` + `GetErrorLogDto`/`Res` + `cuttingFileUrl/Name` + Cutting File DTOs + util `parseProductionIdFromCuttingFilename`), `apps/api/src/utils/transform-drive-url.ts` (chia sẻ với Image module) |
| **Auth & Identity** | [`documents/FunctionDescription/Auth.md`](documents/FunctionDescription/Auth.md) | `apps/web/src/pages/login/`, `apps/web/src/pages/register/`, `apps/web/src/pages/account/`, `apps/web/src/pages/users/` (conditional factory dropdown khi role=Fulfillment), `apps/web/src/pages/roles/`, `apps/web/src/pages/custom-roles/`, `apps/web/src/pages/departments/`, `apps/web/src/store/authStore.ts`, `apps/web/src/hooks/usePermission.ts`, `apps/web/src/components/roles/PermissionMatrix.tsx`, `apps/web/src/components/sidebar/Sidebar.tsx` (dynamic filter), `apps/api/src/modules/auth/`, `user/` (UserEntity field `factoryId`, `fulfillmentStage`, `telegramChatId`, `hireDate` — TUYỆT ĐỐI nhớ add field mới vào CẢ 2 $project `getUserById` + `getMe`, xem `Architecture/Common_Pitfalls.md §1`), `role/`, `custom-role/`, `permission/`, `departments/`, `packages/shared/constants/permission-catalog.ts`, `packages/shared/enums/role-type.ts` (`DesignerLeader`) |
| **Image Optimization & Caching** | [`documents/FunctionDescription/ImageOptimization.md`](documents/FunctionDescription/ImageOptimization.md) | `apps/api/src/utils/transform-drive-url.ts`, `apps/api/src/modules/order/order.service.ts` → `processDesigns()`, `refreshImageUrls()`, `apps/web/public/sw.js`, `apps/web/src/components/common/ImagePreviewDialog.tsx`, `apps/web/src/components/common/CopyButton.tsx`, `apps/api/src/modules/redis-cache/` |
| **Workshop Config** (danh mục xưởng) | [`documents/FunctionDescription/WorkshopConfig.md`](documents/FunctionDescription/WorkshopConfig.md) | `apps/web/src/pages/workshop-config/` (errorSource badge + form cho production_error), `apps/web/src/store/workshopConfigStore.ts`, `apps/web/src/services/workshopConfig.ts`, `apps/api/src/modules/workshop-config/` (auto-cleanup category=assignee + auto-backfill errorSource), `packages/shared/dtos/workshop-config.dto.ts`, `packages/shared/enums/workshop-config-category.ts` |
| **Order Log** (audit trail) | [`documents/FunctionDescription/OrderLog.md`](documents/FunctionDescription/OrderLog.md) | `apps/api/src/modules/order-log/`, `apps/api/src/modules/order/order.service.ts` → `write()` calls in updateField/bulkUpdateField/importOrders/deleteOrder, `apps/web/src/components/orders/OrderLogTimelineDialog.tsx`, `packages/shared/dtos/order-log.dto.ts` |
| **Designer Task Workflow** (Leader + sub-designer, kanban, stats, bulk assign, productionErrorSource) | [`documents/FunctionDescription/DesignerTaskWorkflow.md`](documents/FunctionDescription/DesignerTaskWorkflow.md) | `apps/web/src/pages/designer/team/` + `apps/web/src/pages/designer/my-tasks/`, `apps/web/src/pages/orders/DesignerSummaryPanel.tsx`, `apps/web/src/pages/home/DesignerStatsTab.tsx`, `apps/web/src/pages/home/DesignerAssignBacklog.tsx` (backlog "Cần gán" + nút "Nhận về mình" self-claim cho role Designer), `apps/web/src/components/orders/AssignDesignerDialog.tsx`, `apps/web/src/components/orders/cells/{AssigneeSelectCell,ProductionErrorSelectCell,ProductionErrorOtherDialog,ErrorSourceCell}.tsx`, `apps/web/src/store/designerTeamStore.ts`, `apps/web/src/services/designer.ts` + `apps/web/src/services/order.ts` (`claimDesignerTasks`), `apps/api/src/modules/designer/` (toàn module: migration, team, task, stats), `apps/api/src/modules/order/order.service.ts` → `setProductionError()`, `bulkAssignDesigner()`, `claimDesignerTasks()` (self-claim), `getDesignerBreakdown()`, `backfillDesignerStatus()`, hook auto-rework + auto productionErrorCount in `updateField()`, `packages/shared/dtos/designer.dto.ts`, `packages/shared/enums/designer-status.ts`, `packages/shared/dtos/production-order.dto.ts` (designer fields + productionErrorSource/Count + bulk-assign + claim-designer-tasks + set-production-error DTOs) |
| **Telegram Notification & Scheduled Reports** (import summary noti + cron 3 lần/ngày: designer/factory/error) | [`documents/FunctionDescription/TelegramNotification.md`](documents/FunctionDescription/TelegramNotification.md) | `apps/api/src/modules/telegram-notification/` (service + 4 formatter + types), `apps/api/src/modules/scheduled-reports/` (service + controller + 3 aggregator + buildShiftPeriod), `apps/api/src/modules/order/order.service.ts` → `sendImportSummaryNotification()` hook in `importOrders()`, `apps/api/src/shared/services/api-config.service.ts` → `telegram.notificationEnabled` + `scheduledReports.enabled` getters, `packages/core/services/telegram.service.ts` (HTTP client bot), env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_NOTIFICATION_CHANNEL_ID`, `TELEGRAM_NOTIFICATION_ENABLED`, `SCHEDULED_REPORTS_ENABLED` |
| **Scan Barcode → Gán lỗi nhanh** (workshop quét máy USB HID → dialog gán productionError + optional rework-back về stage trước; page riêng `/orders/scan-error` autoFocus input + recent scans. **Công nhân Fulfillment** (có `fulfillmentStage`): quét đơn đúng công đoạn → Enter Hoàn thành (tự start+complete) hoặc Báo lỗi qua `FulfillmentScanActionDialog`) | [`documents/FunctionDescription/ScanError.md`](documents/FunctionDescription/ScanError.md) | `apps/web/src/pages/orders/scan-error/` (page index.tsx + OrderErrorScanDialog.tsx + FulfillmentScanActionDialog.tsx), `apps/web/src/services/order.ts` → `getByProductionId()`, `apps/web/src/constants/{paths,routerConfig}.ts`, `apps/web/src/components/sidebar/Sidebar.tsx` (entry "Quét mã lỗi" trong group Orders), `apps/api/src/modules/order/order.controller.ts` → `GET /by-production-id/:code`, `apps/api/src/modules/order/order.service.ts` → `getByProductionId()`, `packages/shared/dtos/production-order.dto.ts` → `GetOrderByProductionIdResDto`, `packages/shared/constants/permission-catalog.ts` → `page.scan_error` + Fulfillment preset. Reuse `setProductionError` + `fulfillment-transition` (rework-back). |
| **Fulfillment 6-Stage Workflow** (In→Ép→QC sau ép→May nhận vào→May xuất ra→Đóng hàng; đã bỏ `qc-sorting`+`qc-post-sew`, migrate đơn tồn qc-sorting→sew-in; 1 user per (factory,stage); rework-back về designer hoặc bất kỳ stage trước; UI kanban 4 cột + bottom drawer watching) | [`documents/FunctionDescription/FulfillmentWorkflow.md`](documents/FunctionDescription/FulfillmentWorkflow.md) | `apps/api/src/modules/fulfillment/` (toàn module: task service + controller + module — 5 tab filter waiting/in-progress/rework/done/watching), `apps/api/src/modules/order/order.entity.ts` (currentFulfillmentStage + fulfillmentStages 6 subdoc + fulfillmentTimeline + fulfillmentCompletedAt + makeEmptyStageState), `apps/api/src/modules/user/user.entity.ts` (fulfillmentStage + partial unique index `unique_factory_fulfillment_stage`), `apps/api/src/modules/user/user.service.ts` (Fulfillment validation + isDuplicateStageError E11000 handler + `getUserById`/`getMe` $project bao gồm fulfillmentStage — xem `Architecture/Common_Pitfalls.md §1`), `apps/api/src/modules/designer/designer-task.service.ts` (hook entry A: designer.complete → init print stage với waitingAt), `apps/api/src/modules/order/order.service.ts` (factory `buildFulfillmentEntrySet()` + hook entry B: toolResultNote='ok' qua updateField/bulkUpdateField/importRework, set waitingAt), `apps/web/src/pages/fulfillment/my-tasks/` (kanban index.tsx 4 cột + DnD + filter + bulk + FulfillmentTaskCard + ReworkBackDialog), `apps/web/src/pages/users/index.tsx` (stage dropdown auto-derive từ FULFILLMENT_STAGES khi role=Fulfillment), `apps/web/src/services/fulfillment.ts`, `apps/web/src/components/sidebar/Sidebar.tsx` (entry Task Fulfillment), `apps/web/src/constants/{paths,routerConfig}.ts`, `apps/web/src/main.tsx` (dayjs relativeTime + locale VI), `packages/shared/enums/fulfillment-stage.ts` (6 stage + status + transition action enum), `packages/shared/dtos/production-order.dto.ts` (fulfillment fields trong ProductionOrderZod + waitingAt + FulfillmentTransitionDto + GetFulfillmentMyTasksDto 5 tab + queue/stats DTOs + FulfillmentStagesZod 6 subkey), `packages/shared/dtos/user.dto.ts` (fulfillmentStage), `packages/shared/constants/permission-catalog.ts` (6 perms mới + Fulfillment preset) |
| **Soát tool** (nguồn lỗi thứ 3 `errorSource='tool-check'` — In báo "Thiếu file để in" → đẩy về Support thay vì designer/xưởng; tab Dashboard "Soát tool" CHỈ Support+Admin: 2 nhóm list cần-làm-lại/chưa-soát + thống kê lỗi theo sản phẩm/khách hàng) | [`documents/FunctionDescription/ToolCheckWorkflow.md`](documents/FunctionDescription/ToolCheckWorkflow.md) | `apps/web/src/pages/home/ToolCheckTab.tsx` (+ tab `tool-check` gate `page.tool_check` trong `index.tsx`, bên trái tab Designer), `apps/web/src/pages/workshop-config/CategoryEditor.tsx` (nút nguồn + `ErrorSourceBadge`), `apps/web/src/components/orders/cells/{ProductionErrorSelectCell,ErrorSourceCell,ColorBadgeSelectCell,SelectPopover,ProductionErrorOtherDialog}.tsx` (badge + type 'tool-check'), `apps/web/src/components/orders/workshopTableConfig.tsx` (row type), `apps/web/src/services/designer.ts` → `toolCheckOverview`, `apps/api/src/modules/order/order.service.ts` (`canReworkBackToSupport` + `buildDesignerReworkBackFromError(target)` + 3 call-site + `applyFulfillmentStatusFilter` waiting/watching), `apps/api/src/modules/fulfillment/fulfillment-task.service.ts` (tab watching), `apps/api/src/modules/designer/designer-stats.service.ts` → `getToolCheckOverview()` + `designer-stats.controller.ts` → `GET /designer/tool-check-overview` (`@Auth` Support/Admin), `apps/api/src/modules/workshop-config/workshop-config.seed.ts` + `workshop-config.entity.ts` (errorSource 'tool-check' + seed "Thiếu file để in"), `packages/shared/dtos/{workshop-config,production-order,designer}.dto.ts` (ErrorSource enum + ToolCheckOverview DTOs), `packages/shared/constants/permission-catalog.ts` (`page.tool_check` + Support preset) |

### Cross-cutting docs (không nằm trong feature mapping)

| Doc | Khi nào đọc |
|---|---|
| [`documents/Architecture/Common_Pitfalls.md`](documents/Architecture/Common_Pitfalls.md) | **Trước khi** add field mới vào `UserEntity`, refactor enum trong production, viết const patch object với `new Date()`, hoặc sửa `packages/shared/`. Tổng hợp 5 bug pattern cross-cutting đã từng xảy ra với root cause + rule chung. |

### Doc file structure (template cho file mới)

```markdown
# [Feature Name] — Function Description

> **File FE:** đường dẫn
> **File BE:** đường dẫn
> **Route:** /xxx
> **API:** /v1/xxx

## 1. Overview
## 2. Luồng hoạt động
## 3. API / Schema
## 4. UI Components
## 5. Backend logic
## 6. Performance notes
## 7. Permissions
```

### Quy tắc viết doc

- Viết bằng **tiếng Việt** (giống các file hiện có).
- Trỏ đến **file path tuyệt đối tính từ repo root** + tên function / class cụ thể (không nói chung chung).
- Khi liệt kê endpoint dùng bảng `Method | Path | Mô tả`.
- Khi liệt kê schema dùng code block TypeScript-ish.
- KHÔNG copy nguyên code dài vào doc — chỉ trích đoạn ngắn minh họa.
- Số liệu performance phải có trước/sau cụ thể (ms, MB, lần request...).
