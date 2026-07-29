# Auto-gán Designer (chuỗi ưu tiên khách hàng → sản phẩm → xưởng) — Function Description

> **File FE:** `apps/web/src/pages/settings/index.tsx` + `apps/web/src/components/settings/DesignerAssignmentConfig.tsx` + `apps/web/src/components/settings/DesignerAssignKanban.tsx` + `apps/web/src/services/designerAssignment.ts` > **File BE:** `apps/api/src/modules/designer-assignment/` (service + controller + module) + `apps/api/src/modules/order/order.service.ts` → `autoAssignAfterImport()` (public) + `allocateByLoad()` + hook `importRework`/`updateField`/`setProductionError`/`markToolCheckDone` + `apps/api/src/modules/fulfillment/fulfillment-task.service.ts` → hook `transition()` rework-back target=designer > **Route:** `/adm/settings/designer-assign` (mục "Tự động gán designer" trong Settings, gate quyền `role.manage`)
> **API:** `GET/PUT /v1/designer-assignment/config`

## 1. Overview

> **Loại xưởng US (2026-07):** engine `autoAssignAfterImport()` luôn bỏ xưởng ngoài luồng sản xuất (shortName `US`) khỏi cả 3 mức: xóa khỏi map cấu hình mức 3 (`byFactory.delete`) và loại đơn thuộc xưởng US khỏi query ứng viên (`factoryId $nin [..., excludedFactoryId]`) — xem `Orders.md §21`.

Sau khi **soát tool xong** cho một đơn (`toolResultNote` **có giá trị & != 'ok'**
— tức đã soát và có lỗi cần designer), hệ thống **tự động gán** đơn cho designer
theo **chuỗi ưu tiên 3 mức** Admin cấu hình ở `/adm/settings/designer-assign`, **không cần gán tay**:

1. **Khách hàng → Designer** (kanban kéo thả, card = khách bảng `customers`):
   đơn khớp khách qua `customerMatchKey(userSku, userEmail)` → gán **thẳng**
   designer đó, **BẤT KỂ xưởng** của đơn.
2. **Sản phẩm → Designer** (kanban kéo thả, card = sản phẩm Product Config):
   đơn không khớp khách nhưng `productConfigId` nằm trong cấu hình → gán thẳng
   designer đó, BẤT KỂ xưởng.
3. **Theo xưởng** (cấu hình cũ giữ nguyên): đơn còn lại chia cho designer của
   xưởng theo trọng số, **cân bằng tải thực tế** (`allocateByLoad` — đọc số đơn
   chưa xong mỗi designer đang giữ từ DB, kể cả đơn vừa gán ở mức 1/2 trong cùng
   lô).

Designer chỉ định ở mức 1/2 không hợp lệ (bị tắt / đổi role) → đơn **rơi xuống
mức tiếp theo** (khách → sản phẩm → xưởng), không kẹt lại.

Ngoài luồng soát tool, **đơn bị báo lỗi nguồn designer khi CHƯA ai ôm** (đơn soát
'ok' từ đầu đi thẳng fulfillment nên chưa từng có designer) cũng được auto-gán —
khỏi nằm backlog "Cần gán" chờ leader phân / designer self-claim (xem §2 bước 2b).

- **Bất biến:** 1 designer chỉ thuộc **1 xưởng** (mức 3); 1 khách / 1 sản phẩm
  chỉ thuộc **1 designer** (mức 1/2 — kanban 1 card 1 cột; BE validate lại lúc lưu).
- **% tự do (mức 3):** nhập trọng số bất kỳ (>= 0), không cần cộng đủ 100; tỉ lệ
  thực = `weight / Σweight` của xưởng.
- Designer hiện KHÔNG có field `factoryId` (khác role Fulfillment) — liên kết
  designer↔xưởng **chỉ tồn tại trong cấu hình này**.

## 2. Luồng hoạt động

1. Admin vào `/settings` → section "Tự động gán designer" (3 phần ưu tiên):
   - **Ưu tiên 1:** kanban kéo khách hàng (bảng `customers`, sort VIP 0→5 rồi
     khách lẻ) vào cột designer — **thả là auto-save ngay** (không cần bấm Lưu).
   - **Ưu tiên 2:** kanban kéo sản phẩm (Product Config, có thumbnail mockup)
     vào cột designer — thả là auto-save ngay.
   - **Ưu tiên 3:** chọn designer cho từng xưởng + nhập trọng số (UI cũ) — cần
     bấm **Lưu**.
   Cả auto-save lẫn nút **Lưu** đều gửi trọn cả 3 phần
   (`PUT /v1/designer-assignment/config`).
2. Đơn được **soát tool** đặt `toolResultNote != 'ok'` qua 1 trong các đường:
   - `importRework` (import file soát tool) — hook gom ứng viên trong vòng lặp.
   - `updateField('toolResultNote', code)` sửa tay ô "Note kq Tool" (bulk
     `bulkUpdateField` field `toolResultNote` **delegate** qua `updateField` nên
     cũng phủ).
   - `markToolCheckDone` (nút "Đã soát xong" list "Cần làm lại" tab Soát tool —
     đơn hold In trả về, chưa có designer; note giữ nguyên `'error'`; **await**
     để trả outcome thật cho FE toast — xem `ToolCheckWorkflow.md §2.2b`).

   **NGOẠI LỆ:** `OrderService.setDesignReviewResult()` (public API
   `POST /orders/design-review/result` cho tool ngoài duyệt thiết kế, xem
   `Orders.md §18.7`) gọi `updateField('toolResultNote', ...)` với
   `opts.skipAutoAssign: true` — tool ngoài soát xong **KHÔNG** tự gán
   designer (khác sửa tay/import rework ở trên); đơn nằm ở backlog "Cần gán"
   chờ Leader/Admin gán tay.

2b. **Báo lỗi nguồn designer trên đơn CHƯA ai ôm** (`designerStatus` thành
   `'rework'` + `assignee` rỗng) qua 1 trong 3 đường — hook fire sau khi ghi DB:
   - `setProductionError` (quét mã lỗi / cell lỗi) — khi `autoReworkApplied`.
   - `updateField('productionError')` / `updateField('productionErrorSource'='designer')`
     (bulk delegate qua `updateField` nên cũng phủ) — khi `autoReworkApplied`.
   - `FulfillmentTaskService.transition()` action=rework-back target=designer
     (kanban Fulfillment / `OrderErrorScanDialog`) — inject `OrderService`
     (FulfillmentModule import OrderModule, không vòng lặp).
   Đơn đã có assignee (rework về designer cũ) → engine tự lọc, không đụng.

3. Hook gọi `OrderService.autoAssignAfterImport(orderIds, ctx)` (fire-and-forget,
   riêng `markToolCheckDone` await).
4. Engine xác minh lại điều kiện trên DB → **route từng đơn theo chuỗi ưu tiên**
   (khách hàng → sản phẩm → xưởng, xem §5.2) → đếm **tải thực tế** (số đơn chưa
   xong mỗi designer đang giữ) → mức 1/2 gán thẳng, mức 3 chia **cân bằng tải
   theo trọng số** → `updateMany` set `assignee` (+ `designerStatus='assigned'`
   cho ứng viên unassigned; ứng viên `rework` **GIỮ nguyên status** → task vào
   thẳng cột "Cần làm lại") → ghi `orderLog` (field `assignee`).

> `importOrders` (import đơn chính) **không** gắn hook: đơn mới có `toolResultNote`
> rỗng → không bao giờ thỏa luật "có giá trị & != 'ok'".

## 3. API / Schema

| Method | Path                             | Auth             | Mô tả                             |
| ------ | -------------------------------- | ---------------- | --------------------------------- |
| GET    | `/v1/designer-assignment/config` | `@Auth([Admin])` | Lấy cấu hình                      |
| PUT    | `/v1/designer-assignment/config` | `@Auth([Admin])` | Lưu (validate 1-designer-1-xưởng) |

Lưu blob JSON trong collection `system_configs` (key `designer_assignment_config`,
Redis-cache 1h qua `SystemConfigService`). Shared DTO
`packages/shared/dtos/designer-assignment.dto.ts`:

```ts
DesignerAssignmentConfig = {
  // Ưu tiên 1 — khách hàng → designer (config cũ chưa có field → coi như [])
  customers: Array<{ designerId: string; customerIds: string[] }>;
  // Ưu tiên 2 — sản phẩm → designer
  products: Array<{ designerId: string; productConfigIds: string[] }>;
  // Ưu tiên 3 — chia theo xưởng
  factories: Array<{
    factoryId: string;
    designers: Array<{ designerId: string; weight: number }>; // weight >= 0
  }>;
  updatedAt?: string;
}
```

Constant `DESIGNER_ASSIGNMENT_CONFIG_KEY = 'designer_assignment_config'`.

## 4. UI Components

`DesignerAssignmentConfig.tsx` (3 section ưu tiên, 1 nút **Lưu** chung):

- Mount: load song song `factory.getFactories()` + `designer.listTeam('1')`
  (Status.Active) + `designerAssignment.getConfig()` + `customer.list()` +
  `productConfig.getProductConfigs('?page=1&limit=5000')`.
- **Ưu tiên 1 & 2** dùng chung `DesignerAssignKanban.tsx` (dnd-kit, mẫu theo
  `CustomerFactoryKanban.tsx`): cột "Chưa gán" + 1 cột/designer, search mọi cột,
  card khách = userSku + email + `TierBadge` (sort VIP 0→5 rồi tên), card sản
  phẩm = thumbnail mockup + fullName + shortName (sort theo tên). Kéo card sang
  cột = gán; kéo về "Chưa gán" = bỏ gán. 1 card chỉ ở 1 cột → tự thỏa bất biến.
- **Auto-save khi thả card** (mức 1/2): mỗi lần kéo thả gọi ngay `saveConfig`
  với snapshot mới nhất (`latestRef` cập nhật đồng bộ lúc thả — không đợi React
  commit; các lần lưu **chuỗi hóa** qua `saveChainRef` để kéo liên tiếp không đè
  nhau sai thứ tự). Indicator "Đang lưu..." cạnh nút Lưu; lỗi → toast, không
  hoàn tác UI (bấm Lưu để thử lại). Payload gửi trọn cả 3 phần nên chỉnh trọng
  số mức 3 chưa bấm Lưu cũng được lưu kèm theo lần kéo thả gần nhất.
- **Ưu tiên 3** giữ UI cũ: mỗi xưởng 1 card, danh sách designer (tên + ô trọng
  số + **% quy đổi** + nút xóa) + dropdown "Thêm designer".
- **Chặn 1-designer-nhiều-xưởng:** designer đã ở xưởng khác hiển thị `disabled` +
  ghi chú "(đã ở {xưởng})" trong dropdown.
- Nút **Lưu** → `saveConfig` (chỉ gửi designer/xưởng có ≥ 1 item).
- i18n namespace `designerAutoAssign` (keys `priority1/2/3.*`, `kanban.*`).

## 5. Backend logic

### 5.1 `DesignerAssignmentService.saveConfig(dto)`

- Validate: 1 `designerId` không xuất hiện ở ≥ 2 xưởng (và không lặp trong cùng
  xưởng); 1 `customerId` / 1 `productConfigId` không xuất hiện ở ≥ 2 designer →
  `BadRequestException`. Không kiểm tra tổng %.
- `SystemConfigService.set(KEY, { customers, products, factories, updatedAt })`
  (lọc bỏ entry rỗng).

### 5.2 `OrderService.autoAssignAfterImport(orderIds, ctx)`

- Đọc config; dựng `byFactory` (mức 3) + `designerByCustomerId`/`designerByProductConfigId`
  (mức 1/2); cả 3 rỗng → return.
- **Mức 1:** load khách theo id cấu hình (`CustomerRepository.findAll`) → map
  `customerMatchKey(userSku, userEmail) → designerId` (cùng khóa so khớp với
  tính năng gán xưởng theo khách — `CustomerFactoryAssignment.md`).
- **Xác minh ứng viên trên DB** (authoritative, không tin state truyền vào) —
  điều kiện chung: `assignee ∈ [null,'']` & `factoryId` đã map & ≠ xưởng US
  (KHÔNG giới hạn theo cấu hình mức 3 vì mức 1/2 gán bất kể xưởng) &
  `cancelledAt=null` & `heldAt=null` & `deletedAt` không tồn tại, kèm `$or` 2 loại:
  - `designerStatus='unassigned'` & `toolResultNote ∉ [null,'','ok']` (sau soát tool);
  - `designerStatus='rework'` (báo lỗi designer trên đơn chưa ai ôm — KHÔNG cần
    điều kiện toolResultNote vì đường rework-back từ kanban không set `'error'`).
  Projection thêm `userSku`/`userEmail`/`productConfigId` cho routing.
- Lọc designer **Active + role Designer** (query `userModel`, gộp id cả 3 mức).
- **Đếm tải thực tế**: 1 aggregate đếm số đơn CHƯA XONG mỗi designer đang giữ
  (`assignee ∈ validIds`, `designerStatus ∈ DESIGNER_ACTIVE_STATUSES`
  [assigned/in-progress/rework], `cancelledAt=null`, không xóa) — tính cả đơn
  gán tay, mọi xưởng.
- **Route từng đơn**: khớp khách (mức 1) → khớp `productConfigId` (mức 2) → xưởng
  có cấu hình (mức 3); designer chỉ định không nằm trong `validIds` → thử mức
  tiếp theo; không mức nào khớp → bỏ qua đơn.
- **Gán** (helper `assignSlice` — 2 `updateMany` theo loại, guard status chống race):
  - `{_id∈slice, designerStatus:'unassigned'}` → set `assignee` +
    `designerStatus:'assigned'` + clear rejected.
  - `{_id∈slice, designerStatus:'rework', assignee∈[null,'']}` → CHỈ set
    `assignee` + `designerAssignedAt` (**giữ `rework`** → cột "Cần làm lại").
  Mức 1/2 gán thẳng theo `directGroups` (designerId → orderIds) **trước**, cộng
  số vừa gán vào `loadByDesigner`; mức 3 sau đó `allocateByLoad(N, weights, loads)`
  per xưởng → cắt orderId → `assignSlice` từng designer.
- `orderLogService.writeMany` (field `assignee`, after=designerId) + `invalidateListCache`.

### 5.3 `OrderService.allocateByLoad(n, weights, loads)`

Cân bằng tải theo trọng số (weighted least-loaded): từng đơn gán cho designer có
tải quy đổi `(load + đã chia trong lô + 1) / weight` **thấp nhất** (tie → người
đứng trước). Nhờ đọc tải từ DB nên **soát lẻ từng đơn (N=1) vẫn ra đúng tỉ lệ về
lâu dài** và tự bù trừ khi 1 designer đang bị dồn đơn từ nguồn khác (gán tay) —
khắc phục bug cũ của `allocateByWeight` (floor + dư dồn designer đầu → N=1 luôn
về người đứng đầu danh sách). Σw = 0 → coi mọi trọng số = 1 (chia đều theo tải);
trọng số 0/âm khi có người khác > 0 → người đó không nhận đơn.

## 6. Performance notes

- Cấu hình cache Redis 1h → đọc gần như free ở hook.
- Engine: 1 `find` (khách cấu hình mức 1 — chỉ khi có) + 1 `find` (ứng viên) +
  1 `find` (designer Active) + 1 `aggregate` (tải thực tế, group theo `assignee`)
  + 2K `updateMany` (K = số designer nhận đơn ở cả 3 mức).
  Chạy fire-and-forget, không chặn response import/edit.
- Guard status trong `updateMany` (`unassigned` / `rework`+assignee rỗng) → không
  đè đơn đã có người hoặc vừa bị gán tay/self-claim giữa lúc query và update.

## 7. Permissions

- Cấu hình: `@Auth([Admin])` (FE gate `role.manage`).
- Auto-gán chạy server-side theo actor của import/edit (ghi log `orderLog` field
  `assignee`).
