# Plan — Trang "In" (Fulfillment stage=print) chuyển sang bảng admin xem-tất-cả

> **Mục tiêu:** Riêng user **In** (`role=Fulfillment`, `fulfillmentStage='print'`) sẽ thấy
> **đúng bảng admin `OrderTableWorkshop`** thay cho kanban hiện tại:
> - Hiển thị **tất cả đơn mọi xưởng** (y hệt admin), **kể cả** đơn lỗi / `toolResultNote != 'ok'` / chưa vào pipeline.
> - Dạng **table** (group-by-type như admin), **bỏ kanban / bỏ chia status**.
> - **Đủ 16 cột** như admin (mở thêm view-permission).
> - **Quyền edit giữ nguyên** (chỉ In/QC cơ bản: printStatus, printStatusNote, machineNumber, productionError*, …).
> - Thêm **1 cột action stage** mỗi dòng để đẩy đơn **In → Ép** (Bắt đầu / Hoàn thành / Báo lỗi).
>
> **Các stage fulfillment khác (Ép / QC / May / Đóng) KHÔNG đổi** — vẫn kanban như cũ.

---

## 0. Quyết định đã chốt (từ thảo luận với user)

| Vấn đề | Quyết định |
|---|---|
| Đẩy In→Ép | **Giữ nút action mỗi dòng**. Contextual đúng như card kanban hiện tại: `waiting/rework` → **Bắt đầu**; `in-progress` → **Hoàn thành** + **Báo lỗi**. Không đổi BE state machine. |
| Phạm vi dữ liệu | **Tất cả đơn mọi xưởng** (bỏ scope factory + bỏ `readyForFulfill` + bỏ default 7 ngày cho riêng user In). |
| Quyền edit | **Giữ nguyên** preset Fulfillment hiện tại (không mở edit thêm). |
| Cột hiển thị | **Mở đủ 16 cột** = thêm `order.field.*.view` còn thiếu vào preset Fulfillment. |
| UI | **Tái dùng `OrderTableWorkshop`** (thêm 2 prop optional, không phá admin). |

> **Lưu ý action**: user nói "giữ nút Hoàn thành/Báo lỗi". State machine BE bắt buộc phải qua
> `in-progress` trước khi `complete`, nên ta thêm **Bắt đầu** khi đơn ở `waiting/rework`. Đây là
> hành vi giống hệt card kanban hiện tại (`CardAction`). Nếu sau này muốn 1-click "Hoàn thành"
> tự `start`+`complete` thì phải thêm xử lý gộp (ngoài scope plan này).

---

## 1. Bối cảnh code hiện tại (đã verify)

### 1.1 BE — visibility bị giới hạn cho role Fulfillment
- `apps/api/src/modules/order/order.service.ts`
  - `buildVisibilityFilter()` (~L451): nhánh `roleName === RoleType.Fulfillment` (L478-491) **ép**:
    - `inProductionAt` = 7 ngày gần nhất (nếu không truyền date),
    - `readyForFulfill = true`,
    - `$or: [{factoryId}, {originalFactoryId}]` (scope factory).
    → Đây chính là lý do user In **không** thấy đơn lỗi/non-ok và đơn xưởng khác.
  - `buildOrderListFilter(dto, roleName, assigneeCode, fulfillmentFactoryId)` (~L590) gọi `buildVisibilityFilter`.
  - `getOrdersGroupedByType(dto, roleName, assigneeCode, fulfillmentFactoryId)` (~L823) → endpoint `/grouped`.
  - `getWorkshopAvailableFilters(dto, roleName, assigneeCode, fulfillmentFactoryId)` (~L2241) → endpoint `/workshop-filters`. (Hiện gọi `buildOrderListFilter(sanitizedDto, roleName, assigneeCode)` **không** truyền factory.)
- `apps/api/src/modules/order/order.controller.ts`
  - `GET /grouped` (L140) `@Auth(ORDER_VIEW_ROLES)` (đã gồm `Fulfillment`, L55-63). Gọi service với `user?.role?.name`, `user?._id`, `user?.factoryId`.
  - `GET /workshop-filters` (L154) tương tự.
- `getOrdersGroupedByType` trả **full document** (`orderRepository.findAll` không set projection) → đã sẵn `currentFulfillmentStage`, `fulfillmentStages`, `factoryId`. **Không cần đổi projection.**
- `user.fulfillmentStage` **có** trong auth context: `user.service.ts:100` (`getUserById` $project) + `:179` (`getMe`).

### 1.2 BE — state machine transition (giữ nguyên)
- `apps/api/src/modules/fulfillment/fulfillment-task.service.ts › transition()` (L104):
  - Non-override role bắt buộc: `user.fulfillmentStage === body.stage`, `order.factoryId === user.factoryId`, `order.currentFulfillmentStage === body.stage`.
  - → User In chỉ transition được đơn **đúng xưởng + đang ở stage print**. FE phải ẩn action cho dòng không thỏa (đơn xưởng khác / không ở print) để tránh 403.

### 1.3 FE — trang fulfillment hiện là kanban dùng chung
- `apps/web/src/pages/fulfillment/my-tasks/index.tsx` (`FulfillmentMyTasksPage`): kanban cho **mọi** stage. Lấy data từ `RepositoryRemote.fulfillment.myTasks({tab,...})`.
- `apps/web/src/pages/fulfillment/my-tasks/FulfillmentTaskCard.tsx` — card + `CardAction` (logic nút Bắt đầu/Hoàn thành/Báo lỗi theo status).
- `apps/web/src/pages/fulfillment/my-tasks/ReworkBackDialog.tsx` — dialog báo lỗi. Props: `{ order, myStage, onClose, onSubmit(target, reason) }`.
- `RepositoryRemote.fulfillment.transition(orderId, { stage, action, target?, reason? })` — gọi `POST /v1/orders/:id/fulfillment-transition`.

### 1.4 FE — bảng admin
- `apps/web/src/pages/orders/OrderTableWorkshop.tsx`:
  - Fetch `RepositoryRemote.order.getOrdersGrouped('?'+params)` + `getWorkshopFilters(...)`.
  - Fetch effect deps (L260-279) — cần thêm `reloadToken` vào đây.
  - Trailing column hiện có: 1 `<TableHead className="w-12">` + nút **Lịch sử** mỗi dòng (L580, L738-747).
  - `DesignerSummaryPanel` chỉ hiện khi `has('page.designer_stats') || has('designer.task.assign')` → user In không có → tự ẩn. OK.
  - `visibleCols` = `WORKSHOP_COLS.filter(c => !c.perm || canViewField(c.key))` → cột phụ thuộc view-permission.
- `apps/web/src/components/orders/workshopTableConfig.tsx`:
  - `WORKSHOP_COLS` (16 cột), `WorkshopOrderRow` (type), `WorkshopRenderCtx`.
  - `WorkshopOrderRow` **chưa có** `currentFulfillmentStage`, `fulfillmentStages` (đã có `factoryId`).

### 1.5 Permission catalog
- `packages/shared/constants/permission-catalog.ts`:
  - Preset `[RoleType.Fulfillment]` (L188-207) hiện có **view**: printStatus, printStatusNote, toolResultNote, fabricType, machineNumber, productionError, productionErrorNote, productionErrorSource.
  - **Thiếu view** (so với 16 cột admin): `toolResult`, `errorFile`, `errorFileNote`, `assignee`, `assigneeNote`, `designerStatus`, `order.log.view` (nút Lịch sử).
- `apps/api/src/modules/role/role.service.ts › onModuleInit()` (L17-71): mỗi lần boot **sync** `permissionCodes` system role về `DEFAULT_ROLE_PERMISSIONS`. → **Chỉ cần sửa catalog, KHÔNG cần migration**; restart API là role Fulfillment có quyền mới.
  - ⚠️ Hệ quả: catalog là source-of-truth tuyệt đối cho system role. Nếu admin từng custom quyền Fulfillment qua UI sẽ bị ghi đè về preset khi boot (đã là behavior hiện tại, không phải do plan này gây ra).

---

## 2. Thay đổi chi tiết

### BƯỚC A — Backend: mở visibility admin-like cho user In

**A1. `packages/shared` — không có thay đổi enum.** (dùng `FulfillmentStage.Print` đã có.)

**A2. `order.service.ts › buildVisibilityFilter`** — thêm param `fulfillmentStage?` và helper.

```ts
// thêm gần đầu class hoặc cạnh helper khác
private isPrintAdminView(roleName?: RoleType, fulfillmentStage?: string): boolean {
  return roleName === RoleType.Fulfillment && fulfillmentStage === FulfillmentStage.Print;
}
```

Sửa signature + nhánh Fulfillment:
```ts
private buildVisibilityFilter(
  roleName?: RoleType,
  dto?: GetProductionOrdersDto,
  assigneeUserId?: string,
  fulfillmentFactoryId?: string,
  fulfillmentStage?: string,          // ⬅️ THÊM
): Record<string, unknown> {
  ...
  } else if (roleName === RoleType.Fulfillment) {
    // User In (stage=print) → xem như admin: KHÔNG ép readyForFulfill / scope
    // factory / 7-ngày. Chỉ áp date khi user chủ động truyền.
    if (this.isPrintAdminView(roleName, fulfillmentStage)) {
      if (hasDateOverride) filter.inProductionAt = buildRange();
    } else {
      filter.inProductionAt = hasDateOverride ? buildRange() : { $gte: startOfWindow, $lte: endOfToday };
      filter.readyForFulfill = true;
      if (fulfillmentFactoryId) {
        filter.$or = [{ factoryId: fulfillmentFactoryId }, { originalFactoryId: fulfillmentFactoryId }];
      } else {
        filter.factoryId = '__no_factory__';
      }
    }
  } else if (hasDateOverride) {
    filter.inProductionAt = buildRange();
  }
  return filter;
}
```

**A3. `order.service.ts › buildOrderListFilter`** — thêm param `fulfillmentStage?`, truyền xuống:
```ts
private buildOrderListFilter(
  dto, roleName?, assigneeCode?, fulfillmentFactoryId?,
  fulfillmentStage?: string,          // ⬅️ THÊM
): Record<string, unknown> {
  const filter = this.buildVisibilityFilter(roleName, dto, assigneeCode, fulfillmentFactoryId, fulfillmentStage);
  ...
}
```

**A4. `order.service.ts › getOrdersGroupedByType`** — thêm param + truyền:
```ts
async getOrdersGroupedByType(
  dto, roleName?, assigneeCode?, fulfillmentFactoryId?,
  fulfillmentStage?: string,          // ⬅️ THÊM
) {
  const filter = this.buildOrderListFilter(dto, roleName, assigneeCode, fulfillmentFactoryId, fulfillmentStage);
  ...
}
```

**A5. `order.service.ts › getWorkshopAvailableFilters`** — thêm param + truyền vào mỗi `buildOrderListFilter` trong `aggregateFacet`:
```ts
async getWorkshopAvailableFilters(
  dto, roleName?, assigneeCode?, fulfillmentFactoryId?,
  fulfillmentStage?: string,          // ⬅️ THÊM
) {
  ...
  const aggregateFacet = async (excludeKey, field) => {
    const sanitizedDto = { ...dto, [excludeKey]: undefined };
    const baseFilter = this.buildOrderListFilter(
      sanitizedDto, roleName, assigneeCode, fulfillmentFactoryId, fulfillmentStage, // ⬅️
    );
    ...
  };
}
```
> (Tiện thể truyền luôn `fulfillmentFactoryId` cho đúng — hiện đang bỏ. Không bắt buộc cho plan, nhưng nhất quán.)

**A6. `order.controller.ts`** — 2 endpoint truyền `user?.fulfillmentStage`:
```ts
// GET /grouped
return this.orderService.getOrdersGroupedByType(
  dto, user?.role?.name, user?._id ? String(user._id) : undefined,
  user?.factoryId, user?.fulfillmentStage,                    // ⬅️
);

// GET /workshop-filters
return this.orderService.getWorkshopAvailableFilters(
  dto, user?.role?.name, user?._id ? String(user._id) : undefined,
  user?.factoryId, user?.fulfillmentStage,                    // ⬅️
);
```

> **Cân nhắc (optional)**: nếu muốn user In xem admin-like ở **mọi** chỗ (vd `GET /orders` list, `getFactoryOverview`, `getDashboard`), cần áp `isPrintAdminView` ở các method đó nữa. **Trong scope plan này CHỈ cần `/grouped` + `/workshop-filters`** vì đó là 2 endpoint `OrderTableWorkshop` gọi. Các endpoint khác giữ nguyên (không gây lộ data ngoài ý muốn vì trang khác của user In không dùng).

---

### BƯỚC B — Permission catalog: mở đủ 16 cột (view-only)

**B1. `packages/shared/constants/permission-catalog.ts`** — thêm vào preset `[RoleType.Fulfillment]` (L188-207) các **view** còn thiếu (KHÔNG thêm `.edit`):
```ts
'order.field.toolResult.view',
'order.field.errorFile.view',
'order.field.errorFileNote.view',
'order.field.assignee.view',
'order.field.assigneeNote.view',
'order.field.designerStatus.view',
'order.log.view',                 // để nút Lịch sử + GET /orders/:id/logs hoạt động
```
> Giữ nguyên toàn bộ `.edit` hiện có. `productionErrorSource`/`productionError`/`productionErrorNote`/`printStatus`/`printStatusNote`/`machineNumber` vẫn edit được như cũ.
> `toolResultNote` vẫn **view-only** (Designer là người sửa) — đúng hiện trạng.

**B2. Apply:** restart API → `RoleService.onModuleInit` tự sync. Không cần script migration.
- Verify sau boot: log `[role-seed] sync Fulfillment ... — N codes`.
- User In phải **logout/login lại** (hoặc refresh token) để `permissionCodes` mới vào `authStore.profile.role.permissionCodes`.

---

### BƯỚC C — Frontend: làm `OrderTableWorkshop` tái dùng được

**C1. `components/orders/workshopTableConfig.tsx › WorkshopOrderRow`** — thêm field optional:
```ts
export type WorkshopOrderRow = {
  ...
  factoryId?: string;                          // đã có
  currentFulfillmentStage?: string | null;     // ⬅️ THÊM
  fulfillmentStages?: Record<string, { status?: string } & Record<string, unknown>>; // ⬅️ THÊM
};
```

**C2. `pages/orders/OrderTableWorkshop.tsx`** — thêm 2 prop optional, default không phá admin:
```ts
interface OrderTableWorkshopProps {
  /** Render action stage mỗi dòng (fulfillment print). Trả null = không hiện. */
  extraRowAction?: (row: WorkshopOrderRow) => React.ReactNode;
  /** Header cho cột action thêm. */
  extraActionLabel?: string;
  /** Bump để ép refetch (sau transition). */
  reloadToken?: number;
}
export function OrderTableWorkshop({ extraRowAction, extraActionLabel, reloadToken }: OrderTableWorkshopProps = {}) {
```
Sửa:
- (a) Fetch effect deps (L260-279): thêm `reloadToken` vào dependency array → đổi token là refetch.
- (b) Header: nếu `extraRowAction` có, render thêm cột action **sticky phải** — đặt là cột **cuối cùng** (sau cột `w-12` Lịch sử):
  ```tsx
  {extraRowAction && (
    <TableHead className="sticky right-0 z-30 bg-card whitespace-nowrap text-xs shadow-[-1px_0_0_0_var(--border)]">
      {extraActionLabel ?? 'Thao tác'}
    </TableHead>
  )}
  ```
- (c) Body mỗi dòng: nếu `extraRowAction`, render cột action **sticky phải** với cùng `rowBgClass` (để mask nội dung scroll phía sau — giống pattern sticky-left của cột productionId/checkbox):
  ```tsx
  {extraRowAction && (
    <TableCell className={cn('sticky right-0 z-10 shadow-[-1px_0_0_0_var(--border)]', rowBgClass)}>
      {extraRowAction(row)}
    </TableCell>
  )}
  ```
  > **Quan trọng**: dùng đúng `rowBgClass` của dòng (selected / heaviest-combo / no-tool / `bg-card`) — KHÔNG để trong suốt, nếu không cell scroll phía dưới sẽ lộ qua cột sticky. `shadow-[-1px_0_0_0_var(--border)]` tạo viền trái cho cột sticky phải (đối xứng với `shadow-[1px_0_0_0_...]` của sticky trái). Hàng header group (L626-672) cũng cần 1 `<TableCell>` sticky-right trống tương ứng nếu không sẽ lệch — hoặc cho group header `colSpan` cộng thêm 1 (xem (d)).
- (d) `colSpan`:
  - 2 hàng empty/loading (L586, L593): đổi `visibleCols.length + 2` → tính động `visibleCols.length + 2 + (extraRowAction ? 1 : 0)`.
  - Hàng header group (`colSpan={visibleCols.length + 1}` ở L642): nếu bật action, hoặc cộng thêm 1 vào colSpan, hoặc thêm 1 `<TableCell>` sticky-right trống cuối hàng group để cột thẳng hàng. Đề xuất: cộng colSpan để đơn giản (group header không cần nút).

> Khi admin dùng `<OrderTableWorkshop />` (không prop) → mọi thứ y hệt hiện tại (không render cột action, không đổi colSpan).

> **Bố cục cố định bên phải:** cột action là cột cuối, `sticky right-0` → khi scroll ngang bảng (table trong `overflow-x-auto`), nút Bắt đầu/Hoàn thành/Báo lỗi luôn dính mép phải, không bị cuộn mất. `z-30` ở header / `z-10` ở body để nằm trên các cell thường nhưng dưới overlay dialog.

---

### BƯỚC D — Frontend: trang In dùng bảng admin

**D1. `pages/fulfillment/my-tasks/index.tsx`** — branch theo stage:
```tsx
import { FulfillmentStage } from 'shared';
import PrintWorkshopView from './PrintWorkshopView';
...
export default function FulfillmentMyTasksPage() {
  const profile = useAuthStore((s) => s.profile);
  const myStage = profile?.fulfillmentStage as FulfillmentStage | undefined;
  // User In → bảng admin xem-tất-cả thay cho kanban.
  if (myStage === FulfillmentStage.Print) return <PrintWorkshopView />;
  ... // phần kanban hiện tại giữ nguyên cho các stage khác
}
```
> Admin/Manager (override role, không có `fulfillmentStage`) vẫn vào kanban như cũ. Chỉ user có `fulfillmentStage==='print'` mới rẽ nhánh.

**D2. File mới `pages/fulfillment/my-tasks/PrintWorkshopView.tsx`:**
```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import type { ProductionOrder } from 'shared';
import { FulfillmentStage, FulfillmentStageStatus, FulfillmentTransitionAction } from 'shared';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OrderTableWorkshop } from '@/pages/orders/OrderTableWorkshop';
import type { WorkshopOrderRow } from '@/components/orders/workshopTableConfig';
import { RepositoryRemote } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { handleAxiosError } from '@/utils';
import { ReworkBackDialog } from './ReworkBackDialog';

export default function PrintWorkshopView() {
  const profile = useAuthStore((s) => s.profile);
  const myFactoryId = profile?.factoryId;
  const [reloadToken, setReloadToken] = useState(0);
  const [reworkOrder, setReworkOrder] = useState<ProductionOrder | null>(null);

  const refresh = () => setReloadToken((t) => t + 1);

  const doTransition = async (
    orderId: string,
    action: FulfillmentTransitionAction,
    body?: { target?: 'designer' | FulfillmentStage; reason?: string },
  ) => {
    try {
      await RepositoryRemote.fulfillment.transition(orderId, {
        stage: FulfillmentStage.Print, action, ...body,
      } as never);
      toast.success('Đã cập nhật');
      refresh();
    } catch (err) { handleAxiosError(err); refresh(); }
  };

  const renderRowAction = (row: WorkshopOrderRow) => {
    // Chỉ thao tác được đơn ĐANG ở stage print + thuộc xưởng mình (khớp BE guard).
    if (row.currentFulfillmentStage !== FulfillmentStage.Print) return null;
    if (!myFactoryId || String(row.factoryId) !== String(myFactoryId)) return null;
    const status = row.fulfillmentStages?.print?.status;
    if (status === FulfillmentStageStatus.Waiting || status === FulfillmentStageStatus.Rework) {
      return (
        <Button size="sm" onClick={() => doTransition(row._id, FulfillmentTransitionAction.Start)}>
          Bắt đầu
        </Button>
      );
    }
    if (status === FulfillmentStageStatus.InProgress) {
      return (
        <div className="flex gap-1">
          <Button size="sm" onClick={() => doTransition(row._id, FulfillmentTransitionAction.Complete)}>
            Hoàn thành
          </Button>
          <Button size="sm" variant="destructive"
            onClick={() => setReworkOrder(row as unknown as ProductionOrder)}>
            Báo lỗi
          </Button>
        </div>
      );
    }
    return null; // done / khác → không action
  };

  return (
    <TooltipProvider delayDuration={200}>
      <OrderTableWorkshop
        extraRowAction={renderRowAction}
        extraActionLabel="Thao tác In"
        reloadToken={reloadToken}
      />
      {reworkOrder && (
        <ReworkBackDialog
          order={reworkOrder}
          myStage={FulfillmentStage.Print}
          onClose={() => setReworkOrder(null)}
          onSubmit={async (target, reason) => {
            await doTransition(reworkOrder._id, FulfillmentTransitionAction.ReworkBack, { target, reason });
            setReworkOrder(null);
          }}
        />
      )}
    </TooltipProvider>
  );
}
```
> **Lưu ý import**: `OrderTableWorkshop` đang là **named export** (`export function OrderTableWorkshop`). Import đúng dạng `{ OrderTableWorkshop }`.
> **Lưu ý type**: `WorkshopOrderRow` không hoàn toàn = `ProductionOrder`; ép kiểu khi đưa vào `ReworkBackDialog` (`as unknown as ProductionOrder`) hoặc nới prop dialog nhận row tối thiểu.

---

### BƯỚC E — Docs (bắt buộc theo CLAUDE.md)

**E1. `documents/FunctionDescription/FulfillmentWorkflow.md`**: thêm mục mới (vd §4.5 "Print stage — admin table view"):
- Trang In hiển thị `OrderTableWorkshop` (table, all-factory, all-status) thay kanban.
- BE bypass visibility qua `isPrintAdminView()` ở `buildVisibilityFilter`, áp tại `/grouped` + `/workshop-filters`.
- Action stage chỉ hiện cho đơn `currentFulfillmentStage==='print'` + cùng factory; transition vẫn qua endpoint cũ.
- Permission: thêm 6 `*.view` + `order.log.view` vào preset Fulfillment.

**E2. `documents/FunctionDescription/Orders.md`**: note `OrderTableWorkshop` nhận thêm prop optional `extraRowAction` / `extraActionLabel` / `reloadToken` (reuse bởi trang Fulfillment In). Cập nhật §10.2.

---

## 3. Thứ tự implement đề xuất

1. **B1** (catalog) — nhỏ, độc lập.
2. **A2–A6** (BE visibility) — test bằng tài khoản In gọi `/grouped` thấy đơn lỗi/non-ok + xưởng khác.
3. **C1–C2** (`OrderTableWorkshop` props) — chạy lại admin để chắc không hồi quy.
4. **D1–D2** (branch + `PrintWorkshopView`).
5. **E1–E2** (docs).

---

## 4. Checklist test

### BE
- [ ] Tài khoản In gọi `GET /v1/orders/grouped` (mặc định today) → thấy **mọi xưởng**, gồm đơn `toolResultNote != 'ok'` và đơn `currentFulfillmentStage=null`.
- [ ] `GET /v1/orders/workshop-filters` trả facet theo tập đơn admin-like (không bị cắt bởi readyForFulfill).
- [ ] Stage Fulfillment khác (vd tài khoản Ép) gọi `/grouped` → **vẫn bị giới hạn cũ** (readyForFulfill + factory). (Đảm bảo chỉ print được mở.)
- [ ] `POST /fulfillment-transition` của user In trên đơn **xưởng khác** → 403 (BE guard). FE đã ẩn nút nên không gọi tới.

### FE
- [ ] Login tài khoản In → vào `/fulfillment/my-tasks` thấy **table** (không kanban), đủ 16 cột.
- [ ] Đơn ở stage print + cùng xưởng: hiện nút contextual (waiting→Bắt đầu; in-progress→Hoàn thành+Báo lỗi). Bấm Hoàn thành → đơn advance sang Ép, table refetch (reloadToken).
- [ ] Đơn KHÔNG ở print / khác xưởng: cột "Thao tác In" trống.
- [ ] Cột "Thao tác In" **dính mép phải** khi scroll ngang bảng (sticky right), nền cột khớp màu dòng (selected/no-tool/heaviest), không lộ cell phía sau.
- [ ] "Báo lỗi" mở `ReworkBackDialog`, submit rework-back chạy đúng.
- [ ] Edit cell: chỉ field được phép (printStatus, printStatusNote, machineNumber, productionError*, …) sửa được; cột khác read-only.
- [ ] Admin mở `/orders` tab Workshop → **không đổi gì** (regression).
- [ ] Stage khác (Ép/QC/May/Đóng) → kanban như cũ.

### Permission
- [ ] Sau restart API: log `[role-seed] sync Fulfillment`. User In logout/login → `profile.role.permissionCodes` có 6 `.view` mới + `order.log.view`.

---

## 5. Rủi ro / lưu ý

- **Lộ data cross-factory**: user In nay thấy đơn mọi xưởng (đúng yêu cầu "y hệt admin"). Đảm bảo nghiệp vụ chấp nhận điều này — worker xưởng A thấy đơn xưởng B (chỉ xem, không thao tác).
- **`onModuleInit` ghi đè custom role**: nếu admin từng chỉnh tay quyền Fulfillment, sẽ bị reset về preset khi boot (behavior sẵn có).
- **`reloadToken` reset selection/collapse** của `OrderTableWorkshop` chỉ khi refetch — chấp nhận được (filter giữ qua URL).
- **`colSpan`** hàng empty/loading phải +1 khi bật cột action, tránh lệch layout.
- **Không đổi** `getMyTasks`/kanban của các stage khác → tách bạch rủi ro.
