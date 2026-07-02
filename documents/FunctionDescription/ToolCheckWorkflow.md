# Soát tool — Lỗi "do Soát tool" + Dashboard Support — Function Description

> **File FE:** `apps/web/src/pages/home/ToolCheckTab.tsx` (tab thứ 5 trong `apps/web/src/pages/home/index.tsx`, bên trái tab Designer), `apps/web/src/services/designer.ts` → `toolCheckOverview`, `apps/web/src/pages/workshop-config/CategoryEditor.tsx` (nút chọn nguồn + badge), cells `ProductionErrorSelectCell`/`ErrorSourceCell`/`ColorBadgeSelectCell`/`SelectPopover`
> **File BE:** `apps/api/src/modules/order/order.service.ts` (hook rework-back tool-check), `apps/api/src/modules/designer/designer-stats.service.ts` → `getToolCheckOverview()`, `designer-stats.controller.ts` → `GET /v1/designer/tool-check-overview`, `apps/api/src/modules/fulfillment/fulfillment-task.service.ts` (tab watching), `apps/api/src/modules/workshop-config/workshop-config.seed.ts` (seed "Thiếu file để in")
> **Route:** `/` (Dashboard) → tab `?tab=tool-check`
> **API:** `GET /v1/designer/tool-check-overview`

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
- `toolResultNote='ok'` → marker mất → đơn **tự quay lại tab "Đang chờ" active của In** (filter tự xử lý, không cần flip stage thủ công). `readyForFulfill=true`, `productionFirstErrorAt=null`.
- `productionErrorSource='tool-check'` **giữ nguyên** (cho thống kê lịch sử); chỉ `toolResultNote` quyết định trạng thái hold.

### 2.3 Tab Dashboard "Soát tool"

Support/Admin mở Dashboard → tab "Soát tool":
- Filter **thời gian** (7/14/30 + `DateRangePicker`) — lọc theo `inProductionAt` (tz VN).
- **KPI**: Đã soát trong kỳ · In trả về (cần làm lại) · Chưa soát · Lỗi soát tool đang chờ.
- **2 nhóm danh sách** (segmented, để support biết làm gì trước):
  1. **Cần làm lại** (In trả về) — ưu tiên (`source=tool-check + note=error`).
  2. **Chưa soát** — backlog (`toolResultNote` rỗng).
- **Thống kê lỗi** (mọi đơn `source=tool-check` trong kỳ): theo **sản phẩm** (mockup + level), theo **khách hàng** (`userSku`), và **khách × loại lỗi hay gặp nhất**.

## 3. API / Schema

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/v1/designer/tool-check-overview` | SuperAdmin/Admin/Manager/SupportManager/Support | Đơn In trả về + đơn chưa soát + thống kê lỗi |

Request `GetToolCheckOverviewDto` (`packages/shared/dtos/production-order.dto.ts`):
```ts
{ days: '7'|'14'|'30'; from?: string; to?: string; type?: string; customer?: string }
```

Response `ToolCheckOverviewResDto.data`:
```ts
{
  checkedCount: number;          // toolCheckedAt ∈ kỳ
  errorCount: number;            // đang chờ support (= reworkList)
  reworkList: ToolCheckOrder[];  // In trả về (source=tool-check + note=error)
  unreviewedList: ToolCheckOrder[]; // toolResultNote rỗng
  byProduct: ToolCheckProductStat[];   // {type, fullName?, mockup?, level?, count}
  byCustomer: ToolCheckCustomerStat[]; // {userSku, count}
  topCustomerError: ToolCheckCustomerError[]; // {userSku, code, label?, count}
  rangeDays: number;
}
```

`errorSource` (shared `ErrorSourceZod`, entity `WorkshopConfigEntity.errorSource`, `productionErrorSource`) = `'designer' | 'factory' | 'tool-check'`.

## 4. UI Components

- **CategoryEditor** (`workshop-config`): nút chọn nguồn thêm "Do soát tool" (amber); `ErrorSourceBadge` case "SOÁT TOOL".
- **ProductionErrorSelectCell** / **ColorBadgeSelectCell**: badge "SOÁT TOOL" (amber) cho option `errorSource='tool-check'`.
- **ErrorSourceCell** (cell "Loại lỗi"): thêm option "Do soát tool" + hiển thị badge amber (admin override được).
- **ToolCheckTab**: xem §2.3 — reuse `ImageThumbCell`/`ImagePreviewDialog`/`CopyButton`/`PRODUCT_LEVEL_MAP`.

## 5. Backend logic

- **Hook rework-back tool-check** (`order.service.ts`): helper chung `buildDesignerReworkBackFromError(before, reason, ctx, target='tool-check')` + gate `canReworkBackToSupport(before)` (skip khi đã hold, tránh báo trùng). 3 call-site: `updateField('productionError')`, `updateField('productionErrorSource')`, `setProductionError`.
- **Filter tab In** (`applyFulfillmentStatusFilter` — bảng In `PrintOrderTable`): `waiting` loại trừ `$nor:[{source:'tool-check', note:'error'}]`; `watching` thêm `$or:{source:'tool-check', note:'error'}`. Mirror trong `FulfillmentTaskService.applyTabFilter` (kanban, tab watching — `waiting` đã tự loại nhờ `readyForFulfill:true`).
- **Stats** (`DesignerStatsService.getToolCheckOverview`): 1 `countDocuments` + 2 `find` (rework/unreviewed, cap 500) + 3 `aggregate` (byProduct với `$max productConfigId` join mockup/level, byCustomer, userSku×code) song song. Loại đơn xoá/hủy bằng `{ deletedAt: null, cancelledAt: null }`. Label loại lỗi resolve từ `workshop_config` (category production_error).
- **Seed** (`workshop-config.seed.ts` + `WorkshopConfigService.onModuleInit`): tạo `tool-missing-file` idempotent khi boot.

## 6. Performance notes

- Overview: 6 query song song, tất cả trong cửa sổ ngày + index sẵn (`inProductionAt`, `toolCheckedAt`, `productionErrorSource`). List cap 500 → payload nhỏ.
- Không cache (on-demand, tab ít truy cập).

## 7. Permissions

- `page.tool_check` (mới) — preset `Support` + auto Admin/SuperAdmin/Manager (ALL_PERMISSION_CODES). `RoleService.onModuleInit` sync khi boot.
- Endpoint `@Auth([SuperAdmin, Admin, Manager, SupportManager, Support])`.
- Tab FE gate `isAdmin || has('page.tool_check')`.
