# Plan — Trạng thái lỗi "Soát tool" + tab Dashboard Support

> Trạng thái: **✅ ĐÃ IMPLEMENT**. Doc chính: [`../FunctionDescription/ToolCheckWorkflow.md`](../FunctionDescription/ToolCheckWorkflow.md).
> Liên quan: `FulfillmentWorkflow.md §2.3b`, `DesignerTaskWorkflow.md §2.4/3.4`, `OrderLifecycle.md`, `Dashboard.md`.

## 0. Quyết định đã chốt

1. **Support xử lý:** chỉ đổi cell **"Note kq Tool" → 'ok'** trên bảng `/orders` → đơn tự route lại In. Tab mới **read-only** (worklist + thống kê), KHÔNG thêm endpoint resolve.
2. **Thống kê "user" = khách hàng `order.userSku`** → KHÔNG thêm field `toolCheckedBy`.
3. **Đơn khi In báo "do soát tool":** vào tab **"Đang chờ quay lại"** của In (mirror luồng trả-về-Designer); support set 'ok' → quay lại active của In.
4. **Tab list = 2 nhóm tách biệt:** (a) **Cần làm lại** (In trả về) = ưu tiên; (b) **Chưa soát** (`toolResultNote` rỗng) = backlog.

**Marker "support-hold"** (tự quyết): `productionErrorSource='tool-check' AND toolResultNote='error'`. Song song cách designer dùng `designerStatus='rework'`. Support set 'ok' → `toolResultNote` đổi → marker mất → đơn về active In.

## 1. Data model (shared + entity)

| File | Sửa |
|---|---|
| `packages/shared/dtos/workshop-config.dto.ts:19` | `ErrorSourceZod = z.enum(['designer','factory','tool-check'])` |
| `packages/shared/dtos/production-order.dto.ts:218` | `productionErrorSource: z.enum(['designer','factory','tool-check']).optional()` |
| `packages/shared/dtos/designer.dto.ts:672` | đồng bộ enum |
| `apps/api/.../order.entity.ts` (`productionErrorSource`) | mở rộng type union `'tool-check'` |
| `FulfillmentTimelineEntry.reworkTarget` (production-order.dto) | thêm `'tool-check'` |

> Sau sửa shared: `pnpm --filter shared build` + **restart API** (Common_Pitfalls #5/#6).

## 2. Backend — đẩy về Support

`order.service.ts`:
- Thêm helper `buildToolCheckReworkBackFromError()` (mirror `buildDesignerReworkBackFromError:614`) — timeline entry `reworkTarget:'tool-check'`, reporter stage → waiting.
- Gate `canReworkBackToSupport()` — fire khi lỗi loại `tool-check` (không cần điều kiện designerStatus).
- 3 call-site (giống designer): `updateField(productionError)`, `updateField(productionErrorSource)`, `setProductionError` — khi `errorSource==='tool-check'`:
  - `productionErrorSource='tool-check'`, `productionErrorNote=reason`, `toolResultNote='error'`, `readyForFulfill=false`, `$inc productionErrorCount`.
  - Merge `set` + `$push fulfillmentTimeline`.
- **Hook quay lại In** trong `updateField('toolResultNote'='ok')`: nếu `before.productionErrorSource==='tool-check'` (đơn support-hold) + stage print đang waiting → flip `fulfillmentStages.print.status` để In thấy ở "Cần làm lại" (tương tự `designer-task.service.ts:105`). Clear marker (`productionErrorSource` giữ cho stats, `toolResultNote='ok'` đủ để bỏ hold).

`applyFulfillmentStatusFilter` (`order.service.ts:527`) + `FulfillmentTaskService.applyTabFilter`:
- `waiting`: thêm loại trừ hold → `$and` push `{ $nor: [{ productionErrorSource: 'tool-check', toolResultNote: 'error' }] }`.
- `watching`: mở rộng `$or` thêm `{ $and: [{ productionErrorSource: 'tool-check' }, { toolResultNote: 'error' }] }`.

## 3. Frontend — nguồn lỗi mới

- `workshop-config/CategoryEditor.tsx` (~298 nút chọn nguồn, :373 `ErrorSourceBadge`): thêm nút + badge "Soát tool" (amber). Cập nhật union `'designer'|'factory'` (:49,104,304,315,373).
- `components/orders/cells/ProductionErrorSelectCell.tsx:19,112` + `ErrorSourceCell.tsx`: badge/label "SOÁT TOOL".
- Seed mã mặc định trong `WorkshopConfigService.onModuleInit()` (:55): `{ category:'production_error', code:'tool-missing-file', name:'Thiếu file để in', errorSource:'tool-check', color:'#F59E0B' }` (idempotent).

## 4. Tab Dashboard "Soát tool"

- `pages/home/index.tsx`: thêm `'tool-check'` vào `TABS`, `TabsTrigger`/`TabsContent` **bên trái `designer`**; gate `canSeeToolCheck = isAdmin || has('page.tool_check')`. Namespace URL param `tc*`. Icon `ScanLine`/`ClipboardCheck` (lucide).
- Component mới `pages/home/ToolCheckTab.tsx` (mirror khung `DesignerStatsTab.tsx`):
  - Filter bar: `DateRangePicker` + sản phẩm (`type`) + khách (`userSku`).
  - **2 nhóm list** (chip/segmented): "Cần làm lại (In trả về)" | "Chưa soát" — mỗi nhóm bảng rút gọn + ảnh (ImageThumbCell), productionId, khách, sản phẩm, note lỗi. Click productionId → mở đơn.
  - Block thống kê (xem §5).

## 5. Endpoint thống kê

`GET /v1/orders/tool-check-overview?from&to&type&customer` (`@Auth([SuperAdmin, Admin, Support])`) trong `order.service.ts` + `order.controller.ts`:
- `checkedCount` — số đơn `toolCheckedAt ∈ [from,to]`.
- `errorCount` — số đơn `productionErrorSource='tool-check' AND toolResultNote='error'`.
- `reworkList[]` — đơn In trả về (hold) rút gọn + ảnh.
- `unreviewedList[]` — đơn `toolResultNote` rỗng (backlog).
- `byProduct[]` — lỗi theo `order.type` (join productConfig → mockup/level).
- `byCustomer[]` — lỗi theo `userSku`.
- `topCustomerError[]` — `userSku × productionError` hay gặp nhất.

DTO mới trong `production-order.dto.ts`: `GetToolCheckOverviewDto` + `ToolCheckOverviewResDto`. Service client `apps/web/src/services/order.ts` → `toolCheckOverview()`.

## 6. Permissions

- `permission-catalog.ts`: thêm `page.tool_check` (group page). Preset `Support` + `SupportManager` (+ auto Admin/SuperAdmin). `RoleService.onModuleInit` tự sync.

## 7. Docs

- Tạo `documents/FunctionDescription/ToolCheckWorkflow.md` + dòng mapping trong `CLAUDE.md`.
- Cập nhật: `FulfillmentWorkflow.md §2.3b` (target `tool-check`), `DesignerTaskWorkflow.md` (bảng errorSource), `Dashboard.md` (tab mới), `OrderLifecycle.md` (nếu ảnh hưởng chặng Soát tool).

## 8. Typecheck baseline

BE 31 / FE 85 (pre-existing). Giữ nguyên, không thêm lỗi ở file đụng vào.
