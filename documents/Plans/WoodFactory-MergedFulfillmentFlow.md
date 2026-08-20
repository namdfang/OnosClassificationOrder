# Plan — Ngách Gỗ (Woodcraft) + Xưởng gỗ Thái Nguyên với luồng fulfillment rút gọn

> **Trạng thái:** ĐÃ IMPLEMENT. Lưu ý 2026-08-20: API trong plan này đã được TỔNG QUÁT HÓA khi thêm flowType `no-sew` (xưởng Mê Linh — QC xong bỏ qua May vào/May ra) — `MERGED_STAGE_SOURCE`/`redirectMergedTarget`/`isMergedFlowFactorySync` đã thay bằng `FACTORY_FLOW_AUTO_STAGES`/`isAutoStage`/`redirectAutoTarget`/`getFactoryFlowTypeSync`. Source of truth hiện tại: `documents/FunctionDescription/FulfillmentWorkflow.md` §2.2b.
> **Ngày:** 2026-08-18
> **Quyết định đã chốt với chủ dự án:**
> 1. Routing đơn → xưởng gỗ dùng cơ chế sẵn có Product Config → xưởng (kanban `/adm/settings/product-factory`). Collection "Woodcraft" CHỈ để hiển thị catalog như 2D/3D/Embroidery.
> 2. Đánh dấu luồng rút gọn bằng **field trên FactoryEntity** (`flowType`), KHÔNG hardcode shortName.
> 3. Hiển thị: đơn xưởng gỗ vẫn hiện đủ 6 công đoạn; Ép/May ra **tự tick xong** cùng lúc với In/May vào (ghi chú "tự động"). Không sửa màn hình hiển thị.
> 4. Rework/báo lỗi nhắm về công đoạn đã gộp (Ép/May ra) → **BE tự redirect** về công đoạn gốc (In/May vào). Không sửa dialog FE.

## 1. Tổng quan

Thêm ngách sản phẩm gỗ ("Woodcraft") với xưởng độc lập mới **Xưởng gỗ Thái Nguyên** (shortName đề xuất: `TNW`). Đơn gỗ giữ NGUYÊN pipeline hiện tại (soát tool → thiết kế → 6 công đoạn fulfillment → dashboard), chỉ khác:

- **In (print) hoàn thành → Ép (press) tự động hoàn thành** cùng thời điểm → đơn nhảy thẳng sang QC (`qc-post-press`).
- **May vào (sew-in) hoàn thành → May ra (sew-out) tự động hoàn thành** → đơn nhảy thẳng sang Đóng gói (`pack`).
- Chỉ áp dụng cho xưởng có `flowType = 'merged'`. Mọi xưởng khác giữ nguyên 6 bước.

Luồng thực tế của công nhân xưởng gỗ: **In → QC → May → Đóng gói** (4 trạm, không cần user cho Ép/May ra — index `unique_factory_fulfillment_stage` là partial nên hợp lệ).

## 2. Khái niệm mới trong shared

**File mới `packages/shared/enums/factory-flow.ts`:**

```ts
export const FactoryFlowType = { Standard: 'standard', Merged: 'merged' } as const;

/** Stage bị gộp → stage gốc "gánh" nó. Complete stage gốc = auto-complete stage gộp. */
export const MERGED_STAGE_SOURCE: Partial<Record<FulfillmentStage, FulfillmentStage>> = {
  [FulfillmentStage.Press]: FulfillmentStage.Print,
  [FulfillmentStage.SewOut]: FulfillmentStage.SewIn,
};
export function isMergedStage(stage) { ... }        // press | sew-out
export function redirectMergedTarget(stage) { ... } // press→print, sew-out→sew-in, khác giữ nguyên
```

Export qua `packages/shared/enums/index.ts`.

**`packages/shared/dtos/factory.dto.ts`:** thêm `flowType: z.nativeEnum-style optional, default 'standard'` vào Create/Update/Res DTOs.

## 3. Backend

### 3.1 Factory module

- `apps/api/src/modules/factory/factory.entity.ts`: thêm `flowType: string, default 'standard'`.
- `factory.service.ts`: nhận `flowType` ở `createFactory`/update; thêm helper **`isMergedFlowFactory(factoryId): Promise<boolean>`** — cache in-memory Map factoryId→flowType, TTL ~60s (hoặc invalidate khi save). Pattern tham khảo cache của `apps/api/src/utils/excluded-factory.ts` nhưng KHÔNG hardcode shortName.
- KHÔNG thêm TNW vào seed `DEFAULT_FACTORIES` — tạo xưởng qua UI (tránh seed đè giữa các môi trường).

### 3.2 Transition — điểm chèn chính

`apps/api/src/modules/fulfillment/fulfillment-task.service.ts` → `resolveTransition()` case **Complete** (~L289–334, chỗ gọi `this.nextStage(stage)` L305):

```
next = nextStage(stage)
if (isMergedFlowFactory(order.factoryId) && next && MERGED_STAGE_SOURCE[next] === stage):
    # auto-complete stage gộp — ghi ĐỦ state để mọi phép trừ thời gian ra 0 thay vì NaN:
    merged.status = Done
    merged.waitingAt = merged.startedAt = merged.firstStartedAt = merged.completedAt = now
    merged.workMs giữ nguyên (0), merged.assignee = user hiện tại
    # nếu merged đã từng completedAt (vòng rework) → set reworkAt + reworkCount++ như logic sẵn có
    push fulfillmentTimeline entry cho stage gộp: byUser = user hiện tại, note "tự động (luồng rút gọn)"
    next = nextStage(next)   # nhảy tiếp: print→(press)→qc-post-press; sew-in→(sew-out)→pack
# phần còn lại giữ nguyên: set currentFulfillmentStage=next, next.status=Waiting, next.waitingAt=now
```

Lưu ý:
- `workMs` chỉ `$inc` khi delta > 0 (logic sẵn có L299) — stage gộp workMs=0, an toàn.
- Nếu `next` sau khi nhảy 2 bước là `null` (sew-in → pack là stage cuối? không — pack vẫn còn), giữ nguyên nhánh set `fulfillmentCompletedAt`.
- Trường hợp Complete stage `press`/`sew-out` trực tiếp (admin override trên đơn kẹt): vẫn hoạt động như cũ, không chặn.

### 3.3 Rework-back redirect (3 call-site)

Dùng `redirectMergedTarget()` khi order thuộc xưởng merged:

1. `fulfillment-task.service.ts` `resolveTransition()` case **ReworkBack** (~L336–422): redirect `target` TRƯỚC khi validate index < current.
2. `apps/api/src/modules/order/order.service.ts` `buildFulfillmentReworkBack()` (~L1059–1117): redirect target (đường scan lỗi / admin / stage-error catalog `reworkTarget`).
3. Stage Error Catalog: KHÔNG cần sửa data — row có `reworkTarget='press'|'sew-out'` sẽ được redirect runtime ở (2). Quét barcode `E-<code>` tại xưởng gỗ hoạt động nguyên trạng.

Sau redirect, đơn rework nằm ở In/May vào; khi In complete lại → auto-complete Ép lại (mục 3.2 xử lý vòng rework qua `reworkAt`/`reworkCount`).

### 3.4 Điểm KHÔNG cần sửa (đã soát)

- **Entry fulfillment** (designer.complete / toolResultNote='ok'): vào ở `print` — không đụng stage gộp.
- **Queue/stats** (`getMyTasks`, daily stats L780–862): đếm theo status trên orders, không phụ thuộc user tồn tại ở stage. Stage gộp `arrived`+`done` cùng tick — đúng ngữ nghĩa.
- **Telegram SLA** (`aggregateSla`): stuck counters đếm đơn ĐANG kẹt tại stage — đơn merged không bao giờ dừng ở press/sew-out → tự đúng.
- **Lifecycle funnel** (`getLifecycleOverview`): bucket theo trạng thái hiện tại — như trên.
- **Unique index user** (factoryId, fulfillmentStage): partial — xưởng gỗ không tạo user Ép/May ra là hợp lệ.
- **`priorityEstimate.ts`** (hạn dự kiến): tính theo stage đang active — stage gộp không bao giờ active.

### 3.5 Edge cases

- **Bật flag khi xưởng đã có đơn tồn ở press/sew-out**: đơn kẹt vì không có worker. Giải pháp trong scope: xưởng TNW là xưởng MỚI (không có đơn cũ) + ghi chú trong doc "bật flowType trước khi cho đơn chảy vào". Không viết backfill.
- **Tắt flag giữa chừng**: đơn đã auto-complete Ép giữ nguyên lịch sử; đơn mới chạy 6 bước bình thường. Không cần migration.

## 4. Frontend

- `apps/web/src/pages/products/FactoryTab.tsx`: form create/edit xưởng (hiện có name/shortName/isActive ~L41–233) thêm **select "Luồng sản xuất": Chuẩn 6 công đoạn / Rút gọn (gỗ: In+Ép gộp, May vào+May ra gộp)**. `apps/web/src/services/factory.ts` thêm field vào payload.
- i18n: key mới trong namespace products (vi/en).
- KHÔNG sửa: timeline/OrderDetailDialog/kanban fulfillment/ReworkBackDialog/Telegram formatter (quyết định #3, #4). Timeline entry stage gộp tự hiện với note "tự động (luồng rút gọn)" từ BE.

## 5. Data setup (không code — làm sau khi deploy)

1. Tab Xưởng (`/adm` trang Products → Xưởng): tạo **"Xưởng gỗ Thái Nguyên"**, shortName **`TNW`**, luồng **Rút gọn**.
2. Tab Collection: tạo collection **"Woodcraft"** (cạnh 2D/3D/Embroidery).
3. Tạo/import các Product Config sản phẩm gỗ → trang chi tiết sản phẩm gắn collection Woodcraft.
4. Kanban `/adm/settings/product-factory`: kéo sản phẩm gỗ vào cột TNW → đơn import tự map `factoryId` TNW.
5. Tạo user Fulfillment cho TNW: 4 người — Print / QCPostPress / SewIn / Pack (KHÔNG tạo Press, SewOut).
6. (Tùy chọn) `/adm/settings/designer-assign` mức 3: thêm TNW + designer phụ trách gỗ.

## 6. Test

- Unit (Jest, `apps/api`): `resolveTransition` — (a) xưởng merged: complete print → press Done đủ timestamp/timeline, current=qc-post-press; complete sew-in → current=pack; (b) xưởng standard: giữ nguyên 6 bước; (c) rework từ QC target=press → redirect print, vòng lại print complete → press reworkCount tăng; (d) `buildFulfillmentReworkBack` target=sew-out → sew-in.
- Manual smoke: import đơn sản phẩm TNW → soát tool → designer complete → quét In xong → thấy ngay ở queue QC; timeline hiện Ép "tự động" cùng timestamp.
- `pnpm build-types` (shared + fulfill + folinas-fe) + `pnpm lint`.

## 7. Docs phải cập nhật khi implement

- `documents/FunctionDescription/FulfillmentWorkflow.md`: mục mới "Luồng rút gọn (flowType=merged)".
- `documents/FunctionDescription/Products.md`: field `flowType` ở mục Xưởng.
- `documents/FunctionDescription/Collections.md`: thêm Woodcraft vào ví dụ (nếu liệt kê).
- `CLAUDE.md` root: cập nhật row Fulfillment + Products trong bảng mapping.

## 8. Thứ tự thực hiện

1. Shared: `factory-flow.ts` + factory DTO. → 2. BE factory (entity/service/cache). → 3. BE transition + rework redirect + unit tests. → 4. FE FactoryTab + i18n. → 5. Typecheck/lint/test. → 6. Docs. → 7. Deploy + data setup mục 5.

Ước lượng: BE ~3 file chính (fulfillment-task.service, order.service, factory/*), shared 2 file, FE 2 file. Không migration, không đổi DTO order.
