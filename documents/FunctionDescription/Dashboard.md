# Dashboard — Function Description

> **File FE:** `apps/web/src/pages/home/index.tsx` (Tabs wrapper, 3 tab: `stats|status|factory`)
> **Tab A — Thống kê:** `apps/web/src/pages/home/OrderStatsTab.tsx`
> **Tab B — Tình trạng:** `apps/web/src/pages/home/OrderStatusTab.tsx` + `status/{KpiCard,BreakdownCard,FilterChipBar,OrdersMiniTable,useStatusFilter}.tsx`
> **Tab C — Đơn theo xưởng:** `apps/web/src/pages/home/OrderFactoryTab.tsx` + `apps/web/src/pages/home/exportOrders.ts` (XLSX builder)
> **File BE:** `apps/api/src/modules/order/order.service.ts` → `getDashboard()`, `getStatusOverview()`, `getFactoryOverview()`, `exportOrders()`, `transferOrder()`, `bulkTransferOrders()`
> **Route:** `/dashboard?tab=stats|status|factory`
> **API:**
>  - `GET /v1/orders/dashboard` (Tab A)
>  - `GET /v1/orders/status-overview` (Tab B)
>  - `GET /v1/orders/factory-overview` (Tab C)
>  - `GET /v1/orders/export` (Tab C — full-list export, không phân trang)
>  - `PATCH /v1/orders/:id/transfer` + `PATCH /v1/orders/bulk-transfer` (Tab C — chuyển xưởng)

---

## 1. Overview

Dashboard chia 3 tab độc lập:

### Tab A — "Thống kê đơn & sản phẩm" (cũ)
Tổng quan đơn theo kỳ thời gian:
- 4 metric card (đơn hàng / số lượng / chi phí SX / phí ship)
- Biểu đồ tròn phân bổ **xưởng → loại máy** (hover drill-down)
- Bảng nhóm theo **production type** (expand size / mockup / duplicate)
- Card **Top khách hàng đặt nhiều**
- Bộ lọc time range + search type + search user

Data từ `GET /v1/orders/dashboard`.

### Tab B — "Tình trạng đơn hàng" (Phase 6)
Thống kê + drill-down theo workshop fields:
- 4–6 **KPI card** đổi theo role (xem mục 5)
- **Filter chip bar** + date range
- **Grid breakdown card** đếm đơn theo từng workshop category (printStatus, toolResultNote, assignee, ...) + factory + machineType
- **Mini order list** (20 row/page) lọc theo filter hiện tại, có inline edit theo permission

Data từ `GET /v1/orders/status-overview` + `GET /v1/orders` (list).

### Tab C — "Đơn hàng theo xưởng" (Phase 7)
Dashboard chuyển xưởng + xuất Excel + filter chiều sâu:
- **3 Factory cards** (ML / TN / US) — mỗi card: tổng đơn đang sản xuất tại đó, pure, nhận từ xưởng khác, đã chuyển đi, distinct product/fabric/machine count, withTool count
- **Flow visualization** — danh sách luồng `(Từ xưởng → Đến xưởng, count, totalQuantity)`
- **Filter chip bar** factory `Tất cả / Đang ở ML / Đang ở TN / Đang ở US` + 4 select filter (Sản phẩm / Loại vải / Loại máy / Kết quả Tool) auto-scope theo factory chip đã chọn
- **Bảng đơn 20 cột** (reuse `WORKSHOP_COLS`) — cell inline edit theo permission
- **Bulk transfer** — checkbox row → toolbar `Send` mở Transfer dialog (chọn xưởng đích + lý do, tối đa 200 ký tự)
- **Xuất Excel** — bypass phân trang, gom toàn bộ đơn theo filter hiện tại + overview thành workbook .xlsx multi-sheet
- Date filters mặc định **= hôm nay** (`createdFrom = createdTo = todayISO()`) mỗi lần mount

Data từ `GET /v1/orders/factory-overview` + `GET /v1/orders?sort=grouped&...` + `GET /v1/orders/export` (khi bấm Xuất Excel).

---

## 2. Luồng hoạt động

### 2.1 Khởi tạo
```
User vào /dashboard
  → fetchDashboard({ startDate, endDate, searchType, searchUser })
  → BE: 1 aggregate pipeline trả về { totals, byType, byFactory, byUser, filter }
  → FE memoize chartData, mergedFactory, topUsers theo state
  → Render 4 sections song song
```

### 2.2 Đổi filter
```
User chọn date range / nhập search type / nhập search user / chọn Top N
  → debounce 300ms (search) hoặc immediate (date / topN)
  → Re-fetch dashboard
  → Skeleton loader hiển thị trong khi chờ
```

### 2.3 Hover pie chart (drill-down xưởng)
```
User di chuột vào 1 slice xưởng
  → activeShape lift slice + halo background
  → Side panel hiển thị danh sách loại máy của xưởng đó (machineTypeBreakdown)
  → Move ra ngoài → reset
```

---

## 3. API: `GET /v1/orders/dashboard`

### 3.1 Query params
| Param | Type | Mặc định | Mô tả |
|-------|------|----------|-------|
| `startDate` | ISO date string | đầu tháng hiện tại | Bao gồm |
| `endDate` | ISO date string | hôm nay | Bao gồm cuối ngày |
| `searchType` | string | — | Substring tên product type (case-insensitive) |
| `searchUser` | string | — | Substring `userSku` hoặc `userEmail` |

### 3.2 Response shape
```ts
{
  totals: {
    totalOrders: number;
    totalQuantity: number;
    totalProductionCost: number;
    totalShippingCost: number;
    totalCost: number;
  },
  byType: TypeSummary[];      // Bảng "Group by Production Type"
  byFactory: FactoryBreakdown[]; // Pie chart + drill-down
  byUser: UserBreakdown[];    // Top users card
  filter: { startDate, endDate, searchType, searchUser }
}
```

---

## 4. UI Components

### 4.1 Filter bar (top)
| Field | Component | Mô tả |
|-------|-----------|-------|
| Khoảng thời gian | shadcn `DateRangePicker` | Preset: hôm nay / 7 ngày / 30 ngày / tháng này |
| Tìm theo sản phẩm | shadcn `Input` | Substring match cho `type` |
| Tìm khách hàng | shadcn `Input` | Match `userSku` hoặc `userEmail` |
| Top N | shadcn `Select` | 3 / 5 / 10 / All |

### 4.2 Metric cards (4 ô uniform nhỏ)
- Card style: `rounded-lg`, `border-border`, `px-3 py-2.5`, h=68px
- Icon size 14 + nhãn 11px + giá trị 18px `tabular-nums`
- Skeleton khi loading

| Card | Source | Format |
|------|--------|--------|
| Đơn hàng | `totals.totalOrders` | `12,345` |
| Sản phẩm | `totals.totalQuantity` | `12,345 cái` |
| Chi phí SX | `totals.totalProductionCost` | `$12,345.67` |
| Phí vận chuyển | `totals.totalShippingCost` | `$12,345.67` |

### 4.3 FactoryDistribution (pie chart)
- Header: icon **Factory** (sky-100 box) + tiêu đề "Phân bổ theo xưởng"
- Recharts `PieChart` + `Pie` với `activeShape` lift + halo
- Click-disable focus outline (CSS override trong `globals.css`)
- `PIE_COLORS` — bảng màu tonal desaturated (không rainbow)
- Side panel: di chuột vào slice → hiển thị `byMachineType[]` với % và quantity

### 4.4 Group by Production Type table
- Layout: **CSS Grid div** (không phải `<table>`) để `position: sticky` scope đúng
- Sticky header row + sticky summary row khi expand
- `content-visibility: auto` cho rows ngoài viewport (perf)
- Expand row hiển thị:
  - **Sizes**: sort theo `sizeRank` (XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL)
  - **Mockups duy nhất**: ảnh + count
  - **Mockup trùng**: ảnh + count (mockups xuất hiện ≥ 2 đơn)
- Mỗi mockup click → mở `ImagePreviewDialog` (display URL + original URL)

### 4.5 TopUsersCard
- Header: icon **Crown** (violet-100 box) + tiêu đề "Khách hàng top đơn"
- Mỗi row:
  - `RankBadge` (Medal vàng/bạc/đồng cho 1/2/3, số plain cho 4+)
  - Avatar tròn 32px với initial 2 ký tự (màu hash từ tên)
  - Tên (truncate) — `displayName` lấy từ `userSku || userEmail`
  - Email subtitle 11px (chỉ hiện khi `userEmail !== displayName`)
  - Quantity badge bên phải + tổng chi phí
  - Progress bar violet (% so với user top 1)

---

## 5. Backend aggregation logic

### 5.1 Pipeline `getDashboard()`
```
$match { deletedAt: null, orderAt between [startDate, endDate], type ~ searchType, $or [userSku ~ searchUser, userEmail ~ searchUser] }
$facet {
  totals: $group { _id: null, totalOrders: $sum 1, totalQuantity: $sum quantity, ... }
  byType: $group by type → tính min/max/sum cost, unique mockups, duplicate mockups, sizes
  byFactory: $lookup factory + machineType → $group factory → nested $group machineType → tính %
  byUser: $group by userSku + userEmail → $sort orderCount desc
}
```

### 5.2 Helper functions
- **`sizeRank(size)`**: map S/M/L/XL/2XL/3XL/4XL/5XL → số để sort
- **`processDesigns(designs)`**: transform Drive URL → Teehub CDN URL + giữ lại original

### 5.3 Cache
- Key: `dashboard:${md5(query)}` → TTL 60s
- Invalidate: khi `createOrder`, `importOrders`, `deleteOrder`, `updateOrder`

---

## 6. Performance notes

| Tối ưu | Vị trí | Mục đích |
|--------|--------|----------|
| `React.memo` | `MetricCard`, `RankBadge`, `TopUserRow` | Tránh re-render khi parent thay đổi |
| `useMemo` | `chartData`, `topUsers`, `mergedFactory` | Tính toán nặng chỉ chạy khi deps đổi |
| `useCallback` | `onPieHover`, `setActiveIndex` | Stable ref cho child memo |
| `content-visibility: auto` | Bảng byType khi expand | Browser skip render off-screen rows |
| Native `title` attribute | Tooltip mockup | Nhẹ hơn Radix Tooltip x100 lần |
| Redis cache 60s | API dashboard | Tránh aggregate lặp lại |

---

## 7. Permissions

Page mở cho mọi role có `page.dashboard` (Admin, Manager, Support, Designer, Fulfillment). Decorator BE: `@Auth(ORDER_VIEW_ROLES)` cho 3 endpoint `dashboard` / `status-overview` / `factory-overview` / `export`.

Tab C — **chuyển xưởng** (`/:id/transfer`, `/bulk-transfer`) gắn `@Auth(ORDER_WRITE_ROLES)` (SuperAdmin / Admin / Manager / Support). FE check thêm bằng `isAdmin || has('order.transfer')` để ẩn checkbox + nút bulk transfer khỏi Designer/Fulfillment.

---

## 8. Tab B — Tình trạng đơn hàng (Phase 6)

### 8.1 Endpoint `GET /v1/orders/status-overview`

Query params (extends list filter):
- `printStatus`, `printStatusNote`, `toolResult`, `toolResultNote`, `errorFile`, `assignee`, `assigneeNote` — CSV codes (multi-select OR trong cùng category, AND giữa các category)
- `factoryId`, `machineTypeId`
- `readyForFulfill` (bool)
- `createdFrom`, `createdTo` (yyyy-mm-dd, mặc định 7 ngày gần nhất)
- `search`

Response:
```ts
{
  totals: {
    total, today, pendingToolOk, readyForFulfill, done, errors,
    byMachine: [{ machineCode, machineName, printed, pending }] // mini KPI cho Fulfill
  },
  breakdown: {
    printStatus, printStatusNote, toolResult, toolResultNote, errorFile, assignee, assigneeNote,
    factory: [{ factoryId, name, count }],
    machineType: [{ machineTypeId, name, count }],
    readyForFulfill: [{ key: boolean, count }]
  },
  filter: { ... echo back ... }
}
```

### 8.2 Aggregation (`getStatusOverview()`)
1. Build base match (visibility filter theo role + query filters).
2. `$facet` 16 nhánh chạy SONG SONG: 6 KPI count + 9 breakdown group + 1 ready breakdown — 1 round-trip DB.
3. Hậu xử lý FE-friendly:
   - Workshop codes → name + color + icon qua `WorkshopConfigRepository.findAll()` (1 bulk fetch, build Map).
   - Factory / MachineType codes → name qua direct collection query.
   - Per-machine KPI cho Fulfillment: lọc `printStatus` buckets theo whitelist `machine-1..4, machine-94`.

### 8.3 Per-role KPI cards (FE)

| Role | KPI |
|------|-----|
| Admin / Manager / Support | Tổng đơn · Hôm nay · Chờ Ok Tool · Sẵn sàng in · Đã in xong · Lỗi cần xử lý |
| Designer | Cần check · Ok hôm nay · Đơn lỗi · Tổng (range) |
| Fulfillment | Sẵn sàng in · Đã in xong · Đơn hôm nay · Tổng (range) **+ mini KPI từng máy**. Cell `toolResultNote` (Note kq Tool 1) hiển thị inline-edit để Fulfillment cập nhật tình trạng đơn sau khi in. |

### 8.4 Breakdown card visibility

Mỗi card render conditional theo `usePermission().canViewField(field)`:
- Designer: ẩn `printStatus`, `printStatusNote` (vì không phải việc của Designer)
- Fulfillment: ẩn `toolResult*`, `errorFile*`, `assignee*`
- Support: thấy tất cả (view-only)
- Admin / Manager: thấy tất cả

Factory + MachineType breakdown chỉ hiển thị cho user có `order.view_admin_table` hoặc isAdmin.

**Lưu ý mặc định range:** từ Phase 7, `useStatusFilter` mặc định **hôm nay** (`todayISO()` dùng local-date components, không phải `toISOString()`) thay vì 7 ngày để khớp hành vi với Tab A/C. Designer/Fulfill vẫn được BE giữ cửa sổ 7 ngày qua `buildVisibilityFilter` nếu client không gửi date override.

### 8.5 Filter state — `useStatusFilter` hook

```ts
const { filter, queryString, isActive, toggle, setScalar, clearAll } = useStatusFilter();
```

- State đồng bộ với URL searchParams → reload/share giữ nguyên filter.
- `toggle(category, code)`: thêm/bớt code vào CSV của category đó.
- `setScalar('createdFrom' | 'createdTo' | 'factoryId' | ..., value)`: scalar field.
- `queryString` đã build sẵn `'?printStatus=...&toolResultNote=ok&...'` để pass trực tiếp vào API.

Default range: 7 ngày gần nhất (khớp với BE visibility cho Designer/Fulfill).

### 8.6 OrdersMiniTable (dưới breakdown)

Mini list với 10–11 cột cố định:
- Production ID · User SKU · Size · Mockup (thumb) · Type · Nhà máy · Phòng
- Trạng thái in (nếu có `printStatus.view`)
- Note Tool (nếu có `toolResultNote.view`)
- Người TH (nếu có `assignee.view`)
- Cột action (History dialog)

Inline edit dùng `ColorBadgeSelectCell` / `IconSelectCell` từ Phase 4 — vẫn theo `canEditField` permission.

### 8.7 Cell sync giữa các tab/component

Optimistic update qua callback `onUpdated(newValue)` → patch row local state. Khi user chuyển breakdown filter, OrdersMiniTable tự reload qua `queryString` thay đổi.

---

## 9. Performance Tab B

| Tối ưu | Vị trí |
|--------|--------|
| 1 round-trip cho overview | `$facet` 16-branch aggregation |
| Parallel overview + list | 2 fetch chạy song song khi filter đổi |
| Workshop name resolve | 1 bulk fetch all configs vào Map; lookup O(1) |
| URL state thay vì component state | Refresh / back-forward không mất filter |
| Optimistic update cell | Không re-fetch toàn list khi sửa 1 field |

---

## 10. Tab C — Đơn hàng theo xưởng (Phase 7)

### 10.1 Khái niệm chuyển xưởng

Mỗi order có 2 field factory:
- `factoryId` — xưởng **hiện tại** đang sản xuất (mutable qua transfer).
- `originalFactoryId` — xưởng **gốc** tại lúc import (immutable, backfill bằng `factoryId` cho legacy rows ở `OrderService.onModuleInit()`).

Phân loại đơn:
- **Pure** — `factoryId === originalFactoryId` (chưa chuyển).
- **Transferred** — `factoryId !== originalFactoryId`.
  - Với từng xưởng X: `transferredIn` = đơn `factoryId=X, originalFactoryId≠X`; `transferredOut` = `originalFactoryId=X, factoryId≠X`.

### 10.2 Endpoint `GET /v1/orders/factory-overview`

Query: `createdFrom`, `createdTo`, `factoryId?` (chỉ scope `availableFilters` — cards + flow giữ global).

Response `FactoryOverview` (shared DTO `production-order.dto.ts`):
```ts
{
  totals: { total, transferred, pure },
  factories: FactoryOverviewCell[],  // 1 cell / factory
  flows: FactoryFlow[],              // origin→current pairs (count > 0, from ≠ to)
  availableFilters: {
    products:    { value, label, count }[],
    fabrics:     { ... },
    toolResults: { ... },
    machineTypes:{ ... }
  }
}

FactoryOverviewCell = {
  factoryId, factoryName, factoryShortName,
  total, pure, transferredIn, transferredOut,
  productCount, fabricCount, machineCount, withToolCount,
  // 3 print stage — disjoint, cộng lại = total (Phase 7.1)
  notPrintedCount,   // printStatus null/empty
  printingCount,     // printStatus tồn tại nhưng KHÔNG ∈ PRINTED_MACHINE_CODES
  printedCount,      // printStatus ∈ PRINTED_MACHINE_CODES
  // Lỗi xưởng — Phase 8. Đếm độc lập với 3 print stage.
  errorCount,        // productionError tồn tại và khác empty
  breakdowns: { products, fabrics, sizes, toolResults }  // top 20 mỗi dimension
}
```

Aggregation chính (`OrderService.getFactoryOverview`):
1. `$match` theo `createdAt` range + `factoryId, originalFactoryId` đều tồn tại + (`readyForFulfill=true` nếu role là Fulfillment).
2. `$group` theo `(originalFactoryId, factoryId)` → bảng flow.
3. Bulk fetch tên factory từ collection `factories`.
4. Duyệt flow rows để xây `cellMap` (pure / in / out / total).
5. Aggregation song song:
   - **statRows** — distinct types/fabrics/machines + withToolCount per factory (`toolResult ∈ toolHasCodes` với `toolHasCodes = workshop_config { category=tool_result, name ~ '^Có' }`).
   - **4 breakdownRows** — group `(factoryId, value)` cho products / fabrics / sizes / toolResults.
   - **4 optionRows** — distinct values theo `filterMatch` (= match + `factoryId` nếu user đã chọn chip).
6. Resolve fabric/tool codes → name qua `WorkshopConfigRepository.findAll({ category })`, machine ID → `shortName · name` qua collection `machineTypes`.

### 10.3 Endpoint `GET /v1/orders/export`

Cùng filter shape như `GET /v1/orders` (kế thừa `buildOrderListFilter` + `buildVisibilityFilter`), **bỏ phân trang**, populate `factory / machineType / productConfig`. FE giới hạn payload bằng cách giữ filter chặt (date range + factory chip + selects).

Sort `{ type:1, size:1, fabricType:1, createdAt:-1 }` để file Excel xuất ra đã nhóm sẵn.

### 10.4 Endpoint chuyển xưởng

| Method | Path | Body | Mô tả |
|--------|------|------|-------|
| PATCH | `/v1/orders/:id/transfer` | `{ targetFactoryId, reason? }` | Đổi `factoryId` cho 1 order; nếu trùng target trả `modified: 0`. |
| PATCH | `/v1/orders/bulk-transfer` | `{ ids[], targetFactoryId, reason? }` | Pre-filter ID đã ở target (skip no-op), `updateMany` phần còn lại. |

Cả 2 đều:
- Ghi `OrderLog` `action='transfer'` (xem `OrderLog.md`) với `before={factoryId}`, `after={factoryId, reason}`.
- Gọi `invalidateListCache()` để clear cache `orders:list:*`.

### 10.5 UI components Tab C

| Section | Component | Mô tả |
|---------|-----------|-------|
| Date range bar | `Input type=date` x2 + `RefreshCw` + `Download` | Default = today. Nút `Tải lại` re-fetch overview + rows. |
| Factory cards | `FactoryCard` (3 cards horizontal) | Click số chính → set `filterMode={kind:'at', factoryId}`. Click ô "Nhận từ xưởng khác" / "Đã chuyển đi" → `{kind:'in'\|'out', factoryId}`. 3 button "Chưa in / Đang in / Đã in xong" → `{kind:'print', factoryId, stage}` để drill-down list theo trạng thái in. |
| Flow visualization | Button rows | `[fromShortName] → [toShortName]` + `count + totalQuantity`. Click → filter `{kind:'in', factoryId=to}`. |
| Filter chip bar | `FilterChip` (`Tất cả` + 1 chip/factory) + 4 `SelectFilter` | Selects auto-reset khi đổi factory chip để tránh combo zero-result. |
| Bulk toolbar | Toolbar sticky khi `selected.size > 0` | Chỉ render khi `canTransfer = isAdmin \|\| has('order.transfer')`. |
| Table | `Table` với 1 cột "Xưởng (đang / gốc)" + `WORKSHOP_COLS` filtered theo `canViewField` + cột History | Row có `originalFactoryId !== factoryId` hiện badge `warning` + `← Gốc: shortName`. |
| `TransferDialog` | `Dialog` | Select target + Input lý do (max 200). Gọi `bulkTransferOrders({ids, targetFactoryId, reason})`. |

### 10.6 Filter mode → query params

`FilterMode` (FE-only union):
- `{kind:'all'}` → không gửi `factoryId`/`transferStatus`.
- `{kind:'at', factoryId}` → `?factoryId=…` (đơn đang ở X).
- `{kind:'in', factoryId}` → `?transferStatus=transferred-in:<fid>`.
- `{kind:'out', factoryId}` → `?transferStatus=transferred-out:<fid>`.
- `{kind:'print', factoryId, stage}` → `?factoryId=…&printStage=printed|printing|not-printed` (drill-down theo trạng thái in tại xưởng X).

BE (`OrderService.buildOrderListFilter`) parse `transferStatus` thành `$expr` so sánh `originalFactoryId` vs `factoryId`. Xem `Orders.md §7.x` để biết các token (`transferred / pure / transferred-in:<fid> / transferred-out:<fid>`).

### 10.7 Excel export — multi-sheet workbook

File: `apps/web/src/pages/home/exportOrders.ts` (dùng `xlsx` SheetJS).

Hàm chính: `buildWorkbook(orders, overview, { resolve })` → `XLSX.WorkBook`. Resolve workshop codes thành tên người dùng qua `useWorkshopConfigStore.resolve`. Tải về qua `downloadWorkbook(filename, wb)` → `XLSX.writeFile(..., { bookType:'xlsx' })`.

Cấu trúc workbook:

| Sheet | Mô tả | Cấu trúc |
|-------|-------|----------|
| **Tổng quan** | Snapshot scope hiện tại | TỔNG QUAN (total/pure/transferred) → bảng `(Xưởng, Mã, Tổng, Pure, Nhận vào, Chuyển đi, Sản phẩm, Loại vải, Loại máy, Có tool)` → bảng `LUỒNG CHUYỂN XƯỞNG (Từ, Đến, Số đơn, Tổng sản phẩm)`. |
| **Breakdown** | Long-form pivotable | 4 cột `(Xưởng, Loại, Giá trị, Số đơn)` × mỗi factory × `{Sản phẩm, Loại vải, Size, Kết quả Tool}`. |
| **Chi tiết đơn** | Detail dump 21 cột | Production ID · User SKU · Size · Trạng thái in · Note Trạng thái in · Kết quả Tool · Note kq Tool 1 · File sửa lỗi · Ghi chú file lỗi · Color · Người thực hiện · Note người thực hiện · Type · Mockup · Design Front · Order ID · In Production At · Type.1 · Nhà máy · Phòng · Loại vải. |
| **[shortName]** × N | 1 sheet / factory (`sanitizeSheetName` cắt 31 ký tự + thay `:\/?*[]` → `_`) | Header xưởng + dòng `(Tổng, Pure, Nhận vào, Chuyển đi)` + bảng 4 cột song song `Sản phẩm / Loại vải / Size / Kết quả Tool`. |

Tên file: `don-hang-YYYY-MM-DD-HH-MM-SS.xlsx` (timestamp lấy bằng `toLocaleString('sv-SE')` → ISO-like local time).

Trước khi gọi: nếu `data.length === 0` toast warning, không build workbook.

### 10.8 Performance Tab C

| Tối ưu | Vị trí |
|--------|--------|
| Tránh re-fetch overview khi đổi page/pageSize | `overviewQuery` chỉ phụ thuộc `(createdFrom, createdTo, filterMode)` |
| Reset `selectFilters` khi đổi factory chip | `useEffect([filterMode])` — tránh combo zero-result phải debug |
| Workshop config store load 1 lần | `useEffect` check `loaded` trước khi gọi `load()` |
| Bulk transfer pre-filter | Skip ID đã ở target → không ghi log no-op |
| Indeterminate progress bar khi `rowsLoading` | Giữ UI mượt thay vì block toàn bảng |
| Sort `grouped` trên list | BE sort `(type, size, fabricType)` để đơn cùng combo gom liền nhau |
| Export bypass phân trang nhưng giữ visibility filter | BE chia query → tránh client tải 10k rows × 20 page |

### 10.9 Print stage drill-down (Phase 7.1)

3 button trong mỗi `FactoryCard` — disjoint, cộng lại = `total`:

| Button | Định nghĩa BE | Tone (FE) |
|--------|----------------|-----------|
| **Chưa in** | `printStatus` null/empty/missing | slate |
| **Đang in** | `printStatus` tồn tại, KHÔNG ∈ `PRINTED_MACHINE_CODES` | sky |
| **Đã in xong** | `printStatus` ∈ `PRINTED_MACHINE_CODES` = `['machine-1', 'machine-2', 'machine-3', 'machine-4', 'machine-94']` | emerald |

Constant `PRINTED_MACHINE_CODES` ở module-level `order.service.ts` — dùng chung giữa `getStatusOverview()`, `getFactoryOverview()` (statRows aggregation), và `buildOrderListFilter()` (filter `printStage` query) để 3 chỗ luôn nhất quán.

Click button → `FilterMode = { kind: 'print', factoryId, stage }`:
- Bảng đơn lọc theo xưởng đó + stage.
- Chip "Đang ở Xưởng X" cũng active (vì scope vẫn ở xưởng).
- 4 select filter `availableFilters` (sản phẩm/vải/máy/tool) thu hẹp về options thực sự có trong (xưởng × stage) — `GetFactoryOverviewDto.printStage` thread xuống `filterMatch`.

Click chip "Đang ở X" lúc đang ở print mode → switch về `kind:'at'` (giữ xưởng, bỏ stage). Click button stage đang active → reset về `kind:'all'`.

### 10.10 Lỗi xưởng (Phase 8)

Xưởng (role Fulfillment) báo lỗi đơn hàng sau khi nhận file: chọn mã lý do (workshop_config `category=production_error`) + nhập mô tả tự do.

**Schema** (`OrderEntity`):
```ts
productionError?: string;       // code (wrong-size / wrong-color / print-misalign / fabric-damage / machine-jam / other...)
productionErrorNote?: string;   // free text mô tả chi tiết
```

Đơn được coi là "có lỗi" ⇔ `productionError` tồn tại và khác `null` / `''`. Không có boolean flag riêng — chỉ check sự tồn tại của `productionError`.

**Mã lý do default** (seed `workshop-config.seed.ts`, color badge):

| Code | Tên hiển thị | Màu |
|------|--------------|-----|
| `wrong-size` | Sai size | `#EF4444` |
| `wrong-color` | Sai màu | `#F97316` |
| `wrong-fabric` | Sai loại vải | `#F59E0B` |
| `print-misalign` | In lệch | `#DC2626` |
| `print-blur` | In mờ/nhòe | `#B91C1C` |
| `fabric-damage` | Vải lỗi/rách | `#A855F7` |
| `wrong-design` | Sai design | `#7C3AED` |
| `missing-design` | Thiếu file design | `#9333EA` |
| `machine-jam` | Máy lỗi/kẹt | `#0EA5E9` |
| `other` | Lỗi khác | `#64748B` |

**Permission codes** (catalog):
- `order.field.productionError.view / .edit` — Fulfillment + admin.
- `order.field.productionErrorNote.view / .edit` — Fulfillment + admin.

**Filter trên list endpoint** (`GetProductionOrdersDto`):
- `productionError=wrong-size,print-misalign` — CSV codes.
- `hasError=true` — tất cả đơn có productionError. (`hasError=false` không support — không lọc tức là "tất cả".)

**Factory tab — nút "Lỗi xưởng" thay vị trí "Đang in":**

| Ô (mỗi card) | Filter mode | Query |
|--------------|-------------|-------|
| Chưa in | `{kind:'print', stage:'not-printed'}` | `factoryId + printStage` |
| **Lỗi xưởng** (mới) | `{kind:'error', factoryId}` | `factoryId + hasError=true` |
| Đã in xong | `{kind:'print', stage:'printed'}` | `factoryId + printStage` |

Card hiện `cell.errorCount` ở giữa (tone `rose`); active khi `filterMode.kind === 'error' && factoryId match`. Chip "Đang ở Xưởng X" cũng active đồng thời (giữ context xưởng).

URL params: `fmode=error&ffactory=<id>` (cùng namespace `f*` với các filter khác của Tab C).

**Status tab (Tab B):**
- Toggle nhanh "Lỗi cần xử lý" (button rose) trong `<FilterChipBar>` — đặt `hasError=true` URL param.
- Breakdown card "Lỗi xưởng" hiện 10 lý do hàng đầu (mode color). Click code → toggle `productionError` CSV filter.
- KPI "Lỗi cần xử lý" giờ đếm cả `productionError` (cộng dồn với `toolResultNote='error'` và `errorFile != null`).

**Cách aggregation đếm `errorCount`** (`getFactoryOverview` statRows):
```js
errorCount: { $sum: { $cond: [
  { $ne: [{ $ifNull: ['$productionError', ''] }, ''] }, 1, 0
]}}
```

---

## 11. URL state persistence (Phase 7.2)

### 11.1 Param namespace per tab

Mỗi tab có **prefix riêng** để các param không clash khi user switch tab. Parent `home/index.tsx` `handleTabChange` strip param của 2 tab kia mỗi lần đổi tab.

| Tab | Prefix | Params |
|-----|--------|--------|
| Stats (`OrderStatsTab`) | `s` | `sfrom`, `sto`, `stype`, `suser` |
| Status (`useStatusFilter`) | _không prefix_ | `createdFrom`, `createdTo`, `printStatus`, `printStatusNote`, `toolResult`, `toolResultNote`, `errorFile`, `assignee`, `assigneeNote`, `factoryId`, `machineTypeId`, `readyForFulfill`, `search` |
| Factory (`OrderFactoryTab`) | `f` | `ffrom`, `fto`, `ffactory`, `fmode`, `fstage`, `ftype`, `ffabric`, `ftool`, `fmachine`, `fpage`, `fsize` |

### 11.2 Pattern sync state ↔ URL

Mỗi tab dùng pattern thống nhất:

```ts
// 1) Initial state đọc URL → fallback default
const [createdFrom, setCreatedFrom] = useState(
  () => searchParams.get('ffrom') || todayISO()
);

// 2) Sync ngược state → URL (1 useEffect, replace để không spam history)
useEffect(() => {
  setSearchParams((prev) => {
    const sp = new URLSearchParams(prev);
    // Date LUÔN ghi vào URL (kể cả today) để URL reflect đúng state user thấy.
    createdFrom ? sp.set('ffrom', createdFrom) : sp.delete('ffrom');
    // ... các param khác
    return sp;
  }, { replace: true });
}, [createdFrom, ...]);

// 3) Guard `isFirstRender ref` cho useEffect cleanup (vd. setPage(1) khi
//    filterMode đổi) — skip render đầu để không ghi đè URL params mới load.
```

### 11.3 Phân loại param: strip default vs always-write

| Loại | Quy tắc | Lý do |
|------|---------|-------|
| **Date** (`*from`, `*to`, `createdFrom/To`) | **Luôn ghi vào URL** (kể cả today) | URL phải hiển thị explicit ngày đang xem để share link / copy URL không gây nhầm |
| **Filter chips/selects** (workshop codes, factory, stage, ...) | Strip khi rỗng/default | URL gọn khi không filter |
| **Pagination** (`*page`, `*size`) | Strip khi `page=1`/`size=20` | Default state không cần param |
| **Search** | Strip khi rỗng | Default state không cần param |

### 11.4 Default = today cho mọi date filter

4 tab (Stats / Status / Factory + Workshop tab ở Orders module) đều default `createdFrom = createdTo = todayISO()`. Helper `todayISO()` dùng local date components — KHÔNG dùng `toISOString()` (UTC) vì sẽ lệch ngày khi ở Việt Nam buổi sáng.

### 11.5 Ví dụ URL khôi phục đầy đủ

```
/dashboard?tab=stats&sfrom=2026-06-15&sto=2026-06-18&stype=Tee&suser=user@gmail
/dashboard?tab=status&createdFrom=2026-06-15&createdTo=2026-06-18&printStatus=in-progress&factoryId=...
/dashboard?tab=factory&ffrom=2026-06-15&fto=2026-06-18&ffactory=...&fstage=printed&ftype=Hoodie
```

F5 cả 3 URL trên đều khôi phục đúng state → user share link không lo mất filter.

---

## 12. UI components dùng chung (Phase 7.2)

### 12.1 `<DateRangePicker>` — `apps/web/src/components/common/DateRangePicker.tsx`

Popover gói gọn cả 8 preset + 2 input "Từ/đến" trong 1 trigger button.

- **Trigger**: `<Button>` hiển thị smart label
  - Khớp preset → tên preset (vd. "Tuần này")
  - Range custom → `dd/mm/yy → dd/mm/yy`
  - Rỗng → placeholder
- **Popover content**:
  - Grid 4×2 nút preset (Hôm nay / Hôm qua / Tuần này / Tuần trước / Tháng này / Tháng trước / Năm nay / Năm trước) — click preset → apply ngay + đóng popover.
  - 2 `<Input type="date">` với buffer state `(draftFrom, draftTo)` — gõ KHÔNG trigger fetch, đợi "Áp dụng".
  - Nút "Xóa" (nếu `clearable && hasValue`) reset `('', '')`.
- Preset definitions: `apps/web/src/utils/dateRangePresets.ts` (`DATE_PRESETS` + `matchPreset()`). Tuần bắt đầu thứ Hai (ISO/VN).

Đã thay thế block `2 Input + nút preset` ở 4 chỗ: Stats / Status / Factory tab + `OrderTableWorkshop`.

### 12.2 `<PaginationBar>` — `apps/web/src/components/common/PaginationBar.tsx`

Wrapper đóng gói `<Pagination>` + khung phù hợp cho top/bottom của table.

```tsx
<PaginationBar position="top" {...paginationProps} />
<div className="rounded-lg border border-border bg-card">
  <Table>...</Table>
  <PaginationBar position="bottom" {...paginationProps} />
</div>
```

- `position="top"` → standalone card có viền + nền (đặt trên cụm table).
- `position="bottom"` → dải có `border-t` (đặt trong card của table).
- Auto ẩn khi `total <= 0` hoặc `loading=true` (tránh nhấp nháy).

Áp dụng cho 4 table: `ListOrderTab`, `OrderTableWorkshop`, `OrderFactoryTab`, `OrdersMiniTable` (tất cả đều có top + bottom).

### 12.3 `<MultiSelectFilter>` — `apps/web/src/components/common/MultiSelectFilter.tsx`

Popover multi-select thay thế cho "FilterChips dàn ngang chiếm chiều ngang".

- **Trigger button**: `Label: A, B +N` + badge số đếm khi có chọn.
- **Popover content**: search bar + checkbox list + footer "Chọn tất cả · N/Total".
- `renderType='color'` → chấm tròn màu trước tên (khớp `workshop_config.color`).
- Auto ẩn khi `options.length === 0`.

> **Lưu ý hook order**: tất cả `useMemo` PHẢI khai báo TRƯỚC `if (options.length === 0) return null` để tránh React error "Rendered more hooks than during the previous render" khi options load async.

Đã thay thế `FilterChips` (custom inline) trong `OrderTableWorkshop` cho 3 filter `printStatus` / `toolResultNote` / `assignee`.
