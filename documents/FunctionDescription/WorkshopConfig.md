# Workshop Config — Function Description

> **File FE:** `apps/web/src/pages/workshop-config/index.tsx`, `CategoryEditor.tsx`, `ColorPicker.tsx`, `IconPicker.tsx`
> **Store FE:** `apps/web/src/store/workshopConfigStore.ts`
> **File BE:** `apps/api/src/modules/workshop-config/`
> **Shared:** `packages/shared/dtos/workshop-config.dto.ts`, `packages/shared/enums/workshop-config-category.ts`
> **Route:** `/workshop-config`
> **API:** `/v1/workshop-config/*`

---

## 1. Overview

Workshop Config là **danh mục dùng chung** cho các trường nghiệp vụ trong bảng Order (Trạng thái in, Note kết quả Tool, File sửa lỗi, Người thực hiện...). Mọi giá trị select trên Order table workshop đều resolve từ module này theo cặp `(category, code)`.

Module có **9 category** (giảm 1 từ Phase Designer-Task-Workflow Phase 6 — bỏ `assignee`), mỗi category có một trong 2 mode hiển thị:

| Category | Mode | Mục đích |
|----------|------|----------|
| `print_status` | color badge | Trạng thái in (Chưa in, Đã in máy 1..94) |
| `print_status_note` | icon | Số lần in |
| `tool_result` | icon | Có/không có tool |
| `tool_result_note` | color badge | Ok / Lỗi / Không có file PDF |
| `error_file_type` | icon | Loại file lỗi (Thân trước, Thân sau, Trụ...) |
| `assignee_note` | icon | Trạng thái xử lý (Ok / Lỗi / Không có tool) |
| `fabric_type` | icon | Loại vải / blank (POLY 2 DA, MÈ 64, LỤA 4B, LỤA VÂN GỖ, THUN LẠNH, NỈ BÔNG, MÈ CARO, LỤA NGỌC TRAI, LƯỚI, THÔ MỘC, LỤA, CANVAS, THUN BỘT, PHI BÓNG, 60% COTTON 40% POLY, LÔNG- CHĂN, ÁO: LỤA 4B- QUẦN: MÈ CARO, VẢI MÈ MỚI, MIX VẢI + LƯỚI, MÈ CA SẤU, THÊU, GIẢ LEN) |
| `machine` | color badge | Các máy in vật lý trong xưởng (94, 27, 56) — dùng làm dropdown cho cột "Máy" ở ProductConfig |
| `production_error` | color badge | Lý do xưởng báo lỗi đơn hàng. **Required `errorSource`** = `designer | factory` để dashboard stats phân loại. |

> **⚠️ Phase Designer-Task-Workflow Phase 6** đã **xoá category `assignee`**. Identity model designer giờ dùng `user._id` trực tiếp — picker "Người thực hiện" load thẳng từ `/v1/designer/team`. `WorkshopConfigService.onModuleInit()` chạy `deleteMany({ category: 'assignee' })` 1 lần khi boot (idempotent). Xem `DesignerTaskWorkflow.md §1`.

---

## 2. Schema `WorkshopConfigEntity`

```ts
{
  category: WorkshopConfigCategory;  // enum 9 giá trị (string)
  code: string;                      // slug, unique trong category — lưu vào Order
  name: string;                      // label hiển thị
  color?: string;                    // hex, dùng cho mode 'color'
  icon?: string;                     // tên Lucide icon, dùng cho mode 'icon'
  order: number;                     // sort
  isActive: boolean;
  errorSource?: 'designer' | 'factory';  // CHỈ category=production_error. Required khi tạo/sửa row production_error. 'designer' trigger rework auto cho task designer; 'factory' chỉ ghi stats.
}
// unique index (category, code)
```

- `code` là giá trị thực sự được lưu vào `OrderEntity.printStatus / toolResult / ...` (Phase 2). Đổi `name` không ảnh hưởng các order cũ.
- `WORKSHOP_CONFIG_MODE` (shared enum) định nghĩa mode cho từng category — service BE validate payload theo mode.

---

## 3. API endpoints

| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| GET | `/v1/workshop-config/all` | mọi user đã login | Trả map `{ category: items[] }` cho mọi category, chỉ `isActive=true`. Frontend gọi 1 lần sau login để cache vào store. |
| GET | `/v1/workshop-config?category=&isActive=` | mọi user đã login | List filter. |
| POST | `/v1/workshop-config` | Admin/SuperAdmin | Tạo. Validate `code` chưa có trong category, validate mode (color phải có color, icon phải có icon). |
| PATCH | `/v1/workshop-config/:id` | Admin/SuperAdmin | Update. Đổi `code` → check trùng. |
| PATCH | `/v1/workshop-config/reorder` | Admin/SuperAdmin | Body `{ category, items: [{ id, order }] }`. |
| DELETE | `/v1/workshop-config/:id` | Admin/SuperAdmin | Soft delete (`deletedAt`). Order cũ vẫn giữ giá trị code, chỉ không chọn được nữa. |

> Lưu ý: Plan phase 0 (RBAC) sẽ chuyển permission sang `workshop.manage` thay vì check role tĩnh. Hiện tại tạm dùng `RoleType.Admin / SuperAdmin`.

---

## 4. Auto-seed (`workshop-config.seed.ts`)

`WorkshopConfigService.onModuleInit()` upsert theo `(category, code)` — không tồn tại thì insert. Seed bao gồm tất cả giá trị mặc định trong yêu cầu nghiệp vụ:

- **print_status:** Chưa in (gray), Đã in máy 1/2/3/4/94 (5 màu)
- **print_status_note:** Đã in lần 1/2/3/4, Chưa in (icon Hash/Minus)
- **tool_result:** Có Tool / Không có Tool (icon Wrench/WrenchOff)
- **tool_result_note:** Không có tool (gray), Lỗi (red), Ok (green), Không có file PDF (orange)
- **error_file_type:** 12 loại — Không khớp, Thân trước, Thân sau, Trụ, 2 tay, Nẹp áo, Cổ viền, Dấu, Quần, Không may viền tay áo, Hỏi des khách, Temp
- **~~assignee~~** ❌ (đã bỏ category — dùng `user._id` trực tiếp qua `/designer/team`)
- **assignee_note:** Không có tool, Lỗi, Ok
- **fabric_type:** 22 mã — POLY 2 DA, MÈ 64, LỤA 4B, ... (xem section 1)
- **machine:** 3 máy — 94, 27, 56 (color badge)
- **production_error:** 10 lý do với `errorSource` flag:
  - **`designer` source**: `wrong-design`, `missing-design` (Sai design, Thiếu file design)
  - **`factory` source**: `wrong-size`, `wrong-color`, `wrong-fabric`, `print-misalign`, `print-blur`, `fabric-damage`, `machine-jam`, `other`

**Auto-backfill `errorSource`** khi boot: `onModuleInit` check row production_error chưa có flag → update với value từ seed (idempotent — chỉ update khi DB chưa có).

**Auto-cleanup `assignee` category**: `onModuleInit` chạy `deleteMany({ category: 'assignee' })` mỗi boot. Idempotent.

---

## 5. Frontend page `/workshop-config`

### 5.1 Cấu trúc
- Header (icon Building2 + tiêu đề + mô tả).
- Tabs (8 tab tương ứng 8 category).
- Mỗi tab render component `CategoryEditor` với prop `category` + `mode: 'color' | 'icon'`.

### 5.2 `CategoryEditor.tsx`
- Bảng các mục: cột Hiển thị (badge màu hoặc icon), Tên (+ **badge `DES`/`XƯỞNG`/`? CHƯA GÁN`** cạnh tên khi category=production_error), Mã, Trạng thái, Action.
- Nút **Thêm** → mở Dialog form: Tên + Mã (auto-slug từ tên) + ColorPicker / IconPicker + **2 button toggle "Do designer"/"Do xưởng"** (chỉ hiện cho category=production_error, required) + switch isActive.
- Nút **Sửa** trên mỗi row → mở cùng Dialog ở chế độ edit (pre-fill `errorSource` nếu có).
- Validate: production_error phải chọn errorSource trước khi save (toast error nếu thiếu).
- Nút **Xóa** → Confirm dialog → soft delete + xóa khỏi store.
- Tất cả thay đổi push qua `workshopConfigStore.upsertItem / removeItem` để giữ cache đồng bộ.

**ErrorSourceBadge** (component nội bộ trong `CategoryEditor.tsx`):
- `designer` → violet badge "DES"
- `factory` → sky badge "XƯỞNG"
- `undefined` → rose badge "? CHƯA GÁN" (cảnh báo data legacy chưa fill)

Picker option list trên cell `productionError` của workshop table cũng dùng cùng badge (xem `Orders.md §10.2` cột productionError).

### 5.3 `ColorPicker.tsx`
- Popover Radix.
- 21 màu preset (gray scale + 7 hue × 3 độ sáng).
- Input text (hex) + native `<input type="color">` để pick tự do.

### 5.4 `IconPicker.tsx`
- Popover Radix.
- 27 icon Lucide gợi ý phổ biến + search filter.
- Helper `LucideIcon({ name })` render icon từ tên — dùng cả ở table preview.

---

## 6. Frontend store `workshopConfigStore.ts`

```ts
useWorkshopConfigStore: {
  loaded: boolean
  loading: boolean
  byCategory: Record<WorkshopConfigCategory, WorkshopConfig[]>
  load(force?): Promise<void>   // gọi sau login; idempotent
  resolve(category, code): WorkshopConfig | undefined
  upsertItem(item)
  removeItem(id)
}
```

- `load()` gọi `GET /workshop-config/all`, fill object byCategory.
- `resolve(cat, code)` dùng cho ColorBadgeSelectCell / IconSelectCell ở Phase 4 để map code → `{ name, color, icon }`.
- Editor mutation gọi `upsertItem` / `removeItem` để cập nhật local mà không cần re-fetch.

---

## 7. Liên hệ với module khác

| Module | Liên hệ |
|--------|---------|
| Order (Phase 2) | OrderEntity sẽ có các trường `printStatus`, `printStatusNote`, `toolResult`, `toolResultNote`, `errorFile`, `assignee`, `assigneeNote` lưu **code** từ WorkshopConfig. BE update field sẽ validate code tồn tại + isActive. |
| Order multi-role view (Phase 4) | Cell select component render badge màu / icon theo `WorkshopConfig`, options từ store. |
| RBAC (Phase 0) | Quyền `workshop.manage` (sẽ có ở Phase 0) thay thế role check tĩnh hiện tại. |

---

## 8. Performance notes

- Endpoint `/all` chỉ load 1 lần sau login → cache trong Zustand store.
- Sort BE: `{ category: 1, order: 1 }` — index `(category, code)` hỗ trợ filter category.
- Editor mutation chỉ cập nhật 1 item trong store thay vì reload toàn bộ list.

---

## 9. Permissions hiện tại

| Role | Truy cập |
|------|----------|
| SuperAdmin | ✅ full CRUD |
| Admin | ✅ full CRUD |
| Khác | Chỉ đọc (cần để render Order table) |
