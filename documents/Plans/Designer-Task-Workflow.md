# Designer Task Workflow — Leader + Sub-designers

> **Bài toán:** Hiện tại role `Designer` là 1 account dùng chung, không có khái niệm "leader" hay "task của tôi". Cần tách thành:
> - **1 Leader** (`designerLeader@onospod.com`) — gán task, xem stats.
> - **N Sub-designer** (1 user / assigneeCode 1-1) — chỉ thấy task của mình, có lifecycle status + timestamps để tính hiệu năng.
> - Workflow `assigned → in-progress → done`, có thêm `rejected` (designer trả task) và `rework` (xưởng báo lỗi do design).
>
> **Thời điểm:** 2026-06-21. Liên quan modules: `order`, `user`, `role`, `workshop-config`, `order-log`.

---

## 0. Quyết định đã chốt với user

| # | Khoản | Quyết định |
|---|---|---|
| 1 | Tài khoản hiện tại | Migrate → Leader, email **`designerLeader@onospod.com`** |
| 2 | Trang tạo/quản lý sub-designer | **`/designer/team`** chuyên dụng (form email/pass/status/ngày vào làm…) |
| 3 | Mapping user ↔ assignee code | **1-1**, unique. 8 code seed sẵn (`huy`, `h-anh`, `an`, `k-anh`, `hanh`, `nga`, `phuong-anh`, `huong`) giữ nguyên |
| 4 | Email convention | **`<assigneeCode>.designer@onospod.com`** (vd `huy.designer@…`, `h-anh.designer@…`) |
| 5 | "Từ chối / trả task" | Có. Sub-designer bấm "Trả lại" + nhập lý do optional (500 chars) → status `rejected`, leader thấy + re-assign cho người khác |
| 6 | "Làm lại" sau khi xưởng báo lỗi | Có. Khi xưởng set `productionError` với mã có flag `errorSource='designer'` → status auto `rework`. Designer nhận lại task này |
| 7 | Reassign | **Block** khi status ∉ {`assigned`, `rejected`} (đang in-progress hoặc done hoặc rework → không reassign được) |
| 8 | done → toolResultNote | Auto set `toolResultNote='ok'` + `readyForFulfill=true` |
| 9 | Designer chỉnh toolResultNote tay | **Không cho** (ẩn cell, chỉ derive từ designerStatus) |
| 10 | Scope assign | Mọi order, mọi thời điểm |
| 11 | Bulk assign | Có, qua `BulkEditToolbar` sẵn |
| 12 | Sub-designer view mặc định | Dashboard riêng cho designer (phase sau) + tab "Task của tôi" (kanban kéo thả, có ngay) |
| 13 | Notification | Browser Notification + Telegram (Telegram **phase sau**, có UI config) |
| 14 | Stats period | Today / 7d / 30d / custom |
| 15 | Stats view | Leaderboard + timeline per-person, có chart |
| 16 | Block delete user | Block soft-delete nếu còn task ở trạng thái `{assigned, in-progress, rework}` |
| 17 | productionError flag | Thêm `errorSource: 'designer' \| 'factory'` lên workshop_config items category `production_error`. `'designer'` → trigger rework. `'factory'` → không trigger (chỉ ghi nhận stats) |

---

## 1. State machine + transition rules

```
                                        ┌───────────────┐
                                        │ unassigned    │  ← default khi import order
                                        └───────┬───────┘
                                                │ leader assign
                                                ▼
                                        ┌───────────────┐ ──┐ reassign OK
                                        │   assigned    │   │ (leader pick code khác)
                                        └───┬───────┬───┘ ←─┘
                              sub bấm "Nhận"│       │sub bấm "Trả lại"
                                            ▼       ▼
                          ┌─────────────────────┐ ┌─────────────┐
                          │     in-progress     │ │  rejected   │ ─┐
                          └───┬───────────────┬─┘ └─────┬───────┘  │
              sub bấm "Hoàn thành"│         │              │       │
                                 ▼          │              │       │ leader assign lại
                          ┌──────────────┐  │              │       │ cho người khác
                          │    done      │  │              └───────┘
                          │ + tool=ok    │  │
                          │ + readyForFulfill=true
                          └──────┬───────┘  │
                                 │          │
                xưởng set productionError với errorSource='designer'
                                 ▼          ▼
                          ┌──────────────────┐
                          │     rework       │ ──┐ sub bấm "Nhận làm lại" → in-progress
                          │ (xưởng báo lỗi)  │   │ (cùng người, KHÔNG reassign)
                          └──────────────────┘ ──┘
```

### Bảng transition

| From | To | Trigger | Quyền | Side effects |
|---|---|---|---|---|
| `unassigned` | `assigned` | Leader set `assignee` | Leader / Admin | `designerAssignedAt = now` |
| `assigned` | `assigned` (reassign) | Leader đổi `assignee` | Leader / Admin | Reset `designerAssignedAt`; ghi log "reassigned from X to Y" |
| `assigned` | `in-progress` | Sub bấm "Nhận làm" | Owner sub-designer | `designerStartedAt = now` |
| `assigned` | `rejected` | Sub bấm "Trả lại" + reason | Owner sub-designer | `designerRejectedAt = now`, `designerRejectedReason = "..."`. Notify leader |
| `rejected` | `assigned` | Leader assign cho người khác | Leader / Admin | Reset timestamps + clear `designerRejectedReason` |
| `in-progress` | `done` | Sub bấm "Hoàn thành" | Owner sub-designer | `designerCompletedAt = now`; auto `toolResultNote='ok'`; auto `readyForFulfill=true` |
| `done` | `rework` | Xưởng set `productionError` có `errorSource='designer'` | Fulfillment / Admin | `designerReworkAt = now`, `designerReworkCount++`. Notify cùng sub-designer (không reassign). Clear `toolResultNote='ok'`? — **giữ nguyên ok** để Fulfillment vẫn pickup được, chỉ thêm flag rework |
| `rework` | `in-progress` | Sub bấm "Nhận làm lại" | Owner sub-designer | Không reset `designerStartedAt` gốc (để tính total time); set `designerReworkStartedAt = now` |
| `rework` | `done` | Sub bấm "Hoàn thành" (lần n) | Owner sub-designer | `designerCompletedAt = now` (overwrite) |

### Constraint phụ
- Sub-designer **chỉ** transition được task có `assignee = user.assigneeCode`.
- Sub-designer **không** edit `toolResultNote` trực tiếp — cell ẩn ở UI, BE từ chối nếu PATCH.
- Leader/Admin có thể override mọi transition (escape hatch).

---

## 2. Schema changes

### 2.1 `UserEntity` (`apps/api/src/modules/user/user.entity.ts`)

```ts
@Prop({ trim: true, lowercase: true, sparse: true, unique: true })
assigneeCode?: string;  // 1-1 với workshop_config (category=assignee). Sparse + unique.

@Prop()
telegramChatId?: string;  // Per-user Telegram. Phase notification sau.

@Prop()
hireDate?: Date;  // Ngày vào làm — hiển thị ở /designer/team. Optional.
```

> Đã có `telegramConfig` object — mình giữ nguyên, thêm field shortcut `telegramChatId` để UI/notification dễ đọc.

Index: thêm unique sparse index trên `assigneeCode` để guard 1-1.

### 2.2 `OrderEntity` (`apps/api/src/modules/order/order.entity.ts`)

Thêm 1 enum field + 5 timestamp + 2 counter/text:

```ts
export enum DesignerStatus {
  Unassigned = 'unassigned',
  Assigned = 'assigned',
  InProgress = 'in-progress',
  Done = 'done',
  Rejected = 'rejected',
  Rework = 'rework',
}

@Prop({ type: String, enum: Object.values(DesignerStatus), default: DesignerStatus.Unassigned, index: true })
designerStatus: DesignerStatus;

@Prop() designerAssignedAt?: Date;
@Prop() designerStartedAt?: Date;
@Prop() designerCompletedAt?: Date;
@Prop() designerRejectedAt?: Date;
@Prop() designerReworkAt?: Date;

@Prop() designerRejectedReason?: string;
@Prop({ default: 0 }) designerReworkCount: number;
```

> Mọi field optional trừ `designerStatus` (default `unassigned`). Backfill: scan toàn bộ order, suy ra status từ `assignee` + `toolResultNote` + OrderLog.

### 2.3 `WorkshopConfigEntity` — production_error có thêm flag

```ts
@Prop({ type: String, enum: ['designer', 'factory'] })
errorSource?: 'designer' | 'factory';   // Chỉ dùng khi category=production_error
```

Seed default:
```ts
{ category: ProductionError, code: 'wrong-design',     errorSource: 'designer', ... },
{ category: ProductionError, code: 'missing-design',   errorSource: 'designer', ... },
{ category: ProductionError, code: 'wrong-size',       errorSource: 'factory',  ... },
{ category: ProductionError, code: 'print-misalign',   errorSource: 'factory',  ... },
{ category: ProductionError, code: 'print-blur',       errorSource: 'factory',  ... },
{ category: ProductionError, code: 'fabric-damage',    errorSource: 'factory',  ... },
{ category: ProductionError, code: 'wrong-color',      errorSource: 'factory',  ... },
{ category: ProductionError, code: 'wrong-fabric',     errorSource: 'factory',  ... },
{ category: ProductionError, code: 'machine-jam',      errorSource: 'factory',  ... },
{ category: ProductionError, code: 'other',            errorSource: 'factory',  ... },
```

Workshop config tab "Lỗi sản xuất" thêm dropdown chọn `errorSource` khi tạo/sửa entry (chỉ hiện cho category `production_error`).

### 2.4 Role mới

`packages/shared/enums/role-type.ts`:
```ts
DesignerLeader = 'DesignerLeader',
```

`SYSTEM_ROLES` array thêm `DesignerLeader` đứng trước `Designer`.

### 2.5 Permission catalog (`packages/shared/constants/permission-catalog.ts`)

Thêm:
```ts
{ code: 'page.designer_team',          label: 'Quản lý team designer',     group: 'page' },
{ code: 'page.my_tasks',               label: 'Task của tôi (designer)',   group: 'page' },
{ code: 'page.designer_stats',         label: 'Stats designer (leader)',   group: 'page' },
{ code: 'designer.team.manage',        label: 'Tạo/sửa/xoá sub-designer',  group: 'admin' },
{ code: 'designer.task.assign',        label: 'Assign task cho designer',  group: 'order' },
{ code: 'designer.task.transition',    label: 'Transition trạng thái task của bản thân', group: 'order' },
{ code: 'designer.task.override',      label: 'Override transition (leader)', group: 'order' },
```

`DEFAULT_ROLE_PERMISSIONS` cập nhật:
- **DesignerLeader**: all Admin perms cho order + `page.designer_team`, `designer.team.manage`, `designer.task.assign`, `designer.task.override`, `page.designer_stats`. Không cần `page.my_tasks` (nhưng có thể có để xem thử).
- **Designer** (sub): bỏ `assignee.edit`, `assignee.view` giữ. Thêm `page.my_tasks`, `designer.task.transition`. Bỏ `toolResultNote.edit` (BE auto set).

### 2.6 `OrderWorkshopField` — thêm `'designerStatus'`

Để BE `assertCanEditField` xử lý, dùng chung helper validation:

```ts
// packages/shared/dtos/production-order.dto.ts
export const ORDER_WORKSHOP_FIELDS = [
  ...,
  'designerStatus',  // new
] as const;
```

Permission map:
```ts
designerStatus: [...ADMIN_ROLES, RoleType.Designer, RoleType.DesignerLeader],
```

Nhưng transition logic phức tạp hơn assertCanEditField đơn giản — sẽ có 1 endpoint riêng `POST /v1/orders/:id/designer-transition` với body `{ action: 'start' | 'complete' | 'reject' | 'restart' | 'reassign-block-clear', reason? }`. Endpoint này check state machine + owner constraint + side effects (auto set toolResultNote, increment counter, log).

---

## 3. API endpoints mới

### 3.1 Designer team management (Leader)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/v1/designer/team` | List sub-designers (filter active/inactive) + count task hiện tại của mỗi người |
| `POST` | `/v1/designer/team` | Tạo sub-designer: body `{ email, password, assigneeCode, fullName, hireDate?, telegramChatId? }`. BE auto link role=Designer + validate assigneeCode chưa được user khác claim + assigneeCode có trong workshop_config |
| `PATCH` | `/v1/designer/team/:userId` | Update info (không cho đổi assigneeCode nếu user đang có task active) |
| `DELETE` | `/v1/designer/team/:userId` | Soft delete. Block nếu còn task active |
| `GET` | `/v1/designer/team/available-codes` | List assignee code (workshop_config) chưa bị user nào claim — cho dropdown khi tạo user mới |

### 3.2 Task transition (Sub-designer + Leader)

| Method | Path | Body | Mô tả |
|---|---|---|---|
| `POST` | `/v1/orders/:id/designer-transition` | `{ action: 'start' \| 'complete' \| 'reject' \| 'restart', reason?: string }` | State machine transition. Auto side effects |

Action mapping → state:
- `start`: assigned/rework → in-progress
- `complete`: in-progress → done (+ toolResultNote='ok')
- `reject`: assigned → rejected (+ reason)
- `restart`: rework → in-progress

### 3.3 My tasks (Sub-designer)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/v1/designer/my-tasks` | Query: `?status=assigned,in-progress&from=&to=`. BE auto inject `assignee = user.assigneeCode`. Return list orders + count theo status để FE render kanban |
| `GET` | `/v1/designer/my-stats` | KPI cá nhân: today/7d/30d — `{assignedCount, completedToday, avgResponseMin, avgWorkMin}` |

### 3.4 Performance / leaderboard (Leader)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/v1/designer/performance` | Query: `?from=&to=&designerCode?=` (optional, lọc 1 người). Return: per-designer aggregate (totalAssigned, totalCompleted, totalRejected, totalRework, avgResponseMin, avgWorkMin, errorRate) |
| `GET` | `/v1/designer/timeline/:assigneeCode` | Per-day count per status (cho chart line/bar). 30 day buckets |

### 3.5 Production error stats (mới — flag `errorSource`)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/v1/orders/error-stats` | Aggregate productionError trong khoảng thời gian, group theo `errorSource` ('designer' vs 'factory') + breakdown từng code. Dùng cho dashboard chung |

---

## 4. UI/UX

### 4.1 `/designer/team` (Leader page)

Layout:
```
┌─ Header: "Team Designer" ──────────────────────────┐
│  [+ Thêm thành viên]   [Filter: All/Active/Inactive]│
└─────────────────────────────────────────────────────┘

┌─ Table ────────────────────────────────────────────┐
│ Tên       Code   Email                Vào   Status │
│ ─────────────────────────────────────────────────  │
│ Huy       huy    huy.designer@…       2024  ✅ Đang│
│ H Anh     h-anh  h-anh.designer@…     2025  ✅ Đang│
│ An        an     an.designer@…        —     ❌ Tắt│
│ ...                                                │
│                                                    │
│ [Sửa] [Reset pwd] [Xem stats] [Tắt account]       │
└────────────────────────────────────────────────────┘
```

Dialog "Thêm thành viên":
- Tên hiển thị (required)
- Email (auto-fill `<code>.designer@onospod.com` khi chọn code, nhưng cho sửa)
- Password (random gen + nút "copy" hoặc tự nhập)
- AssigneeCode (dropdown từ `/available-codes`)
- HireDate (DatePicker)
- TelegramChatId (optional, placeholder "Sẽ dùng cho notification sau")

### 4.2 `/my-tasks` (Sub-designer kanban)

```
┌─ Header ────────────────────────────────────────────────┐
│ Xin chào, Huy. Hôm nay: 3 task xong, 5 đang chờ        │
│ [today | 7d | 30d | custom]                            │
└─────────────────────────────────────────────────────────┘

┌─ KPI mini (4 ô)  ───────────────────────────────────────┐
│ Cần làm: 5 │ Đang làm: 2 │ Cần làm lại: 1 │ Đã xong: 8 │
└─────────────────────────────────────────────────────────┘

┌─ Kanban 4 cột (drag-drop) ─────────────────────────────┐
│ Cần làm (5)    Đang làm (2)  Cần làm lại (1)  Đã xong (8) │
│ ┌──────────┐   ┌──────────┐  ┌──────────┐    ┌──────────┐  │
│ │ Card     │   │ Card     │  │ Card     │    │ Card     │  │
│ │ thumbnail│   │ thumbnail│  │ thumbnail│    │ thumbnail│  │
│ │ PR-12345 │   │ PR-23456 │  │ PR-34567 │    │ PR-45678 │  │
│ │ Tee blue │   │ Hoodie   │  │ Tank top │    │ Polo     │  │
│ │ 12:30    │   │ 13:45    │  │ rework × 2│    │ ✓ 14:20  │  │
│ └──────────┘   └──────────┘  └──────────┘    └──────────┘  │
└─────────────────────────────────────────────────────────┘

[+ Toggle "Hiện task đã trả lại"] → expand drawer dưới
```

Card detail click → mở dialog (reuse OrderLogTimelineDialog?) hoặc drawer riêng với button transition.

Drag rules (enforce qua `@dnd-kit/core` onDragEnd):
- Cần làm → Đang làm: OK (action 'start')
- Cần làm → Đã trả (modal nhập reason): action 'reject'
- Đang làm → Đã xong: OK (action 'complete')
- Cần làm lại → Đang làm: OK (action 'restart')
- Drop sai → revert + toast warning "Không thể chuyển từ X sang Y"

### 4.3 Workshop table (Leader view)

Tận dụng `OrderTableWorkshop.tsx` + `WorkshopOrderRow` đã có. Thay đổi:
- Thêm cột mới **"Designer status"** sau cột `assignee` — hiển thị badge có color theo state (assigned=xám, in-progress=xanh dương, done=xanh lá, rejected=đỏ, rework=cam).
- Cell `assignee` đối với Leader vẫn editable, đối với sub-designer ẩn (Leader-only).
- Cell `toolResultNote` ẩn với cả Designer + sub-designer (đã derive auto).
- `BulkEditToolbar` thêm field `assignee` cho Leader.

### 4.4 Stats dashboard `/dashboard?tab=designer`

3 section:

**A. Leaderboard (table)** — sort theo `completedCount` desc:
```
Rank  Tên     Code     Cần làm  Đang làm  Đã xong  Trả  Làm lại  Avg phản hồi  Avg làm
 1    Huy     huy      3        2         42       1    2        12'           45'
 2    An      an       5        1         38       0    0        18'           52'
 ...
```

**B. Timeline per-designer (chart)** — dropdown chọn designer → line chart 30 ngày, 4 line: assigned/started/completed/rework.

**C. Error source pie/bar** — split lỗi xưởng vs lỗi designer trong kỳ. Có drill-down từng productionError code.

Sử dụng `recharts` (đã có trong package?). Nếu chưa, dùng `chart.js`. Check phase implement.

---

## 5. Migration

### 5.1 Account migration (chạy 1 lần khi deploy)

Script `apps/api/src/migration/migrate-designer-leader.ts` (chạy qua `pnpm migration:designer-leader`):

```ts
// 1. Tìm user hiện có role=Designer
// 2. Nếu chỉ 1 user → update role=DesignerLeader, email='designerLeader@onospod.com'
//    (Lưu email cũ vào field `previousEmail` để track)
// 3. Nếu nhiều user Designer → in ra danh sách, user thủ công chọn ai là leader
```

### 5.2 Backfill `designerStatus` cho order cũ

Endpoint `POST /v1/orders/backfill-designer-status` (Admin only, idempotent):

```ts
for each order:
  if (!order.assignee) → status='unassigned', skip
  else if (toolResultNote === 'ok') {
    status = 'done'
    completedAt = OrderLog.findLast({orderId, field:'toolResultNote', after:'ok'})?.createdAt ?? order.updatedAt
    assignedAt = OrderLog.findFirst({orderId, field:'assignee'})?.createdAt ?? order.createdAt
    startedAt = (assignedAt + (completedAt-assignedAt)/2)  // fallback giữa range nếu không có log
  } else if (productionError && errorSource('designer')) {
    status = 'rework'
    reworkAt = OrderLog.findLast({orderId, field:'productionError'})?.createdAt
    completedAt = ...
    startedAt = ...
  } else {
    status = 'assigned'
    assignedAt = OrderLog.findFirst({orderId, field:'assignee'})?.createdAt
  }
```

Báo cáo trả về `{ scanned, updated, skipped }`.

### 5.3 Seed 8 sub-designer (optional, leader có thể skip nếu muốn tự tạo từng người)

CLI command `pnpm seed:designers`:
- Đọc 8 code từ workshop_config (category=assignee)
- Mỗi code tạo 1 user: email `<code>.designer@onospod.com`, password random ghi ra file `.tmp-designer-passwords.txt`, role=Designer, assigneeCode=code
- In ra bảng tóm tắt để leader gửi mật khẩu cho team
- Idempotent: code đã có user thì skip

### 5.4 Update workshop_config seed với `errorSource` flag

Sửa `workshop-config.seed.ts` thêm field `errorSource` cho 10 mã production_error (xem §2.3).
- Phase deploy: chạy endpoint mới `POST /v1/workshop-config/sync-error-source` để update field cho row cũ trong DB.

---

## 6. Notification (phase sau — chuẩn bị schema)

### 6.1 Triggers
- Sub-designer được assign task mới → notify sub-designer.
- Task của sub-designer chuyển `rework` (xưởng báo lỗi) → notify sub-designer.
- Sub-designer reject task → notify leader.

### 6.2 Channel

Hiện chuẩn bị **schema + field user** nhưng KHÔNG enable notify thực tế. Phase tiếp:
- **Browser**: Notification API native, register service worker push, gọi `new Notification(...)` từ FE polling khi list endpoint trả task mới.
- **Telegram**: Module `TelegramNotificationService` đã có. Field `UserEntity.telegramChatId` đã thêm ở §2.1. Thêm `TELEGRAM_GROUP_CHAT_ID` env cho group chung.

UI config:
- `/account` page: input "Telegram Chat ID" (user tự lấy từ @userinfobot rồi paste).
- `/designer/team` form: leader nhập hộ.

---

## 7. Phase rollout

### Phase 1 — Schema + role + permission (1 ngày)
- Add UserEntity fields (`assigneeCode`, `telegramChatId`, `hireDate`).
- Add OrderEntity fields (`designerStatus` + 5 timestamp + reworkCount + rejectedReason).
- Add `DesignerLeader` role + perms.
- Add `errorSource` field to WorkshopConfig.
- Update DTOs in shared.
- Migration script: migrate existing 1 Designer → Leader.

### Phase 2 — `/designer/team` page (1 ngày)
- BE: 5 endpoints CRUD + available-codes.
- FE: table + dialog create/edit + seed initial 8 users (qua CLI).

### Phase 3 — Task transition + visibility (1.5 ngày)
- BE: `POST /orders/:id/designer-transition` với state machine.
- BE: auto rework khi xưởng set productionError có errorSource='designer'.
- BE: visibility filter cho sub-designer (`assignee = user.assigneeCode`).
- BE: backfill endpoint cho order cũ.
- FE: update `OrderTableWorkshop` thêm cột designerStatus + cell hidden cho sub-designer.

### Phase 4 — Sub-designer Kanban (`/my-tasks`) (2 ngày)
- BE: `/v1/designer/my-tasks` + `/my-stats`.
- FE: page mới với 4 cột kanban (`@dnd-kit/core`), reject modal, click card → drawer detail.
- KPI header.

### Phase 5 — Stats dashboard (1.5 ngày)
- BE: `/v1/designer/performance` + `/timeline/:code` + `/orders/error-stats`.
- FE: tab mới `/dashboard?tab=designer` với 3 section (leaderboard / timeline / error source pie).

### Phase 6 — Browser notification (1 ngày, sau khi 1-5 ổn)
- FE: register service worker push + Notification permission flow.
- Trigger ở component `/my-tasks` khi polling thấy task mới.

### Phase 7 — Telegram notification + per-user config (1.5 ngày, optional)
- BE: hook vào `OrderService.updateField('assignee')` + transition rework → send via TelegramNotificationService.
- FE: `/account` input telegramChatId + `/designer/team` form.

**Tổng:** ~8-9 ngày cho full feature. Có thể merge Phase 5+6+7 sang sau khi 1-4 sống.

---

## 8. Acceptance criteria

- [ ] Login `designerLeader@onospod.com` → thấy menu `/designer/team`, `/dashboard?tab=designer`, vẫn xem được toàn bộ orders.
- [ ] Leader tạo sub-designer "Huy" với code `huy` → email `huy.designer@onospod.com` được tạo, password reset link gửi (optional) hoặc password hiển thị 1 lần trong dialog.
- [ ] Leader assign 1 order cho `huy` → order có `designerStatus='assigned'`, `designerAssignedAt` set.
- [ ] Leader assign lại order đó cho `an` khi vẫn ở status `assigned` → OK, ghi log.
- [ ] Leader cố assign lại order đang `in-progress` → BE từ chối 400 "Cannot reassign while in-progress".
- [ ] Login `huy.designer@onospod.com` → vào thẳng `/my-tasks` → thấy 1 task trong cột "Cần làm".
- [ ] Huy drag card sang "Đang làm" → BE set `designerStartedAt`, status='in-progress'.
- [ ] Huy drag card sang "Đã xong" → BE set `designerCompletedAt`, status='done', auto `toolResultNote='ok'`, `readyForFulfill=true`.
- [ ] Login Fulfillment → thấy order Huy vừa xong (readyForFulfill=true).
- [ ] Fulfillment set `productionError='wrong-design'` (errorSource='designer') → order chuyển status `rework`, `designerReworkAt` set, `designerReworkCount=1`. Huy thấy trong cột "Cần làm lại".
- [ ] Fulfillment set `productionError='fabric-damage'` (errorSource='factory') → KHÔNG chuyển rework, chỉ ghi vào productionError. Order vẫn done.
- [ ] Huy drag rework card → "Đang làm" → BE set `designerReworkStartedAt`, status='in-progress'. Tiếp tục → done. `designerReworkCount` vẫn = 1, `designerCompletedAt` update.
- [ ] Huy drag "Cần làm" sang "Đã trả" → modal nhập reason → status='rejected', `designerRejectedReason` lưu. Leader thấy + reassign.
- [ ] Leader vào `/dashboard?tab=designer` → leaderboard 4 designer với count + avg time. Chart timeline đúng.
- [ ] Error stats: pie chart designer vs factory tỷ lệ đúng theo flag.
- [ ] Block delete user Huy nếu Huy còn task active (status ∈ {assigned, in-progress, rework}).
- [ ] Sub-designer cố PATCH `toolResultNote` qua API → 403 Forbidden.
- [ ] Sub-designer cố GET order không phải của mình → 404 hoặc empty.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| State machine race condition (2 user transition cùng lúc) | Mongo `findOneAndUpdate` với filter `designerStatus: <expected>` — nếu không match thì throw 409 Conflict, FE refetch + retry |
| Backfill sai timestamp (OrderLog thiếu) | Cho phép leader chạy lại backfill nhiều lần, idempotent. Stats có disclaimer "ước tính cho data cũ" |
| Sub-designer quên logout → đồng nghiệp dùng máy nhìn thấy task riêng | Out of scope — vấn đề physical security. Có thể bổ sung 2FA sau |
| Kanban drag-drop conflict khi 2 user kéo cùng 1 card | Optimistic update + revert nếu BE 409. Polling refresh 30s |
| Leaderboard "gaming" — sub-designer cố tình bấm "complete" sớm để tăng số task | Stats kèm `errorRate` (rework count / completed count) — exposed cho leader thấy. Audit log OrderLog đầy đủ |
| 8 sub-designer + leader = 9 user → password leak | Yêu cầu leader đổi password lần đầu login. Lưu hashed bcrypt như cũ |

---

## 10. File checklist

### Backend new
- [ ] `apps/api/src/modules/designer/designer.module.ts`
- [ ] `apps/api/src/modules/designer/designer-team.controller.ts`
- [ ] `apps/api/src/modules/designer/designer-team.service.ts`
- [ ] `apps/api/src/modules/designer/designer-task.controller.ts`
- [ ] `apps/api/src/modules/designer/designer-task.service.ts`  ← state machine
- [ ] `apps/api/src/modules/designer/designer-stats.controller.ts`
- [ ] `apps/api/src/modules/designer/designer-stats.service.ts`
- [ ] `apps/api/src/migration/migrate-designer-leader.ts`
- [ ] `apps/api/src/seed/seed-designers.ts`

### Backend modified
- [ ] `apps/api/src/modules/user/user.entity.ts` (+ assigneeCode, telegramChatId, hireDate)
- [ ] `apps/api/src/modules/user/user.service.ts` (validate assigneeCode unique + check active code in workshop_config; block delete if active tasks)
- [ ] `apps/api/src/modules/order/order.entity.ts` (+ designerStatus enum + 5 timestamp + counter + reason)
- [ ] `apps/api/src/modules/order/order.service.ts`:
  - `buildVisibilityFilter` thêm branch cho Designer (filter assignee=user.assigneeCode)
  - `updateField('assignee')` set `designerStatus='assigned'` + check reassign rule
  - `updateField('productionError')` check `errorSource='designer'` → transition rework
  - Block FE update `toolResultNote` từ role Designer (deriv auto)
  - Backfill method
- [ ] `apps/api/src/modules/workshop-config/workshop-config.entity.ts` (+ errorSource)
- [ ] `apps/api/src/modules/workshop-config/workshop-config.seed.ts` (errorSource cho 10 mã production_error)
- [ ] `apps/api/src/modules/workshop-config/workshop-config.service.ts` (resetCategory respect errorSource)
- [ ] `apps/api/src/app.module.ts` import DesignerModule

### Shared
- [ ] `packages/shared/enums/role-type.ts` (+ DesignerLeader)
- [ ] `packages/shared/enums/designer-status.ts` (mới)
- [ ] `packages/shared/constants/permission-catalog.ts` (+ 7 perm, role mapping)
- [ ] `packages/shared/dtos/production-order.dto.ts` (+ designerStatus, timestamps, transition action enum)
- [ ] `packages/shared/dtos/user.dto.ts` (+ assigneeCode, telegramChatId, hireDate)
- [ ] `packages/shared/dtos/workshop-config.dto.ts` (+ errorSource)
- [ ] `packages/shared/dtos/designer.dto.ts` (mới — team, my-tasks, stats DTOs)

### Frontend new
- [ ] `apps/web/src/pages/designer/team/index.tsx`
- [ ] `apps/web/src/pages/designer/team/TeamMemberDialog.tsx`
- [ ] `apps/web/src/pages/designer/my-tasks/index.tsx` (Kanban)
- [ ] `apps/web/src/pages/designer/my-tasks/TaskCard.tsx`
- [ ] `apps/web/src/pages/designer/my-tasks/RejectModal.tsx`
- [ ] `apps/web/src/pages/designer/stats/index.tsx` (dashboard)
- [ ] `apps/web/src/services/designer.ts`
- [ ] `apps/web/src/store/designerStore.ts` (kanban state)

### Frontend modified
- [ ] `apps/web/src/constants/paths.ts` (+ DESIGNER_TEAM, MY_TASKS, DESIGNER_STATS)
- [ ] `apps/web/src/constants/routerConfig.ts` (+ lazy load 3 page mới, gắn role-based redirect cho sub-designer login → /my-tasks)
- [ ] `apps/web/src/components/sidebar/Sidebar.tsx` (menu mới)
- [ ] `apps/web/src/components/orders/workshopTableConfig.tsx` (cột designerStatus mới)
- [ ] `apps/web/src/components/orders/cells/IconSelectCell.tsx` (Designer role → ẩn assignee picker)
- [ ] `apps/web/src/components/orders/cells/ColorBadgeSelectCell.tsx` (Designer role → ẩn toolResultNote picker)
- [ ] `apps/web/src/components/orders/BulkEditToolbar.tsx` (thêm bulk assign cho Leader)
- [ ] `apps/web/src/pages/workshop-config/CategoryEditor.tsx` (production_error mode thêm errorSource dropdown)
- [ ] `apps/web/src/pages/home/index.tsx` (tab designer mới cho Leader/Admin)
- [ ] `apps/web/src/store/authStore.ts` (helper `isDesignerLeader`, `isSubDesigner`)

### Doc
- [ ] `documents/FunctionDescription/DesignerWorkflow.md` (mới — sync với CLAUDE.md mapping table)
- [ ] Update CLAUDE.md "Feature → Doc mapping" thêm row Designer Workflow

---

## 11. Open questions còn lại (parking lot)

- Chat in-app giữa leader ↔ sub-designer (vd 1 task có lỗi qua lại 3 lần) — defer, dùng tạm `designerRejectedReason` + Telegram.
- Mobile responsive cho Kanban — Phase sau, hiện ưu tiên desktop.
- Tính lương designer theo số task done — defer hoàn toàn, để stats raw cho HR xử lý ngoài.
- Auto re-assign khi sub-designer offline > N ngày — defer, leader manual handle.

---

**Step kế tiếp:** Approve plan → mình bắt đầu Phase 1 (schema + role + permission migration). Phase 1 commit lên main, deploy, không break gì vì code chưa enable transition mới. Phase 2 trở đi từng phase deploy + test.
