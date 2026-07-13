# Đẩy lùi công đoạn → "Đang chờ quay lại" cho công đoạn đã xong + chạy lại toàn chuỗi

> **Trạng thái:** ✅ Đã triển khai (2026-07-08)
> **Ngày:** 2026-07-08
>
> **Giới hạn đã biết:**
> - Re-flow tool-check chỉ qua `updateField` (sửa cell, gồm bulk delegate). Import xlsx "file soát" set 'ok' trên đơn tool-check-hold KHÔNG re-flow.
> - Sau khi Support/Designer xong, **In (stage ngay sau designer)** hiển thị "Đã xong" (không "Đã sửa") vì hook Entry A flip In→rework KHÔNG `reworkCount++` (giữ nguyên hành vi cũ, tránh đổi flow designer-rework hiện có). Các stage sau In (Ép…) vẫn "Đã sửa" đúng qua auto-advance. Chỉ là sắc thái hiển thị.
> **Liên quan:** [`FulfillmentWorkflow.md`](../FunctionDescription/FulfillmentWorkflow.md), [`DesignerTaskWorkflow.md`](../FunctionDescription/DesignerTaskWorkflow.md), [`OrderLifecycle.md`](../FunctionDescription/OrderLifecycle.md), [`ToolCheckWorkflow.md`](../FunctionDescription/ToolCheckWorkflow.md)

## 1. Vấn đề

Khi đơn bị lỗi ở 1 công đoạn (vd **Ép**) rồi đẩy lùi về công đoạn trước (vd **Soát tool**):

- **Hiện tại:** các công đoạn đã hoàn thành trước đó (Thiết kế, In) vẫn hiển thị **"Đã xong"**. Người ở In/Thiết kế không biết đơn mình từng làm đang bị lỗi và sắp phải làm lại. Ngoài ra khi đẩy về tool-check, `currentFulfillmentStage` giữ nguyên = reporter (Ép) → Support soát xong đơn **nhảy thẳng về Ép**, KHÔNG chạy lại qua In/Thiết kế.

- **Mong muốn (3 quyết định của product owner):**
  1. **Chạy lại toàn chuỗi** — Support soát xong → Thiết kế (nếu được gán) làm lại → In in lại → Ép ép lại → … tới công đoạn báo lỗi.
  2. **Áp mọi trường hợp đẩy lùi** — bất kỳ đơn nào bị đẩy về công đoạn trước (tool-check / designer / stage fulfillment bất kỳ).
  3. Công đoạn **đã xong** nằm phía sau điểm đẩy về → chuyển sang **"Đang chờ quay lại"** (không còn ở "Đã xong"), **vẫn giữ lịch sử `completedAt`**. Công đoạn **nhận đơn về** (target) → **"Cần làm lại"**. Kanban Thiết kế thêm cột **"Đang chờ quay lại"** (chỉ hiện đơn có `assignee = chính designer đó`).

## 2. Mô hình vị trí thống nhất (8 chặng)

```
0 tool-check  1 designer  2 print  3 press  4 qc-post-press  5 sew-in  6 sew-out  7 pack
(Support)     (Thiết kế)  └──────────────── 6 stage Fulfillment ─────────────────┘
```

**Vị trí đơn `P`** (suy ra như `getLifecycleTrack`, theo ưu tiên):
1. Marker tool-check (`productionErrorSource='tool-check'` AND `toolResultNote='error'`) → `P=0`.
2. `designerStatus='rework'` → `P=1` (đang ở Thiết kế, chờ/đang làm lại).
3. `currentFulfillmentStage` set → `P = 2 + FULFILLMENT_STAGE_ORDER[stage]`.
4. `designerStatus ∈ {assigned,in-progress}` → `P=1`.
5. else theo `toolResultNote` (rỗng → `P=0`).

**Trạng thái hiển thị của 1 công đoạn `S` (index `i`) so với `P`:**

| Điều kiện | Hiển thị |
|---|---|
| `i == P` | trạng thái to-do hiện tại của S (waiting/in-progress/rework) |
| `i > P` (đơn đang ở phía trước S) **VÀ** S đã từng hoàn thành đơn (có `completedAt`/done) hoặc S là reporter | **Đang chờ quay lại** (watching) |
| `i < P` (đơn đã đi qua S) **VÀ** S có `completedAt` | **Đã xong** (`reworkCount=0`) / **Đã sửa** (`reworkCount>0`) |

> Điểm cốt lõi: **watching = "đã làm rồi + đơn đang ở phía trên (upstream) mình"**. Thay cho điều kiện cũ "chính mình là người báo lỗi" (`timeline.byUserId`).

### "Đơn đang upstream của fulfillment-stage S" (fulfillment-index `fi`)
```
toolCheckMarker
OR designerStatus == 'rework'
OR currentFulfillmentStage ∈ FULFILLMENT_STAGES.slice(0, fi)   // stage fulfillment trước S
```
### "Đơn đang downstream của S" = NOT upstream AND currentFulfillmentStage != S (hoặc đã hoàn thành hẳn).

### Designer (chặng 1) — chỉ upstream khi tool-check marker (chỉ tool-check ở trước designer).

## 3. Bounce = đẩy lùi + re-flow

Khi báo lỗi tại reporter `R`, đẩy về target `T` (furthest `F` = vị trí xa nhất đơn từng tới):

- Đặt vị trí đơn về `T`; `T` → to-do (rework) → tab **"Cần làm lại"** của target.
- **KHÔNG** ép các công đoạn trung gian `(T, F]` sang rework ngay. Giữ `completedAt` (lịch sử). Tab-filter positional tự cho chúng vào **watching** vì đơn đang upstream.
- Đơn **re-flow tiến** qua auto-advance: mỗi công đoạn khi đơn quay về (đơn tới `i == P`) chuyển sang to-do; hoàn thành lại → `reworkCount++` → "Đã sửa".
- **Re-flow xuyên ranh giới designer/tool-check:** để sau khi Support/Designer làm lại, chuỗi fulfillment chạy lại **từ In**, đặt `currentFulfillmentStage = Print` khi target là tool-check hoặc designer.

### 3.1 Auto-advance nhận biết "làm lại"
`resolveTransition(complete)`: khi set stage kế tiếp `waiting`, nếu stage đó **đã từng có `completedAt`** (đang làm lại vòng mới) → `reworkCount++` + `reworkAt=now`. (Flow xuôi bình thường: stage kế chưa từng done → không tăng.)

### 3.2 Bounce target = fulfillment stage (Báo lỗi nút / `buildFulfillmentReworkBack`)
Giữ nguyên rewind `currentFulfillmentStage=target` + target→rework. **Bỏ** việc ép intermediates sang rework (để positional lo watching); chỉ reporter timeline entry + target rework. (Có thể giữ reworkCount++ intermediates — vô hại vì positional bỏ qua status; nhưng nên bỏ cho sạch.)

### 3.3 Bounce target = designer (`errorSource='designer'`)
- Set `designerStatus='rework'` (đơn về Thiết kế).
- **Reset `currentFulfillmentStage=Print`** (nếu đơn từng vào fulfillment) để sau khi designer complete, hook Entry A chạy lại từ In. Giữ `completedAt` các stage.
- Reporter stage giữ `completedAt`; positional → watching.

### 3.4 Bounce target = tool-check (`errorSource='tool-check'`)
- Set marker (`productionErrorSource='tool-check'`, `toolResultNote='error'`, `readyForFulfill=false`) — như hiện tại.
- **Reset `currentFulfillmentStage=Print`** (nếu đơn từng vào fulfillment).
- **Giữ `designerStatus='done'`** trong lúc Support soát (đơn upstream ở tool-check → Thiết kế hiển thị watching, CHƯA cần làm lại).
- **Support soát xong** (`toolResultNote='ok'` trên đơn bounce — nhận biết bằng `currentFulfillmentStage` set + có stage `completedAt`, HOẶC `designerCompletedAt` set):
  - Nếu đơn **có `assignee` + designer từng done** → `designerStatus='rework'` (đơn về Thiết kế "Cần làm lại"), giữ `currentFulfillmentStage=Print`. Sau designer complete → Entry A else-if flip Print→rework → re-flow.
  - Nếu **không có designer** → `currentFulfillmentStage=Print` + `fulfillmentStages.print.status='rework'` + `readyForFulfill=true` (đơn về In "Cần làm lại").
  - Clear `productionFirstErrorAt`.

## 4. Thay đổi theo file

### Backend
- `apps/api/src/modules/fulfillment/fulfillment-task.service.ts`
  - `resolveTransition(complete)`: auto-advance tăng `reworkCount` khi stage kế đã từng done (§3.1).
  - `resolveTransition(rework-back)` + `applyTabFilter`: dùng positional cho `done`/`fixed`/`watching` (§2).
- `apps/api/src/modules/order/order.service.ts`
  - Helper positional dùng chung: `isUpstreamOfStageClause(stage)` / `isDownstreamOfStageClause(stage)` (build Mongo clause) — reuse cả `applyFulfillmentStatusFilter` (bảng In) lẫn (mirror) fulfillment-task.
  - `applyFulfillmentStatusFilter`: `done`/`fixed`/`watching` positional (mirror).
  - `buildDesignerReworkBackFromError`: reset `currentFulfillmentStage=Print` (§3.3/§3.4); tool-check giữ designerStatus.
  - `buildFulfillmentReworkBack`: bỏ ép intermediates rework (§3.2).
  - `updateField` nhánh `toolResultNote='ok'`: handoff Support-soát-xong cho đơn bounce (§3.4) — route designer-rework hoặc print-rework. Áp cả `bulkUpdateField` + `importRework`.
  - Entry A hook nằm ở `designer-task.service.ts` — cần đảm bảo khi `currentFulfillmentStage=Print` và designer complete → flip Print (đã đúng, chỉ cần currentStage=Print).
- `apps/api/src/modules/designer/designer-task.service.ts`
  - `getMyTasks`: thêm cột `watching` = `toolCheckMarker AND assignee=me AND designerStatus ∈ {done,rework}` (đơn upstream ở tool-check). Cột `rework` loại marker (`NOT toolCheckMarker`). `done`/`fixed` loại marker.
  - `countAllTabs` / stats tương ứng nếu cần.

### Shared
- `packages/shared/dtos/production-order.dto.ts` — nếu cần thêm field DTO cho designer card/tab (watching count).
- Không đổi enum stage.

### Frontend
- `apps/web/src/pages/designer/my-tasks/index.tsx` — thêm cột **"Đang chờ quay lại"** (read-only, không DnD/checkbox), ẩn khi rỗng; thêm KPI/label; map từ `columns.watching`.
- `apps/web/src/services/designer.ts` + types — nhận `columns.watching`.
- `apps/web/src/pages/fulfillment/my-tasks/*` + `PrintOrderTable` — không cần đổi (đã đọc `watching`/`done`/`fixed` từ BE); chỉ hưởng logic positional mới. Kiểm tra label.

### Docs
- Cập nhật `FulfillmentWorkflow.md` (§5.3 tab filter positional, §2.3), `DesignerTaskWorkflow.md` (cột watching), `ToolCheckWorkflow.md` (re-flow), `OrderLifecycle.md` nếu đụng.

## 5. Kịch bản kiểm thử (Ép → Soát tool)

Đơn: soát ok → Thiết kế(X) done → In done → Ép in-progress → Ép báo lỗi tool-check.

1. Sau báo lỗi: marker tool-check; `currentFulfillmentStage=Print`; designerStatus=done; print/press giữ completedAt.
   - Support: ToolCheckTab "Cần làm lại". ✅
   - Thiết kế(X): cột **"Đang chờ quay lại"** (marker + assignee=X + done). ✅ không còn "Đã xong".
   - In: chip **"Đang chờ quay lại"** (positional upstream). ✅ không còn "Đã xong".
   - Ép: "Đang chờ quay lại" (reporter timeline). ✅
2. Support đổi Note kq Tool → 'ok': designer có gán → `designerStatus='rework'`, giữ `currentFulfillmentStage=Print`.
   - Thiết kế(X): cột **"Cần làm lại"**. ✅
3. Designer(X) làm lại → Hoàn thành → Entry A flip Print→rework.
   - In: **"Cần làm lại"**. ✅
4. In in lại → Hoàn thành → auto-advance Press (đã từng done → `reworkCount++` → "làm lại").
   - Ép: **"Cần làm lại"**. ✅
5. Ép ép lại → Hoàn thành → tiếp tục QC… (flow xuôi). Các stage đã làm lại hiện "Đã sửa".
