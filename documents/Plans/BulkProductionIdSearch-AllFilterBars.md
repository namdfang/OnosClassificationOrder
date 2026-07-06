# Bulk Production ID Search — cho mọi nơi dùng OrderFilterBar

> **Mục tiêu:** Thêm nút **"Nhiều mã"** vào `OrderFilterBar` → mở modal dán list productionId (mỗi mã 1 dòng) → **bảng + dashboard thống kê** của nơi đó lọc đúng các mã đã dán. Áp cho **cả 8 nơi** dùng `OrderFilterBar`.
>
> **Trạng thái:** 🟡 CHỜ DUYỆT — chưa implement. Chỉ code khi user xác nhận.

---

## 0. Quyết định đã chốt (user)

1. **Tương tác lọc:** `productionIds` **AND** với ngày + facet hiện tại (KHÔNG bypass ngày). ⚠️ Mã dán nằm ngoài khoảng ngày → không hiện → **nhắc user nới khoảng ngày** (tooltip/hint ở modal).
2. **Phạm vi:** cả 8 nơi (3 bảng + 4 tab dashboard tổng hợp + PrintOrderTable).
3. **Đơn hủy:** khi có `productionIds` → **hiện cả đơn đã hủy** (bỏ qua loại đơn hủy ở 4 dashboard — đúng tinh thần "tra đúng đơn này").
4. **Clear:** chip **"Đang lọc N mã ✕"** cạnh nút "Nhiều mã".

---

## 1. Hạ tầng đã có (không làm lại)

- `BulkProductionIdDialog` (mode `filter` → `onApply(ids)`) + `parseProductionIds` (`components/orders/BulkProductionIdDialog.tsx`).
- Param `productionIds` (CSV) trong `GetProductionOrdersZod` + match `$in` regex exact/case-insensitive ở `buildOrderListFilter` (`order.service.ts:965`). Verified chạy đúng với nhiều mã.
- Đã có `productionIds` sẵn ở: `getOrders`, `getOrdersGrouped`, `getFulfillmentStatusCounts` (đều qua `buildOrderListFilter`).

## 2. Ma trận 8 nơi dùng OrderFilterBar

| Nơi | Endpoint | productionIds hiện có? | Cần làm |
|---|---|---|---|
| OrderTableWorkshop | `getOrdersGrouped` | ✅ | chỉ nối FE state |
| PrintOrderTable (In) | `getOrders` + `getFulfillmentStatusCounts` | ✅ cả 2 | chỉ nối FE state |
| ErrorLogTab | `getErrorLog` | ❌ | +DTO +service |
| OrderStatsTab | `getDashboard` | ❌ | +DTO +service +cancelled-bypass |
| OrderStatusTab (+StatusFilterExtras) | `getStatusOverview` | ❌ | +DTO +service +cancelled-bypass |
| OrderFactoryTab | `getFactoryOverview` | ❌ | +DTO +service +cancelled-bypass |
| LifecycleTab | `getLifecycleOverview` | ❌ | +DTO +service +cancelled-bypass |

---

## 3. Backend

### 3.1 Shared DTO — thêm `productionIds: z.string().optional()`
- `GetOrderDashboardZod` (`production-order.dto.ts`)
- `GetFactoryOverviewZod`
- `GetLifecycleOverviewZod`
- `GetErrorLogZod`
- `GetOrderStatusOverviewZod` (`order-status.dto.ts`)
- (GetProductionOrdersZod đã có)

### 3.2 Helper dùng chung (order.service.ts)
```ts
/** Nếu dto.productionIds có → set match.productionId = {$in:[regex exact/ci]}. Trả về true nếu áp. */
private applyProductionIdsMatch(match: Record<string,unknown>, productionIds?: string): boolean {
  if (!productionIds) return false;
  const ids = productionIds.split(',').map(s=>s.trim()).filter(Boolean);
  if (!ids.length) return false;
  match.productionId = { $in: ids.map(id => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i')) };
  return true;
}
```
(Refactor `buildOrderListFilter:965` để tái dùng helper — 1 nguồn logic.)

### 3.3 Áp vào 5 service (đều ở order.service.ts)
Mỗi hàm: gọi `const hasPids = this.applyProductionIdsMatch(match, dto.productionIds)` **sau khi** build match/baseMatch, **trước** aggregate. Và **cancelled-bypass**: bọc các dòng `cancelledAt: {$exists:false}` đã thêm (task trước) trong `if (!hasPids)`:
- `getDashboard` — `match`; `if(!hasPids) match.cancelledAt={$exists:false}`. (cancelledOrders count vẫn tính bình thường.)
- `getStatusOverview` — `baseMatch`.
- `getFactoryOverview` — `match` (matchMapped kế thừa qua spread — áp helper TRƯỚC khi tạo matchMapped).
- `getLifecycleOverview` — `match`; cancelledInRange vẫn tính. ⚠️ productionId AND với funnel.
- `getErrorLog` — `filter` (không có cancelled-exclude nên chỉ cần helper).

> Controllers: **không đổi** — đều `@Query() dto` truyền nguyên; service đọc `dto.productionIds`.
> Ngày **giữ nguyên** (AND) theo quyết định #1.

---

## 4. Frontend

### 4.1 OrderFilterBar — thêm nút + chip (backward-compatible)
Props mới:
```ts
bulkProductionIds?: string[];
onBulkProductionIdsChange?: (ids: string[]) => void;
```
- Chỉ render khi có `onBulkProductionIdsChange`. Nút **"Nhiều mã"** (`ListChecks`) cạnh "Tải lại" → mở `BulkProductionIdDialog` mode=`filter` (state open nội bộ), `onApply` → `onBulkProductionIdsChange(ids)`.
- Khi `bulkProductionIds.length>0` → chip **"Đang lọc N mã"** + nút ✕ (`onBulkProductionIdsChange([])`). Đặt ở `middleRow` area hoặc ngay sau nút.
- Hint trong modal: "Mã ngoài khoảng ngày sẽ không hiện — nới khoảng ngày nếu cần." (do quyết định AND).

### 4.2 8 consumer — nối state
Mỗi nơi: `const [bulkIds, setBulkIds] = useState<string[]>(() => parse URL param 'pids')`; truyền `bulkProductionIds={bulkIds}` + `onBulkProductionIdsChange={setBulkIds}` vào `OrderFilterBar`; thêm `if (bulkIds.length) params.set('productionIds', bulkIds.join(','))` vào fetch; thêm `bulkIds` vào deps effect + URL sync (`pids`).
- Workshop/Print/ErrorLog: bảng lọc theo mã.
- Stats/Status/Factory/Lifecycle: card/chart recompute theo mã.
- `StatusFilterExtras` (con của StatusTab) — nối chung state với OrderStatusTab.

### 4.3 Service FE
Các hàm (`getDashboard/getStatusOverview/getFactoryOverview/getLifecycleOverview/getErrorLog`) nhận query string — chỉ cần append `productionIds`. Không đổi chữ ký.

---

## 5. Docs cập nhật (sau implement)
- `Orders.md` (Workshop + ErrorLog), `Dashboard.md` (Stats/Status/Factory), `OrderLifecycle.md` (Lifecycle tab), `FulfillmentWorkflow.md` (Print) — ghi nút "Nhiều mã" + hành vi AND-ngày + hiện đơn hủy khi lookup.
- `CLAUDE.md`: bổ sung prop OrderFilterBar + productionIds ở 5 endpoint.

## 6. Build verify
- `pnpm --filter shared build` → restart API.
- BE tsc = baseline 31; FE tsc = baseline 85; `vite build` ✓.
- Test tay: dán 3 mã (trong khoảng ngày) ở từng nơi → bảng/thống kê chỉ còn 3 mã; chip "Đang lọc 3 mã ✕" → bấm ✕ trở lại bình thường; dán mã đơn đã hủy → vẫn hiện.

## 7. Rủi ro / lưu ý
- Quyết định AND-ngày: user dán mã cũ (ngoài 7 ngày) sẽ thấy rỗng → **hint trong modal** là bắt buộc để tránh hiểu nhầm "mất đơn".
- `getFactoryOverview`: áp helper vào `match` TRƯỚC khi clone `matchMapped` để cả unmapped + mapped đều lọc.
- Cancelled-bypass chỉ ở 4 dashboard (Workshop/Print/ErrorLog vốn đã hiện đơn hủy hoặc lọc theo lỗi).
