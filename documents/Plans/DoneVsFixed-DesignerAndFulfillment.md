# Tách "Đã sửa" khỏi "Đã xong" — Designer + Fulfillment

> Trạng thái: **ĐÃ IMPLEMENT** (2026-07-07). Build shared/api/web + vite đều pass (chỉ còn baseline errors cũ). Chưa commit.
>
> **Ngoài scope (giữ nguyên):** ma trận `team-daily-breakdown` (Dashboard tab Designer — 4 số mini/ô) và bảng `daily-overview` 4-hàng backlog vẫn để "Đã xong" = tổng done (gồm cả đã sửa), vì 2 bảng này focus "chưa xong/tồn", done chỉ là cột đối chiếu. Nếu muốn tách "Đã sửa" ở đó nữa → mở rộng sau.
> Mục tiêu: đơn từng bị báo lỗi rồi hoàn thành hiện đang lẫn trong "Đã xong". Tách ra mục **"Đã sửa"** riêng (loại trừ khỏi "Đã xong") để check được đơn nào designer/xưởng đã sửa lỗi, ở cả tài khoản Designer, các stage Fulfillment (gồm In), và dashboard/thống kê.

## 0. Quyết định đã chốt
1. **Loại trừ** — `Đã xong` = hoàn thành KHÔNG dính lỗi; `Đã sửa` = hoàn thành sau khi sửa lỗi. Không trùng.
2. **Phạm vi đầy đủ** — kanban + KPI + dashboard/thống kê.
3. Bảng **In** (PrintOrderTable) thêm chip `Đã sửa`.

## 1. Định nghĩa "Đã sửa" (không cần schema mới)
| Nơi | "Đã xong" (mới) | "Đã sửa" |
|---|---|---|
| Designer | `designerStatus='done'` **và** `designerReworkCount ∈ {0, null}` | `designerStatus='done'` **và** `designerReworkCount > 0` |
| Mỗi stage Fulfillment | `fulfillmentStages.<stage>.completedAt` tồn tại **và** `reworkCount ∈ {0,null}` | `completedAt` tồn tại **và** `fulfillmentStages.<stage>.reworkCount > 0` |

`reworkCount`/`designerReworkCount` đã `$inc` sẵn khi báo lỗi, không reset → chỉ thêm điều kiện filter, **không backfill, không thêm query mới** (giữ nguyên số lần truy vấn).

## 2. Shared DTOs (`packages/shared`)
- `dtos/designer.dto.ts`
  - `DesignerMyStatsZod`: thêm `fixedInPeriod: z.number().int().nonnegative()`. Giữ `completedInPeriod` = **tổng** done (fresh+fixed) để không phá nơi khác; FE tự tính `Đã xong = completedInPeriod − fixedInPeriod`.
  - `DesignerTasksColumns` (return của `/my-tasks`): thêm cột `fixed: DesignerTaskCardZod.array()`.
  - `DesignerPerformanceRowZod`: thêm `fixedInPeriod` (dashboard leader).
- `dtos/production-order.dto.ts`
  - `FULFILLMENT_TASK_TABS`: thêm `'fixed'`.
  - `FulfillmentStatusCountsResZod.data`: thêm `fixed: z.number()`.
  - `MyTasksTabCounts` (nếu có `tabCounts`): thêm `fixed`.
  - `GetProductionOrdersZod.fulfillmentStatus` enum: thêm `'fixed'`.
  - `FulfillmentDailyRowZod` + `FulfillmentDailyColumnTotalsZod`: thêm `designerFixed` + mỗi stage subobject thêm `fixed` (cho PipelineDailyOverview).

## 3. Backend

### 3.1 Designer — `designer-task.service.ts`
- `getMyTasks` (L317-350): query `done` thêm `designerReworkCount: { $in: [0, null] }`; thêm query thứ 6 `fixed` = `designerStatus: Done, designerReworkCount: { $gt: 0 }` sort `designerCompletedAt: -1`. Return `columns.fixed`.
- `getMyStats` (L575-): `completedAgg` đã project `designerReworkCount` → thêm `fixedInPeriod = completedAgg.filter(o => (o.designerReworkCount||0) > 0).length`. Trả về.
- `getMyTaskFilters`: **không đổi** (facet dùng `buildMyTaskFilter`, không phân cột).

### 3.2 Designer dashboard — `designer-stats.service.ts`
- `getPerformance` (L127-251): mảng completed docs trong period đã có → thêm accumulate `fixedInPeriod` per assignee (completed && reworkCount>0). Gán `r.fixedInPeriod`. (Khác `totalRework` = từ OrderLog theo assignee hiện tại; khác `reworkCount` snapshot đang-rework.)

### 3.3 Fulfillment — `fulfillment-task.service.ts`
- `applyTabFilter` (L571-):
  - `case 'done'`: thêm `[`fulfillmentStages.${stage}.reworkCount`]: { $in: [0, null] }` vào object merge (loại đơn đã sửa).
  - **thêm** `case 'fixed'`: y hệt `done` nhưng `reworkCount: { $gt: 0 }`.
- `getMyTaskCounts` (L674-681): thêm `countDocuments(applyTabFilter(base,'fixed',…))`.

### 3.4 Print flat table — `order.service.ts`
- `applyFulfillmentStatusFilter` (L577): mirror trên — `done` loại `reworkCount>0`; thêm nhánh `'fixed'`.
- `getFulfillmentStatusCounts` (L747-): thêm `'fixed'` vào danh sách status đếm → trả `fixed`.

### 3.5 Fulfillment daily-overview — `fulfillment-task.service.ts §5.1b`
- Aggregate `$group`: thêm `designerFixed = $sum($cond[ designerStatus=='done' && designerReworkCount>0 ,1,0])`; và mỗi stage thêm `s_<stage>_fixed` (`status=='done' && reworkCount>0`). Reshape vào `designerFixed` + `stages.<stage>.fixed`. Cập nhật `emptyTotals` + `columnTotals`.

## 4. Frontend

### 4.1 Designer my-tasks — `pages/designer/my-tasks/index.tsx`
- `ColKey` thêm `'fixed'`; `COL_ORDER` = `['assigned','rework','inProgress','done','fixed']`; `COL_META.fixed` (label "Đã sửa", accent teal, **không phải drop target** — terminal như done, không map DnD).
- State `columns` thêm `fixed`; render cột mới (ẩn khi rỗng — tuỳ chọn, hoặc luôn hiện).
- Grid kanban: 4→5 cột (và nhánh ẩn rework: 3→4). Cập nhật class ở L685-686.
- KPI (L563-568): grid `md:grid-cols-6` → `7`; sửa "Đã xong" `value = completedInPeriod − fixedInPeriod`; thêm ô "Đã sửa" `value = fixedInPeriod` (teal).
- DnD: `handleDragEnd` bỏ qua khi target là `fixed`; card trong `fixed` không draggable.

### 4.2 Fulfillment my-tasks kanban — `pages/fulfillment/my-tasks/{index,FulfillmentTaskCard}.tsx`
- `ColKey` thêm `'fixed'`; `WORKER_COL_ORDER` chèn `'fixed'` sau `'done'`; `COL_META.fixed` (label "Đã sửa", teal, read-only như done — không checkbox/bulk/DnD).
- Fetch (L378-382): thêm `myTasks({ tab:'fixed', size:5000 })` (Promise.all 6 phần).
- KPI grid + kanban grid: +1 cột (cập nhật class L766-767, 883, 932-933).
- `FulfillmentTaskCard`: `showCheckbox`/action ẩn cho `fixed` (giống `done`).

### 4.3 Print flat table — `pages/fulfillment/my-tasks/PrintOrderTable.tsx`
- `STATUS_TABS`: thêm `{ value:'fixed', label:'Đã sửa', countKey:'fixed', accent:'text-teal-600' }` (sau `done`).
- `StatusCounts` type thêm `fixed`.

### 4.4 Dashboard leader — `pages/home/DesignerStatsTab.tsx`
- Bảng performance: thêm cột "Đã sửa" (`row.fixedInPeriod`) cạnh "Đã xong". (Header title: "Hoàn thành sau khi sửa lỗi trong period".)

### 4.5 Bảng "Tổng quan theo ngày" — `components/common/PipelineDailyOverview.tsx`
- `EMPTY_TOTALS` + types: thêm `designerFixed` + `stages.<st>.fixed`.
- Lane `designer` (L225-): thêm hàng con **"Đã sửa"** (`designerFixed`, teal) — và "Đã xong" giữ hiển thị `designerDone` (hoặc `designerDone − designerFixed` để nhất quán loại trừ — **chốt: hiển thị `designerDone` tổng + thêm dòng Đã sửa** cho khớp funnel; ghi rõ ở tooltip).
- Stage mở rộng (khi có `stage` prop) + tooltip ô stage: thêm số "Đã sửa" (`stages[st].fixed`).

## 5. Rà soát nhất quán / rủi ro
- **Kanban vs KPI**: cột dùng snapshot (`reworkCount>0`), KPI dùng period (`fixedInPeriod` theo `designerCompletedAt`). Đã có sai lệch nhẹ tương tự với "Đã xong" hiện tại — chấp nhận, note trong doc.
- **`done` giờ trừ fixed** ở mọi filter đếm → tổng `done` các bảng cũ giảm đúng bằng số fixed. Kiểm tra không nơi nào giả định `done` = tổng-hoàn-thành (nếu cần tổng: `done + fixed`).
- Stage là **intermediate** trong rework-back của stage khác cũng `reworkCount++` → khi nó complete lại sẽ vào "Đã sửa" của chính nó. Đúng ngữ nghĩa "stage này đã làm lại".
- Không thêm endpoint, không thêm query, không schema mới → **không tăng tải server**.

## 6. Verify
1. `pnpm --filter shared build`
2. `cd apps/api && ./node_modules/.bin/tsc --noEmit` (đối chiếu baseline errors đã biết)
3. `cd apps/web && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vite build`
4. Cập nhật docs: `DesignerTaskWorkflow.md` (state/column/§4.2), `FulfillmentWorkflow.md` (§4.1/4.5/4.6 + tab enum + §5.3), `Dashboard.md` (tab Designer). Không commit tới khi user yêu cầu.
</content>
</invoke>
