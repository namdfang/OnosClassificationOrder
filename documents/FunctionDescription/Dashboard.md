# Dashboard — Function Description

> **File FE:** `apps/web/src/pages/home/index.tsx` (Tabs wrapper)
> **Tab A — Thống kê:** `apps/web/src/pages/home/OrderStatsTab.tsx`
> **Tab B — Tình trạng:** `apps/web/src/pages/home/OrderStatusTab.tsx` + `status/{KpiCard,BreakdownCard,FilterChipBar,OrdersMiniTable,useStatusFilter}.tsx`
> **File BE:** `apps/api/src/modules/order/order.service.ts` → `getDashboard()`, `getStatusOverview()`
> **Route:** `/dashboard?tab=stats|status`
> **API:** `GET /v1/orders/dashboard`, `GET /v1/orders/status-overview`

---

## 1. Overview

Dashboard chia 2 tab độc lập:

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

Page mở cho mọi role có `page.dashboard` (Admin, Manager, Support, Designer, Fulfillment). Decorator BE: `@Auth(ORDER_VIEW_ROLES)` cho cả 2 endpoint dashboard/statusOverview.

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
| Fulfillment | Sẵn sàng in · Đã in xong · Đơn hôm nay · Tổng (range) **+ mini KPI từng máy** |

### 8.4 Breakdown card visibility

Mỗi card render conditional theo `usePermission().canViewField(field)`:
- Designer: ẩn `printStatus`, `printStatusNote` (vì không phải việc của Designer)
- Fulfillment: ẩn `toolResult*`, `errorFile*`, `assignee*`
- Support: thấy tất cả (view-only)
- Admin / Manager: thấy tất cả

Factory + MachineType breakdown chỉ hiển thị cho user có `order.view_admin_table` hoặc isAdmin.

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
