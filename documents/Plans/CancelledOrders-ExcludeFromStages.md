# Đơn hủy — Loại khỏi mọi công đoạn + Thống kê Dashboard

> **Mục tiêu:** Đơn `cancelledAt` set → biến mất khỏi **mọi hàng chờ / đang làm / cần làm** của tất cả công đoạn (designer + fulfillment) và mọi số liệu công đoạn/dashboard, **kể cả đơn đang dở ở stage bất kỳ**. Đồng thời thêm **thống kê số đơn hủy** ra Dashboard (2 nơi) + **drill-down** xem danh sách.
>
> **Trạng thái:** ✅ ĐÃ IMPLEMENT. BE net-zero lỗi mới (baseline 31), FE baseline 85, vite build ✓.

---

## 0. Quyết định đã chốt (user)

1. **Bảng đơn chính (List/Workshop):** GIỮ hiện đơn hủy (badge "Đã hủy", `opacity-60`) như hiện tại → **KHÔNG** đụng `buildVisibilityFilter` / `getOrders` / `getOrdersGroupedByType`.
2. **Vị trí thống kê:** CẢ HAI — KPI card ở tab Stats **và** số trên `LifecycleStrip`.
3. **Cách đếm:** theo `inProductionAt` trong khoảng ngày đang chọn trên dashboard.
4. **Drill-down:** CÓ — bấm số → mở danh sách đơn hủy (productionId + lý do + ngày hủy + công đoạn).

---

## 1. Cơ chế hủy hiện tại (không đổi)

- Field: `OrderEntity.cancelledAt?: Date` + `cancelReason?: string` (`order.entity.ts:167,170`).
- Set qua: `OrderService.cancelOrder` (Admin-only, `order.service.ts:3605`) + import-rework (note "hủy đơn", `order.service.ts:4693`).
- FE hiển thị: `CancelledBadge.tsx`, `OrderTableWorkshop.tsx:154,176,208` (row `opacity-60` + badge). **Giữ nguyên.**
- Loại đơn hủy = **filter lúc đọc** (`cancelledAt: null` / `{ $exists: false }`). KHÔNG cần reset stage subdoc → cancel giữa chừng tự rớt khỏi queue ngay ở lần query kế.

---

## 2. Inventory — nơi CÒN LỌT đơn hủy (cần sửa)

| # | Hàm | File:dòng | Sửa |
|---|-----|-----------|-----|
| 1 | `buildMyTaskBase` (kanban Fulfillment 4 cột + facet) | `fulfillment/fulfillment-task.service.ts` (~536) | thêm `cancelledAt: null`; xóa comment "KHÔNG filter cancelledAt để khớp Factory Tab" |
| 2 | `buildMyTaskFilter` (kanban Designer my-tasks + facet) | `designer/designer-task.service.ts` (buildMyTaskFilter) | thêm `cancelledAt: null` |
| 3 | `getMyStats` designer (KPI cá nhân) | `designer/designer-task.service.ts:549` `{ assignee: userId }` | thêm `cancelledAt: null` |
| 4 | `getMyDailyBreakdown` designer (line 689 `{ assignee: userId }`) | `designer/designer-task.service.ts:~689` | thêm `cancelledAt: null` |
| 5 | `getDailyOverview` (Dashboard tab Designer §0b — bảng tổng quan N ngày) | `designer/designer-stats.service.ts:632` `baseMatch` | thêm `cancelledAt: null` |
| 6 | `getAssignBacklog` (pool "Cần gán" + self-claim) | `designer/designer-stats.service.ts:790` `match` | thêm `cancelledAt: null` |
| 7 | `getDashboard` (tab Stats số liệu) | `order/order.service.ts:1435` `match` | thêm `cancelledAt: { $exists: false }` |
| 8 | `getFactoryOverview` (tab Xưởng cards/flow) | `order/order.service.ts:~2620` `match` | thêm `cancelledAt: { $exists: false }` (matchMapped kế thừa) |
| 9 | `getStatusOverview` (tab Trạng thái) | `order/order.service.ts:1828` `baseMatch` (SAU `buildVisibilityFilter`) | thêm `cancelledAt: { $exists: false }` |
| 10 | `getDesignerBreakdown` (ma trận KPI /orders) | `order/order.service.ts:~5164` `scopedFilter` + `overallFilter` | thêm `cancelledAt: { $exists: false }` cả 2 |

> **KHÔNG sửa** `buildVisibilityFilter` — vì nó cũng cấp cho bảng đơn chính (phải giữ hiện đơn hủy). Ta thêm exclusion **tại từng consumer dashboard/stage** (dòng 9,10 add SAU khi gọi builder).

### Đã đúng sẵn (không đụng)
- `getLifecycleOverview` funnel — đã `cancelledAt: {$exists:false}` (`order.service.ts:2301`).
- `getDesignerBacklog` (cây tồn đọng modal) — đã loại (`order.service.ts:5417`).
- Fulfillment **daily breakdown** — đã `cancelledAt: null` (`fulfillment-task.service.ts:710`).
- Tool-check overview — `alive={deletedAt,cancelledAt}` (`designer-stats.service.ts:1035`).
- Fulfillment/Designer transition — chặn thao tác đơn đã hủy.

---

## 3. Thống kê đơn hủy (mới)

### 3.1 getDashboard → `cancelledCount`
- **DTO** `OrderDashboardZod.totals` (`production-order.dto.ts:588`): thêm `cancelledOrders: z.number()`.
- **Service** `getDashboard`: sau khi build `match` (đã exclude cancelled), build song song `cancelledMatch` = **cùng scope xưởng + date (`inProductionAt`)** nhưng `cancelledAt: { $exists: true }`. `countDocuments(cancelledMatch)` → `totals.cancelledOrders`. (Cùng `Promise.all` với các aggregate sẵn có.)

### 3.2 getLifecycleOverview → `cancelledInRange`
- **DTO** `LifecycleOverviewZod.totals` (`production-order.dto.ts:1399`): thêm `cancelledInRange: z.number()`.
- **Service** `getLifecycleOverview`: đang có `match` loại cancelled cho funnel; thêm 1 `countDocuments` với **cùng window `inProductionAt` + factory scope** nhưng `cancelledAt: { $exists: true }` → `totals.cancelledInRange`.
- `LifecycleStrip` đọc từ đây (xác nhận `services/order.ts:getLifecycleOverview` là nguồn của strip lúc implement).

### 3.3 Drill-down — endpoint danh sách đơn hủy
- **DTO mới** (`production-order.dto.ts`):
  ```ts
  GetCancelledOrdersZod = z.object({ from: z.string().optional(), to: z.string().optional(), factoryId: IDZod.optional() });
  CancelledOrderRowZod = z.object({
    _id, productionId, type, size, color, cancelReason, cancelledAt, inProductionAt,
    currentFulfillmentStage: nullable, designerStatus: optional,
  });
  GetCancelledOrdersResDto = ResZod.extend({ data: CancelledOrderRowZod.array(), total });
  ```
- **Service** `getCancelledOrders(dto, roleName, factoryId)`: match = factory scope (như dashboard) + `inProductionAt` in range + `cancelledAt: { $exists: true }`, sort `cancelledAt` desc, cap ~500 (log nếu cắt).
- **Controller** `order.controller.ts`: `@Get('cancelled-list')` + `@Auth(ORDER_VIEW_ROLES)` (giống lifecycle-overview). Log request.
- **FE service** `services/order.ts`: `getCancelledOrders({ from, to, factoryId })`.

---

## 4. Frontend

| File | Thay đổi |
|------|----------|
| `pages/home/OrderStatsTab.tsx` (KPI tab Stats) | Thêm KPI card **"Đơn đã hủy"** = `totals.cancelledOrders`, `onClick` → mở `CancelledOrdersDialog` (truyền from/to hiện tại). |
| `pages/home/LifecycleStrip.tsx` | Thêm chip/số **"Hủy: N"** = `totals.cancelledInRange`, click → cùng dialog. |
| `components/orders/CancelledOrdersDialog.tsx` (mới) | Modal fetch `getCancelledOrders(from,to,factoryId)` → bảng gọn: productionId (+CopyButton) · sản phẩm/size/màu · công đoạn hiện tại · lý do hủy · ngày hủy. Empty state. |
| `services/order.ts` | `getCancelledOrders`. |

> Dialog nhận `from/to` (+ factoryId nếu strip đang lọc xưởng) từ chỗ mở để khớp con số. Reuse pattern `DesignerBacklogDialog.tsx`.

---

## 5. Docs cần cập nhật (sau khi implement)

- `FulfillmentWorkflow.md` §2.4 (dòng 129-131): **sửa chỗ lệch** — hiện ghi "My Tasks tự filter `cancelledAt: null`" nhưng code (`buildMyTaskBase`) trước đây KHÔNG; ghi rõ nay đã thêm.
- `DesignerTaskWorkflow.md`: my-tasks kanban + my-stats + daily breakdown + `getDailyOverview` + `getAssignBacklog` (pool/self-claim) đều loại đơn hủy.
- `OrderLifecycle.md`: thêm `totals.cancelledInRange` + số hủy trên strip + dialog.
- `Dashboard.md`: KPI "Đơn đã hủy" tab Stats + drill-down; ghi chú tab Designer §0b/§0c loại cancelled.
- `CLAUDE.md`: bổ sung file mới (`CancelledOrdersDialog.tsx`, endpoint `cancelled-list`) vào mapping Orders/Dashboard.

---

## 6. Build verify

- `pnpm --filter shared build` (thêm DTO) → restart API.
- BE `tsc --noEmit` = baseline 31; FE `tsc --noEmit` = baseline 85; `vite build` ✓.
- Test tay: hủy 1 đơn đang ở stage giữa (vd 'ép') → biến mất khỏi kanban thợ ép + designer (nếu đang gán) + tab Trạng thái/Xưởng/Stats; vẫn thấy ở bảng đơn chính (badge); số "Đơn đã hủy" +1; bấm số → thấy đơn trong danh sách.

---

## 7. Điểm cần xác nhận khi implement

- Nguồn dữ liệu thật của `LifecycleStrip` (getLifecycleOverview hay endpoint riêng) — gắn `cancelledInRange` đúng chỗ.
- `cancelledOrders` đặt trong `totals` (an toàn, thêm field) — FE chỉ đọc thêm, không phá field cũ.
- Đơn hủy KHÔNG có `inProductionAt` → không vào count theo range (chấp nhận: chưa từng vào SX).
