# Nhật ký bù lỗi — 3 cải tiến

> Trạng thái: **KẾ HOẠCH — chờ confirm, chưa implement.**
> File chính: `apps/web/src/pages/orders/ErrorLogTab.tsx` · `apps/api/src/modules/order/order.service.ts` (`getErrorLog`) · `apps/api/src/modules/order/order.entity.ts` · `packages/shared/dtos/production-order.dto.ts` · `apps/api/src/modules/designer/designer-task.service.ts`.

## Quyết định đã chốt
1. **Mức độ khẩn tính theo `inProductionAt`** (đơn vào SX càng lâu càng khẩn), KHÔNG theo `productionFirstErrorAt`. Cột "Đã chờ" **giữ cả 2 mốc**: tuổi SX (chính, drive mức độ) + thời gian từ lúc báo lỗi (phụ).
2. **Thêm field `productionErrorResolvedAt`** + tab **"Đã xong"** (đơn từng lỗi đã fix xong).
3. **Thêm mảng `productionErrorHistory`** trên đơn (mọi lỗi từng gặp + thời điểm/nguồn) + backfill từ OrderLog.

---

## Phần 1 — Mức độ khẩn theo `inProductionAt`

### Bản chất hiện tại
- "Đơn đang lỗi mở" = `productionError` set **và** `productionFirstErrorAt != null` (GIỮ NGUYÊN — đây là điều kiện lọc tab "Đang lỗi", không đổi).
- **Chỉ đổi trục TÍNH TUỔI/mức độ** từ `productionFirstErrorAt` → `inProductionAt`.

### Backend (`getErrorLog`, `order.service.ts`)
- **Sort**: `{ productionFirstErrorAt: 1 }` → `{ inProductionAt: 1 }` (đơn SX cũ nhất lên đầu). Tie-break `productionFirstErrorAt: 1`.
- **Bộ lọc mức độ** (`dto.urgency`): các range hiện áp lên `productionFirstErrorAt` → chuyển sang **`inProductionAt`** (giữ riêng điều kiện base `productionFirstErrorAt: {$exists,$ne:null}`). Tách clause: base "open" + clause urgency trên `inProductionAt` (gộp qua `$and` khi cần, mirror logic hiện có).
- **Aggregate `byUrgency`**: `$project ageMs = now − $inProductionAt` (thay `$productionFirstErrorAt`); switch buckets giữ ngưỡng **1/2/3 ngày**.
- `countFilter` (badge count bỏ qua urgency): vẫn giữ base `productionFirstErrorAt exists`; chỉ strip clause urgency (giờ trên `inProductionAt`).
- ⚠️ **Ngưỡng 1/2/3 ngày**: vì tuổi SX thường lớn hơn tuổi lỗi → nhiều đơn dồn vào "Khẩn cấp" (đúng ý: SX lâu = khẩn). Giữ nguyên ngưỡng, có thể chỉnh sau nếu muốn phân bố khác. Đơn thiếu `inProductionAt` (hiếm) → coi như cũ nhất (critical), sort đầu.

### Frontend (`ErrorLogTab.tsx`)
- `urgencyOf(firstErrorAt)` → `urgencyOf(inProductionAt)` (đọc `row.inProductionAt`).
- Cột **"Đã chờ"** đổi thành 2 dòng nhỏ:
  - Dòng 1 (đậm): **tuổi SX** `formatDuration(inProductionAt)` + "SX dd/MM".
  - Dòng 2 (mờ): **"lỗi: {formatDuration(productionFirstErrorAt)}"** + "báo dd/MM" (giữ thông tin cũ).
- Tooltip chip mức độ đổi mô tả: "< 24h kể từ ngày vào SX" … "≥ 72h kể từ ngày vào SX".
- Header phụ đề: "…sắp xếp theo **ngày vào sản xuất** lâu nhất trước".

---

## Phần 2 — Field `productionErrorResolvedAt` + tab "Đã xong"

### Schema
- `order.entity.ts`: thêm `@Prop() productionErrorResolvedAt?: Date;` (indexed để sort).
- `ProductionOrderZod` (`production-order.dto.ts`): thêm `productionErrorResolvedAt` (date optional).

### Set field lúc runtime (mọi nơi đơn **hết lỗi** = null `productionFirstErrorAt` do fix)
Set `productionErrorResolvedAt = now` **chỉ khi** trước đó đơn đang có lỗi mở (`before.productionFirstErrorAt` set **hoặc** `productionErrorCount>0`):
- `OrderService.updateField` — nhánh `toolResultNote='ok'` (cạnh chỗ set `productionFirstErrorAt=null`).
- `OrderService.updateField` — nhánh clear `productionError=''` (cạnh `productionFirstErrorAt=null`).
- `OrderService.bulkUpdateField` — path `toolResultNote='ok'` (updateMany subset).
- `OrderService.importRework` — path đánh 'ok'.
- `DesignerTaskService.resolveTransition` — case `Complete` (`designer-task.service.ts:240`, cạnh `productionFirstErrorAt: null`).
- (Ngược lại: khi đơn **báo lỗi lại** — set `productionFirstErrorAt=now` — **clear** `productionErrorResolvedAt=null` để không lẫn giữa open/done.)

### Backfill (`onModuleInit`, idempotent)
- `updateMany({ productionErrorCount>0, productionFirstErrorAt null, productionErrorResolvedAt exists:false }, [{ $set: { productionErrorResolvedAt: '$updatedAt' } }])` — ước lượng mốc bằng `updatedAt`. Chạy 1 lần, cần restart API.

### Backend `getErrorLog` — thêm tab
- DTO `GetErrorLogZod`: thêm `status: z.enum(['open','done']).default('open')`.
- `status='open'` (mặc định, như hiện tại): `productionError set` + `productionFirstErrorAt != null`. Trục tuổi = `inProductionAt` (Phần 1).
- `status='done'`: `productionErrorCount > 0` + `productionFirstErrorAt` **null/absent** + `productionErrorResolvedAt` set. **Bỏ** bộ lọc/aggregate urgency (không áp cho done). Sort mặc định `{ productionErrorResolvedAt: -1 }` (sửa xong gần nhất trước); vẫn cho filter ngày theo `inProductionAt`.
- `byUrgency`: chỉ tính cho `open`; `done` trả `{new:0,…}` + dùng `total` cho badge "Đã xong".
- Res DTO: thêm (optional) `doneTotal`? — không cần, `total` đã phản ánh tab hiện tại. FE fetch riêng count "Đã xong" bằng 1 call `status=done&limit=1` nếu muốn badge (hoặc thêm field). **Chốt: thêm `resolvedTotal` vào Res** = tổng đơn đã xong trong scope (rẻ, 1 countDocuments) để badge tab luôn hiện.

### Frontend
- Segmented control 2 tab trên đầu: **"Đang lỗi ({total open})" / "Đã xong ({resolvedTotal})"** (state `statusTab`, URL param `estatus`).
- Tab "Đã xong":
  - Ẩn dải chip mức độ (không áp).
  - Cột "Đã chờ" → đổi thành **"Sửa xong lúc"** = `formatDate(productionErrorResolvedAt)` + "SX dd/MM".
  - Giữ nguyên các cột còn lại (productionError hiển thị lỗi đã fix — tham chiếu). Badge "Số lần lỗi" giữ.
  - Sort BE theo resolvedAt desc.
- `ErrorLogRow` thêm `productionErrorResolvedAt?: string`.

---

## Phần 3 — Mảng `productionErrorHistory`

### Schema
- `order.entity.ts`: subdoc array
  ```ts
  productionErrorHistory?: {
    code: string;            // productionError code
    source?: string;         // designer | factory | tool-check
    note?: string;           // productionErrorNote lúc đó
    at: Date;
    byUserId?: string;
    byUserName?: string;
  }[];
  ```
- `ProductionOrderZod`: thêm `productionErrorHistory` (array optional, subschema tương ứng).

### Append lúc runtime (mọi nơi set `productionError` = code non-empty)
Push 1 entry `{ code, source, note, at: now, byUserId, byUserName }` (dùng `$push`):
- `OrderService.updateField` — nhánh `productionError` (normalized truthy) — cạnh `$inc productionErrorCount`.
- `OrderService.setProductionError` (scan + dialog "Lỗi khác").
- `OrderService.bulkUpdateField` — nếu field=`productionError` (kiểm tra path bulk có set productionError không → cover).
- `OrderService.importRework` — nếu row set productionError code.
> Dùng chung 1 helper `buildProductionErrorHistoryEntry(before, code, source, note, ctx)` để 4 nơi nhất quán (giống `buildFulfillmentEntrySet`).

### Backfill (`onModuleInit`, idempotent)
- Đọc `OrderLog` field=`productionError`, `after ∉ [null,'']`, group theo orderId → build mảng `{code:after, at:createdAt, byUserId, byUserName}` (source/note best-effort từ log nếu có, else để trống).
- `updateMany`/bulkWrite **chỉ đơn `productionErrorHistory` chưa tồn tại/empty** (idempotent). Cần restart API. Ghi log số đơn backfill.
- ⚠️ Chi phí: 1 lần quét OrderLog. Chạy 1 lần lúc boot; guard `$exists:false` để lần sau match 0.

### Frontend hiển thị (cả 2 tab)
- Cột mới **"Lỗi từng gặp"** (hoặc chip dưới cột productionError): render tối đa N chip từ `row.productionErrorHistory` (resolve name qua `productionErrorConfigs`), badge `×count`, hover tooltip full list `{name · nguồn · dd/MM HH:mm · ai}`. Trùng nút "Lịch sử" nhưng nhanh hơn (khỏi mở dialog).
- `ErrorLogRow` thêm `productionErrorHistory?`.

---

## Files đụng tới (tổng hợp)
| Layer | File | Thay đổi |
|---|---|---|
| shared | `production-order.dto.ts` | `ProductionOrderZod` +2 field; `GetErrorLogZod.status`; `GetErrorLogResZod` +`resolvedTotal` |
| BE entity | `order.entity.ts` | `productionErrorResolvedAt`, `productionErrorHistory[]` |
| BE | `order.service.ts` | `getErrorLog` (sort/urgency/aggregate theo inProductionAt + tab status + resolvedTotal); set resolvedAt + push history ở updateField/bulk/import/setProductionError; helper history; onModuleInit 2 backfill |
| BE | `designer-task.service.ts` | complete: set `productionErrorResolvedAt` |
| BE controller | `order.controller.ts` | truyền `status` (đã có dto) — kiểm tra không cần đổi signature |
| FE | `ErrorLogTab.tsx` | urgency theo inProductionAt; cột "Đã chờ" 2 mốc; segmented tab open/done; cột "Sửa xong lúc"; cột "Lỗi từng gặp"; types |

## Rủi ro / lưu ý
- **Không tăng tải đáng kể**: getErrorLog vẫn 2 query song song; thêm `$push`/1 field set ở các mutation sẵn có. 2 backfill chạy 1 lần lúc boot (idempotent, guard `$exists:false`).
- **Cần restart API** để chạy 2 migration onModuleInit + nhận `status` enum mới.
- `inProductionAt` null (đơn hiếm chưa set) → sort đầu + bucket critical; chấp nhận.
- Không đụng các bảng/luồng khác dùng `productionError` (single field vẫn giữ hành vi ghi đè — history là bản ghi phụ, không thay field chính).

## Verify
`pnpm --filter shared build` → api `tsc --noEmit` (đối chiếu baseline) → web `tsc --noEmit` + `vite build`. Cập nhật `documents/FunctionDescription/Orders.md` (§ Nhật ký bù lỗi) + `OrderLog.md` nếu cần. Không commit tới khi user yêu cầu.
</content>
