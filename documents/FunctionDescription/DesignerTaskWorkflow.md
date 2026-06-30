# Designer Task Workflow — Function Description

> **File FE:**
>  - `apps/web/src/pages/designer/team/{index,TeamMemberDialog}.tsx` — Leader CRUD sub-designer
>  - `apps/web/src/pages/designer/my-tasks/{index,TaskCard,RejectModal,TaskDetailDialog}.tsx` — Sub-designer kanban
>  - `apps/web/src/pages/home/DesignerStatsTab.tsx` — Dashboard tab leader
>  - `apps/web/src/pages/orders/DesignerSummaryPanel.tsx` — KPI panel trên /orders cho leader/admin
>  - `apps/web/src/components/orders/AssignDesignerDialog.tsx` — Bulk assign từ workshop table
>  - `apps/web/src/components/orders/cells/AssigneeSelectCell.tsx` — Picker user trong order table
>  - `apps/web/src/components/orders/cells/{ProductionErrorSelectCell,ProductionErrorOtherDialog,ErrorSourceCell}.tsx` — Error workflow
>  - `apps/web/src/store/designerTeamStore.ts` — Zustand cache designer team
>  - `apps/web/src/services/designer.ts` — API client
>
> **File BE:** `apps/api/src/modules/designer/`
>  - `designer.module.ts`
>  - `designer-migration.{controller,service}.ts` — One-shot migrate legacy Designer → Leader
>  - `designer-team.{controller,service}.ts` — Leader CRUD
>  - `designer-task.{controller,service}.ts` — State machine + my-tasks + bulk transition
>  - `designer-stats.{controller,service}.ts` — Leader dashboard
>
> **Route FE:**
>  - `/designer/team` (Leader/Admin)
>  - `/my-tasks` (Designer sub)
>  - `/dashboard?tab=designer` (Leader/Admin tab)
>
> **API chính:**
>  - `POST /v1/designer/migrate-leader` (one-shot)
>  - `GET/POST/PATCH/DELETE /v1/designer/team` + `/:userId/reset-password`
>  - `POST /v1/orders/:id/designer-transition` (state machine 1 task)
>  - `POST /v1/designer/bulk-transition` (state machine N task)
>  - `GET /v1/designer/my-tasks` + `/my-task-filters` + `/my-stats`
>  - `GET /v1/designer/performance` + `/timeline/:userId`
>  - `GET /v1/orders/designer-breakdown` (KPI matrix per-user trong /orders)
>  - `POST /v1/orders/bulk-assign-designer-preview` + `/bulk-assign-designer`
>  - `POST /v1/orders/:id/set-production-error` (atomic 3 field — bắt buộc khi 'other')
>  - `POST /v1/orders/backfill-designer-status` (Admin one-shot)

---

## 1. Overview

Tách role Designer cũ (1 account dùng chung) thành **DesignerLeader** + N **Designer** (sub). Workflow chính:

```
Leader assign → Sub Designer nhận → làm → hoàn thành
                                 ↘ trả lại (rejected) → leader re-assign
xưởng báo lỗi designer (rework) → sub làm lại → hoàn thành
```

State machine 6 trạng thái:
- `unassigned` (default khi import order)
- `assigned` (leader gán cho user)
- `in-progress` (sub bấm "Nhận làm")
- `done` (sub bấm "Hoàn thành" — auto `toolResultNote='ok'` + `readyForFulfill=true`)
- `rejected` (sub bấm "Trả lại" + reason — cho phép từ **`assigned` HOẶC `in-progress`**, tức đã kéo sang "Đang làm" vẫn trả lại được)
- `rework` (xưởng set productionError có errorSource='designer')

**Identity model:** `Order.assignee = user._id` (string). KHÔNG còn dùng workshop_config (category=assignee đã xoá).

**Per-cycle work tracking:**
- `designerStartedAt` reset mỗi cycle (`start`/`restart`)
- `designerFirstStartedAt` immutable, set lần đầu start
- `designerWorkMs` cumulative ms — `$inc` mỗi `complete` bằng `(now − designerStartedAt)`
- Stats `avgWorkMin` dùng `designerWorkMs` trực tiếp (fallback `completedAt − startedAt` cho legacy)
- Stats `avgResponseMin` dùng `designerFirstStartedAt − designerAssignedAt`

---

## 2. Luồng hoạt động

### 2.1 Setup ban đầu
1. Boot API → `RoleService.onModuleInit()` seed role `DesignerLeader`, sync permissions cho Designer (sub) — bỏ `assignee.edit`, `toolResultNote.edit`.
2. Admin gọi `POST /v1/designer/migrate-leader` (1 lần) → promote 1 user Designer cũ → email `designerleader@onospod.com` + role `DesignerLeader`.
3. Login Leader → `/designer/team` → tạo các sub-designer (chỉ cần fullName + email + password + hireDate + telegramChatId optional). Code/slug đã bỏ — identity = user._id.

### 2.2 Assign task

> **⛔ Điều kiện gán designer** (helper `canAssignDesignerByStatus(status, hasAssignee)` ở `order.service.ts`, áp **cả BE + FE**, cả 3 đường: per-row cell, bulk dialog, bulk-update field):
>
> | designerStatus | Gán được? |
> |---|---|
> | `unassigned` / `assigned` / `rejected` | ✅ (assigned cho người khác → cần ghi đè `reassignOthers`) |
> | `rework` **chưa có ai ôm** (`assignee` rỗng) | ✅ — đơn lỗi xưởng-báo-designer trên đơn unassigned (xem `FulfillmentWorkflow.md §2.3b`) rơi vào nhóm này |
> | `rework` **đang có người ôm** (`assignee` != null) | ❌ skip + thông báo (kể cả ghi đè) — người đang ôm phải tự làm lại |
> | `in-progress` / `done` | ❌ |
>
> Ngoài ra **đơn `toolResultNote === 'ok'`** (`READY_FOR_FULFILL_CODE`, đã soát xong) → KHÔNG cho gán (chỉ chặn khi GÁN, vẫn cho bỏ chọn).

**Single order**: Leader vào `/orders` workshop table → cell "Người thực hiện" (`AssigneeSelectCell`) → pick user từ dropdown load `/designer/team` cache (zustand `designerTeamStore`). `updateField('assignee')` BE:
- **Đơn `toolResultNote='ok'` + đang gán → `BadRequestException`** "Đơn đã 'ok' — không cần gán designer."
- **Đơn `rework` đang có người ôm + đang gán → `ConflictException`** "Đơn cần làm lại đang có người ôm — không gán cho người khác."
- Gán hợp lệ (gồm `rework` chưa ai ôm) → set `designerStatus='assigned'`, `designerAssignedAt=now`, clear reject fields.
- Block 409 nếu `!canAssignDesignerByStatus` (in-progress/done, hoặc rework-held khi clear).
- FE: `AssigneeSelectCell` nhận prop `blockedReason` (set khi `r.toolResultNote==='ok'` ở `workshopTableConfig.tsx`) → cell **disabled + opacity-60 + tooltip** lý do.

**Bulk assign**: Workshop table → tick nhiều row → toolbar **"Gán design"** → `AssignDesignerDialog`:
1. Pre-flight `POST /bulk-assign-designer-preview` trả KPI per status + `alreadyAssigned[]` (CHỈ đơn eligible đang gán người khác → conflict/override; KHÔNG gồm rework-held/blocked) + `blockedCount` (in-progress/done) + **`reworkHeldCount`** (rework đang có người ôm) + **`okCount`** + **`noToolCount`** (chưa soát) + `eligibleCount` + `eligibleWithToolCount`.
2. Dialog banners:
   - `blockedCount>0` → "X đơn đang in-progress/done — sẽ bị skip."
   - **`reworkHeldCount>0`** → "X đơn **cần làm lại đang có người ôm** — không gán cho người khác được, sẽ bị bỏ qua. Chỉ gán được đơn cần làm lại chưa có ai ôm."
   - `okCount>0` → "X đơn đã OK — không gán được… chỉ gán {eligibleCount} còn lại."
   - `noToolCount>0` → "X đơn **chưa soát**. Bạn có chắc muốn gán?".
3. Counts: `eligibleCount` = `canAssignDesignerByStatus` && `!ok` (gồm rework-chưa-ôm + chưa soát) → "Gán tất cả". `eligibleWithToolCount` = subset eligible ĐÃ soát → "Chỉ gán đơn đã soát".
4. **Footer 3 chế độ:**
   - `noToolCount>0` → **2 nút**: "Chỉ gán đơn đã soát ({eligibleWithToolCount})" (`skipUnreviewed=true`) + "Gán tất cả ({eligibleCount})" (`skipUnreviewed=false`). Conflict → tự ghi đè.
   - `noToolCount=0` + conflict → "Ghi đè & Gán".
   - `noToolCount=0` + không conflict → "Gán".
5. `POST /bulk-assign-designer { ids, userId, reassignOthers, skipUnreviewed }` → skip đơn `ok` + (nếu `skipUnreviewed`) đơn chưa soát + **đơn rework đang có người ôm** ("Cần làm lại đang có người ôm — chỉ gán được đơn chưa có ai ôm.") + đơn in-progress/done → report skipped → toast + detail.

### 2.3 Sub Designer xử lý task

Login Designer → auto redirect `/my-tasks` (xem `pages/login/index.tsx`).

**Layout kanban 4 cột** theo thứ tự **Cần làm → Cần làm lại → Đang làm → Đã xong**:
- Cột "Cần làm lại" auto **ẩn** khi rỗng (grid switch `xl:grid-cols-4 ↔ xl:grid-cols-3`)
- Mỗi cột group cards theo `type` (sản phẩm), header collapsible với checkbox-all + indeterminate + chevron toggle. **Trong mỗi nhóm sản phẩm sắp xếp theo size ưu tiên XS→S→M→L→XL→2XL→3XL→4XL→5XL** (size giống nhau đứng cạnh nhau) qua `sizeRank()` + `SIZE_ORDER`/`SIZE_ALIAS` trong `groupByType` (sort ổn định, cùng size giữ thứ tự ngày từ BE; size lạ/không có dồn cuối).
- Mỗi card: thumbnail (click → ImagePreviewDialog), productionId (click → TaskDetailDialog) + **nút copy (`CopyButton`, copy xong hiện dấu tích)**, size/color. **Note kết quả Tool (`toolResultNote`) hiển thị nhỏ ở góc trên cùng bên phải card** (truncate + tooltip) — **resolve label + màu từ `workshop_config` (category `ToolResultNote`) qua `useWorkshopConfigStore`, đồng bộ với `ColorBadgeSelectCell` ở bảng đơn** (badge nền màu config + chữ trắng, hiện `name` thay vì raw code; page gọi `load()` 1 lần để nạp config). Hàng mốc thời gian **dàn ngang full-width dưới mockup** (tiết kiệm khoảng trống): "SX" (`inProductionAt`) + timestamp theo state + "Cập nhật" (`updatedAt`) — mỗi mốc có tooltip (`Hint`) giải thích. (`DesignerTaskCardZod` có `orderAt`/`inProductionAt`/`updatedAt`/`toolResultNote`; mapper `toCard` map từ order doc.)
- Cards indent `pl-5 border-l-2` so với group header để visualize hierarchy
- Filter bar: search + 6 SelectFilter (Sản phẩm/Loại vải/Máy/Kết quả Tool/**Note kq Tool** = `toolResultNote`/**Khách hàng** = `userSku`) cross-faceted từ `/my-task-filters`. **Loại vải/Máy/Kết quả Tool/Note kq Tool hiển thị `name` (resolve code→name qua `useWorkshopConfigStore.byCategory`, helper `labelOpts`), KHÔNG hiện raw code** — `value` gửi BE vẫn là code. Backend: `toolResultNote` thêm vào `buildMyTaskFilter` ($in) + facet KEYS trong `getMyTaskFilters`; shared `GetMyTasksZod.toolResultNote` + `GetMyTaskFiltersResZod.data.toolResultNote`.
- KPI 6 ô: Cần làm · Cần làm lại · Đang làm · Đã xong · **Đã trả lại** · Phản hồi/Làm
- Period switcher today/7d/30d ảnh hưởng cột "Đã xong" + completed stats

**Multi-select**:
- Checkbox per card (góc trên-trái, `accent-indigo-500`, không nuốt drag nhờ `onPointerDown stopPropagation` + PointerSensor `distance: 6`)
- Shift+click trong cùng cột → range select (`lastClickedRef + orderedIdsPerColumn`)
- Card được tick: `ring-1 ring-indigo-400/70 bg-indigo-50/40`

**Drag & drop** (dnd-kit):
- `DragOverlay` render card "fly" theo cursor (rotate-1 + shadow-2xl), card gốc opacity-30
- Drop sai → toast warning + revert. Rules: assigned→inProgress (start), inProgress→done (complete), rework→inProgress (restart)
- Mỗi drop fire `POST /orders/:id/designer-transition { action }` đơn lẻ, optimistic UI

**Bulk action toolbar** sticky bottom khi `selected.size > 0`:
- Detect cột của items đã chọn:
  - 1 cột → button theo `COL_META[col].bulk`: Cần làm (Nhận/Trả) · Cần làm lại (Nhận lại) · Đang làm (Hoàn thành) · Đã xong (—)
  - Mixed → text "Đơn ở nhiều cột" + clear button only
- Reject mở `RejectModal` với label "N đơn được chọn" → `POST /designer/bulk-transition { ids, action: 'reject', reason }` → skip per-row + report

**Rejected drawer** dưới kanban: list collapsible đơn đã trả với productionId clickable + reason.

### 2.4 Xưởng báo lỗi → rework cycle
1. Fulfillment vào `/orders` workshop → cell "Lỗi xưởng" (`ProductionErrorSelectCell`) pick code:
   - Code thường (vd `wrong-design`): `updateField('productionError', code)` → hook BE auto-fill `productionErrorSource` từ `workshop_config.errorSource`, set `toolResultNote='error'`, `$inc productionErrorCount`. Nếu source=designer + status=done → auto `designerStatus='rework'` + `$inc designerReworkCount`. **Nếu đơn đang trong pipeline fulfillment** (`currentFulfillmentStage` set) → đồng thời mirror rework-back về designer (reporter stage→waiting + push `fulfillmentTimeline` rework-back) để worker thấy đơn ở tab "Đang chờ quay lại" rồi "Cần làm lại" sau khi designer xong — xem `FulfillmentWorkflow.md` §2.3b.
   - Code `'other'`: mở `ProductionErrorOtherDialog` bắt buộc pick source + nhập note → `POST /orders/:id/set-production-error` atomic (BE validate 400 nếu thiếu)
2. Designer thấy đơn trong cột "Cần làm lại" với badge ×N + productionErrorNote
3. Designer drag → "Đang làm" (action=`restart` — reset `designerStartedAt`, giữ `designerFirstStartedAt` + `designerWorkMs` cumulative)
4. Designer drag → "Đã xong" (action=`complete` — `$inc designerWorkMs += (now − startedAt)`, set `toolResultNote='ok'`, `readyForFulfill=true`). Counter `productionErrorCount` không reset
5. Nếu xưởng báo lỗi tiếp lần 2+: cell `toolResultNote` hiển thị **"Lỗi ×N"** (rose badge) khi `productionErrorCount >= 2` + `toolResultNote='error'`

### 2.5 Leader xem stats

**Dashboard tab Designer** (`?tab=designer`): xem `Dashboard.md` mục tab Designer.

**Order list KPI panel** (`DesignerSummaryPanel` trên `/orders` cho Admin/Manager/Leader):
- KPI 6 button-card (Chưa gán/Cần làm/Cần làm lại/Đang làm/Đã xong/Đã trả) — click → set filter list
- Bảng matrix per-designer (collapsible, sort total desc, "Chưa gán" lên đầu) — click cell → set `assignee + designerStatus`
- Toggle "Xem theo filter/Xem tổng" swap scoped ↔ overall counts
- Data từ `GET /v1/orders/designer-breakdown` (cùng filter shape với list)

---

## 3. API / Schema

### 3.1 OrderEntity fields (Designer-related)
```ts
designerStatus: DesignerStatus   // enum 6 values, default unassigned, indexed
designerAssignedAt?: Date
designerStartedAt?: Date          // per-cycle, reset mỗi start/restart
designerFirstStartedAt?: Date     // immutable, set lần đầu start
designerCompletedAt?: Date
designerRejectedAt?: Date
designerReworkAt?: Date
designerRejectedReason?: string
designerReworkCount: number       // default 0, $inc khi xưởng báo lỗi designer
designerWorkMs: number            // default 0, cumulative ms, $inc khi complete

productionError?: string          // workshop_config code
productionErrorNote?: string
productionErrorSource?: 'designer' | 'factory'   // indexed, per-order
productionErrorCount: number      // default 0, $inc mỗi lần xưởng set productionError
```

### 3.2 UserEntity fields (Designer/Fulfillment-related)
```ts
telegramChatId?: string           // notification phase sau
hireDate?: Date                   // hiển thị /designer/team
factoryId?: string                // ref FactoryEntity, REQUIRED khi role=Fulfillment (BE enforce)
// `assigneeCode` đã XOÁ — identity model dùng user._id
```

### 3.3 Endpoint chính

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/v1/designer/migrate-leader` | Admin | Promote 1 user Designer cũ → Leader (idempotent) |
| GET  | `/v1/designer/team` | Admin/Manager/Leader | List sub-designer + active/completed count |
| POST | `/v1/designer/team` | Admin/Leader | Tạo sub-designer (fullName, email, password, hireDate?, telegramChatId?) |
| PATCH | `/v1/designer/team/:userId` | Admin/Leader | Update info, block status change/disable nếu còn task active |
| DELETE | `/v1/designer/team/:userId` | Admin/Leader | Soft delete, block nếu còn task active |
| POST | `/v1/designer/team/:userId/reset-password` | Admin/Leader | Force password change next login |
| POST | `/v1/orders/:id/designer-transition` | Designer/Leader/Admin | Body `{ action, reason? }`. State machine race-safe `findOneAndUpdate({ designerStatus: expected })`. Sub-designer chỉ transition task `assignee=user._id` (owner check). Override roles (Admin/Manager/Leader) bypass |
| POST | `/v1/designer/bulk-transition` | Same | Bulk N task, per-row state machine, skip + report |
| GET | `/v1/designer/my-tasks` | Designer/Leader/Admin | Kanban 4 cột + rejected drawer. Filter (type, fabricType, machineNumber, toolResult, search); `from`/`to` lọc **cả 4 cột** theo `inProductionAt` (mặc định today) |
| GET | `/v1/designer/my-task-filters` | Same | Faceted filter options (5 facets: type/fabricType/machineNumber/toolResult/userSku) cross-narrow + lọc `inProductionAt` |
| GET | `/v1/designer/my-stats?period=today\|7d\|30d\|custom` | Same | KPI cá nhân (counts + avgResponseMin + avgWorkMin + errorRate) |
| GET | `/v1/designer/performance?from&to&userId?` | Admin/Manager/Leader | Leaderboard per-user trong period (incl. totalRejected/totalRework từ OrderLog) |
| GET | `/v1/designer/timeline/:userId?from&to` | Same | Per-day buckets 4 series (assigned/started/completed/rework) cho line chart |
| GET | `/v1/orders/error-stats?from&to` | Same | Pie split errorSource (designer/factory/unknown) + breakdown per code |
| GET | `/v1/orders/designer-breakdown` | Admin/Manager/Leader | KPI scoped/overall + matrix per-designer (cho /orders panel) |
| POST | `/v1/orders/bulk-assign-designer-preview` | Same | Pre-flight stats |
| POST | `/v1/orders/bulk-assign-designer` | Same | Body `{ ids, userId, reassignOthers }`, skip + report |
| POST | `/v1/orders/:id/set-production-error` | Admin/Manager/Designer/Fulfillment/Leader | Atomic set 3 field, validate code='other' phải có source + note |
| POST | `/v1/orders/backfill-designer-status` | Admin | Suy ra designerStatus + timestamps cho order legacy từ assignee + toolResultNote + OrderLog (idempotent) |

### 3.4 State machine table

| From | Action | To | Side effects |
|---|---|---|---|
| `unassigned` → updateField assignee | (auto) | `assigned` | designerAssignedAt=now, clear reject fields |
| `assigned`/`rejected` → updateField assignee | (auto) | `assigned` | reassign OK; reset reject fields |
| `in-progress`/`done`/`rework` → updateField assignee | (block) | — | 409 ConflictException |
| `assigned` | `start` | `in-progress` | designerStartedAt=now; if isFirstStart → designerFirstStartedAt=now |
| `rework` | `restart` | `in-progress` | designerStartedAt=now (reset per-cycle) |
| `in-progress` | `complete` | `done` | designerCompletedAt=now; toolResultNote='ok'; readyForFulfill=true; `$inc designerWorkMs += (now − startedAt)` |
| `assigned` **hoặc** `in-progress` | `reject` | `rejected` | designerRejectedAt=now; designerRejectedReason=reason. FE: nút "Trả" hiện ở cả cột Cần làm + Đang làm; bulk reject cho cột Đang làm |
| `done`/`unassigned`/`rejected` → updateField productionError (errorSource=designer) | (auto) | `rework` | designerReworkAt=now; `$inc designerReworkCount`. Đồng thời rework-back về designer + tạo/giữ stage fulfillment → tab "Đang chờ quay lại" (xem `FulfillmentWorkflow.md` §5.4b). Skip khi `rework`/`in-progress`/`assigned` (gate `canReworkBackToDesigner`) |
| `done`/`unassigned`/`rejected` → updateField productionErrorSource → 'designer' | (auto) | `rework` | Same as above |
| `done`/`unassigned`/`rejected` → setProductionError (source=designer, scan/dialog) | (auto) | `rework` | Same as above |

### 3.5 Role/permission catalog (`packages/shared/constants/permission-catalog.ts`)

**3 page perms**: `page.designer_team`, `page.my_tasks`, `page.designer_stats`
**4 task perms**: `designer.team.manage`, `designer.task.assign`, `designer.task.transition`, `designer.task.override`
**1 field**: `order.field.designerStatus.view`

**Default mapping**:
- `DesignerLeader`: admin-like với order + tất cả designer/team perms
- `Designer` (sub): bỏ `assignee.edit`, `toolResultNote.edit` (BE auto derive); có `designer.task.transition` + `page.my_tasks`

---

## 4. UI Components

### 4.1 `/designer/team` (Leader)
- 3 stat card: Đang làm · Tạm tắt · Task active toàn team
- Bảng: Họ tên · Email · Đang làm (badge) · Đã xong · Vào làm · Trạng thái (Switch) · Actions (reset pwd / edit / xoá — Trash disabled khi activeTaskCount > 0)
- `TeamMemberDialog` (mode create/edit):
  - Field: fullName, email, password (chỉ create — có random gen + copy + KeyRound hint), hireDate (date), telegramChatId (optional)
  - Validate email unique BE; block disable/delete khi user còn task active
  - Sub-designer dropdown trong các dialog assign/bulk dùng cùng `designerTeamStore` cache

### 4.2 `/my-tasks` (Sub-designer)
Xem 2.3 chi tiết.

**Bộ lọc ngày:** chỉ dùng `<DateRangePicker>` (đã bỏ 3 preset nút Hôm nay/7 ngày/30 ngày). State `dateFrom`/`dateTo` **mặc định 7 ngày gần nhất**, **lưu vào URL params `from`/`to`** (F5 giữ lựa chọn — `useSearchParams`, đọc khi mount + sync khi đổi). Gửi `from`/`to` vào `myTasks` + `myTaskFilters` + `myStats({period:'custom', from, to})`.

**Filter bar lưu URL params:** ngoài `from`/`to`, toàn bộ filter bar (`type`/`fabricType`/`machineNumber`/`toolResult`/`toolResultNote`/`userSku` + `search`) cũng **đọc từ URL khi mount + sync vào URL khi đổi** (cùng 1 `useEffect` sync, `search` sync theo `debouncedSearch`) → F5 giữ nguyên cả bộ lọc. `fetchTasks`/`fetchFilters` gửi `...filters` xuống cả 2 endpoint nên các cột bên dưới + count facet đều lọc theo. **Hai endpoint dùng chung `buildMyTaskFilter` + cùng range `inProductionAt`** ⇒ kết quả `/my-tasks` và `/my-task-filters` luôn đồng bộ.

**Chống race khi đổi ngày/filter liên tiếp (seq guard):** `fetchTasks`/`fetchFilters` mỗi lần gọi tăng `tasksSeqRef`/`filtersSeqRef`; khi response về chỉ `setState` nếu `seq` còn là mới nhất, ngược lại bỏ qua. Tránh response cũ về muộn (mạng không đảm bảo thứ tự) ghi đè data mới → trước đây gây "đổi lại ngày thì cột hiển thị loạn". Latency local ~0 nên hiếm lộ; server latency cao lộ rõ.

**Lọc theo `inProductionAt`:** áp `inProductionAt ∈ [from,to]` vào:
- `getMyTasks` (`baseFilter`) → **cả 4 cột kanban + rejected drawer** (header mỗi cột đếm đúng theo filter).
- `getMyTaskFilters` (facet aggregation) → **số đếm dropdown Sản phẩm/Vải/Máy/Kết quả Tool/Khách hàng** cũng đúng theo khoảng ngày.
- `toCard` trả `inProductionAt` (+ `orderAt`/`updatedAt`) → card hiển thị mốc "SX".

⚠️ Đơn open vào sản xuất ngoài khoảng sẽ bị ẩn — chọn khoảng rộng để thấy backlog cũ. **KPI giữ nguyên** (status counts = snapshot; `completedInPeriod` theo `designerCompletedAt`) → có thể lệch nhẹ với cột "Đã xong".

Components con:
- `TaskCard` — drag handle, productionId button (mở `TaskDetailDialog`), mockup thumbnail (mở preview), timestamp + reworkCount badge
- `TaskDetailDialog` — header status badge + grid info (9 field) + mockup + designs grid 4 cột + timeline (Khách lên đơn `orderAt` → **Vào sản xuất `inProductionAt`** → Được gán → Bắt đầu → Hoàn thành → Cần làm lại/Đã trả lại) + banner productionError/rejectedReason. Fetch `GET /v1/orders/:id`
- `RejectModal` — textarea reason max 500, dùng chung cho single reject + bulk reject

### 4.3 Dashboard tab Designer (Leader)
Xem `Dashboard.md` mục tab D.

### 4.4 `DesignerSummaryPanel` (trên /orders)
Trên cùng tab List Order + Bảng Workshop khi user có quyền `page.designer_stats`/`designer.task.assign`:
- 6 KPI button-card scoped theo filter list. Toggle xem "tổng" (overall, ignore filter)
- Bảng matrix per-designer collapsible — click cell → set filter list (`handleSummaryCellClick`)
- Auto refetch khi filter list đổi (cùng query string)

### 4.5 `AssignDesignerDialog` (bulk assign từ workshop)
Xem 2.2.

### 4.6 `AssigneeSelectCell` (cell "Người thực hiện")
- Load designer team từ `designerTeamStore` (lazy fetch 1 lần)
- Value = user._id, display = fullName (fallback `#{slice(-4)}` nếu user bị xoá)
- Dùng `SelectPopover` generic-ized với `SelectOption = { _id, code, name, color?, icon?, errorSource? }`
- Prop `blockedReason?: string` — khi set (vd đơn `toolResultNote='ok'` qua `workshopTableConfig.tsx`) → cell disabled + opacity-60 + tooltip lý do (xem §2.2 chặn gán đơn 'ok')

### 4.7 `ProductionErrorSelectCell` + `ProductionErrorOtherDialog`
- Popover option list có badge "DES" (violet) / "XƯỞNG" (sky) cho code có errorSource, "CẦN CHI TIẾT" (rose) cho code='other'
- Pick code thường → updateField, BE auto-fill source
- Pick 'other' → mở dialog yêu cầu pick source + note → atomic `setProductionError` endpoint
- Dialog pre-fill source/note cũ nếu đã từng set

### 4.8 `ErrorSourceCell` (cell "Loại lỗi" mới)
Picker designer/factory cho `order.productionErrorSource`. User override được khi cần.

---

## 5. Backend logic

### 5.1 Owner check + override
`DesignerTaskService.transition()`:
- Resolve `roleName`. Admin/Manager/Leader = override, bypass owner check
- Sub-designer phải có `order.assignee === String(user._id)`
- Throw `ForbiddenException` nếu fail

### 5.2 Race safety
- `findOneAndUpdate({ _id, designerStatus: expectedCurrent }, patch)` — nếu state đã đổi → match=null → `ConflictException` (FE refetch + retry)
- Bulk variant áp pattern same cho từng row

### 5.3 Auto-fill `productionErrorSource`
`order.service.updateField('productionError', code)`:
1. Lookup `workshop_config.errorSource` cho code
2. Nếu config có flag → set `order.productionErrorSource`
3. Nếu code='other' → để user pick qua dialog (atomic endpoint)
4. Nếu source='designer' AND status=done → set rework + `$inc designerReworkCount`
5. Luôn set `toolResultNote='error'` + `$inc productionErrorCount` (khi non-null)
6. Giữ `readyForFulfill` không đổi (mềm hoá invariant để fulfillment vẫn thấy đơn lỗi trong list mặc định)

### 5.4 Per-cycle work time
`resolveTransition(current, action, reason, { isFirstStart, designerStartedAt })`:
- `start` (assigned→in-progress): set `designerStartedAt=now`. Nếu `isFirstStart` → set `designerFirstStartedAt=now`
- `restart` (rework→in-progress): set `designerStartedAt=now` (reset per-cycle)
- `complete` (in-progress→done): `designerCompletedAt=now` + `$inc designerWorkMs += (now − startedAt)`

### 5.5 Visibility filter
`OrderService.buildVisibilityFilter(roleName, dto, assigneeUserId, fulfillmentFactoryId)`:
- `Designer` (sub) → `filter.assignee = user._id` (no date window)
- `Fulfillment` → `filter.readyForFulfill=true` + `$or: [{factoryId: uid}, {originalFactoryId: uid}]` (cả 2 xưởng thấy đơn transfer)
- Khác → no extra constraint (optional date range)

### 5.6 Bulk transition logic
`bulkTransition(user, ids, action, reason, ctx)`:
- Fetch tất cả docs với selected fields (productionId, assignee, designerStatus, designerStartedAt, designerFirstStartedAt)
- Loop per doc, owner check, `resolveTransition`, `findOneAndUpdate` race-safe
- Skip + report: owner fail, race conflict, action invalid → return `{matched, modified, skipped[{orderId, productionId, reason}]}`
- Audit log mỗi transition + side-effect

### 5.7 Stats aggregation

**`getMyStats`** (sub-designer):
- snapshot count theo status (current) + completed count trong period
- avgResponseMin: trung bình `designerFirstStartedAt − designerAssignedAt` (fallback `designerStartedAt`)
- avgWorkMin: trung bình `designerWorkMs` (fallback `(completedAt − startedAt)` cho legacy data)

**`getPerformance`** (leader leaderboard):
- snapshot count per (assignee, status) → 4 cột (assignedCount, inProgressCount, reworkCount, rejectedCount)
- completed in period với timestamps + workMs cumulative
- Auto-include sub-designer chưa có task (row count 0)
- `totalRejected` + `totalRework`: aggregate `OrderLog { field='designerStatus', after in [rejected,rework], createdAt in period } → $lookup orders → group by assignee + after`

**`getErrorStats`**:
- Group `(productionError, productionErrorSource)` per-order trong period (theo `updatedAt`)
- bySource: designer/factory/unknown (đếm theo field per-order, KHÔNG còn lookup config)
- byCode aggregate sum across sources

**`getDesignerBreakdown`** (panel /orders):
- scoped: KPI count theo filter list hiện tại (`buildOrderListFilter`)
- overall: ignore filter (chỉ visibility/date)
- perDesigner matrix (assignee × status), auto-include designer + pseudo row `__unassigned__`

### 5.8 OrderLog audit
Mỗi transition ghi entry `{ field: 'designerStatus', before, after, action: 'update' }` + side-effect entries (vd `toolResultNote: 'ok'` khi complete). Bulk transition gọi `writeMany`. Backfill design status không ghi log (silent).

---

## 6. Performance notes

- **Designer team list query**: filter `{ roleId: designerRoleId }` + 2 aggregate count tasks (active/completed). 8 designer × ~few hundred tasks → < 50ms.
- **My tasks query**: 5 song song find with sort, mỗi cột scope user._id + status. Mỗi user thường < 100 task → < 30ms.
- **Faceted my-task-filters**: 5 aggregate independent (type/fabricType/machineNumber/toolResult/userSku — mỗi facet exclude khỏi filter để cross-narrow count đúng). Run parallel ~50ms.
- **Performance leaderboard**: 3 aggregate (status snapshot + completed docs + OrderLog totals) parallel + user/role lookups. 1000 order × 30d → < 200ms.
- **Auto-rework hook**: thêm 1 workshop_config findOne per `updateField('productionError')`. Cache miss < 10ms (collection nhỏ).
- **Race-safe transitions**: `findOneAndUpdate filter` cost 1 query (no read-then-write). Concurrent users hiếm trên 1 task — 409 happen edge case.
- **No pagination cho /my-tasks**: assumption sub-designer < 200 active task. Nếu vượt → cần thêm pagination.

---

## 7. Permissions

| Role | Page access | Action |
|---|---|---|
| **SuperAdmin/Admin** | All | All transitions + assign + override |
| **Manager** | All | Same as Admin |
| **DesignerLeader** | `/designer/team`, `/my-tasks`, `/dashboard?tab=designer`, `/orders`, `/workshop-config` | CRUD team, assign, override transitions, transfer orders, edit toolResultNote/assignee |
| **Designer** (sub) | `/dashboard`, `/orders`, `/my-tasks` | Transition own task only, KHÔNG edit assignee/toolResultNote (BE auto derive) |
| **Fulfillment** | `/dashboard`, `/orders` (scoped factory) | Edit printStatus*, productionError*, machineNumber. Transfer orders. KHÔNG transition designer task. Scope theo `user.factoryId` |
| **Support** | `/dashboard`, `/orders` | View only most fields, không edit designer-related |

Field-level perms (mới):
- `order.field.designerStatus.view` — Admin/Manager/Designer/Leader/Fulfillment
- `order.field.productionErrorSource.view/.edit` — Admin/Manager/Leader/Fulfillment

---

## 8. Migration history (one-shot endpoints)

| Endpoint | Khi nào chạy | Tác dụng |
|---|---|---|
| `POST /v1/designer/migrate-leader` | Sau khi deploy Phase 1 | Promote user Designer cũ duy nhất → Leader, đổi email |
| `POST /v1/orders/backfill-designer-status` | Sau khi deploy Phase 3 | Suy ra `designerStatus` + timestamps cho order legacy |

**Auto-cleanup khi boot:**
- `RoleService.onModuleInit()` sync role catalog (auto-add DesignerLeader, rút quyền cũ của Designer sub)
- `WorkshopConfigService.onModuleInit()` `deleteMany({ category: 'assignee' })` 1 lần (legacy category đã bỏ)
- Cùng onModuleInit backfill `errorSource` cho production_error rows chưa có
