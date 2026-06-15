# Plan — Dashboard Tab "Tình trạng đơn hàng" (Order Status)

> **Tạo:** 2026-06-13
> **Phạm vi:** Restructure `/dashboard` thành 2 tab; thêm tab thống kê tình trạng đơn theo workshop fields; per-role view; filter drill-down + danh sách đơn bên dưới.
> **Ước tính:** ~3 ngày dev (1 BE + 1.5 FE + 0.5 docs/test).

---

## 1. Mục tiêu

1. **Refactor `/dashboard`** từ trang đơn → 2 tab:
   - Tab A — "Thống kê đơn & sản phẩm" (giữ nguyên dashboard hiện tại).
   - Tab B — "Tình trạng đơn hàng" (MỚI).
2. Tab B hiển thị bảng đếm đơn theo **mọi workshop field** (printStatus, printStatusNote, toolResult, toolResultNote, errorFile, assignee, assigneeNote) + factory + machineType + readyForFulfill.
3. Click 1 ô count → áp filter → bảng đơn bên dưới list ra các đơn matched.
4. Multi-filter combine (status + factory + machineType + assignee...).
5. Per-role: Support / Designer / Fulfill / Admin xem layout + KPI cards khác nhau (focus đúng việc của họ).

---

## 2. Layout chung tab "Tình trạng đơn hàng"

```
┌─────────────────────────────────────────────────────────────────┐
│  Khung 1: KPI cards (4–6 card)                                 │
│  Số liệu thay đổi theo role (xem mục 4)                        │
├─────────────────────────────────────────────────────────────────┤
│  Khung 2: Filter bar — active chips + date range + clear all   │
├─────────────────────────────────────────────────────────────────┤
│  Khung 3: Grid 2–3 cột bảng breakdown                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ printStatus  │  │ toolResultN. │  │ assignee     │         │
│  │ • Chưa in 42 │  │ • Ok      80 │  │ • Huy     12 │         │
│  │ • Máy 1   18 │  │ • Lỗi     14 │  │ • H Anh   18 │         │
│  │ ...          │  │ ...          │  │ ...          │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  + tương tự cho factory / machineType / readyForFulfill        │
├─────────────────────────────────────────────────────────────────┤
│  Khung 4: Danh sách đơn (mini OrderTableWorkshop)               │
│  Hiển thị các đơn match toàn bộ filter trên, có pagination     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Mỗi card breakdown
- Header: tên category + total count.
- Body: list row `{ name | count | bar | %, click to toggle filter }`.
- Row state:
  - **Selected** (đã filter): nền `bg-primary/10`, border-l primary, badge "active".
  - **Hover**: bg-accent.
- Click 1 row → toggle code đó vào filter category đó. Click code khác cùng category → multi-select (OR).
- Click chip ở filter bar (X) → bỏ filter.

### 2.2 Filter bar
- Chip danh sách: `Trạng thái in: Chưa in × | Máy 1 × | Note Tool: Ok ×`.
- Date range: from / to (mặc định 7 ngày gần nhất).
- Nút "Clear all".
- URL sync: `?printStatus=not-printed,machine-1&toolResultNote=ok&from=...`.

### 2.3 Danh sách đơn bên dưới
- Component tái dùng phần render của `OrderTableWorkshop` nhưng:
  - Cố định 8 cột chính (productionId, userSku, size, type, factory, printStatus, toolResultNote, assignee) — không cho hide.
  - Cell vẫn dùng `ColorBadgeSelectCell` / `IconSelectCell` cho phép sửa nhanh ngay tại dashboard (vẫn theo permission).
  - Pagination 20 row/page.
  - Header sticky.

---

## 3. KPI cards theo role

### 3.1 Admin / Support (full visibility)
1. **Tổng đơn (range)** — số đơn trong khoảng filter.
2. **Hôm nay**: số đơn mới hôm nay.
3. **Chờ Ok Tool**: count toolResultNote != 'ok' (đang chờ Designer).
4. **Sẵn sàng in (ready)**: `readyForFulfill=true` AND `printStatus != 'machine-*'` (chưa in).
5. **Đã in xong**: printStatus thuộc nhóm "Đã in máy X".
6. **Lỗi (cần xử lý)**: toolResultNote='error' OR errorFile != null.

### 3.2 Designer
1. **Hàng đợi của tôi** — toolResult != null AND toolResultNote = null (đơn đang xử lý).
2. **Chưa check tool** — toolResult = null trong 7 ngày qua.
3. **Ok hôm nay** — toolResultNote='ok' AND createdAt=today.
4. **Lỗi cần fix** — toolResultNote='error' AND errorFile = null.
5. **File lỗi đã chọn** — errorFile != null nhưng chưa Ok.

### 3.3 Fulfill
1. **Sẵn sàng in** — `readyForFulfill=true` AND printStatus chưa có giá trị "máy X".
2. **Đã in hôm nay** — printStatus thuộc "máy 1..94" AND updatedAt=today.
3. **Theo máy** — KPI mini từng máy (#đơn đã in / chưa in trên máy đó) → có thể inline 5 mini card.
4. **Tổng đơn hôm nay**.

> Designer không thấy KPI thiên về print; Fulfill không thấy KPI tool/file. Mapping ẩn/hiện theo permission `order.field.*.view`.

---

## 4. BE API design

### 4.1 Endpoint mới
```
GET /v1/orders/status-overview?<filters>
```

**Query params** (reuse + extend của `GetProductionOrdersDto`):
- `printStatus`, `printStatusNote`, `toolResult`, `toolResultNote`, `errorFile`, `assignee`, `assigneeNote` (CSV codes)
- `factoryId`, `machineTypeId`
- `readyForFulfill` (bool)
- `createdFrom`, `createdTo`
- `search`

**Response:**
```ts
{
  success: true,
  data: {
    totals: {
      total: number;            // tổng matched filter
      today: number;
      pendingToolOk: number;
      readyForFulfill: number;
      done: number;
      errors: number;
      byMachine?: Array<{ machineName: string; printed: number; pending: number }>;
    },
    breakdown: {
      printStatus:        Array<{ code: string|null; name: string; count: number }>;
      printStatusNote:    Array<{ ... }>;
      toolResult:         Array<{ ... }>;
      toolResultNote:     Array<{ ... }>;
      errorFile:          Array<{ ... }>;
      assignee:           Array<{ ... }>;
      assigneeNote:       Array<{ ... }>;
      factory:            Array<{ factoryId?: string; name: string; count: number }>;
      machineType:        Array<{ machineTypeId?: string; name: string; count: number }>;
      readyForFulfill:    Array<{ key: boolean; count: number }>;
    },
    filter: { ... echo back ... }
  }
}
```

### 4.2 Aggregation logic (`OrderService.getStatusOverview`)
1. Build base match từ visibility filter (theo role) + query filters.
2. Single `$facet` aggregation chạy 10 group song song trên cùng match — 1 round-trip DB.
3. Hậu xử lý:
   - Resolve `code` → `name` qua workshop_config store (BE inject `WorkshopConfigRepository.findByCodes()`).
   - `factory` / `machineType` join name từ collections tương ứng.
   - Bao gồm cả buckets `null` (đơn chưa set field đó) — quan trọng để user thấy "chưa được phân loại bao nhiêu".

### 4.3 Endpoint danh sách đơn (đã có)
Tái dùng `GET /v1/orders` với cùng query filters → list view dưới. Không cần API mới.

### 4.4 Permission
`@Auth(ORDER_VIEW_ROLES)` — Designer / Fulfill cũng được call. Visibility filter (today / 7-day / ready) tự động enforce.

### 4.5 Cache
Hiện tại cache disabled (dev). Sau khi enable lại:
- Key `orders:status-overview:${md5(filter+role)}` TTL 30s.
- Invalidate khi import / updateField / bulkUpdateField.

---

## 5. Frontend structure

### 5.1 Files mới / sửa
- ✏️ `apps/web/src/pages/home/index.tsx` — wrap Tabs (tab A: cũ, tab B: mới).
- ➕ `apps/web/src/pages/home/OrderStatsTab.tsx` (tab A: refactor từ home cũ).
- ➕ `apps/web/src/pages/home/OrderStatusTab.tsx` (tab B mới).
- ➕ `apps/web/src/pages/home/status/KpiCard.tsx`.
- ➕ `apps/web/src/pages/home/status/BreakdownCard.tsx`.
- ➕ `apps/web/src/pages/home/status/FilterChipBar.tsx`.
- ➕ `apps/web/src/pages/home/status/OrdersMiniTable.tsx` (tái dùng cell components Phase 4).
- ➕ `apps/web/src/services/orderStatus.ts` (hoặc thêm vào `services/order.ts`).
- ➕ `apps/web/src/hooks/useStatusFilter.ts` — quản lý state filter + sync URL.
- ➕ `packages/shared/dtos/order-status.dto.ts` — Zod schemas.

### 5.2 Tabs page
```tsx
function DashboardPage() {
  const { has } = usePermission();
  const tabs = [];
  if (has('page.dashboard')) tabs.push({ key: 'stats', label: 'Thống kê đơn & sản phẩm' });
  if (has('page.dashboard')) tabs.push({ key: 'status', label: 'Tình trạng đơn hàng' });
  // ... default tab from URL
}
```

### 5.3 `useStatusFilter`
```ts
type StatusFilter = {
  printStatus: string[];
  printStatusNote: string[];
  toolResult: string[];
  toolResultNote: string[];
  errorFile: string[];
  assignee: string[];
  assigneeNote: string[];
  factoryId?: string;
  machineTypeId?: string;
  readyForFulfill?: boolean;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
};

useStatusFilter() → { filter, toggle(category, code), setRange, clearAll, queryString }
```
URL ↔ state sync qua `useSearchParams`. Chip click → toggle.

### 5.4 `OrderStatusTab` flow
1. `useStatusFilter()` đọc URL.
2. Gọi `/v1/orders/status-overview?<queryString>` → set `overview`.
3. Render: 4–6 KPI card (theo role), filter chip bar, grid breakdown cards, mini list.
4. Mini list gọi `/v1/orders?<queryString>&page=…&limit=20` (riêng request).
5. Khi user toggle filter → URL change → 2 request refresh (overview + list) parallel.

### 5.5 BreakdownCard
- Props: `{ title, items: { code, name, count }[], selectedCodes: string[], onToggle: (code) => void }`.
- Render top 8 items + "Xem thêm" nếu nhiều hơn.
- Bar width % so với max trong card.
- Item `code === null` hiển thị "— Chưa phân loại —" italic.

### 5.6 Per-role render
- Component đọc `usePermission()`:
  ```ts
  const showToolBreakdown = canViewField('toolResultNote');
  const showAssigneeBreakdown = canViewField('assignee');
  const showPrintBreakdown = canViewField('printStatus');
  ```
- Hide card breakdown nếu user không có quyền view field đó.
- KPI cards lấy từ template + filter theo role:
  ```ts
  const kpiSet = roleName === RoleType.Designer ? KPI_DESIGNER
               : roleName === RoleType.Fulfillment ? KPI_FULFILL
               : KPI_SUPPORT;
  ```

---

## 6. UX details

### 6.1 Empty state
- Filter quá hẹp → list rỗng → CTA "Bỏ filter này" trên từng chip.
- Không có data ngày đó → "Chọn ngày khác?" với quick-pick "Hôm qua / Tuần trước".

### 6.2 Loading
- KPI cards skeleton.
- Breakdown card skeleton (3 row giả).
- List skeleton 5 row.
- Header KPI cập nhật trước, breakdown sau (không block UI).

### 6.3 Quick filters preset
Trên đầu trang có 3 pill quick filter:
- "Cần xử lý hôm nay" — auto set `createdTo=today, createdFrom=today, toolResultNote != ok` (Designer) hoặc `readyForFulfill=true, printStatus=null` (Fulfill).
- "Lỗi gần đây" — `toolResultNote=error, createdFrom=7d ago`.
- "Đã xong" — `printStatus thuộc nhóm máy*`.

---

## 7. Tab A refactor (giữ chức năng cũ)

Move toàn bộ JSX của `pages/home/index.tsx` hiện tại sang `pages/home/OrderStatsTab.tsx`. Logic không đổi. Chỉ tách file. URL sync `?tab=stats|status`.

---

## 8. Performance

| Tối ưu | Cách làm |
|--------|----------|
| 1 request thay 10 | `$facet` aggregation server-side |
| Parallel overview + list | 2 fetch song song, không sequential |
| Workshop name resolve client-side | FE đã có store `workshopConfigStore`; BE trả code, FE map → name. Nếu BE cần, dùng repository |
| Cache aggregation 30s | Khi re-enable cache |
| `useMemo` cho KPI compute | Đã có pattern |
| Debounce search 300ms | Như list |

---

## 9. Lộ trình triển khai

1. **Day 1 — BE**: tạo `getStatusOverview()` service + endpoint + DTO + permission. Test bằng curl với data thật.
2. **Day 2 — FE shell + breakdown**: tabs + filter state + breakdown cards + chip bar + mini list. Bỏ qua per-role KPI ban đầu.
3. **Day 2.5 — KPI per role + UX polish**: KPI presets, quick filters, empty/loading states.
4. **Day 3 — Docs + manual test 4 role**: update Dashboard.md, test với account thật mỗi role, polish.

---

## 10. Doc impact

| File | Update |
|------|--------|
| `Dashboard.md` | Mô tả 2 tab, BE endpoint mới, per-role KPI |
| `CLAUDE.md` | Update mapping row Dashboard (thêm files mới) |
| `Orders.md` | Cross-link "Status overview cũng tái dùng filter này" |

---

## 11. Default decisions (làm theo nếu không có chỉ đạo khác)

| Vấn đề | Quyết định |
|--------|-----------|
| Hiện cả "code chưa set" (null) trong breakdown? | Có — Designer cần biết bao nhiêu đơn chưa được phân loại |
| Multi-select 1 category | OR (đã chọn 2 code → match đơn nào thỏa 1 trong 2) |
| Multi-category | AND (filter combine giữa các category) |
| Date mặc định | 7 ngày gần nhất (giống workshop table) |
| Cho phép inline edit ở mini list? | Có (giữ UX nhất quán với workshop table) |
| Designer thấy breakdown printStatus? | Không (per `canViewField` rule) |
| Fulfill thấy breakdown toolResultNote? | Không (per `canViewField` rule) |
| Click code trong breakdown đã active → bỏ chọn? | Có (toggle behavior) |
| Auto-refresh? | Không — manual refresh button. Real-time không cần thiết cho dashboard này |

---

## 12. Tracking

- [ ] BE: DTO + endpoint `/v1/orders/status-overview`
- [ ] BE: `getStatusOverview()` service với `$facet` aggregation
- [ ] FE: `pages/home/index.tsx` tabs wrapper
- [ ] FE: `OrderStatsTab.tsx` (move logic cũ)
- [ ] FE: `useStatusFilter` hook
- [ ] FE: `KpiCard` + `BreakdownCard` + `FilterChipBar` + `OrdersMiniTable`
- [ ] FE: `OrderStatusTab.tsx` glue
- [ ] FE: per-role KPI presets
- [ ] Docs: Dashboard.md update + CLAUDE.md mapping
- [ ] Test thủ công Admin / Support / Designer / Fulfill
