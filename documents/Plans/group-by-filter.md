# Plan — "Nhóm theo" filter cho bảng đơn

> **Tạo:** 2026-06-27
> **Phạm vi:** Thêm 1 ô select **"Nhóm theo"** ở đầu facet grid của `<OrderFilterBar>` cho 2 bảng:
>   - `OrderTableWorkshop` (apps/web/src/pages/orders/) — đã có group-by-type sẵn, mở rộng cho phép chọn field khác.
>   - `OrdersMiniTable` (apps/web/src/pages/home/status/) — chưa có grouping, thêm mới.
> **UX:** Sort-only (rows cùng giá trị sát nhau), KHÔNG collapsible header. Đơn giản, đồng bộ visual.
> **Ước tính:** ~0.5 ngày BE + 1 ngày FE + 0.5 ngày test/doc.
> **Status:** `PLANNED` — chưa implement.

---

## 1. Mục tiêu

1. Cho phép user pick 1 trong 8 fields để các đơn cùng giá trị field đó **sát nhau** trong list. Ví dụ chọn "Loại vải" → đơn vải A đứng cạnh đơn vải A, đơn vải B cạnh đơn vải B.
2. **Lúc đầu vào trang phải Y NGUYÊN behavior hiện tại** — Workshop default = "Sản phẩm" (sort=grouped); OrdersMiniTable default = "Mặc định" (không nhóm, sort `inProductionAt desc`).
3. Đồng bộ visual với các facet select khác — `<SelectFilter>` 1st cell của facet grid trong `<OrderFilterBar>`.
4. Persist qua URL params → F5/share link giữ nguyên lựa chọn.

---

## 2. Field options

| Giá trị | Label | Hành vi sort BE |
|---------|-------|------------------|
| _(rỗng/`default`)_ | **Mặc định** | `inProductionAt desc` — không nhóm |
| `type` | **Sản phẩm** | `type asc → size asc → fabricType asc → inProductionAt desc` (= `sort=grouped` cũ) |
| `fabricType` | **Loại vải** | `fabricType asc → type asc → size asc → inProductionAt desc` |
| `machineNumber` | **Máy** | `machineNumber asc → type asc → size asc → inProductionAt desc` |
| `machineTypeId` | **Phòng** | `machineTypeId asc → type asc → size asc → inProductionAt desc` |
| `printStatus` | **Trạng thái in** | `printStatus asc → type asc → size asc → inProductionAt desc` |
| `toolResult` | **Kết quả Tool** | `toolResult asc → type asc → size asc → inProductionAt desc` |
| `assignee` | **Người thực hiện** | `assignee asc → type asc → size asc → inProductionAt desc` |
| `productionError` | **Lỗi xưởng** | `productionError asc → type asc → size asc → inProductionAt desc` |

**Multi-level pattern (B):** primary = field user chọn, tiebreak = `type → size → inProductionAt desc`. Đảm bảo combo (sản phẩm + size + thời gian) vẫn cluster trong cùng giá trị primary.

---

## 3. UX — Sort only

- Rows cùng giá trị field group **sát nhau** trong table body.
- **KHÔNG** collapsible header (tránh việc phải code lại render groups + sticky logic + label resolve cho mỗi field).
- Workshop hiện tại có collapsible header `Sản phẩm: <type> (5 đơn)` — **giữ nguyên** khi groupBy = `type` (default behavior). Khi user đổi sang field khác, **bỏ collapsible header**, render flat list sorted theo BE.
  - Lý do: chỉ field `type` có sẵn `OrderGroup[]` structure từ `getOrdersGroupedByType`. Field khác render qua `getOrders` flat.

---

## 4. UI placement

Trong `<OrderFilterBar>`:
- 1 ô đầu của **facet grid** (responsive `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`).
- Component: `<SelectFilter label="Nhóm theo" value={groupBy} onChange={setGroupBy} options={GROUP_BY_OPTIONS} />`.
- Style đồng bộ với các facet khác — không cần slot riêng.

```tsx
facets={[
  { key: 'groupBy', label: 'Nhóm theo', value: groupBy, onChange: setGroupBy, options: GROUP_BY_OPTIONS },
  // ... các facet khác
] satisfies OrderFilterFacet[]}
```

`GROUP_BY_OPTIONS` constant export từ `apps/web/src/components/orders/OrderFilterBar.tsx`:
```ts
export const GROUP_BY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Mặc định' },
  { value: 'type', label: 'Sản phẩm' },
  { value: 'fabricType', label: 'Loại vải' },
  { value: 'machineNumber', label: 'Máy' },
  { value: 'machineTypeId', label: 'Phòng' },
  { value: 'printStatus', label: 'Trạng thái in' },
  { value: 'toolResult', label: 'Kết quả Tool' },
  { value: 'assignee', label: 'Người thực hiện' },
  { value: 'productionError', label: 'Lỗi xưởng' },
];
```

---

## 5. Backend changes

### 5.1 Mở rộng `sort` param

File: `apps/api/src/modules/order/order.service.ts` — method `getOrders` (line ~626).

Hiện tại:
```ts
const sortSpec = sort === 'grouped'
  ? { type: 1, size: 1, fabricType: 1, inProductionAt: -1 }
  : { [sort || 'inProductionAt']: order === 'asc' ? 1 : -1 };
```

Đổi sang:
```ts
const sortSpec = parseGroupBySort(sort, order);

function parseGroupBySort(sort?: string, order?: 'asc' | 'desc'): Record<string, 1 | -1> {
  // `grouped` (legacy) = type-based 4-level
  if (sort === 'grouped') {
    return { type: 1, size: 1, fabricType: 1, inProductionAt: -1 };
  }
  // `grouped:<field>` = field-based multi-level
  if (sort?.startsWith('grouped:')) {
    const field = sort.slice('grouped:'.length);
    if (GROUP_BY_FIELDS.has(field)) {
      // Multi-level: <field> asc → type asc → size asc → inProductionAt desc
      return {
        [field]: 1,
        type: 1,
        size: 1,
        inProductionAt: -1,
      };
    }
    // unknown field → fallback default
    return { inProductionAt: -1 };
  }
  // Single field sort (giữ cũ)
  return { [sort || 'inProductionAt']: order === 'asc' ? 1 : -1 };
}

const GROUP_BY_FIELDS = new Set([
  'type',
  'fabricType',
  'machineNumber',
  'machineTypeId',
  'printStatus',
  'toolResult',
  'assignee',
  'productionError',
]);
```

### 5.2 `getOrdersGroupedByType` — KHÔNG đổi

Workshop's group-by-type vẫn dùng endpoint riêng này (paginate theo product type). Khi user **đổi** từ "Sản phẩm" sang field khác, FE chuyển sang gọi `getOrders` (flat) với `sort=grouped:<field>`. Endpoint `getOrdersGroupedByType` chỉ dùng cho `groupBy=type`.

### 5.3 Backward compat

- `sort=grouped` (không `:field`) → giữ behavior cũ. Không breaking.
- Param mới `sort=grouped:fabricType` → behavior mới.
- Đơn legacy không có field group (vd `assignee` null) → Mongo đẩy về cuối khi sort asc (chấp nhận).

### 5.4 Validate sort field

Không cần — `GROUP_BY_FIELDS` whitelist đã chặn injection. Field ngoài whitelist fallback `inProductionAt desc`.

---

## 6. Frontend changes

### 6.1 `OrderTableWorkshop.tsx`

**State + URL:**
```ts
const [groupBy, setGroupBy] = useState<string>(
  () => searchParams.get('wgroup') ?? 'type', // default = type (giữ behavior cũ)
);

// URL sync
useEffect(() => {
  setSearchParams((prev) => {
    const sp = new URLSearchParams(prev);
    // Default `type` thì strip để URL gọn (giống các default khác).
    groupBy && groupBy !== 'type' ? sp.set('wgroup', groupBy) : sp.delete('wgroup');
    return sp;
  }, { replace: true });
}, [groupBy, setSearchParams]);
```

**Fetch:**
```ts
const fetchData = async () => {
  // ...
  if (groupBy === 'type') {
    // Workshop hiện tại — group-by-type, paginate by type
    const res = await RepositoryRemote.order.getOrdersGrouped(...);
    // Render qua groups + collapsible header (cũ)
  } else if (groupBy && groupBy !== '') {
    // Field khác — flat list với multi-level sort
    params.set('sort', `grouped:${groupBy}`);
    const res = await RepositoryRemote.order.getOrders(...);
    // Render flat (không group header)
  } else {
    // Default sort
    const res = await RepositoryRemote.order.getOrders(...);
  }
};
```

**Render branching:**
```tsx
{groupBy === 'type' ? (
  // Giữ render groups + collapsible cũ
  groups.map((g) => <GroupHeader + GroupBody />)
) : (
  // Render flat list sorted by BE
  items.map((row) => <TableRow />)
)}
```

**Facet:**
```tsx
facets={[
  { key: 'groupBy', label: 'Nhóm theo', value: groupBy, onChange: setGroupBy, options: GROUP_BY_OPTIONS },
  // ... 9 facet cũ giữ nguyên
]}
```

### 6.2 `OrdersMiniTable.tsx`

**Tạo URL prefix mới `m` (mini)** — currently component nhận `queryString` từ parent (OrderStatusTab). Cần đổi: thêm state local `groupBy` + sync URL `mgroup` + pass vào fetch.

```ts
const [groupBy, setGroupBy] = useState<string>(
  () => searchParams.get('mgroup') ?? '', // default = '' (Mặc định, không nhóm)
);

// URL sync
useEffect(() => {
  setSearchParams((prev) => {
    const sp = new URLSearchParams(prev);
    groupBy ? sp.set('mgroup', groupBy) : sp.delete('mgroup');
    return sp;
  }, { replace: true });
}, [groupBy]);

// Fetch — pass sort vào getOrders
const params = new URLSearchParams(parentQs);
if (groupBy) params.set('sort', `grouped:${groupBy}`);
// ...
```

**Filter bar:** OrdersMiniTable hiện tại không có filter bar riêng — filter top bar nằm ở `OrderStatusTab`. Cần quyết định:
- **Option A:** Add facet "Nhóm theo" vào OrderStatusTab's `<OrderFilterBar>` — facet này áp dụng cho mini table bên dưới.
- **Option B:** Add facet vào OrdersMiniTable component riêng (mini filter bar trên top mini table).

→ **Pick Option A** (đồng bộ với pattern hiện tại, OrderStatusTab quản lý filter chính).

### 6.3 `OrderFilterBar.tsx`

Export constant `GROUP_BY_OPTIONS` để 2 consumer dùng chung. Không thay đổi API component.

### 6.4 Workshop — bỏ collapse-all button khi không phải group-by-type

`OrderTableWorkshop` có button "Mở hết / Thu gọn hết" trong `topActionsRight` — hiện ra khi `groups.length > 1`. Khi user chọn group-by khác (flat render), button này không có ý nghĩa → ẩn:
```tsx
topActionsRight={
  groupBy === 'type' && groups.length > 1 ? <CollapseAllButton /> : null
}
```

---

## 7. URL params

| Tab | Prefix | Param mới | Default (strip URL) |
|-----|--------|-----------|----------------------|
| `OrderTableWorkshop` | `w` | `wgroup` | `type` (giữ behavior cũ) |
| `OrdersMiniTable` (OrderStatusTab) | `m` | `mgroup` | `''` (Mặc định, không nhóm) |

**Examples:**
- `?wgroup=fabricType` → workshop group theo loại vải
- `?mgroup=printStatus` → mini table group theo trạng thái in
- Default state → URL không có param này

---

## 8. Default behavior matrix

| Tab | Initial load | URL không có `xgroup` | URL có `xgroup=<f>` |
|-----|--------------|------------------------|---------------------|
| Workshop | Group by `type` (collapsible, current) | Group by `type` | Sort by `<f>` multi-level (flat) |
| OrdersMiniTable | Mặc định BE (`inProductionAt desc`) | Mặc định | Sort by `<f>` multi-level |

→ Lúc đầu vào trang **không có URL param** → behavior **Y NGUYÊN hiện tại**. ✓

---

## 9. Migration strategy / rollout

### Phase 1 — BE extend `sort` param (no breaking)
- Add `parseGroupBySort` helper + `GROUP_BY_FIELDS` whitelist.
- Test: existing `sort=grouped` vẫn return 4-level current. `sort=grouped:fabricType` return multi-level mới.

### Phase 2 — FE `OrderFilterBar` + Workshop
- Export `GROUP_BY_OPTIONS` constant.
- Workshop: add `groupBy` state + URL sync + facet + fetch branching + render branching.
- Test:
  - F5 không có URL param → Workshop group-by-type collapsible (current).
  - F5 với `?wgroup=fabricType` → flat list sorted theo vải.
  - Đổi select → URL update + fetch lại + render đổi giữa group/flat.

### Phase 3 — FE `OrderStatusTab` + `OrdersMiniTable`
- OrderStatusTab: add `groupBy` state + facet.
- Pass `groupBy` vào OrdersMiniTable qua prop hoặc query string.
- OrdersMiniTable: dùng `groupBy` để build `sort` param khi fetch.

### Phase 4 — Doc
- Update `Orders.md §10.3` Filter bar — thêm field option "Nhóm theo".
- Update `Orders.md §10.2` Workshop — note rằng group-by-type vẫn dùng collapsible, field khác render flat.

---

## 10. Risks / open questions

| Risk | Mitigation |
|------|------------|
| `assignee` field lưu userId không phải workshop_code → sort asc cho ra UID lung tung, không user-friendly | Chấp nhận sort theo userId. Nếu user phàn nàn, có thể join với users + sort theo `fullName` sau (out of scope phase 1). |
| Đơn legacy không có `inProductionAt` (null) → Mongo đẩy về cuối khi sort desc, có thể out of order trong group | Chấp nhận. Đã document trong code comment hiện tại. |
| `machineTypeId` / `assignee` là ObjectId reference — sort asc theo ID không có nghĩa nghiệp vụ | Sort theo ID đảm bảo rows cùng giá trị sát nhau (đúng yêu cầu user). Label/ordering thực tế hiển thị trên FE qua resolve. |
| Workshop's group-by-type có 1 endpoint `getOrdersGrouped` riêng paginate theo type. Khi đổi sang field khác phải switch endpoint → fetch logic phức tạp | Chấp nhận branching `if (groupBy === 'type')`. Comment rõ trong code. |

---

## 11. Files sẽ sửa

### Backend
- `apps/api/src/modules/order/order.service.ts` — `parseGroupBySort` + `GROUP_BY_FIELDS`

### Frontend
- `apps/web/src/components/orders/OrderFilterBar.tsx` — export `GROUP_BY_OPTIONS`
- `apps/web/src/pages/orders/OrderTableWorkshop.tsx` — `groupBy` state + facet + branching fetch/render
- `apps/web/src/pages/home/OrderStatusTab.tsx` — `groupBy` state + facet + pass xuống mini
- `apps/web/src/pages/home/status/OrdersMiniTable.tsx` — nhận `groupBy` prop hoặc query, pass vào fetch

### Docs
- `documents/FunctionDescription/Orders.md` — §10.2 + §10.3 cập nhật

---

## 12. Acceptance criteria

- [ ] Lần đầu vào `/orders` (Workshop tab) — render group-by-type collapsible **giống hệt hiện tại**, không có URL param mới.
- [ ] Lần đầu vào `/dashboard?tab=status` (OrderStatusTab → OrdersMiniTable) — render flat list sort `inProductionAt desc` **giống hệt hiện tại**, không có URL param mới.
- [ ] Workshop: chọn "Loại vải" trong "Nhóm theo" → render flat list, các đơn cùng loại vải sát nhau, trong cùng vải thì sắp xếp tiếp theo sản phẩm → size → thời gian.
- [ ] Workshop: chọn lại "Sản phẩm" → render collapsible header group trở lại.
- [ ] Workshop: chọn "Mặc định" → render flat list sort `inProductionAt desc`.
- [ ] OrdersMiniTable: chọn "Trạng thái in" → các đơn cùng trạng thái in sát nhau.
- [ ] URL params persist qua F5: `?wgroup=fabricType`, `?mgroup=printStatus`.
- [ ] Đổi tab (sang Tab A/C của dashboard) — `mgroup`/`wgroup` cleanup theo `handleTabChange` (nếu cần).
- [ ] Typecheck FE + BE clean (chỉ pre-existing errors).
- [ ] Hoạt động đúng với cả role Admin / Designer / Fulfillment / Support (permission gate không thay đổi).
