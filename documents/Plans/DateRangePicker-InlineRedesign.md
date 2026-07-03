# DateRangePicker — Redesign thanh preset inline

> **Mục tiêu:** Hiển thị sẵn các option ngày nhanh **ra ngoài giao diện** (không cần bấm vào ô mới thấy), xếp **hàng ngang chiếm nguyên 1 chiều ngang**, vẫn có "Tùy chỉnh" để chọn khoảng tùy ý.
>
> **Option yêu cầu (8):** Hôm nay · Hôm qua · 7 ngày · 14 ngày · 30 ngày · Tháng này · Tháng trước · Tùy chỉnh.
>
> **File component:** `apps/web/src/components/common/DateRangePicker.tsx`
> **File preset:** `apps/web/src/utils/dateRangePresets.ts`
> **Trạng thái:** ✅ ĐÃ IMPLEMENT. Quyết định đã chốt: (1) tách hàng riêng full-width; (2) ToolCheckTab + DesignerStatsTab đổi `days` → `from/to`; (3) LifecycleStrip giữ `popover`.

---

## 1. Bối cảnh — 8 nơi dùng, 2 model khác nhau

| Nơi dùng | File | Cách đặt hiện tại |
|---|---|---|
| OrderFilterBar | `apps/web/src/components/orders/OrderFilterBar.tsx:163` | Chung hàng flex-wrap với search (flex-1) + Tải lại |
| Fulfillment my-tasks | `apps/web/src/pages/fulfillment/my-tasks/index.tsx:873` | Chung hàng với search (flex-1) |
| Designer my-tasks | `apps/web/src/pages/designer/my-tasks/index.tsx:542` | Chung hàng với Tải lại (`clearable={false}`) |
| StatusBarCharts | `apps/web/src/pages/home/StatusBarCharts.tsx:173` | Chỉ ở "designer mode" (`clearable={false}`); "chart mode" có nút RANGES riêng |
| LifecycleStrip | `apps/web/src/pages/home/LifecycleStrip.tsx:235` | Strip gọn, nằm giữa các nút nhỏ |
| **ToolCheckTab** | `apps/web/src/pages/home/ToolCheckTab.tsx:286` | ⚠️ Có **nhóm nút `7/14/30 ngày` riêng** gửi param **`days`** + DateRangePicker chỉ là ô "khoảng tùy chỉnh" phụ (gửi `from/to` override) |
| **DesignerStatsTab** | `apps/web/src/pages/home/DesignerStatsTab.tsx:189` | ⚠️ Giống ToolCheckTab — model `rangeDays` (`days`) + custom `from/to` (`dateFrom`/`dateTo`) |

> **⚠️ Điểm mấu chốt:** `ToolCheckTab` + `DesignerStatsTab` KHÔNG dùng from/to cho preset — dùng `rangeDays` gửi param `days=7|14|30` xuống BE. `DateRangePicker` chỉ là ô phụ. Xem quyết định #2.

---

## 2. Thiết kế component mới

### 2.1 Preset (`dateRangePresets.ts`)

- Thêm 3 preset **N ngày gần nhất** (inclusive, tính đến hôm nay):
  - `last-7d` = "7 ngày" → `from = hôm nay − 6`, `to = hôm nay`
  - `last-14d` = "14 ngày" → `from = hôm nay − 13`, `to = hôm nay`
  - `last-30d` = "30 ngày" → `from = hôm nay − 29`, `to = hôm nay`
  - Dùng `toISO()` + `addDays()` sẵn có (local tz, KHÔNG `toISOString()`).
- Giữ nguyên các preset cũ (`today`/`yesterday`/`this-week`/`last-week`/`this-month`/`last-month`/`this-year`/`last-year`) để không phá `matchPreset` + variant `popover`.
- Thêm export danh sách **curated cho thanh inline** (đúng thứ tự yêu cầu):
  ```ts
  export const QUICK_PRESET_KEYS = [
    'today', 'yesterday', 'last-7d', 'last-14d', 'last-30d', 'this-month', 'last-month',
  ] as const;
  ```
  (Nút "Tùy chỉnh" là item thứ 8, render riêng — không nằm trong list này.)

> **Lưu ý `matchPreset`:** nó lặp `DATE_PRESETS` theo thứ tự, first-match-wins. Đặt `last-7d/14d/30d` sau `today`/`yesterday` để không nuốt nhầm. Range 7/14/30 ngày không trùng today/yesterday nên an toàn.

### 2.2 Component (`DateRangePicker.tsx`)

- Thêm prop:
  ```ts
  variant?: 'popover' | 'inline';   // default 'popover' — KHÔNG đổi hành vi nơi chưa migrate
  ```
- **`variant='popover'`**: GIỮ NGUYÊN 100% code hiện tại.
- **`variant='inline'`**: render thanh ngang:
  - Container: `w-full flex flex-wrap items-center gap-1.5`.
  - 7 pill preset từ `QUICK_PRESET_KEYS` (map ra `DATE_PRESETS`), style pill giống nút preset trong popover cũ (`h-8 px-2.5 rounded-md border text-xs`), preset đang active (`matchPreset(from,to)`) → highlight `border-primary bg-primary/10 text-primary`.
  - Pill thứ 8 **"Tùy chỉnh"** = `PopoverTrigger`; mở ra `PopoverContent` chứa **2 input date + Áp dụng/Xóa** (tái dùng nguyên block "Hoặc chọn khoảng tùy chỉnh" hiện có, kèm buffer `draftFrom`/`draftTo`).
    - Khi range hiện tại là custom (`matchPreset === null && hasValue`) → pill "Tùy chỉnh" hiện label `${fmt(from)} → ${fmt(to)}` + highlight.
    - Ngược lại pill hiện chữ "Tùy chỉnh" + icon `Calendar`.
  - Tôn trọng `clearable`: `false` → ẩn nút "Xóa" trong popover tùy chỉnh (các nơi `clearable={false}` luôn phải có value).
- Tách body popover-tùy-chỉnh thành sub-component/JSX dùng chung cho cả 2 variant để tránh lặp code.

---

## 3. Áp dụng từng nơi

| Nơi | Hành động | Ghi chú |
|---|---|---|
| OrderFilterBar | `variant='inline'`, đưa xuống **hàng riêng** dưới hàng search | Filter bar 1 hàng → 2 hàng |
| Fulfillment my-tasks | `variant='inline'`, hàng riêng | |
| Designer my-tasks | `variant='inline'`, hàng riêng (`clearable={false}`) | |
| StatusBarCharts (designer mode) | `variant='inline'` | "chart mode" giữ RANGES riêng, không đụng |
| ToolCheckTab | Bỏ nhóm nút `[7,14,30] ngày` + ô picker phụ → **1 thanh inline duy nhất** | ⚠️ Xem quyết định #2 (đổi `days`→`from/to`) |
| DesignerStatsTab | Bỏ nhóm nút `rangeDays` + ô picker phụ → **1 thanh inline** | ⚠️ Xem quyết định #2 |
| LifecycleStrip | **Giữ `popover`** (khuyến nghị) | ⚠️ Xem quyết định #3 |

---

## 4. ⚠️ 3 quyết định cần chốt trước khi implement

1. **Bố cục 2 hàng ở filter bar chung với search:** thanh ngày tách xuống hàng riêng full-width.
   - [x] OK, tách hàng riêng (đúng ý "chiếm nguyên 1 chiều ngang")

2. **ToolCheckTab / DesignerStatsTab đổi `days` → `from/to`:**
   - [x] Đổi sang `from/to` (gộp UI, đồng bộ). ToolCheckTab: bỏ hẳn `rangeDays`, luôn gửi `from/to` (default `last-7d`). DesignerStatsTab: bỏ `rangeDays`, `from/to` default `last-7d`, prop `days` truyền hằng `7` cho bảng con (BE bỏ qua khi có from/to).

3. **LifecycleStrip:**
   - [x] Giữ `popover` (không đổi)

---

## 5. Build verify sau khi implement

- `cd apps/web && ./node_modules/.bin/tsc --noEmit` → lọc file đã sửa, so với baseline (không phát sinh lỗi mới).
- `./node_modules/.bin/vite build | tail -2` → `✓ built`.
- Test tay: mỗi nơi migrate → bấm từng preset thấy đổi range ngay; "Tùy chỉnh" mở popover chọn tay + Áp dụng/Xóa; preset active highlight đúng; màn hẹp pill wrap gọn.

---

## 6. Checklist file sẽ sửa

- [ ] `apps/web/src/utils/dateRangePresets.ts` — thêm `last-7d/14d/30d` + `QUICK_PRESET_KEYS`
- [ ] `apps/web/src/components/common/DateRangePicker.tsx` — thêm `variant` + nhánh `inline`
- [ ] `apps/web/src/components/orders/OrderFilterBar.tsx`
- [ ] `apps/web/src/pages/fulfillment/my-tasks/index.tsx`
- [ ] `apps/web/src/pages/designer/my-tasks/index.tsx`
- [ ] `apps/web/src/pages/home/StatusBarCharts.tsx`
- [ ] `apps/web/src/pages/home/ToolCheckTab.tsx` (tùy quyết định #2)
- [ ] `apps/web/src/pages/home/DesignerStatsTab.tsx` (tùy quyết định #2)
- [ ] `apps/web/src/pages/home/LifecycleStrip.tsx` (tùy quyết định #3)
- [ ] Doc: nếu đổi UX filter ngày ở feature nào có doc trong `documents/FunctionDescription/` → cập nhật mục UI Components tương ứng (Orders / Dashboard / DesignerTaskWorkflow / FulfillmentWorkflow / ToolCheckWorkflow / OrderLifecycle).
