# Fulfillment 7-Stage Workflow — Function Description

> **File FE:** `apps/web/src/pages/fulfillment/my-tasks/`, `apps/web/src/services/fulfillment.ts`, `apps/web/src/pages/users/index.tsx` (form chọn `fulfillmentStage`)
> **File BE:** `apps/api/src/modules/fulfillment/` (full module), hook ở `apps/api/src/modules/designer/designer-task.service.ts` → `transition()`
> **Route FE:** `/fulfillment/my-tasks`
> **API:** `POST /v1/orders/:id/fulfillment-transition`, `GET /v1/fulfillment/my-tasks`

---

## 1. Overview

Sau khi Designer mark task `done` (`designerStatus === 'done'` + `readyForFulfill === true`), đơn được auto-route qua **7 stage tuần tự** trong phạm vi factory:

```
Designer done → In → Ép → QC sau ép → QC phân hàng kiểm → May nhận vào → May xuất ra → Đóng hàng → completed
                ↑    ↑       ↑              ↑                  ↑              ↑            ↑
              mỗi stage có DUY NHẤT 1 user phụ trách per factory
              (BE enforce unique constraint (factoryId, fulfillmentStage))
```

| # | Label UI | Code enum | Vai trò |
|---|---|---|---|
| 1 | In | `print` | In tem/mockup |
| 2 | Ép | `press` | Ép nhiệt lên vải |
| 3 | QC sau ép | `qc-post-press` | Kiểm hậu ép (chất lượng in) |
| 4 | QC phân hàng kiểm | `qc-sorting` | Phân loại + kiểm hàng tổng |
| 5 | May nhận vào | `sew-in` | Tiếp nhận hàng vào tổ may |
| 6 | May xuất ra | `sew-out` | Xuất hàng đã may xong khỏi tổ |
| 7 | Đóng hàng | `pack` | Đóng gói + chuẩn bị ship |

- 2 xưởng × 7 stage = **14 user Fulfillment** trong hệ thống.
- Đơn đến stage X → tự nhảy vào "Task của tôi" của user X tại factory đó.
- Mỗi stage có 4 trạng thái: `waiting`, `in-progress`, `done`, `rework`.
- Khi báo lỗi, có thể đẩy về **Designer** hoặc **bất kỳ stage nào trước** đó.

**Refactor history (5 → 7 stage):** QC cũ tách thành `qc-post-press` + `qc-sorting`; May cũ tách thành `sew-in` + `sew-out`. `Pack` đổi label "Đóng gói" → "Đóng hàng" (code không đổi). **Không migrate đơn cũ hoặc user cũ** — dữ liệu cũ có `currentFulfillmentStage='qc'`/`'sew'` sẽ trở thành arbitrary string (không nằm trong enum mới) và **mất visibility** trong My Tasks. Admin cần dọn dẹp / xoá hoặc bỏ qua. Áp dụng cho đơn mới từ thời điểm deploy refactor.

---

## 2. Luồng hoạt động

### 2.1 Vào fulfillment lần đầu

Có **2 entry point** tương đương — đều dẫn tới việc set `currentFulfillmentStage='print'` + `fulfillmentStages.print = { status: 'waiting', reworkCount: 0, workMs: 0 }` → user In của factory tự thấy đơn trong tab "Đang chờ".

#### Entry A — Designer hoàn thành task (mặc định)

1. Designer click "Hoàn thành" (`designer-transition action=complete`).
2. Hook trong `DesignerTaskService.transition()` (~line 83): nếu `!order.currentFulfillmentStage` → set entry patch.
3. Đồng thời `toolResultNote='ok'` + `readyForFulfill=true` được set (side effect).

#### Entry B — Manual set `toolResultNote='ok'` (admin/leader bypass)

Khi admin/leader/support trực tiếp đổi cell **"Note kq Tool 1"** thành `'ok'` (không qua designer state machine) — các path sau cùng kích hoạt fulfillment:

| Path | File | Hành vi |
|---|---|---|
| `PATCH /v1/orders/:id` field=`toolResultNote` | `OrderService.updateField()` (`order.service.ts` ~line 2347) | Set `readyForFulfill=true` + `productionFirstErrorAt=null`. Nếu `!before.currentFulfillmentStage` → spread `buildFulfillmentEntrySet()` vào patch. |
| `PATCH /v1/orders/bulk-update` field=`toolResultNote` | `OrderService.bulkUpdateField()` (`order.service.ts` ~line 2572) | Sau update chính, chạy thêm 1 `updateMany` cho subset `currentFulfillmentStage` null/undefined. |
| Import xlsx "soát" (`Note_kq_Tool` cell = `ok`) | `OrderService.importRework()` (`order.service.ts` ~line 2929) | Per-row check `!order.currentFulfillmentStage` → merge entry patch vào `$set`. |

**Helper:** `buildFulfillmentEntrySet()` constant ở đầu file (`order.service.ts:155`) — đảm bảo 3 path dùng cùng shape. Đồng bộ với Entry A.

**Đặc biệt:** Entry B chỉ kích hoạt khi `currentFulfillmentStage` đang null/undefined để **tránh ghi đè state đang chạy**. Nếu đơn đã ở stage Press/QC/... mà admin sửa cell ok bằng tay → chỉ flip `readyForFulfill`, không reset state fulfillment.

### 2.2 Tiến qua từng stage

User Print mở `/fulfillment/my-tasks`:

- **Đang chờ** → bấm "Bắt đầu" → `POST /orders/:id/fulfillment-transition { stage: 'print', action: 'start' }`
  - Stage status: `waiting` → `in-progress`, `startedAt = now`, `firstStartedAt` set (lần đầu).
- **Đang làm** → bấm "Hoàn thành" → `action: 'complete'`
  - Stage status: `in-progress` → `done`, `completedAt = now`.
  - `workMs += (now - startedAt)`.
  - **Auto-advance**: `currentFulfillmentStage = 'press'`, `fulfillmentStages.press.status = 'waiting'`.
  - User Press tự thấy đơn.

Tiếp tục Press → QCPostPress → QCSorting → SewIn → SewOut → Pack. Khi Pack `complete`:
- `currentFulfillmentStage = null`
- `fulfillmentCompletedAt = now`
- Đơn hoàn thành toàn bộ workflow.

### 2.3 Báo lỗi (rework-back)

Trong tab "Đang làm", bấm "Báo lỗi" mở dialog:

- Chọn target: **Designer** hoặc **1 stage trước đó** (chip selectable).
- Nhập lý do (bắt buộc, max 500 ký tự).

`POST /orders/:id/fulfillment-transition { stage: <mine>, action: 'rework-back', target, reason }`:

| Target | Effect |
|---|---|
| `'designer'` | `designerStatus = 'rework'`, `productionErrorSource = 'designer'`, `productionErrorNote = reason`. Reporter stage giữ status=`waiting` (workMs cộng dồn), assignee giữ nguyên. Đơn rời khỏi flow tạm thời cho đến khi Designer hoàn thành lại. |
| `<previous stage X>` | `currentFulfillmentStage = X`. Target stage X + tất cả stage giữa X và reporter → `status='rework'`, `reworkCount++`, `reworkAt=now`, `reworkFromStage = reporter`. Reporter → `status='waiting'`. |

**Ví dụ:** May xuất ra (`sew-out`) báo lỗi đẩy về In (`print`):
- `currentFulfillmentStage` chuyển từ `sew-out` → `print`.
- `fulfillmentStages.print.status: done → rework` (reworkCount++).
- `fulfillmentStages.press.status: done → rework` (intermediate).
- `fulfillmentStages['qc-post-press'].status: done → rework` (intermediate).
- `fulfillmentStages['qc-sorting'].status: done → rework` (intermediate).
- `fulfillmentStages['sew-in'].status: done → rework` (intermediate).
- `fulfillmentStages['sew-out'].status: in-progress → waiting` (chờ đơn quay lại).
- User Print thấy đơn trong tab "Làm lại" → bấm "Bắt đầu" → in-progress.
- Print xong → Press auto-active → ... → SewOut auto-active sau khi SewIn complete.
- User SewOut mở tab "Đợi quay lại" → thấy đơn này với badge "Đang ở: <stage hiện tại>" trong suốt quá trình các stage trước chạy lại.
- Khi SewOut nhận lại → tab "Đang chờ" → bấm "Bắt đầu" lần 2 (workMs cộng dồn, reworkCount của SewOut = 1).

### 2.4 Đơn bị hủy

Nếu `cancelledAt` được set (từ flow Import file soát), `BadRequestException` khi transition. My Tasks tự filter `cancelledAt: null`.

---

## 3. API / Schema

### 3.1 Endpoints

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/v1/orders/:id/fulfillment-transition` | Trigger state machine. Body: `{ stage, action, target?, reason? }`. |
| `GET`  | `/v1/fulfillment/my-tasks` | List 4-tab cho worker hiện tại. Query: `tab=waiting|in-progress|rework|watching`, `page`, `size`. Stage + factoryId tự suy từ user (Manager có thể override). |

### 3.2 OrderEntity — fields mới

```ts
// apps/api/src/modules/order/order.entity.ts
type FulfillmentStage =
  | 'print' | 'press'
  | 'qc-post-press' | 'qc-sorting'
  | 'sew-in' | 'sew-out'
  | 'pack';

currentFulfillmentStage?: FulfillmentStage;  // null khi chưa vào hoặc xong
fulfillmentCompletedAt?: Date;  // set khi pack.complete
fulfillmentStages?: {
  print?: StageState;
  press?: StageState;
  'qc-post-press'?: StageState;
  'qc-sorting'?: StageState;
  'sew-in'?: StageState;
  'sew-out'?: StageState;
  pack?: StageState;
};
fulfillmentTimeline: TimelineEntry[];  // append-only history

type StageState = {
  status: 'waiting' | 'in-progress' | 'done' | 'rework';
  assignee?: string;          // = user._id
  assignedAt?: Date;
  waitingAt?: Date;           // mốc "nhận task" (vào waiting). Reset mỗi cycle.
  startedAt?: Date;           // reset mỗi cycle
  firstStartedAt?: Date;      // immutable, set lần đầu
  completedAt?: Date;
  reworkAt?: Date;
  reworkCount: number;
  reworkReason?: string;
  reworkFromStage?: FulfillmentStage;
  workMs: number;             // cumulative
};

type TimelineEntry = {
  stage: FulfillmentStage;
  action: 'start' | 'complete' | 'rework-back';
  fromStatus: StageStatus;
  toStatus: StageStatus;
  byUserId: string;
  byUserName?: string;
  at: Date;
  reworkTarget?: 'designer' | FulfillmentStage;
  reason?: string;
};
```

### 3.3 UserEntity — field mới

```ts
// apps/api/src/modules/user/user.entity.ts
fulfillmentStage?: FulfillmentStage;  // 7 giá trị — xem §3.2

// Partial unique index:
UserSchema.index(
  { factoryId: 1, fulfillmentStage: 1 },
  {
    unique: true,
    partialFilterExpression: {
      fulfillmentStage: { $exists: true, $type: 'string' },
      factoryId: { $exists: true, $type: 'string' },
    },
    name: 'unique_factory_fulfillment_stage',
  },
);
```

BE service convert E11000 → `BadRequestException` thân thiện.

### 3.4 Permissions mới

```
page.fulfillment_my_tasks         — Truy cập trang task của tôi (worker)
page.fulfillment_team             — Truy cập trang quản lý team (manager)
page.fulfillment_stats            — Truy cập trang stats (manager)
fulfillment.task.transition       — Transition stage của task bản thân
fulfillment.task.override         — Override transition (manager/admin)
fulfillment.team.manage           — Quản lý worker (factory × stage)
```

Default preset:
- `Fulfillment`: thêm `page.fulfillment_my_tasks` + `fulfillment.task.transition`.
- `Manager`, `SupportManager`, `Admin`, `SuperAdmin`: auto inherit (ALL_PERMISSION_CODES).

---

## 4. UI Components

### 4.1 `/fulfillment/my-tasks` (`pages/fulfillment/my-tasks/index.tsx`)

**Layout: kanban 4 cột** — đồng bộ pixel-by-pixel với `pages/designer/my-tasks` để hai role có trải nghiệm visual giống nhau (header / KPI / hint / column / card shape).

- **Header**: icon avatar bg-indigo + "Task của tôi — {stage label}" + dòng phụ "Xưởng: {factoryId}" + nút Làm mới (ghost icon spinner khi loading).
- **KPI bar**: 4 ô (`Đang chờ` / `Đang làm` / `Làm lại` / `Đợi quay lại`) — derive từ length của 4 column. Cùng style với KPI ở Designer page (border-card + label uppercase + value lớn).
- **Hint bar**: rounded box bg-muted với `MousePointerClick` icon — hướng dẫn checkbox + shift-click + DnD (clone Designer hint).
- **Filter bar**: grid 5 cell (Search + 4 SelectFilter cho `type`/`fabricType`/`machineNumber`/`toolResult`) — match Designer page.
  - Search 300ms debounce → match `productionId` / `orderId`.
  - Facet options derive client-side bằng pattern faceted (loại trừ chính facet đang tính) → count phản ánh đúng các filter khác.
  - Apply filter client-side trước khi group → DnD/checkbox/kanban đều thấy data đã filter.
- **Selection + bulk** (clone Designer):
  - Checkbox tại group header (toàn bộ rows trong group) — indeterminate state khi partial.
  - Checkbox tại từng card (top-left absolute). Shift+click trong cùng cột để select range.
  - `selectedColumns` cross-column: nếu user chọn đơn ở > 1 cột → toolbar hiển thị warning, không cho bulk.
  - Sticky toolbar bottom-3 rounded-full: hiển thị count + button bulk theo cột:
    - waiting / rework → "Bắt đầu" (Promise.allSettled loop `transition(start)`).
    - in-progress → "Hoàn thành" (loop `transition(complete)`).
    - watching → không có checkbox + không có bulk (read-only).
    - Rework-back KHÔNG bulk (cần dialog per đơn → input lý do).
- **Kanban 4 column** với border accent màu:
  - `waiting` — zinc
  - `in-progress` — indigo
  - `rework` — amber
  - `done` — emerald (đơn user đã hoàn thành stage này, đã chuyển sang stage sau hoặc xong toàn bộ flow)
- **Bottom drawer** `Đơn đã đẩy về xử lý` (collapsible, default closed) — clone pattern Designer's "Đơn đã trả lại". Hiển thị danh sách `watching` (đơn user đã rework-back, đang chờ quay lại). Card read-only, không có checkbox/action.
- **Group by type** trong mỗi cột — collapsible header (chevron + type name + count) — match Designer pattern (1 difference: không có checkbox bulk).
- **Card** (`FulfillmentTaskCard.tsx`) — design lấy nguyên template từ `pages/designer/my-tasks/TaskCard.tsx`:
  - **Mockup thumbnail** 56×56 (`bg-checker`) bên trái, click → preview to qua `ImagePreviewDialog`.
  - **ProductionId** font-mono có thể clickable (hook `onClickProductionId` chưa nối, sẽ thêm detail dialog sau).
  - **Type** (line-clamp 1 + Hint tooltip).
  - **Size · Color · qty** dòng phụ.
  - **Time stamp** với `Clock` icon — switch field theo status:
    - `waiting` → `waitingAt` ("Nhận: 14:25 22/06").
    - `in-progress` → `startedAt` ("Bắt đầu: ...").
    - `rework` → `reworkAt` ("Quay lại: ...").
    - Hint tooltip on hover: format absolute + `dayjs.fromNow()` relative VI.
  - **ReworkCount badge** với `RotateCcw` icon (`×N` amber) — match Designer.
  - **Watching badge** (chỉ tab watching): "Đang ở: <stage>" với chevron sky.
  - **Production error note** (chỉ status rework): rounded amber alert box với `MessageSquareWarning` icon — clone từ Designer.
  - **Action buttons** inline ở footer (sub-component `CardAction`):
    - Waiting/Rework: "Bắt đầu" (indigo).
    - In-progress: "Hoàn thành" (emerald) + "Báo lỗi" (rose, mở `ReworkBackDialog`).
    - Watching: ẩn hoàn toàn.
- **DnD** (`@dnd-kit/core`): `useDraggable` build-in trong card. Chỉ enable cho `waiting`/`rework` → drop vào cột `in-progress` = action `start`. Drag rule khác bị toast warning. `in-progress`/`watching` không draggable (no valid target).
- **Data fetch**: 5 `Promise.all` calls song song tới `GET /v1/fulfillment/my-tasks?tab=...&size=5000` (waiting / in-progress / rework / done / watching). FE load full queue mỗi cột (size=5000) để hiển thị toàn bộ đơn không cắt; BE cap `size` tối đa 5000 (default 50 khi không truyền). 4 fetch đầu feed 4 cột kanban, fetch thứ 5 feed bottom drawer. Đơn giản hơn add BE endpoint mới vì queue per stage thường < 200 đơn.
- **ImagePreviewDialog** dùng chung với Designer — preview ảnh mockup khi click thumb.
- Empty state mỗi cột: "Trống" (italic).

### 4.2 `ReworkBackDialog`

- Chip group target: **Designer** + N chip cho stage trước (mặc định chọn stage trước liền kề).
- Textarea reason (required, max 500).
- Submit gọi `transition({ stage, action: 'rework-back', target, reason })`.

### 4.3 User form (`pages/users/index.tsx`)

- Khi role = `Fulfillment` → show 2 select:
  1. **Xưởng** (existing).
  2. **Stage Fulfillment** (auto-derive từ shared enum: In / Ép / QC sau ép / QC phân hàng kiểm / May nhận vào / May xuất ra / Đóng hàng).
- Helper text: "Mỗi (xưởng, stage) chỉ được 1 user".

### 4.4 Sidebar entry

Thêm vào group "Workflow":
```
{ key: PATHS.FULFILLMENT_MY_TASKS, label: 'Task Fulfillment', perm: 'page.fulfillment_my_tasks' }
```

---

## 5. Backend logic

### 5.1 `FulfillmentTaskService.transition()`

Pseudocode:
```
1. findById(orderId) → assert not cancelled, not deleted.
2. Role check: nếu không phải override role → user.fulfillmentStage === body.stage
   && order.factoryId === user.factoryId && order.currentFulfillmentStage === body.stage.
3. resolveTransition() → patch + nextStatus:
   - start: status → in-progress, set startedAt + (firstStartedAt nếu chưa).
   - complete: status → done, $inc workMs += delta, set completedAt.
     Auto-advance: nextStage waiting / nếu pack thì fulfillmentCompletedAt.
   - rework-back: reporter → waiting (cộng workMs), target → rework, intermediates → rework, currentStage = target.
     Nếu target = 'designer': designerStatus=rework + productionErrorSource=designer + designerReworkCount++.
4. findOneAndUpdate({ _id, fulfillmentStages.<stage>.status: currentStatus }, patch).
5. Nếu match miss → 409 (race condition).
6. orderLogService.write({ field: 'fulfillmentStages.<stage>.status', before, after }).
```

### 5.2 Race-safe atomicity

Cùng pattern designer: `findOneAndUpdate` với filter chứa `expected status` → nếu 2 user transition đồng thời, người sau nhận 409 + FE refetch.

### 5.3 `getMyTasks()` — 5 tab filter

| Tab | Filter |
|---|---|
| `waiting` | `currentFulfillmentStage = stage` && `fulfillmentStages.<stage>.status = waiting` && `designerStatus != 'rework'` |
| `in-progress` | `currentFulfillmentStage = stage` && `status = in-progress` |
| `rework` | `currentFulfillmentStage = stage` && `status = rework` |
| `done` | `fulfillmentStages.<stage>.completedAt $exists` && (`currentFulfillmentStage != stage` OR `currentFulfillmentStage` null) — đơn user đã hoàn thành stage này VÀ đã rời (auto-advance) HOẶC xong toàn bộ flow |
| `watching` | `fulfillmentTimeline.elemMatch({ stage, action: 'rework-back', byUserId: me })` && (`currentFulfillmentStage != stage` OR `designerStatus = 'rework'`) |

Common: `cancelledAt: null` + scope theo `user.factoryId`.

### 5.4 Hook entry → fulfillment

Có 2 entry point gọi vào cùng patch shape — code tham chiếu cùng helper `buildFulfillmentEntrySet()` ở `order.service.ts:155`:

```ts
// Factory function (không phải const) để `waitingAt` evaluate mỗi lần gọi —
// const với `as const` sẽ freeze timestamp ở module load time.
function buildFulfillmentEntrySet(): Record<string, unknown> {
  return {
    currentFulfillmentStage: FulfillmentStage.Print,
    'fulfillmentStages.print': {
      status: FulfillmentStageStatus.Waiting,
      reworkCount: 0,
      workMs: 0,
      waitingAt: new Date(),  // mốc nhận task cho user In
    },
  };
}
```

#### Entry A — Designer complete (`designer-task.service.ts:83`)

```ts
if (
  action === Complete &&
  plan.nextStatus === Done &&
  !order.currentFulfillmentStage  // chưa từng vào fulfillment
) {
  set.currentFulfillmentStage = 'print';
  set['fulfillmentStages.print'] = { status: 'waiting', reworkCount: 0, workMs: 0 };
}
```

Trường hợp designer rework cycle (đẩy từ fulfillment về): `currentFulfillmentStage` đã set sẵn (= reporter stage) → hook không kích hoạt lại → đơn quay lại đúng stage cũ.

#### Entry B — Manual `toolResultNote='ok'` (3 path)

**B1. `OrderService.updateField()`** — single update qua workshop cell:
```ts
if (dto.field === 'toolResultNote') {
  patch.readyForFulfill = normalized === READY_FOR_FULFILL_CODE;
  if (normalized === READY_FOR_FULFILL_CODE) {
    patch.productionFirstErrorAt = null;
    if (!before.currentFulfillmentStage) Object.assign(patch, buildFulfillmentEntrySet());
  }
}
```

**B2. `OrderService.bulkUpdateField()`** — sau update chính, chạy thêm `updateMany` cho subset chưa vào fulfillment:
```ts
if (dto.field === 'toolResultNote' && normalized === READY_FOR_FULFILL_CODE) {
  await this.orderModel.updateMany(
    { _id: { $in: dto.ids }, deletedAt: { $exists: false },
      currentFulfillmentStage: { $in: [null, undefined] } },
    { $set: buildFulfillmentEntrySet() },
  );
}
```

**B3. `OrderService.importRework()`** — per-row check trong import xlsx:
```ts
if (code === READY_FOR_FULFILL_CODE) {
  $set.readyForFulfill = true;
  $set.productionFirstErrorAt = null;
  if (!order.currentFulfillmentStage) Object.assign($set, buildFulfillmentEntrySet());
}
```

**Guard `!currentFulfillmentStage`** đảm bảo không ghi đè state đang chạy — nếu đơn đã ở Press/QC/... mà admin sửa cell ok bằng tay, chỉ flip `readyForFulfill`.

### 5.5 User service — Fulfillment validation

`createUser` + `adminUpdateUser`:
- `role === Fulfillment && !factoryId` → 400.
- `role === Fulfillment && !fulfillmentStage` → 400.
- Try/catch quanh `userRepository.create/update`: convert E11000 (duplicate `unique_factory_fulfillment_stage`) → 400 với message rõ ràng.

### 5.6 ⚠️ Gotcha: `getUserById` $project phải include `fulfillmentStage`

JWT strategy gọi `UserService.getUserById()` để build `@AuthUser() user` context cho mọi protected endpoint. Aggregation pipeline trong method này có 1 `$project` stage explicit — **chỉ field nào trong list mới có trên `user` object**, các field khác bị strip silently.

Trong khi đó, `FulfillmentTaskService.getMyTasks()` + `transition()` đều dùng `user.fulfillmentStage` để:
- Resolve stage mặc định khi query không truyền.
- Check ownership (`user.fulfillmentStage === body.stage`).

→ Nếu `getUserById` $project thiếu `fulfillmentStage`, mọi call tới `/v1/fulfillment/my-tasks` sẽ throw `"Thiếu stage (user chưa gán fulfillmentStage)"` **dù user đã được admin gán đúng trong DB**.

Đã fix tại `apps/api/src/modules/user/user.service.ts:96` — thêm `fulfillmentStage: 1` vào `$project`. Tương tự cho `getMe()` ($project khác, audience FE).

**Rule chung:** Bất kỳ field mới nào trên `UserEntity` mà downstream service / controller cần access qua `@AuthUser()` phải:
1. Thêm vào `$project` của `getUserById()` (BE auth context).
2. Thêm vào `$project` của `getMe()` (FE profile context — nếu cần hiển thị / store ở authStore).

Trừ khi field thuần private (chỉ DB schema, không có business logic dùng tới), luôn add cả 2 chỗ để tránh debug nhầm hướng.

---

## 6. Performance notes

- **My Tasks query**: index hỗ trợ
  - `factoryId` (existing).
  - `currentFulfillmentStage` (new, single field).
  - `inProductionAt` (existing, dùng làm tiebreak sort sau `orderAt`).
  - Sub-field `fulfillmentStages.<stage>.status` không index riêng (Mongo sẽ scan trong scope của factoryId + currentStage) — đủ nhanh vì queue per stage thường < 200 đơn.
- **Sort**: `{ orderAt: -1, inProductionAt: -1 }` — `orderAt` primary (thời gian khách đặt), `inProductionAt` secondary tiebreak (thời gian vào xưởng). Đổi từ `createdAt` Mongo timestamp → `inProductionAt` business time để khớp với toàn bộ flow order (xem `Orders.md` §7.0b).
- **Tab counts**: 5 query song song `countDocuments` (waiting/in-progress/rework/done/watching) — tổng < 50ms với dataset ~10k đơn/factory.
- **Timeline**: append-only, không index. Reads chỉ khi user mở chi tiết đơn (lazy).
- **fulfillmentTimeline** có thể grow theo thời gian → nếu đơn rework nhiều lần (>50 entry) cần consider archive sau. Hiện tại chấp nhận.

---

## 7. Permissions

| Role | Quyền | Page truy cập |
|---|---|---|
| `Fulfillment` worker | `fulfillment.task.transition` (chỉ transition stage của bản thân) | `/fulfillment/my-tasks` |
| `Manager` / `SupportManager` | `fulfillment.task.override`, `fulfillment.team.manage` | All fulfillment pages |
| `Admin` / `SuperAdmin` | ALL | All |

Worker scope enforce ở BE: `user.fulfillmentStage === body.stage` && `user.factoryId === order.factoryId`.

---

## 8. Deferred (Phase 6/7 chưa làm)

- **Stats endpoint + page** (`/fulfillment/stats`): throughput per stage per period, cycle time avg, top worker. DTO đã định nghĩa (`GetFulfillmentStatsDto`, `FulfillmentStageStatRowZod`) — service + UI chưa.
- **Telegram noti**: aggregator + formatter cho fulfillment block trong scheduled report 3 slot. Optional cron alert đơn kẹt 24h.
- **Team admin queue page** (`/fulfillment/team`): kanban 5 column × factory. Hiện tại workers quản lý qua `/users` (form đã hỗ trợ stage dropdown).

---

## 9. Files / Folders liên quan

**Shared:**
- `packages/shared/enums/fulfillment-stage.ts` — enum + label + order
- `packages/shared/dtos/production-order.dto.ts` — fulfillment fields + transition DTOs
- `packages/shared/dtos/user.dto.ts` — `fulfillmentStage` field
- `packages/shared/constants/permission-catalog.ts` — 6 permission mới

**Backend:**
- `apps/api/src/modules/fulfillment/fulfillment.module.ts`
- `apps/api/src/modules/fulfillment/fulfillment-task.service.ts`
- `apps/api/src/modules/fulfillment/fulfillment-task.controller.ts`
- `apps/api/src/modules/order/order.entity.ts` — 4 field mới + `makeEmptyStageState` helper
- `apps/api/src/modules/user/user.entity.ts` — `fulfillmentStage` + partial unique index
- `apps/api/src/modules/user/user.service.ts` — validation + E11000 handler
- `apps/api/src/modules/designer/designer-task.service.ts` — hook entry A (designer.complete)
- `apps/api/src/modules/order/order.service.ts` — helper `buildFulfillmentEntrySet()` + hook entry B ở `updateField` / `bulkUpdateField` / `importRework`

**Frontend:**
- `apps/web/src/pages/fulfillment/my-tasks/index.tsx` — kanban 4 cột + DnD
- `apps/web/src/pages/fulfillment/my-tasks/FulfillmentTaskCard.tsx` — card component dùng chung 4 cột
- `apps/web/src/pages/fulfillment/my-tasks/ReworkBackDialog.tsx`
- `apps/web/src/services/fulfillment.ts`
- `apps/web/src/pages/users/index.tsx` — form thêm stage dropdown
- `apps/web/src/constants/paths.ts` — 3 PATH mới
- `apps/web/src/constants/routerConfig.ts` — lazy route
- `apps/web/src/components/sidebar/Sidebar.tsx` — entry "Task Fulfillment"
