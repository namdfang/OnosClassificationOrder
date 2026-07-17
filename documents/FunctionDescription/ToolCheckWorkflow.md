# Soát tool — Lỗi "do Soát tool" + Dashboard Support — Function Description

> **File FE:** `apps/web/src/pages/home/ToolCheckTab.tsx` (tab thứ 5 trong `apps/web/src/pages/home/index.tsx`, bên trái tab Designer), `apps/web/src/components/common/PipelineDailyOverview.tsx` (bảng "Tổng quan theo ngày" `lane='tool'`, xem `FulfillmentWorkflow.md §4.6`), `apps/web/src/services/designer.ts` → `toolCheckOverview`, `apps/web/src/pages/workshop-config/CategoryEditor.tsx` (nút chọn nguồn + badge), cells `ProductionErrorSelectCell`/`ErrorSourceCell`/`ColorBadgeSelectCell`/`SelectPopover` > **File BE:** `apps/api/src/modules/order/order.service.ts` (hook rework-back tool-check + hook `$addToSet toolCheckErrorNotes` trong `updateField('toolResultNote')` + backfill `onModuleInit`), `apps/api/src/modules/order/order.entity.ts` (field `toolCheckErrorNotes: string[]`), `apps/api/src/modules/order-log/order-log.repository.ts` → `aggregateToolCheckErrorNotes()`, `apps/api/src/modules/designer/designer-stats.service.ts` → `getToolCheckOverview()`, `designer-stats.controller.ts` → `GET /v1/designer/tool-check-overview`, `apps/api/src/modules/fulfillment/fulfillment-task.service.ts` (tab watching), `apps/api/src/modules/workshop-config/workshop-config.seed.ts` (seed "Thiếu file để in")
> **Route:** `/` (Dashboard) → tab `?tab=tool-check` > **API:** `GET /v1/designer/tool-check-overview`

## 1. Overview

Bổ sung **nguồn lỗi thứ 3** cho `productionError`: `errorSource = 'tool-check'` (nhãn **"Soát tool"**), song song `designer` / `factory`.

Bối cảnh: đơn `toolResultNote='ok'` được đẩy thẳng sang In (xem `FulfillmentWorkflow.md §2.1 Entry B`). Nếu đơn ok nhưng **thiếu file để in**, trước đây In chỉ báo được "do designer" hoặc "do xưởng" → Support (người soát tool) không biết lỗi thuộc về mình. Nay In chọn lỗi loại **Soát tool** (mặc định mã "Thiếu file để in") → đơn đẩy **về Support** để soát lại, KHÔNG đụng designer/xưởng.

- Mã lỗi mặc định seed sẵn: `tool-missing-file` — "Thiếu file để in", `errorSource='tool-check'`.
- Tab Dashboard mới **"Soát tool"** — **CHỈ Support + Admin** (perm `page.tool_check`).

## 2. Luồng hoạt động

### 2.1 In báo lỗi "do Soát tool"

1. User In (bảng `PrintOrderTable`) chọn cell **"Lỗi xưởng"** = mã có `errorSource='tool-check'` (vd "Thiếu file để in").
2. BE (`updateField('productionError')`): set `productionErrorSource='tool-check'`, `toolResultNote='error'`, `readyForFulfill=false`, `$inc productionErrorCount`, `productionErrorNote`. Reporter stage `print` → `waiting` (reworkCount++), push `fulfillmentTimeline { action:'rework-back', reworkTarget:'tool-check', byUserId:In }`.
3. **Marker "support-hold"** = `productionErrorSource='tool-check' AND toolResultNote='error'`. Đơn nằm tab **"Đang chờ quay lại"** của In (KHÔNG lọt "Đang chờ" active). Song song với cách designer dùng `designerStatus='rework'`.

### 2.2 Support soát lại → đẩy về In

- Support vào bảng `/orders`, **đổi cell "Note kq Tool" → 'ok'** (chỉ cần thao tác này).
- `toolResultNote='ok'` → marker mất → **re-flow CHẠY LẠI TOÀN CHUỖI từ In** (cập nhật 2026-07). `OrderService.updateField` nhận biết `wasToolCheckHold` (marker cũ) → gỡ `productionErrorSource`, `currentFulfillmentStage=Print`:
  - Đơn **có designer từng làm** (`assignee` + `designerStatus='done'`) → `designerStatus='rework'` → về **Thiết kế** "Cần làm lại" (designer complete → hook Entry A flip In→rework). `readyForFulfill=false` tới khi designer xong.
  - Đơn **không designer** → `fulfillmentStages.print.status='rework'` → về **In** "Cần làm lại" luôn. `readyForFulfill=true`.
- Trong lúc chờ Support soát, các công đoạn đã-xong (Thiết kế/In/…) hiển thị **"Đang chờ quay lại"** (positional watching — xem `FulfillmentWorkflow.md §5.3` + `documents/Plans/UpstreamWatching-ReflowChain.md`).
- ⚠️ **Giới hạn:** re-flow chỉ kích hoạt qua **`updateField`** (sửa cell — bao gồm bulk delegate). Import xlsx "file soát" set 'ok' trên đơn tool-check-hold KHÔNG re-flow (Support nên soát bằng cell).

### 2.3 Tab Dashboard "Soát tool"

Support/Admin mở Dashboard → tab "Soát tool":

- Filter **thời gian** — `DateRangePicker variant="inline"` (thanh preset ngang full-width: Hôm nay · Hôm qua · 7/14/30 ngày · Tháng này · Tháng trước · Tùy chỉnh), lọc theo `inProductionAt` (tz VN). Model đã đổi `days` → **`from/to`** (mặc định 7 ngày gần nhất = `last-7d`); BE `getToolCheckOverview` khi có `from&&to` dùng window đó (bỏ qua `days`). Xem `DateRangePicker-InlineRedesign.md`.
- **4 filter server-side** (`SelectFilter` — options từ `facets` BE, phạm vi = đơn Support quan tâm cả kỳ `chưa soát ∪ tool-check`, KHÔNG cross-narrow → dropdown ổn định): **Sản phẩm** (`type`) · **Khách hàng** (`userSku`) · **Máy** (`machineNumber`) · **Ưu tiên** (`priority` — value `'1'|'2'|'3'`, label map qua `ORDER_PRIORITY_LABELS`, hàm `toPriorityOpts` riêng vì facet BE trả code chứ không phải label sẵn). Đổi filter → refetch, narrow **toàn tab** (KPI + dải ngày + list + thống kê). _(Lưu ý: đơn chưa soát thường chưa gán máy → filter Máy phủ ít cho nhóm chưa soát.)_
- **KPI**: Đã soát trong kỳ · In trả về (cần làm lại) · Chưa soát · Lỗi soát tool đang chờ (KPI tính **cả kỳ**, KHÔNG đổi khi click ngày).
- **Bảng "Tổng quan theo ngày" FULL luồng** (`<PipelineDailyOverview lane="tool">`, ngay TRÊN dải 2 hàng focus) — component dùng chung với Task Fulfillment (xem `FulfillmentWorkflow.md §4.6`). **Funnel TOÀN CỤC** (mọi đơn cả nhà máy) qua `GET /v1/fulfillment/daily-overview` (auth `OVERVIEW_ROLES` đã gồm Support). Lane "Soát tool" bung 4 hàng con: Đã soát / OK / Lỗi (`reviewed−ok`) / Chưa soát; kèm hàng Designer + 6 stage (dim) để thấy toàn luồng. Ăn cùng `from/to`; click 1 ngày → dùng chung `dayFilter` với dải focus dưới (cùng lọc list client-side).
- **Dải tổng quan theo ngày (focus)** (`days[]` + `columnTotals`): 2 hàng **Chưa soát** + **In trả về**, mỗi cột 1 ngày `inProductionAt` (VN, cũ→mới; BE trả mới→cũ, FE reverse) + cột Tổng. **Click 1 ngày (header hoặc ô) → lọc DANH SÁCH bên dưới client-side** (so `inProductionAt`→ngày VN); click lại / nút "Đang lọc dd/MM ✕" để bỏ. Badge 2 tab list + đơn hiển thị theo ngày đang chọn; KPI/dải/thống kê giữ nguyên. ⚠️ list cap 500/kỳ → nếu 1 ngày vượt cap, số ở dải (đếm chuẩn từ aggregate) có thể > số dòng hiện.
- **2 nhóm danh sách** (segmented, để support biết làm gì trước):
  1. **Cần làm lại** (In trả về) — ưu tiên (`source=tool-check + note=error`).
  2. **Chưa soát** — backlog (`toolResultNote` rỗng).
  - **Cột EDIT trực tiếp** (mirror thứ tự + cell của bảng "Đơn theo xưởng"): Mockup · Mã đơn · **Ưu tiên** (`PriorityBadge` + chip đếm ngược `formatCountdown`, chỉ hiển thị — sửa mức ưu tiên ở Bảng Workshop/Tab List, xem `Orders.md §17.2`; estimate bước `tool-check`, mốc `inProductionAt`, xem `Orders.md §17.4`) · Khách · Sản phẩm · Size/Màu · **Note kq Tool 1** (`ColorBadgeSelectCell`) · **File sửa lỗi** (`MultiIconSelectCell`) · **Ghi chú file lỗi** (`TextEditCell`) · **Lỗi xưởng** (`ProductionErrorSelectCell`). Support đổi Note kq Tool → 'ok' ngay tại đây → đơn về In (đổi list → refetch). Edit cell dùng chung `updateField` + `useWorkshopConfigStore` như bảng workshop; gate quyền qua `canEditField`. Cả 2 list sort `priority: -1` trước — đơn ưu tiên luôn lên đầu (xem `Orders.md §17.3`).
- **Thống kê lỗi Soát tool** (ô riêng dưới cùng) — **LỖI DO NGƯỜI SOÁT TOOL TẠO RA** = đơn **TỪNG bị đánh `toolResultNote` (Note kq Tool) ≠ ok (≠ rỗng)**, **KỂ CẢ đơn đã sửa về 'ok'** (khác trước chỉ đếm lỗi đang chờ / trạng thái hiện tại). Đếm **số ĐƠN riêng biệt** (dedup theo `orderId`). Lọc kỳ theo `inProductionAt`. 3 cột:
  1. **Theo khách hàng** — mỗi khách = cặp (`userSku`, `userEmail`), kèm số đơn lỗi. Click → lọc chéo cột 2 + 3.
  2. **Theo sản phẩm** — mockup + level + fullName + số đơn. Click → lọc chéo cột 1 + 3.
  3. **Theo loại lỗi** — mã note ≠ ok (`tool_result_note`: Lỗi / Không có tool / Không có file PDF / …) + số đơn (phản ánh khách/sản phẩm đang chọn). **Bấm 1 loại lỗi → mở panel chi tiết** bên dưới: bảng các ĐƠN dính note đó (dedup theo orderId, tôn trọng cross-filter khách/sản phẩm) — cột **Mã đơn** (+copy) · **Sản phẩm** (mockup+level+tên) · **Note lỗi** (`errorFileNote`). Nút "đóng" để tắt.
  - **Cross-filter client-side**: chọn Khách → 2 cột kia chỉ tính đơn của khách đó; chọn Sản phẩm → 2 cột kia chỉ tính đơn sản phẩm đó; nút "Bỏ lọc chéo". FE tự group từ flat rows `errorHistory` (không refetch), tất cả sort cao→thấp.
  - ⚠️ Chỉ tính thao tác TRỰC TIẾP của người soát (cell `toolResultNote` qua `updateField`/bulk); KHÔNG tính side-effect `toolResultNote='error'` tự set khi In báo "thiếu file" (đó là lỗi do In, thuộc `errorSource='tool-check'`).

## 3. API / Schema

| Method | Path                               | Auth                                            | Mô tả                                        |
| ------ | ---------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| GET    | `/v1/designer/tool-check-overview` | SuperAdmin/Admin/Manager/SupportManager/Support | Đơn In trả về + đơn chưa soát + thống kê lỗi |

Request `GetToolCheckOverviewDto` (`packages/shared/dtos/production-order.dto.ts`):

```ts
{ days: '7'|'14'|'30'; from?: string; to?: string; type?: string; customer?: string; machineNumber?: string; priority?: '1'|'2'|'3' }
```

Response `ToolCheckOverviewResDto.data`:

```ts
{
  checkedCount: number;          // toolCheckedAt ∈ kỳ
  errorCount: number;            // đang chờ support (= reworkList)
  reworkList: ToolCheckOrder[];  // In trả về (source=tool-check + note=error) — thêm machineNumber + priority, sort priority:-1 trước
  unreviewedList: ToolCheckOrder[]; // toolResultNote rỗng — cùng sort priority:-1 trước
  errorHistory: ToolCheckErrorRow[]; // LỊCH SỬ lỗi do người soát tool đánh (Note kq Tool ≠ ok, kể cả đã sửa) — flat rows: {orderId, productionId?, userSku?, userEmail?, type?, fullName?, mockup?, level?, code, codeLabel?, note?} (mỗi đơn × mã note ≠ ok; code=mã note, codeLabel=tên từ tool_result_note, note=errorFileNote cho panel chi tiết). FE tự group 3 cột + cross-filter + panel chi tiết theo loại lỗi.
  days: ToolCheckDayRow[];       // {day, unreviewed, rework} — dải theo ngày (mới→cũ)
  columnTotals: { unreviewed: number; rework: number };
  facets: {                      // options cho 4 dropdown (phạm vi chưa-soát∪tool-check, KHÔNG cross-narrow)
    type: ToolCheckFacet[];      // {value, count}
    customer: ToolCheckFacet[];
    machineNumber: ToolCheckFacet[];
    priority: ToolCheckFacet[];  // value = '1'|'2'|'3' (string hoá từ number qua $toString), sort theo _id desc
  };
  rangeDays: number;
}
```

BE `getToolCheckOverview` thêm: 2 aggregate `groupBy day` (unreviewed/rework, áp cùng 4 filter) + 4 aggregate facet (`facetAgg`/`priorityFacetAgg` trên `facetScope` = window + alive + `$or[toolResultNote∈[null,''], productionErrorSource='tool-check']`, KHÔNG áp type/customer/machine/priority). Tất cả gộp vào `Promise.all` sẵn có → 1 round-trip.

`errorSource` (shared `ErrorSourceZod`, entity `WorkshopConfigEntity.errorSource`, `productionErrorSource`) = `'designer' | 'factory' | 'tool-check'`.

## 4. UI Components

- **CategoryEditor** (`workshop-config`): nút chọn nguồn thêm "Do soát tool" (amber); `ErrorSourceBadge` case "SOÁT TOOL".
- **ProductionErrorSelectCell** / **ColorBadgeSelectCell**: badge "SOÁT TOOL" (amber) cho option `errorSource='tool-check'`.
- **ErrorSourceCell** (cell "Loại lỗi"): thêm option "Do soát tool" + hiển thị badge amber (admin override được).
- **ToolCheckTab**: xem §2.3 — reuse `ImageThumbCell`/`ImagePreviewDialog`/`CopyButton`/`PRODUCT_LEVEL_MAP`.

## 5. Backend logic

- **Hook rework-back tool-check** (`order.service.ts`): helper chung `buildDesignerReworkBackFromError(before, reason, ctx, target='tool-check')` + gate `canReworkBackToSupport(before)` (skip khi đã hold, tránh báo trùng). 3 call-site: `updateField('productionError')`, `updateField('productionErrorSource')`, `setProductionError`.
- **Bulk edit các field có side-effect** (`bulkUpdateField`): `updateMany` uniform KHÔNG tái hiện được side-effect phụ thuộc state từng đơn. Nên với **`toolResultNote` / `productionError` / `productionErrorSource`** → **delegate loop `updateField` per id** → bulk hành xử GIỐNG HỆT sửa từng cell:
  - `productionError` = "Thiếu file để in" cho N đơn → cột "Note kq Tool" tự thành **"lỗi"**, cột "Loại lỗi" tự thành **"do soát tool"**, cả N đơn đẩy về Support.
  - `productionError` loại designer → fire rework-back designer (trước đây bulk bỏ sót).
  - `toolResultNote`='ok' → readyForFulfill + entry fulfillment/clear stage + toolCheckedAt đúng per-đơn.
  - `assignee` + các field thuần config (printStatus, fabricType, máy…) giữ path `updateMany` nhanh (không có side-effect / assignee có dialog riêng).
- **Filter tab In** (`applyFulfillmentStatusFilter` — bảng In `PrintOrderTable`): `waiting` loại trừ `$nor:[{source:'tool-check', note:'error'}]`; `watching` thêm `$or:{source:'tool-check', note:'error'}`. Mirror trong `FulfillmentTaskService.applyTabFilter` (kanban, tab watching — `waiting` đã tự loại nhờ `readyForFulfill:true`).
- **Stats** (`DesignerStatsService.getToolCheckOverview`): 1 `countDocuments` + 2 `find` (rework/unreviewed, cap 500) + 1 `find` candidate lịch sử lỗi + 2 aggregate/facet ngày song song, rồi 1 `aggregate` OrderLog enrich mã lỗi. Loại đơn xoá/hủy bằng `{ deletedAt: null, cancelledAt: null }`.
  - **Nguồn lịch sử "lỗi do người soát tool tạo ra"** = field BỀN VỮNG **`Order.toolCheckErrorNotes: string[]`** (tập mã `toolResultNote` ≠ ok đã từng đánh, dedup; KHÔNG bị xoá khi sửa về 'ok') — thay cách đếm current-state cũ (`productionErrorSource` bị clear khi sửa → mất đơn đã sửa):
    - **Ghi (hook)** — `OrderService.updateField` nhánh `field='toolResultNote'`, `normalized` ≠ rỗng & ≠ 'ok' → `$addToSet toolCheckErrorNotes`. Bulk delegate per-id nên tự áp. KHÔNG chạm side-effect 'error' do In báo (nhánh `productionError`).
    - **Backfill** — `OrderService.onModuleInit`: nếu chưa đơn nào có field → `OrderLogRepository.aggregateToolCheckErrorNotes()` (group `field='toolResultNote', after ∉ [ok,'',null]` theo orderId, `$addToSet after`) → `bulkWrite $set` cho đơn chưa có. Idempotent.
    - **Đọc (stats)** — candidate = `orders.find({ inProductionAt ∈ kỳ, 'toolCheckErrorNotes.0':{$exists:true}, alive, +3 filter })` (cap 5000, log warn nếu chạm); flat rows = mỗi (đơn × mã note). Label mã note từ `workshop_config { category:tool_result_note }`; productConfig (mockup/level/fullName theo `productConfigId`) resolve như cũ. **Không cần join OrderLog khi đọc.**
- **Seed** (`workshop-config.seed.ts` + `WorkshopConfigService.onModuleInit`): tạo `tool-missing-file` idempotent khi boot.

## 6. Performance notes

- Overview: ~9 query song song. Candidate lịch sử lỗi bó theo `inProductionAt` + marker `toolCheckErrorNotes` (index; chỉ đơn đã lỗi → nhỏ), mã note nằm sẵn trên đơn → **không join OrderLog khi đọc**. List cap 500, errorHistory cap 5000 → payload nhỏ.
- Backfill `toolCheckErrorNotes` chạy 1 lần lúc boot (gate `exists`), aggregate OrderLog theo index `field` → không lặp lại các boot sau.
- Không cache (on-demand, tab ít truy cập).

## 7. Permissions

- `page.tool_check` (mới) — preset `Support` + auto Admin/SuperAdmin/Manager (ALL_PERMISSION_CODES). `RoleService.onModuleInit` sync khi boot.
- Endpoint `@Auth([SuperAdmin, Admin, Manager, SupportManager, Support])`.
- Tab FE gate `isAdmin || has('page.tool_check')`.
