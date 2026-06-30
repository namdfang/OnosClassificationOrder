# Fulfillment 7-Stage Workflow — Function Description

> **File FE:** `apps/web/src/pages/fulfillment/my-tasks/`, `apps/web/src/services/fulfillment.ts`, `apps/web/src/pages/users/index.tsx` (form chọn `fulfillmentStage`)
> **File BE:** `apps/api/src/modules/fulfillment/` (full module), hook ở `apps/api/src/modules/designer/designer-task.service.ts` → `transition()` > **Route FE:** `/fulfillment/my-tasks` > **API:** `POST /v1/orders/:id/fulfillment-transition`, `GET /v1/fulfillment/my-tasks`

---

## 1. Overview

Sau khi Designer mark task `done` (`designerStatus === 'done'` + `readyForFulfill === true`), đơn được auto-route qua **7 stage tuần tự** trong phạm vi factory:

```
Designer done → In → Ép → QC sau ép → QC phân hàng kiểm → May nhận vào → May xuất ra → Đóng hàng → completed
                ↑    ↑       ↑              ↑                  ↑              ↑            ↑
              mỗi stage có DUY NHẤT 1 user phụ trách per factory
              (BE enforce unique constraint (factoryId, fulfillmentStage))
```

| #   | Label UI          | Code enum       | Vai trò                       |
| --- | ----------------- | --------------- | ----------------------------- |
| 1   | In                | `print`         | In tem/mockup                 |
| 2   | Ép                | `press`         | Ép nhiệt lên vải              |
| 3   | QC sau ép         | `qc-post-press` | Kiểm hậu ép (chất lượng in)   |
| 4   | QC phân hàng kiểm | `qc-sorting`    | Phân loại + kiểm hàng tổng    |
| 5   | May nhận vào      | `sew-in`        | Tiếp nhận hàng vào tổ may     |
| 6   | May xuất ra       | `sew-out`       | Xuất hàng đã may xong khỏi tổ |
| 7   | Đóng hàng         | `pack`          | Đóng gói + chuẩn bị ship      |

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

| Path                                                  | File                                                             | Hành vi                                                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /v1/orders/:id` field=`toolResultNote`         | `OrderService.updateField()` (`order.service.ts` ~line 2347)     | Set `readyForFulfill=true` + `productionFirstErrorAt=null`. Nếu `!before.currentFulfillmentStage` → spread `buildFulfillmentEntrySet()` vào patch. |
| `PATCH /v1/orders/bulk-update` field=`toolResultNote` | `OrderService.bulkUpdateField()` (`order.service.ts` ~line 2572) | Sau update chính, chạy thêm 1 `updateMany` cho subset `currentFulfillmentStage` null/undefined.                                                    |
| Import xlsx "soát" (`Note_kq_Tool` cell = `ok`)       | `OrderService.importRework()` (`order.service.ts` ~line 2929)    | Per-row check `!order.currentFulfillmentStage` → merge entry patch vào `$set`.                                                                     |

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

| Target               | Effect                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'designer'`         | `designerStatus = 'rework'`, `productionErrorSource = 'designer'`, `productionErrorNote = reason`. Reporter stage về status=`waiting` (workMs cộng dồn, reworkCount++), assignee giữ nguyên. Đơn nằm ở tab **"Đang chờ quay lại"** của reporter (match nhờ `designerStatus='rework'`). **Sau khi Designer complete:** hook `DesignerTaskService.transition()` set reporter stage = `rework` → đơn chuyển sang tab **"Cần làm lại"** của reporter (KHÔNG về "Đang chờ"). |
| `<previous stage X>` | `currentFulfillmentStage = X`. Target stage X + tất cả stage giữa X và reporter → `status='rework'`, `reworkCount++`, `reworkAt=now`, `reworkFromStage = reporter`. Reporter → `status='waiting'`.                                                                                                                                                                              |

#### 2.3b Báo lỗi designer qua cell "Lỗi xưởng" (tương đương rework-back target=designer)

Worker KHÔNG bắt buộc dùng nút "Báo lỗi": chọn cell **"Lỗi xưởng"** (`productionError`) mà loại lỗi (`errorSource` từ config) = **designer** → tự động mirror rework-back về designer.

> ⚠️ **Điều kiện kích hoạt** (`canReworkBackToDesigner`): `errorSource='designer'` + `designerStatus` ∈ {`done`, `unassigned`, `rejected`}. **KHÔNG** gate `=== 'done'` (đơn vào print qua manual `toolResultNote='ok'` Entry B có `designerStatus='unassigned'` — gate Done sẽ bỏ sót, bug đã sửa). Skip khi designer đang `rework` (tránh double-report) hoặc `in-progress`/`assigned` (designer đang làm dở, không giật).
>
> **Vị trí stage** (`buildDesignerReworkBackFromError`):
> - Đơn **đã trong pipeline** (`currentFulfillmentStage` set) → reporter = stage hiện tại; stage → `waiting` (reworkCount++).
> - Đơn **CHƯA vào pipeline** (`currentFulfillmentStage` null — vd đơn lỗi tool chưa từng 'ok', `designerStatus='unassigned'`) → **khởi tạo stage `print`** (`currentFulfillmentStage='print'` + subdoc `{status:'waiting', reworkCount:0, workMs:0, waitingAt}`). Vì pipeline luôn bắt đầu ở Print; bảng In là admin-view nên worker In thấy & báo lỗi cả đơn ngoài pipeline. Sau khi designer complete → hook designer-complete (currentFulfillmentStage đã set) flip Print → `rework`.


- `toolResultNote='error'` + `designerStatus='rework'` + `designerReworkAt` + `$inc designerReworkCount` (như cũ).
- **Mới:** reporter stage (`currentFulfillmentStage`) → `status='waiting'` + `reworkCount++`, và **push `fulfillmentTimeline` entry** `{ stage, action:'rework-back', byUserId:<worker>, reworkTarget:'designer', reason:productionErrorNote }` → đơn vào tab **"Đang chờ quay lại"** của worker (điều kiện match của tab watching cần đúng timeline entry này).
- Sau khi Designer complete → reporter stage = `rework` (như 2.3) → tab **"Cần làm lại"**.

Áp dụng ở `OrderService.updateField()` (field `productionError` / `productionErrorSource`) + `OrderService.setProductionError()` (scan + dialog "Lỗi khác") qua helper chung `buildDesignerReworkBackFromError()`. Chỉ kích hoạt khi đơn đã ở fulfillment + có user context; đơn chưa vào pipeline → chỉ flip `designerStatus` như cũ. **Áp cho mọi stage** (print trở đi), cả PrintOrderTable (chip watching/rework) lẫn kanban (tab watching/rework).

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

| Method | Path                                    | Mô tả                                                               |
| ------ | --------------------------------------- | ------------------------------------------------------------------- | ----------- | ------ | -------------------------------------------------------------------------------------- |
| `POST` | `/v1/orders/:id/fulfillment-transition` | Trigger state machine. Body: `{ stage, action, target?, reason? }`. |
| `GET`  | `/v1/fulfillment/my-tasks`              | List 4-tab cho worker hiện tại. Query: `tab=waiting                 | in-progress | rework | watching`, `page`, `size`. Stage + factoryId tự suy từ user (Manager có thể override). |

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

### 4.5 Stage In (print) — bảng admin-view thay kanban

> Plan gốc: `documents/Plans/PrintStage-AdminTableView.md`.

Riêng user **In** (`role=Fulfillment`, `fulfillmentStage='print'`) **KHÔNG** dùng kanban như các stage khác, mà dùng **bảng phẳng** (`PrintOrderTable` — file riêng, KHÔNG đụng `OrderTableWorkshop`) để thấy **mọi trạng thái đơn TRONG XƯỞNG MÌNH** (gồm đơn lỗi / `toolResultNote != 'ok'` / chưa vào pipeline). **CHỈ xưởng mình** (`factoryId = user.factoryId`) — không thấy đơn xưởng khác (khác user admin thấy mọi xưởng).

- **Dispatcher** `pages/fulfillment/my-tasks/index.tsx`: nếu `myStage === FulfillmentStage.Print` → render `PrintWorkshopView`; còn lại render `FulfillmentKanbanView` (kanban cũ, đổi tên từ component cũ). Dispatcher chỉ gọi `useAuthStore` rồi rẽ nhánh → không vi phạm Rules of Hooks.
- **`PrintWorkshopView`** (`pages/fulfillment/my-tasks/PrintWorkshopView.tsx`): thin orchestrator — giữ logic transition + `ReworkBackDialog` + `reloadToken`, render `<PrintOrderTable extraRowAction reloadToken>`.
  - Action chỉ hiện khi `row.currentFulfillmentStage === 'print'` **và** `row.factoryId === user.factoryId` (khớp BE transition guard — đơn xưởng khác chỉ xem, không thao tác).
  - Contextual theo `fulfillmentStages.print.status`: `waiting`/`rework` → **Bắt đầu**; `in-progress` → **Hoàn thành** + **Báo lỗi** (mở `ReworkBackDialog`, target chỉ có `designer` vì print là stage đầu).
  - Sau transition → bump `reloadToken` để `PrintOrderTable` refetch (bảng + count).
- **`PrintOrderTable`** (`pages/fulfillment/my-tasks/PrintOrderTable.tsx`): bảng **phẳng KHÔNG group sản phẩm** (bỏ expand), self-contained:
  - Data từ `GET /v1/orders` với `sort=grouped` → sort ưu tiên **type → size → fabric → inProductionAt**. Pagination theo **đơn** (default size 50).
  - **Thanh chips trạng thái (hàng ngang)**: 6 chip `Tất cả / Đang chờ / Đang làm / Làm lại / Đã xong / Đang chờ quay lại` + số đếm (từ `GET /orders/fulfillment-status-counts`). Click → `statusFilter` → **cả list + facet dropdowns đều narrow theo status** (data qua `getOrders` + facets qua `getWorkshopAvailableFilters`, đều nhận `fulfillmentStatus`). Counts KHÔNG kèm status (đếm đủ 5).
  - **Filter bar** (`OrderFilterBar`): search + date + **Tên sản phẩm** (`type`) + **Khách hàng** (`userSku`) dạng dropdown có count + các facet workshop (loại vải/máy/trạng thái in/kết quả tool/note/file lỗi/người thực hiện/TT designer/lỗi xưởng).
  - **URL params persistence** (prefix `p` = print, dùng `useSearchParams` — mirror pattern `OrderTableWorkshop`): mọi filter ghi lên query string (`psearch`, `pfrom`/`pto`, `pstatus`, `ptype`, `pusersku`, `pfabric`, `pmnum`, `pprint`, `ptool`, `pnote`, `perrfile`, `passign`, `pdstatus`, `perror`, `ppage`, `psize`). Effect sync state→URL (`{ replace: true }`) strip giá trị rỗng cho URL gọn, riêng **ngày luôn ghi** (`pfrom`/`pto` set kể cả rỗng → giữ trạng thái user clear date qua F5). State khởi tạo lazy từ `searchParams.get(...)` → **F5 / mở lại link đều khôi phục nguyên filter + search + ngày + trang**. Ngày đọc bằng `?? todayISO()` (chỉ default về hôm nay khi param vắng mặt hoàn toàn), các filter khác đọc bằng `|| ''`.
  - Cột = `WORKSHOP_COLS` (theo view-permission). Cột action **sticky phải** (prop `extraRowAction`). Highlight no-tool. `reloadToken` prop → ép refetch.
  - **Chế độ phím ↑↓** (toggle "Chế độ phím ↑↓" cạnh chips, state `keyboardMode` — **mặc định On**): bật → nghe `keydown` window, phím `↑`/`↓` di chuyển `cursorIndex` trong trang + copy `productionId` dòng đó vào clipboard (`navigator.clipboard`). Dòng đang focus có ring + auto `scrollIntoView`. **CHỈ dòng vừa copy (cursor đang trỏ) hiện ✓** (`copiedId: string | null` — KHÔNG còn tích lũy Set; mỗi lần copy thay thế giá trị cũ → di chuyển cursor thì ✓ nhảy theo, dòng cũ mất tick), render `CheckCircle2` cạnh checkbox. Bỏ qua khi target là input/textarea/select. `copiedId` reset khi đổi filter/search/date/status/facet; `cursorIndex` reset thêm khi đổi trang.
  - **Chọn nhiều + bulk CHUYỂN TRẠNG THÁI** (không phải bulk-edit field): checkbox chỉ tick được đơn **hợp lệ** (`isRowSelectable` = đơn của mình + stage In + status chờ/làm lại/đang làm; đơn khác bị disable). Toolbar (`renderBulkBar`) hiện 2 nút riêng **Bắt đầu** (cho đơn chờ/làm lại) + **Hoàn thành** (cho đơn đang làm). Nếu chọn lẫn trạng thái → **popup xác nhận** trước khi chuyển (chỉ áp cho subset hợp lệ với nút đó, số còn lại bỏ qua). Bulk loop `transition` song song → toast gộp.
- **BE filter + count**:
  - `GetProductionOrdersZod.fulfillmentStatus` (enum 5 giá trị) + `userSku` (CSV filter). `OrderService.applyFulfillmentStatusFilter()` mirror `FulfillmentTaskService.applyTabFilter` (không ép scope factory/ready; `watching` dùng userId elemMatch timeline). Áp ở `getOrders` + `getOrdersGroupedByType` + `getFulfillmentStatusCounts`.
  - `GET /v1/orders/fulfillment-status-counts` (`@Auth(ORDER_VIEW_ROLES)`) trả `{all, waiting, inProgress, rework, done, watching}` (all = tổng đơn theo filter, không kèm status).
  - `getWorkshopAvailableFilters` thêm facet `type` + `userSku` (cho dropdown). `buildOrderListFilter` thêm filter `userSku`.
- **Visibility BE**: helper `OrderService.isPrintAdminView(roleName, fulfillmentStage)` (true khi Fulfillment + print) bỏ qua `readyForFulfill` + window 7 ngày **NHƯNG vẫn scope `factoryId = user.factoryId`** (chỉ xưởng mình, dùng equality — KHÔNG gồm `originalFactoryId`). Áp tại:
  - `buildVisibilityFilter()` → cover `GET /orders` + `GET /orders/grouped` + `GET /orders/workshop-filters` + `GET /orders/status-overview` + `GET /orders/fulfillment-status-counts`.
  - `getDashboard()` + `getFactoryOverview()` (Dashboard tab Stats + Factory).
  - Controller truyền `user?.fulfillmentStage` cho các endpoint trên (gồm `GET /orders`).
  - **Ngoài scope** (giữ scope Fulfillment cũ): `getErrorLog`, `getByProductionId`, `getDesignerBreakdown`.
- **Permission**: preset `Fulfillment` được bổ sung các `order.field.*.view` còn thiếu (`toolResult`, `errorFile`, `errorFileNote`, `assignee`, `assigneeNote`, `designerStatus`) + `order.log.view` để hiển thị đủ 16 cột + nút Lịch sử (chỉ **view**, không mở edit). `RoleService.onModuleInit` tự sync khi boot.
- **Cột "Loại lỗi" (`productionErrorSource`) tự fill theo "Lỗi xưởng" (`productionError`), KHÔNG cho sửa tay**:
  - Chọn `productionError` (code) → BE auto-fill `productionErrorSource = config.errorSource` (`order.service.ts:3294`;
    **bỏ chọn productionError → clear source** `:3318`). FE `ProductionErrorSelectCell` resolve sẵn `cfg.errorSource` truyền
    qua `onUpdated(code, source)`; handler cột trong `workshopTableConfig.tsx` patch `productionErrorSource` ngay (kể cả khi
    `!code` → clear) → cột "Loại lỗi" cập nhật tức thì, không chờ F5. Áp cho mọi bảng dùng `WORKSHOP_COLS` (`PrintOrderTable` +
    `OrderTableWorkshop`).
  - Preset `Fulfillment` **bỏ `order.field.productionErrorSource.edit`** (giữ `.view`) → `ErrorSourceCell` render
    read-only. Permission theo **role `Fulfillment` (1 role chung cả 7 stage)** nên áp mọi stage — đúng logic vì loại lỗi luôn
    suy ra từ lỗi xưởng. `RoleService.onModuleInit` revoke quyền khi restart (catalog = source of truth). Vẫn giữ
    `productionError.edit` để worker chọn lỗi xưởng.

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

| Tab           | Filter                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `waiting`     | `currentFulfillmentStage = stage` && `fulfillmentStages.<stage>.status = waiting` && `designerStatus != 'rework'`                                                                                            |
| `in-progress` | `currentFulfillmentStage = stage` && `status = in-progress`                                                                                                                                                  |
| `rework`      | `currentFulfillmentStage = stage` && `status = rework`                                                                                                                                                       |
| `done`        | `fulfillmentStages.<stage>.completedAt $exists` && (`currentFulfillmentStage != stage` OR `currentFulfillmentStage` null) — đơn user đã hoàn thành stage này VÀ đã rời (auto-advance) HOẶC xong toàn bộ flow |
| `watching`    | `fulfillmentTimeline.elemMatch({ stage, action: 'rework-back', byUserId: me })` && (`currentFulfillmentStage != stage` OR `designerStatus = 'rework'`)                                                       |

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
      waitingAt: new Date(), // mốc nhận task cho user In
    },
  };
}
```

#### Entry A — Designer complete (`designer-task.service.ts:83`)

```ts
if (action === Complete && nextStatus === Done && !order.currentFulfillmentStage) {
  // Lần đầu vào fulfillment.
  set.currentFulfillmentStage = 'print';
  set['fulfillmentStages.print'] = { status: 'waiting', reworkCount: 0, workMs: 0 };
} else if (action === Complete && nextStatus === Done && order.currentFulfillmentStage) {
  // Cycle quay về (đơn bị worker báo lỗi designer rồi designer fix xong):
  // set reporter stage = rework → đơn vào tab "Cần làm lại" của worker.
  set[`fulfillmentStages.${order.currentFulfillmentStage}.status`] = 'rework';
  set[`fulfillmentStages.${order.currentFulfillmentStage}.reworkAt`] = now;
}
```

Trường hợp designer rework cycle (đẩy từ fulfillment về, qua nút "Báo lỗi" hoặc cell "Lỗi xưởng" §2.3b): `currentFulfillmentStage` đã set sẵn (= reporter stage). Trong lúc designer làm, reporter giữ stage=`waiting` + `designerStatus='rework'` → đơn nằm tab **"Đang chờ quay lại"**. Khi designer complete → nhánh `else if` set reporter stage=`rework` → đơn sang tab **"Cần làm lại"** của worker (đúng stage cũ, KHÔNG về "Đang chờ").

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
    { _id: { $in: dto.ids }, deletedAt: { $exists: false }, currentFulfillmentStage: { $in: [null, undefined] } },
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

| Role                         | Quyền                                                             | Page truy cập           |
| ---------------------------- | ----------------------------------------------------------------- | ----------------------- |
| `Fulfillment` worker         | `fulfillment.task.transition` (chỉ transition stage của bản thân) | `/fulfillment/my-tasks` |
| `Manager` / `SupportManager` | `fulfillment.task.override`, `fulfillment.team.manage`            | All fulfillment pages   |
| `Admin` / `SuperAdmin`       | ALL                                                               | All                     |

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
