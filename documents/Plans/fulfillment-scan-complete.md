# Kế hoạch — Quét barcode → Hoàn thành nhanh stage trên Fulfillment My Tasks

> **Status:** Draft — chờ implement
> **Page áp dụng:** `apps/web/src/pages/fulfillment/my-tasks/index.tsx`
> **Liên quan:** [`documents/FunctionDescription/ScanError.md`](../FunctionDescription/ScanError.md) (đã có pattern scan tương tự cho gán lỗi), [`documents/FunctionDescription/FulfillmentWorkflow.md`](../FunctionDescription/FulfillmentWorkflow.md) (state machine 7 stage)

---

## 1. Mục tiêu

Workshop staff phụ trách 1 stage trong dây chuyền fulfillment (vd "In") cần **hoàn thành đơn nhanh** qua máy quét barcode USB thay vì kéo card kanban / click "Hoàn thành" từng đơn.

**Yêu cầu:**
- Trên page `/fulfillment/my-tasks`, thêm 1 button (vd "Quét hoàn thành") cạnh nút "Làm mới".
- Click button → mở modal có input quét barcode.
- Quét đơn → hiển thị info đơn trong modal.
- Nhấn Enter (lần 2, từ user) → hệ thống tự transition stage đó của đơn sang `done`.
- Modal **giữ mở** sau khi complete → focus lại input để workshop quét đơn tiếp.

**Hỗ trợ:**
- 2 mode: **Barcode** (auto-strip prefix `N-`) / **Nhập tay** — reuse pattern từ `pages/orders/scan-error`.
- Tự xử lý đơn ở status `waiting` (chưa Start) → tự `start + complete` trong 1 lần Enter.
- Block (hiển thị nhưng disable) khi đơn không thuộc stage của user / đã `done` rồi.

---

## 2. Quyết định đã chốt (user confirm 2026-06-28)

| # | Tình huống | Quyết định |
|---|---|---|
| 1 | Đơn không ở stage của user (vd user `print`, đơn ở `press`) | **Vẫn hiển thị info đơn** + disable nút complete + alert amber "Đơn không thuộc công đoạn của bạn". Workshop nhìn thấy nhưng không hoàn thành được. |
| 2 | Đơn ở stage user nhưng status = `waiting` (chưa Start) | Tự động **waiting → in-progress → done** trong 1 thao tác. BE call sequential: `transition(start)` rồi `transition(complete)`. Workshop chỉ cần quét + Enter là xong. Áp dụng tương tự cho status `rework`. |
| 3 | Luồng Enter trong modal | **2 lần Enter** mới complete: Enter 1 (từ scanner kết thúc barcode) → fetch info; Enter 2 (user xác nhận) → complete. An toàn, tránh hoàn thành nhầm. |
| 4 | Đơn ở status `done` rồi (user đã complete trước đó) | Hiển thị info + nút "Tiếp tục quét". Nhấn Enter → reset modal state (clear input + back về Phase 1) để quét đơn tiếp. |
| 5 | Sau khi complete xong | **Modal giữ mở** + refresh kanban dưới nền + clear input + re-focus → workshop quét hàng loạt liên tục không cần đóng/mở modal. |

---

## 3. Luồng hoạt động

### 3.1 Happy path (đơn đúng stage, status in-progress)

```
1. Workshop click button "Quét hoàn thành" (header bar, cạnh Làm mới)
2. Modal mở → input autoFocus → state = "phase1-await-scan"
3. Workshop quét barcode "N-PROD1234<Enter>"  ← scanner output
4. Input nhận chuỗi + Enter event
   → normalizeCode (strip "N-" nếu mode=barcode)
   → call GET /v1/orders/by-production-id/PROD1234
5. Match đơn → set state = "phase2-confirm" + hiển thị info card:
     • Mockup thumb + productionId
     • Type / size / color / qty
     • Stage user vs stage đơn (badge khớp / không khớp)
     • Status hiện tại của stage (badge waiting/in-progress/rework/done)
   → autoFocus primary button "Hoàn thành"
6. Workshop nhấn Enter (lần 2)  ← user keystroke
7. Modal:
     - Nếu status=in-progress → 1 BE call: transition(complete)
     - Nếu status=waiting/rework → 2 BE call sequential: transition(start) → transition(complete)
8. Toast success → append history → trigger refresh kanban (parent callback)
9. Modal về state = "phase1-await-scan":
     - Clear input value
     - Focus input ngay
     - Append entry vào lịch sử quét (max 10)
10. Workshop quét đơn tiếp → quay lại bước 3.
```

### 3.2 Đơn không thuộc stage user

```
1-4. Như happy path → fetch về đơn có currentFulfillmentStage = 'press'
   nhưng user.fulfillmentStage = 'print'.
5. State = "phase2-confirm" + hiển thị info card.
   → Badge stage có style ❌ amber: "Đơn đang ở: Ép · Bạn phụ trách: In"
   → Alert amber: "Đơn không thuộc công đoạn của bạn — không thể hoàn thành ở đây."
   → Button autoFocus đổi thành "Tiếp tục quét" (KHÔNG phải Hoàn thành).
6. Workshop nhấn Enter → reset state về phase1, quét đơn tiếp.
```

### 3.3 Đơn đã `done` ở stage user

```
1-4. Như happy path → fetch về đơn có currentFulfillmentStage = 'print'
   nhưng fulfillmentStages.print.status = 'done' (user đã complete trước đó,
   đơn đang ở stage 'press' hoặc xa hơn).
   
   Lưu ý: Đơn đã done ở stage này → currentFulfillmentStage thường KHÔNG còn
   là 'print' nữa (đã auto-advance sang 'press'). Logic check:
     - resolveOrderStageStatus(order, user.fulfillmentStage) === 'done'

5. State = "phase2-confirm" + hiển thị info.
   → Badge xanh: "Stage của bạn ({myStage}) đã hoàn thành lúc {completedAt}"
   → Button autoFocus đổi thành "Tiếp tục quét".
6. Workshop nhấn Enter → reset state, quét đơn tiếp.
```

### 3.4 Đơn không tồn tại / ngoài scope visibility

```
1-4. Như happy path → BE 404 (không tìm thấy hoặc không thuộc factory user).
5. State giữ phase1 + toast "Không tìm thấy đơn với mã này".
   → Append history entry status='not-found'.
   → Clear input + re-focus.
6. Workshop quét đơn tiếp.
```

### 3.5 Đơn đang ở status `rework`

Tương tự `waiting` (Quyết định #2):
- BE call sequential: `transition(start)` → `transition(complete)`.
- Status: `rework → in-progress → done`.
- workMs cộng dồn (BE đã handle).
- reworkCount KHÔNG tăng (chỉ tăng khi stage sau đẩy về).

---

## 4. State machine modal

```
   [phase1-await-scan]
   - Input autoFocus, value=''
   - Loading=false
   - order=null
   - History list dưới
        │ user/scanner gõ Enter
        ▼
   [loading-fetch]
   - Input disabled, spinner inline
   - Call getByProductionId
        │ ┌── 404 → toast + history(not-found) + reset → phase1
        │ └── 200 ┐
        ▼        ▼
   [phase2-confirm]
   - Hiển thị info card
   - Compute status:
       canComplete = (order.currentFulfillmentStage === myStage)
                  && (status in {waiting, in-progress, rework})
       isDoneAtMyStage = (resolveStageStatus(order, myStage) === 'done')
   - Primary button autoFocus:
       canComplete=true  → "Hoàn thành" (indigo)
       canComplete=false → "Tiếp tục quét" (outline)
        │ user gõ Enter (= click primary button)
        ▼
   ┌─────────────────────────────────────┐
   │ Nếu canComplete:                    │
   │   [loading-complete]                │
   │   - status=waiting/rework:           │
   │       1. transition(start)          │
   │       2. transition(complete)       │
   │   - status=in-progress:              │
   │       1. transition(complete)       │
   │   → toast success + history(ok)     │
   │   → emit onCompleted → parent       │
   │     refresh kanban                  │
   │   → reset → phase1                  │
   │ Nếu !canComplete:                   │
   │   → reset → phase1 (không gọi BE)   │
   └─────────────────────────────────────┘
```

**Edge: scanner gõ Enter trong khi đang ở phase2** (workshop chưa kịp xác nhận, đã quét đơn tiếp):
- Phase2 không có input visible → keystroke Enter rơi vào primary button (autoFocus).
- Nếu canComplete=true → tự complete đơn HIỆN TẠI (đơn vừa fetch).
- Sau đó modal reset → phase1, lúc này keystroke barcode tiếp theo sẽ vào input.
- **Rủi ro**: workshop quét nhanh, scanner gõ chuỗi "N-PROD1235<Enter>" vào lúc phase2 → ký tự của PROD1235 sẽ inject vào primary button (vô hại vì button không nhận text input), sau đó Enter trigger complete PROD1234 đang hiển thị → kết quả là PROD1235 bị BỎ QUA, chỉ PROD1234 được complete.
- **Mitigation**: 2 cách
  - **(a) Acceptable** — Workshop được khuyến cáo "chờ toast success rồi quét đơn tiếp". Implement đơn giản nhất.
  - **(b) Buffer** — Khi đang phase2, capture keystroke vào hidden buffer. Nếu phát hiện chuỗi mới có Enter → defer: complete đơn hiện tại trước, rồi process buffer như scan mới. Phức tạp, defer Phase 2.

  → Phase 1 dùng **(a)**. Hint text "⏳ Chờ toast xác nhận trước khi quét đơn tiếp" hiển thị trong khi đang loading-complete.

---

## 5. UI specs

### 5.1 Entry button trong header bar

`apps/web/src/pages/fulfillment/my-tasks/index.tsx` — chỗ render header (~line 595):

```tsx
<div className="flex items-center gap-2">
  <Button
    variant="default"
    size="sm"
    onClick={() => setScanCompleteOpen(true)}
    className="gap-1.5"
  >
    <ScanLine size={14} />
    Quét hoàn thành
  </Button>
  <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
  </Button>
</div>
```

Chỉ render khi `myStage` đã resolve (user có `fulfillmentStage`). Nếu admin/manager đang override stage → hiển thị badge "đang xem stage X" cạnh nút.

### 5.2 Modal `FulfillmentScanCompleteDialog`

File mới: `apps/web/src/pages/fulfillment/my-tasks/FulfillmentScanCompleteDialog.tsx`

**Props:**
```ts
interface Props {
  myStage: FulfillmentStage;
  open: boolean;
  onClose: () => void;
  /** Gọi sau khi complete thành công 1 đơn → parent reload kanban. */
  onCompleted: () => void;
}
```

**Layout (max-w-xl):**

```
┌────────────────────────────────────────────────────┐
│ 🎯 Quét hoàn thành — {myStage label}          [×] │
├────────────────────────────────────────────────────┤
│ Chế độ:  [📡 Barcode]  [⌨ Nhập tay]              │  ← segmented (reuse từ scan-error)
│                                                    │
│ ┌────────────────────────────────────────────────┐│
│ │ 📡  N-PROD1234                              ⌛  ││  ← phase1: input autoFocus
│ └────────────────────────────────────────────────┘│
│   Sẽ tra cứu: PROD1234  ✓ đã bỏ "N-"              │  ← live preview chip
│                                                    │
│   ⚠ phase2 — info card:                           │
│   ┌──────────────────────────────────────────────┐│
│   │ [thumb] PROD1234 · Áo · Đỏ · M · qty 2       ││
│   │ Xưởng: ML · Máy: M-94                        ││
│   │ Stage: [📍 In · in-progress] ✓ khớp           ││  ← badge match/mismatch
│   │ workMs: 12m 30s                              ││
│   └──────────────────────────────────────────────┘│
│                                                    │
│   [alert nếu canComplete=false]                   │
│                                                    │
├────────────────────────────────────────────────────┤
│ 📜 Lịch sử quét gần nhất (3/10)        [Xoá]     │
│   ✅ PROD-1234 · Đã hoàn thành (In)   14:25:33   │
│   ⏭  PROD-1235 · Bỏ qua (Ép, không thuộc bạn)    │
│   ❌ PROD-1236 · Không tìm thấy        14:24:58   │
├────────────────────────────────────────────────────┤
│                  [Huỷ]   [✓ Hoàn thành]            │  ← primary autoFocus, đổi label theo state
└────────────────────────────────────────────────────┘
```

**State trong dialog:**
```ts
type Phase = 'await-scan' | 'fetching' | 'confirm' | 'completing';

const [phase, setPhase] = useState<Phase>('await-scan');
const [value, setValue] = useState('');
const [mode, setMode] = useState<ScanMode>(/* localStorage */);
const [order, setOrder] = useState<ScannedOrder | null>(null);
const [history, setHistory] = useState<HistoryEntry[]>([]);
```

**Mode toggle:** dùng key localStorage **riêng** `fulfillment-scan-complete-mode` (không share với scan-error vì 2 workflow độc lập, có thể workshop chọn mode khác nhau).

**Live preview chip + warning amber** khi mode=barcode mà input không có prefix `N-` — reuse logic từ scan-error.

**Info card badge stage match/mismatch:**
- Match (`order.currentFulfillmentStage === myStage`): badge xanh emerald + icon ✓.
- Mismatch: badge amber + "Đơn đang ở: {stage} · Bạn phụ trách: {myStage}".
- Đơn đã done ở myStage (stage hiện tại đã advance qua): badge xanh + "Đã hoàn thành lúc {completedAt}".

**Status badge** (compute từ `order.fulfillmentStages[myStage].status`):
- waiting → zinc
- in-progress → indigo
- rework → amber + icon RotateCw
- done → emerald + icon CheckCircle2

**Alert/Hint:**
- canComplete=true + status=waiting/rework: amber info "Stage chưa Start. Hoàn thành sẽ tự Bắt đầu + Đóng cùng lúc."
- canComplete=false (sai stage): amber error "Đơn không thuộc công đoạn của bạn — không thể hoàn thành ở đây."
- canComplete=false (đã done ở myStage): emerald info "Stage của bạn đã hoàn thành trước đó. Bấm Enter để quét đơn tiếp."

**Primary button label** đổi theo state:
- phase=fetching → "Đang tra cứu…" + spinner
- phase=completing → "Đang hoàn thành…" + spinner
- phase=confirm + canComplete → "✓ Hoàn thành"
- phase=confirm + !canComplete → "Quét tiếp"

**History list:** max 10, mỗi entry status icon + productionId + nhãn ("Đã hoàn thành (In)" / "Bỏ qua (Ép, không thuộc bạn)" / "Đã done sẵn ở stage bạn" / "Không tìm thấy" / "Lỗi") + timestamp HH:mm:ss.

### 5.3 Reuse từ scan-error

Tách helper dùng chung sang file mới `apps/web/src/utils/scanNormalize.ts`:
```ts
export type ScanMode = 'barcode' | 'normal';
export const BARCODE_PREFIX = 'N-';
export function normalizeCode(raw: string, mode: ScanMode): string { ... }
```

Cả `pages/orders/scan-error/index.tsx` + `pages/fulfillment/my-tasks/FulfillmentScanCompleteDialog.tsx` import từ đây. Mode toggle component cũng có thể tách thành `apps/web/src/components/common/ScanModeToggle.tsx` để DRY.

---

## 6. Backend reuse — KHÔNG có endpoint mới

| Endpoint | Mục đích | Hiện trạng |
|---|---|---|
| `GET /v1/orders/by-production-id/:code` | Fetch đơn theo productionId, populate factory/machineType, áp visibility filter Fulfillment per-factory | ✅ Đã có (từ `ScanError.md`) |
| `POST /v1/orders/:id/fulfillment-transition` | action=`start` (waiting/rework → in-progress) | ✅ Đã có |
| `POST /v1/orders/:id/fulfillment-transition` | action=`complete` (in-progress → done + auto-advance) | ✅ Đã có |

**Visibility check trong endpoint by-production-id**: BE đã trả 404 cho đơn ngoài factory của Fulfillment user → không leak.

**Stage ownership check trong endpoint fulfillment-transition**: BE `FulfillmentTaskService.transition()` đã check `user.fulfillmentStage === body.stage && order.factoryId === user.factoryId && order.currentFulfillmentStage === body.stage`. Nếu user lách FE để gọi complete cho đơn không thuộc stage → BE trả 403 / 409.

**Race condition**: `findOneAndUpdate` filter chứa `expected status` → nếu 2 user transition đồng thời → người sau nhận 409. FE catch 409 → toast "Đơn đã được hoàn thành bởi người khác. Hãy làm mới." + refetch.

---

## 7. Edge cases tổng hợp

| Case | UI Phase 2 | Primary button | Enter behavior |
|---|---|---|---|
| Đơn đúng stage + status `in-progress` | Badge xanh ✓ | "✓ Hoàn thành" | 1 BE call complete |
| Đơn đúng stage + status `waiting` | Badge zinc + alert "sẽ tự Bắt đầu" | "✓ Hoàn thành" | 2 BE call: start → complete |
| Đơn đúng stage + status `rework` | Badge amber + alert "sẽ tự Bắt đầu" | "✓ Hoàn thành" | 2 BE call: start → complete |
| Đơn đúng stage + status `done` (đã hoàn thành trước đó) | Badge xanh "Đã hoàn thành lúc..." | "Quét tiếp" | Reset state, no BE call |
| Đơn KHÔNG ở stage user | Badge amber + alert "không thuộc công đoạn của bạn" | "Quét tiếp" | Reset state, no BE call |
| Đơn ở stage user nhưng đơn vẫn ở waiting do mới start lại từ rework (đã start, đang chờ user phase2 thì stage sau đẩy về) | Badge tự refresh nếu user F5; hiện tại không real-time | Vẫn complete nếu canComplete=true | BE filter expected status → 409 nếu race |
| Đơn đã cancel (`cancelledAt` set) | BE 404 từ fetch (visibility filter loại ra) | — | Toast "Không tìm thấy" |
| Đơn chưa vào fulfillment (`currentFulfillmentStage = null`) | Badge zinc "Chưa vào fulfillment" | "Quét tiếp" | Reset state, no BE call |
| Mã quét trùng đơn vừa complete (workshop quét nhầm 2 lần) | Phase2 hiện "Đã hoàn thành lúc..." | "Quét tiếp" | Reset, no BE call |
| Network fail giữa chừng `start` xong nhưng `complete` fail | Toast lỗi cụ thể. Đơn ở status `in-progress`. Workshop có thể quét lại để complete (chỉ 1 BE call). | — | — |
| User mở modal khi role không phải Fulfillment (admin xem trên page) | `myStage` = stage mặc định Admin chọn / undefined → button disabled + hint "Admin chưa chọn stage" | — | — |
| Scanner Enter rơi vào phase=fetching | Input đã disabled → Enter no-op. | — | — |

---

## 8. Milestones implement

### M1 — Helper dùng chung
- [ ] Tạo `apps/web/src/utils/scanNormalize.ts` — export `ScanMode`, `BARCODE_PREFIX`, `normalizeCode()`.
- [ ] Refactor `pages/orders/scan-error/index.tsx` để import từ helper (không lặp logic).

### M2 — Mode toggle reusable
- [ ] Tạo `apps/web/src/components/common/ScanModeToggle.tsx` — segmented control với 2 props `value`, `onChange`. Optional `storageKey` để persist auto.
- [ ] Refactor `scan-error/index.tsx` dùng component này.

### M3 — Modal `FulfillmentScanCompleteDialog`
- [ ] Tạo file `pages/fulfillment/my-tasks/FulfillmentScanCompleteDialog.tsx`.
- [ ] State machine 4 phase: `await-scan` / `fetching` / `confirm` / `completing`.
- [ ] Resolve helper `resolveOrderStageStatus(order, myStage)` (đọc `fulfillmentStages[myStage].status`, fallback từ `currentFulfillmentStage`).
- [ ] Compute `canComplete` logic.
- [ ] Primary button autoFocus + label đổi theo state.
- [ ] 2-Enter pattern: Enter trên input → fetch; Enter trên button → submit.
- [ ] Sequential transition logic (waiting/rework → start + complete; in-progress → complete).
- [ ] Catch 409 race condition → toast + emit refresh signal.
- [ ] History list 10 entries.

### M4 — Wire vào page
- [ ] Thêm state `scanCompleteOpen` + button "Quét hoàn thành" trong header bar (`my-tasks/index.tsx` line ~595).
- [ ] `onCompleted` callback → trigger `load()` để refresh kanban.
- [ ] Hide button nếu `!myStage` (admin chưa chọn stage override).

### M5 — Doc + mapping
- [ ] Tạo `documents/FunctionDescription/FulfillmentScanComplete.md` theo template.
- [ ] Update `documents/FunctionDescription/FulfillmentWorkflow.md` thêm 1 mục mới § "Quét hoàn thành nhanh" link sang doc mới.
- [ ] Update `CLAUDE.md` — thêm 1 row vào bảng Feature → Doc mapping HOẶC mở rộng row Fulfillment hiện tại để include file mới.

### M6 — Test manual
- [ ] Cắm scanner USB, test 5 happy path + 5 edge case trong bảng §7.
- [ ] Test 2 mode toggle, persist qua refresh.
- [ ] Test quét hàng loạt 20 đơn liên tiếp — không cần đóng/mở modal.
- [ ] Test với Admin override stage → button "Quét hoàn thành" disabled khi chưa chọn stage.

---

## 9. Risks & open questions

| Risk | Mitigation |
|---|---|
| Scanner gõ Enter vào phase2 trong khi user chưa kịp xác nhận → complete nhầm đơn | Phase 1: chấp nhận, hint UI "chờ toast trước khi quét tiếp". Phase 2 (future): buffer keystrokes nếu cần. |
| Admin/Manager vào page chưa chọn stage → bấm button không hợp lý | Disable button + tooltip "Bạn chưa chọn stage để xem". |
| User Fulfillment có thể có `factoryId` nhưng `fulfillmentStage` chưa được admin gán | `myStage` = undefined → button không render (đồng bộ với kanban hiện tại đã handle). |
| 2 BE call sequential cho waiting → done có thể fail giữa chừng (start OK, complete fail) | Toast cụ thể "Đã Start nhưng Complete fail. Quét lại để Complete." Workshop quét lại → chỉ 1 call complete. |
| BE timeout hoặc 5xx trong loading-fetch | Toast error + reset phase1 (KHÔNG retry tự động). User quét lại. |
| Workshop quét nhầm sang đơn ở factory khác (vd đơn từ xưởng B trong batch xưởng A) | BE trả 404 (visibility filter loại đơn xưởng khác) → UI hiện "Không tìm thấy". Workshop biết quét sai. |
| Workshop Admin/Manager xem qua page này (override stage) muốn complete cho đơn không thuộc factory mình | BE `transition()` check `order.factoryId === user.factoryId` cho non-override roles. Admin có `fulfillment.task.override` → bypass check (hiện hành). FE không cần thêm logic. |

---

## 10. Permission

Không cần permission mới. Reuse:
- `page.fulfillment_my_tasks` — đã gate cả page (sidebar + route).
- `fulfillment.task.transition` — đã gate hành động complete.

User vào được page → tự có quyền dùng button "Quét hoàn thành".

---

## 11. Files dự kiến tạo/sửa

**Tạo mới:**
- `apps/web/src/utils/scanNormalize.ts` — helper share giữa 2 page (M1).
- `apps/web/src/components/common/ScanModeToggle.tsx` — segmented control reusable (M2).
- `apps/web/src/pages/fulfillment/my-tasks/FulfillmentScanCompleteDialog.tsx` — dialog chính (M3).
- `documents/FunctionDescription/FulfillmentScanComplete.md` — doc nghiệp vụ (M5).

**Sửa:**
- `apps/web/src/pages/orders/scan-error/index.tsx` — refactor dùng helper + ScanModeToggle (M1, M2).
- `apps/web/src/pages/fulfillment/my-tasks/index.tsx` — thêm button entry + state `scanCompleteOpen` + callback (M4).
- `documents/FunctionDescription/FulfillmentWorkflow.md` — thêm § "Quét hoàn thành" (M5).
- `CLAUDE.md` — update mapping (M5).

**KHÔNG đụng:**
- BE — không thêm endpoint, không sửa service.
- shared package — không thêm DTO/enum/permission.

---

## 12. Estimate

| Milestone | Effort |
|---|---|
| M1 — Helper | 15p |
| M2 — ScanModeToggle | 20p |
| M3 — Dialog | 90p |
| M4 — Wire page | 20p |
| M5 — Doc + mapping | 30p |
| M6 — Test manual | 30p |
| **Tổng** | **~3.5h** |

---

## 13. Lịch sử quyết định

- **2026-06-28** — User confirm 5 quyết định trong §2. Plan này được tạo trước khi implement để align expectations.
