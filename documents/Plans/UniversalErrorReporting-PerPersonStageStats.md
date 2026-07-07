# Báo lỗi toàn cục + Thống kê lỗi theo người & theo công đoạn

> **Mục tiêu (yêu cầu user):**
> 1. Bất kỳ ai cũng **báo lỗi được 1 đơn dù đơn đã đi qua công đoạn của mình** (đã hoàn thành ở công đoạn mình hoặc các công đoạn sau).
> 2. Khi báo lỗi → **chọn loại lỗi + đẩy về công đoạn trước** (kể cả đơn đã hoàn thành). Đẩy về → **làm lại toàn bộ chuỗi**.
> 3. Báo xong → **mọi công đoạn đều thấy đơn bị lỗi + note + đang ở công đoạn nào**.
> 4. Đơn đẩy về → **tất cả ai đang giữ công đoạn đó (theo stage+xưởng) đều thấy ở tab "Đang chờ quay lại"** (không chỉ người báo).
> 5. Fix xong → **tự chuyển công đoạn tiếp** + hiện trạng thái **"Đã sửa"**.
> 6. **Thống kê tất cả lỗi của 1 người** (2 chiều: người phải sửa + người đã báo) → click ra **list đơn lỗi cần fix**.
> 7. **Mỗi công đoạn có ô thống kê lỗi trong trang task** → click hiện bảng lỗi bên dưới.
> 8. Ưu tiên: **bảng lỗi theo ngày dựa `inProductionAt`**.
>
> **Trạng thái:** 🟡 CHỜ DUYỆT — chưa implement. Chỉ code khi user xác nhận.

---

## 0. Quyết định đã chốt (user, qua AskUserQuestion)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Báo lỗi đơn đã rời hàng chờ → tìm đơn kiểu gì? | **Quét/nhập mã** — mở rộng trang Quét mã lỗi `/orders/scan-error` |
| 2 | Tab "Đang chờ quay lại" ai thấy? | **Ai đang giữ công đoạn đó (stage + xưởng)** — bỏ lọc theo người báo |
| 3 | "Thống kê lỗi của 1 người" tính cho ai? | **Cả 2 chiều**: người phải sửa (bị quy lỗi) + người đã báo lỗi |
| 4 | Đẩy về công đoạn trước → công đoạn ở giữa? | **Làm lại toàn bộ chuỗi** (giữ logic hiện tại) |

---

## 1. Hiện trạng code (đã map)

### 1.1 Cái ĐÃ CÓ — tận dụng, không làm lại
- **State machine 6 công đoạn** `print → press → qc-post-press → sew-in → sew-out → pack` + status `waiting/in-progress/rework/done` — `packages/shared/enums/fulfillment-stage.ts`.
- **Rework-back đa chặng**: `FulfillmentTaskService.transition()` action `rework-back` (`apps/api/src/modules/fulfillment/fulfillment-task.service.ts:329-426`) — set `target` + các stage ở giữa về `rework`, dời `currentFulfillmentStage=target`, `reworkCount++`. **Đây chính là "làm lại toàn bộ chuỗi" mà user muốn (quyết định #4).**
- **Báo lỗi kèm auto rework-back** khi set nguồn = designer/tool-check: `OrderService.setProductionError()` (`apps/api/src/modules/order/order.service.ts:5671+`) + helper `buildDesignerReworkBackFromError()` (`:707-754`).
- **Trạng thái "Đã sửa"**: tab `fixed` = `completedAt` tồn tại + `reworkCount>0` (`fulfillment-task.service.ts:620-631`).
- **Auto chuyển công đoạn tiếp** khi `complete` — đã có trong `transition()`.
- **Note lỗi lưu ở order-level**: `productionError`, `productionErrorNote`, `productionErrorSource`, `productionErrorCount`, `productionFirstErrorAt` (`order.entity.ts:268-294`) + `currentFulfillmentStage` (`:344`). → yêu cầu #3 chỉ cần **hiện ra UI**, data đã đủ.
- **FE báo lỗi từ quét ĐÃ TỒN TẠI**: `apps/web/src/pages/orders/scan-error/OrderErrorScanDialog.tsx` — chọn mã lỗi (workshop_config) + nguồn + note + đẩy về `tool-check | designer | stage trước`. Trang `.../scan-error/index.tsx` autoFocus quét mã, `FulfillmentScanActionDialog.tsx` cho công nhân đúng stage Hoàn thành/Báo lỗi.
- **ErrorLog + drill-down theo `inProductionAt`**: `OrderService.getErrorLog()` (`:5813-5997`), FE `apps/web/src/pages/orders/ErrorLogTab.tsx` (urgency badge → click lọc bảng). Pattern "click stat → bảng dưới" mẫu ở `ToolCheckTab.tsx` + `DesignerStatsTab.tsx`.
- **Bảng ma trận theo ngày (inProductionAt, VN tz)** mẫu: `DesignerStatsService.getTeamDailyBreakdown()` (`apps/api/src/modules/designer/designer-stats.service.ts:394-569`).

### 1.2 Cái THIẾU — phải làm
| # | Gap | Vị trí |
|---|---|---|
| A | Worker báo lỗi đơn **đang ở công đoạn SAU mình** → BE `transition()` chặn (guard `stage == user.fulfillmentStage` cho non-override role) `fulfillment-task.service.ts:155-178` | BE |
| B | Đơn **đã hoàn thành** (`currentFulfillmentStage=null`) → scan dialog không list được stage đích (`OrderErrorScanDialog.tsx:67-71` tính `previousStages` từ `currentStage`) | BE + FE |
| C | Tab watching **khóa theo `byUserId`** → chỉ người báo thấy | BE (2 chỗ) |
| D | **Thống kê lỗi theo người** (2 chiều) + drill-down | BE + FE mới |
| E | **Ô thống kê lỗi trong trang task fulfillment** + bảng theo ngày | BE + FE mới |
| F | Hiện badge lỗi + note + công đoạn hiện tại **ở mọi tab task** (data có sẵn, chỉ thiếu UI) | FE |

---

## 2. Kế hoạch — chia 6 phase (implement tuần tự, verify từng phase)

### Phase 1 — BE: Báo lỗi + đẩy về từ BẤT KỲ đâu (gap A, B, #4)

**Ý tưởng:** gộp về **1 điểm vào duy nhất** là `setProductionError` (đã cho role Fulfillment + check `order.field.productionError.edit`, KHÔNG dính guard theo stage). Bỏ lệnh gọi `fulfillment.transition` riêng ở scan dialog.

1. **Shared DTO** — `packages/shared/dtos/production-order.dto.ts`, thêm vào `SetProductionErrorZod`:
   ```ts
   target: z.union([z.literal('designer'), z.literal('tool-check'), FulfillmentStageZod]).optional(),
   ```
   (Hiện `SetProductionErrorDto` chỉ có `code/source/note`.)

2. **Helper mới** `OrderService.buildFulfillmentReworkBack(before, target: FulfillmentStage, reason, ctx)` (generalize `buildDesignerReworkBackFromError`):
   - Xác định **vị trí xa nhất** của đơn: `furthest = before.currentFulfillmentStage ?? (before.fulfillmentCompletedAt ? Pack : Print)`.
   - **Enforce** `STAGE_ORDER[target] < STAGE_ORDER[furthest]` (chỉ lùi; nếu đơn completed thì furthest=Pack → cho lùi về mọi stage trước Pack; muốn redo cả Pack thì target≤sew-out).
   - `set[target].status = rework`, `reworkAt`, `reworkFromStage = reporterStage`, `reworkReason`, `reworkCount++`.
   - **Redo toàn chuỗi (quyết định #4):** mọi stage `i` với `targetIdx < i ≤ furthestIdx` → `rework` + `reworkCount++` + `reworkFromStage`.
   - `set.currentFulfillmentStage = target`; nếu đơn từng completed → **clear** `fulfillmentCompletedAt`, `set.readyForFulfill` giữ theo luồng.
   - **reporterStage cho timeline** = `ctx.user.fulfillmentStage ?? furthest` (để đúng stage watch — Phase 2).
   - Trả `{ set, timelineEntry: { stage: reporterStage, action: 'rework-back', reworkTarget: target, byUserId, byUserName, reason, at } }`.

3. **`setProductionError`** — sau block auto designer/tool-check hiện có, thêm nhánh:
   ```ts
   if (isFulfillmentStage(dto.target)) {
     const rb = this.buildFulfillmentReworkBack(before, dto.target, dto.note, ctx);
     if (rb) { Object.assign(patch, rb.set); reworkBackTimelineEntry = rb.timelineEntry; ...$inc reworkCount }
   }
   ```
   Giữ nguyên atomic `$set/$inc/$push fulfillmentTimeline`. Ghi `OrderLog` như các call-site khác.

4. **KHÔNG động** `FulfillmentTaskService.transition()` rework-back — vẫn phục vụ công nhân thao tác đơn **đang trong hàng chờ của mình**.

**Verify:** scratch test (đơn ở sew-out → report target=print → print..sew-out=rework, current=print); đơn completed → report → reopen, clear `fulfillmentCompletedAt`.

---

### Phase 2 — BE: Tab "Đang chờ quay lại" theo stage+xưởng (gap C, #4-user2)

Bỏ điều kiện `byUserId: userId` trong filter `watching`, **giữ** điều kiện "đơn đang ở stage sớm hơn HOẶC designer rework HOẶC tool-check pending" + scope xưởng. 2 chỗ **phải sửa cùng lúc** (nếu không lệch số liệu):
- `apps/api/src/modules/fulfillment/fulfillment-task.service.ts:632-658` (`applyTabFilter` case `watching`).
- `apps/api/src/modules/order/order.service.ts:631-650` (`applyFulfillmentStatusFilter` case `watching`).

Filter mới (rút gọn):
```ts
fulfillmentTimeline: { $elemMatch: { stage, action: 'rework-back' } },   // BỎ byUserId
$or: [ { currentFulfillmentStage: { $in: earlierStages } },
       { designerStatus: 'rework' },
       { productionErrorSource: 'tool-check', toolResultNote: 'error' } ],
```
+ scope factory như hiện tại (`mergeWithFactoryOr`).

> ⚠️ Giữ nguyên cảnh báo đã note trong code: KHÔNG dùng `currentFulfillmentStage != stage` (kẹt vĩnh viễn). `earlierStages` = các stage index < stage hiện tại.

**Verify:** 2 user khác nhau cùng stage+xưởng đều thấy đơn watching; đổi ca vẫn thấy.

---

### Phase 3 — FE: Quét báo lỗi cho đơn xa/đã hoàn thành + hiện lỗi mọi nơi (gap B, F, #1,2,3)

1. **`OrderErrorScanDialog.tsx`**:
   - Đổi luồng submit: khi `reworkTarget` là 1 FulfillmentStage → **chỉ gọi 1 lần** `setProductionError({code, source, note, target: reworkTarget})` (bỏ call `fulfillment.transition` — Phase 1 gộp rồi). `tool-check`/`designer` vẫn qua `setProductionError` (source-driven) như cũ.
   - **Đơn đã hoàn thành** (`currentStage` null nhưng `fulfillmentCompletedAt`): list **cả 6 stage** làm đích (không còn chặn "chưa vào fulfillment"). Tính `targetStages` = mọi stage trước `furthest` (furthest=Pack nếu completed).
   - **Đơn đang ở stage sau mình**: không cần biết stage user — dialog thao tác theo `currentStage` của đơn, BE Phase 1 không guard stage. Bỏ điều kiện `currentStage &&` ở chip designer/stage (`:362-377`) để đơn completed vẫn chọn được.

2. **Hiện badge lỗi + note + công đoạn hiện tại ở mọi tab task** (`apps/web/src/pages/fulfillment/my-tasks/FulfillmentTaskCard.tsx`): khi `productionError` + `toolResultNote==='error'` → badge đỏ "Lỗi: {tên} · Do {nguồn} · đang ở {FULFILLMENT_STAGE_LABELS[currentStage]}" + `productionErrorNote` (line-clamp + tooltip). Tái dùng khối đỏ đã có ở `OrderErrorScanDialog.tsx:216-255`.

**Verify:** quét đơn ở Pack (đang giữ Print) → báo lỗi đẩy về Press OK; card ở mọi cột hiện badge lỗi + note.

---

### Phase 4 — BE+FE: Thống kê lỗi theo người, 2 chiều + drill-down (gap D, #6)

**Đơn giản hóa nền tảng:** vì hệ thống ràng buộc **1 user / (factory, stage)** (`user.entity.ts` unique index `unique_factory_fulfillment_stage`), "người phải sửa 1 rework ở stage S xưởng F" = user có `fulfillmentStage=S, factoryId=F` → map xác định, không cần lưu assignee rời rạc.

1. **BE** — `DesignerStatsService` (hoặc module `fulfillment` — chọn `designer-stats` cho gọn) thêm `getPersonErrorOverview(from, to, factoryId?)`:
   - **Chiều A — Bị quy lỗi / phải sửa:** match `inProductionAt ∈ [from,to]` + đơn có rework/error; nhóm theo `(factoryId, stage đang rework)` → map ra user; đếm số đơn + tách trạng thái (đang rework / đã sửa xong trong kỳ). Designer: nhóm `designerStatus=rework` theo `assignee`.
   - **Chiều B — Đã báo lỗi:** unwind `fulfillmentTimeline` (action `rework-back`), match `at`/`inProductionAt` trong kỳ, `$group` theo `byUserId` → đếm số lần báo + tách target.
   - Trả `{ rows: [{ userId, name, stage/role, faultCount, fixingCount, fixedCount, reportedCount }], totals }`.

2. **FE** — thêm section/tab "Lỗi theo người" (đặt trong Dashboard, cạnh tab Designer — gate role Admin/Manager/Support/DesignerLeader). Bảng leaderboard 2 cột chỉ số (Nhận lỗi / Đã báo). **Click 1 người → bảng dưới** = `getErrorLog` đã có, truyền filter theo người:
   - Nhận lỗi (đơn cần fix) → `assignee` (designer) hoặc `(factory,stage)` → productionIds. Có thể mở rộng `getErrorLog` nhận `fulfillmentStage`+`factoryId` (đã có sẵn tham số `fulfillmentFactoryId`).
   - Reuse toàn bộ UX drill-down + date range của `ErrorLogTab`.

**Verify:** tổng faultCount + reportedCount khớp số rework-back trong kỳ.

---

### Phase 5 — BE+FE: Ô thống kê lỗi trong trang task + bảng theo ngày (gap E, #7,8)

1. **BE** — endpoint per-stage cho công nhân: mở rộng `GET /fulfillment/my-tasks` `tabCounts` (đã trả `rework/fixed/watching`) — đủ cho "ô thống kê". Thêm `getStageErrorDaily(stage, factoryId, from, to)` (mẫu `getTeamDailyBreakdown`): ma trận **cột = ngày (`inProductionAt`, VN tz), hàng = mã lỗi** (hoặc nguồn), cell = count.

2. **FE** — `apps/web/src/pages/fulfillment/my-tasks/index.tsx`: trên đầu kanban thêm **strip ô thống kê lỗi công đoạn mình** (số đang rework / đã sửa trong kỳ / mình đã báo). **Click ô → bảng lỗi theo ngày** (component mới `StageErrorDailyTable`, reuse style ma trận của `DesignerStatsTab`). Mặc định kỳ = 7 ngày, có DateRangePicker.

**Verify:** số ô khớp `tabCounts`; bảng ngày group đúng `inProductionAt` VN tz.

---

### Phase 6 — Docs + verify tổng

- Cập nhật: `FulfillmentWorkflow.md` (watching stage-scoped + báo lỗi toàn cục + ô thống kê task), `ScanError.md` (đơn xa/completed + gộp setProductionError), `Dashboard.md` (tab Lỗi theo người), `OrderLifecycle.md` nếu ảnh hưởng, `CLAUDE.md` (mapping row Fulfillment + ScanError + Dashboard).
- Tạo doc mới nếu tách tính năng: cân nhắc `documents/FunctionDescription/ErrorReportingHub.md`.
- **Build:** `pnpm --filter shared build` → restart API. BE tsc = baseline **31**; FE tsc = baseline **85**; `vite build` ✓.
- **Test tay:** kịch bản E2E (báo lỗi đơn completed → redo chuỗi → 2 user cùng stage thấy watching → fix xong "Đã sửa" → thống kê người + công đoạn lên số).

---

## 3. Rủi ro / lưu ý

1. **Watching phải sửa ĐỒNG THỜI 2 chỗ** (`fulfillment-task.service.ts` + `order.service.ts`) — lệch sẽ sai count giữa kanban worker và Print-admin view.
2. **Đơn đã completed reopen**: nhớ clear `fulfillmentCompletedAt` + loại khỏi thống kê "đã xong fulfillment"; kiểm tra không kẹt ở dashboard Lifecycle (`doneInRange`).
3. **Loại đơn hủy** (`cancelledAt`): mọi aggregation mới **phải** loại đơn hủy (theo `documents/Plans/CancelledOrders-ExcludeFromStages.md`) trừ khi lookup theo mã.
4. **Enforce chỉ lùi** (`targetIdx < furthestIdx`) — chặn đẩy "tới" gây loạn state machine.
5. **Aggregation theo (factory,stage)→user** phụ thuộc unique index; nếu 1 stage tạm thời không có user (nghỉ) → gom vào nhóm "chưa gán" thay vì lỗi.
6. **Quyền báo lỗi toàn cục**: hiện `setProductionError` cho SuperAdmin/Admin/Manager/Fulfillment. Xác nhận có mở cho **Support/DesignerLeader** không (nếu cần quét báo lỗi). — *cần hỏi khi implement Phase 1.*
7. Giữ **BE cần restart** sau đổi shared/service; nhắc user.

---

## 4. Thứ tự implement đề xuất

`Phase 1 (BE lõi) → Phase 2 (watching) → Phase 3 (FE quét + hiện lỗi)` = xong luồng nghiệp vụ chính (yêu cầu #1-5).
`Phase 4 → Phase 5` = thống kê (yêu cầu #6-8).
`Phase 6` = docs + verify.

Mỗi phase build + verify trước khi sang phase sau.
