# Auto-gán Designer theo xưởng — Function Description

> **File FE:** `apps/web/src/pages/settings/index.tsx` + `apps/web/src/components/settings/DesignerAssignmentConfig.tsx` + `apps/web/src/services/designerAssignment.ts`
> **File BE:** `apps/api/src/modules/designer-assignment/` (service + controller + module) + `apps/api/src/modules/order/order.service.ts` → `autoAssignAfterImport()` + `allocateByWeight()` + hook `importRework`/`updateField`
> **Route:** `/adm/settings` (gate quyền `role.manage`)
> **API:** `GET/PUT /v1/designer-assignment/config`

## 1. Overview

Cho phép Admin cấu hình **mỗi xưởng có những designer nào + trọng số (%) nhận
task**. Sau khi **soát tool xong** cho một đơn (`toolResultNote` **có giá trị &
!= 'ok'** — tức đã soát và có lỗi cần designer), hệ thống **tự động gán** đơn cho
designer của xưởng đó theo tỉ lệ đã cấu hình, **không cần gán tay**.

- **Bất biến:** 1 designer chỉ thuộc **1 xưởng** (validate BE lúc lưu + FE lúc chọn).
- **% tự do:** nhập trọng số bất kỳ (>= 0), không cần cộng đủ 100; tỉ lệ thực =
  `weight / Σweight` của xưởng.
- Designer hiện KHÔNG có field `factoryId` (khác role Fulfillment) — liên kết
  designer↔xưởng **chỉ tồn tại trong cấu hình này**.

## 2. Luồng hoạt động

1. Admin vào `/settings` → section "Gán designer theo xưởng". Chọn designer cho
   từng xưởng + nhập trọng số → **Lưu** (`PUT /v1/designer-assignment/config`).
2. Đơn được **soát tool** đặt `toolResultNote != 'ok'` qua 1 trong các đường:
   - `importRework` (import file soát tool) — hook gom ứng viên trong vòng lặp.
   - `updateField('toolResultNote', code)` sửa tay ô "Note kq Tool" (bulk
     `bulkUpdateField` field `toolResultNote` **delegate** qua `updateField` nên
     cũng phủ).
   - `markToolCheckDone` (nút "Đã soát xong" list "Cần làm lại" tab Soát tool —
     đơn hold In trả về, chưa có designer; note giữ nguyên `'error'`; **await**
     để trả outcome thật cho FE toast — xem `ToolCheckWorkflow.md §2.2b`).
3. Hook gọi `OrderService.autoAssignAfterImport(orderIds, ctx)` (fire-and-forget,
   riêng `markToolCheckDone` await).
4. Engine xác minh lại điều kiện trên DB → chia đơn theo trọng số → `updateMany`
   set `assignee` + `designerStatus='assigned'` → ghi `orderLog` (field `assignee`).

> `importOrders` (import đơn chính) **không** gắn hook: đơn mới có `toolResultNote`
> rỗng → không bao giờ thỏa luật "có giá trị & != 'ok'".

## 3. API / Schema

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/v1/designer-assignment/config` | `@Auth([Admin])` | Lấy cấu hình |
| PUT | `/v1/designer-assignment/config` | `@Auth([Admin])` | Lưu (validate 1-designer-1-xưởng) |

Lưu blob JSON trong collection `system_configs` (key `designer_assignment_config`,
Redis-cache 1h qua `SystemConfigService`). Shared DTO
`packages/shared/dtos/designer-assignment.dto.ts`:

```ts
DesignerAssignmentConfig = {
  factories: Array<{
    factoryId: string;
    designers: Array<{ designerId: string; weight: number }>; // weight >= 0
  }>;
  updatedAt?: string;
}
```

Constant `DESIGNER_ASSIGNMENT_CONFIG_KEY = 'designer_assignment_config'`.

## 4. UI Components

`DesignerAssignmentConfig.tsx`:
- Mount: load `factory.getFactories()` + `designer.listTeam('1')` (Status.Active) +
  `designerAssignment.getConfig()`.
- Mỗi xưởng 1 card: danh sách designer (tên + ô trọng số + **% quy đổi** + nút xóa)
  + dropdown "Thêm designer".
- **Chặn 1-designer-nhiều-xưởng:** designer đã ở xưởng khác hiển thị `disabled` +
  ghi chú "(đã ở {xưởng})" trong dropdown.
- Nút **Lưu** → `saveConfig` (chỉ gửi xưởng có ≥ 1 designer).

## 5. Backend logic

### 5.1 `DesignerAssignmentService.saveConfig(dto)`
- Validate: 1 `designerId` không xuất hiện ở ≥ 2 xưởng (và không lặp trong cùng
  xưởng) → `BadRequestException`. Không kiểm tra tổng % .
- `SystemConfigService.set(KEY, { ...dto, updatedAt })`.

### 5.2 `OrderService.autoAssignAfterImport(orderIds, ctx)`
- Đọc config; nếu rỗng → return. Map `factoryId → designers[]`.
- **Xác minh ứng viên trên DB** (authoritative, không tin state truyền vào):
  `designerStatus='unassigned'` & `assignee ∈ [null,'']` & `factoryId ∈ configured`
  & `toolResultNote ∉ [null,'','ok']` & `cancelledAt=null` & `heldAt=null` &
  `deletedAt` không tồn tại.
- Lọc designer **Active + role Designer** (query `userModel`).
- Nhóm ứng viên theo `factoryId` → `allocateByWeight(N, weights)` → cắt orderId →
  mỗi designer 1 `updateMany({_id∈slice, designerStatus:'unassigned'}, {$set:...})`
  (guard `unassigned` chống race).
- `orderLogService.writeMany` (field `assignee`, after=designerId) + `invalidateListCache`.

### 5.3 `OrderService.allocateByWeight(n, weights)`
`baseᵢ = floor(n × wᵢ / Σw)`; **số dư dồn hết cho designer đầu danh sách**. Σw = 0
→ chia đều. Trọng số < 0 hoặc không hợp lệ → coi như 0.

## 6. Performance notes
- Cấu hình cache Redis 1h → đọc gần như free ở hook.
- Engine: 1 `find` (ứng viên) + 1 `find` (designer Active) + K `updateMany` (K =
  số designer có phần > 0). Chạy fire-and-forget, không chặn response import/edit.
- Guard `designerStatus:'unassigned'` trong `updateMany` → không đè đơn đã có người.

## 7. Permissions
- Cấu hình: `@Auth([Admin])` (FE gate `role.manage`).
- Auto-gán chạy server-side theo actor của import/edit (ghi log `orderLog` field
  `assignee`).
