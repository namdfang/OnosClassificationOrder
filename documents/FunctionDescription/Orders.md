# Orders — Function Description

> **File FE:** `apps/web/src/pages/orders/index.tsx` (Tabs wrapper, route theo permission)
> **File FE tabs:** `ListOrderTab.tsx` (Admin), `OrderTableWorkshop.tsx` (Designer/Fulfill/Support), `ImportOrderTab.tsx`, `parseOrders.ts`
> **Cell components:** `apps/web/src/components/orders/cells/{ColorBadgeSelectCell,IconSelectCell,TextEditCell,ImageThumbCell,SelectPopover}.tsx`
> **Bulk edit:** `apps/web/src/components/orders/BulkEditToolbar.tsx`
> **File BE:** `apps/api/src/modules/order/`
> **Route:** `/orders`
> **API:** `/v1/orders`, `/v1/orders/import`, `/v1/orders/refresh-image-urls`, `/v1/orders/:id/field`, `/v1/orders/bulk-field`

---

## 1. Overview

Module **Orders** quản lý đơn hàng sản xuất từ hệ thống ngoài (Google Sheets / TikTok / Etsy export...). UI chia tab động theo quyền của user:

- **Tab List Order** — bảng admin cũ (card row, preview mockup/design, copy URL). Cần `order.view_admin_table`.
- **Tab Bảng Workshop** — bảng nghiệp vụ 20 cột với inline select / bulk edit. Cần `order.view_workshop_table`.
- **Tab Import Order** — paste TSV từ Google Sheets → parse → preview → bulk import. Cần `order.import`.

User không có quyền nào → trang hiển thị "Bạn không có quyền xem trang Orders".

Mỗi đơn hàng gồm:
- Production ID duy nhất (key dedupe)
- SKU sản phẩm, user info (sku + email)
- Type / color / size / quantity / cost
- 1 mockup URL + nhiều design URL (`front`, `back`, `sleeve`, `hood`, ...)
- Mapping tới factory + machineType qua ProductConfig

---

## 2. Tab `List` (`ListOrderTab.tsx`)

### 2.1 Tính năng
| Chức năng | Mô tả |
|-----------|-------|
| List | Card list (không phải table) cho mỗi đơn, pageSize=20 default |
| Phân trang | Top + bottom (cả 2 chỗ), shadcn `Pagination` |
| Filter | `isMapped` / `factoryId` / `machineTypeId` / `status` |
| Search | `productionId`, `userSku`, `userEmail`, `type` |
| Preview mockup | Click ảnh → `ImagePreviewDialog` |
| Preview design | Click thumb design → `ImagePreviewDialog` |
| Copy URL | CopyButton cho display URL + original URL |
| Delete | Confirm → soft delete |

### 2.2 OrderRowItem (memoized)
- Wrap `React.memo` để chỉ re-render khi order data đổi
- Hiển thị:
  - Thumbnail mockup (Teehub CDN variant `s200`)
  - `productionId` + copy button
  - `type` truncate 1 dòng + ellipsis (không line-clamp 2)
  - `userSku` + `userEmail`
  - Badge factory + machineType + status
  - Grid thumbnail design (max 6 ảnh visible, "+N" badge nếu nhiều hơn)
  - Quantity + base cost + ship cost

### 2.3 Performance
| Tối ưu | Mục đích |
|--------|----------|
| `React.memo(OrderRowItem)` | Skip re-render rows không đổi |
| Native `title` attribute | Tooltip nhẹ thay Radix |
| Teehub CDN thumb `s200` | Ảnh thumbnail nhỏ ~5KB thay ảnh gốc MB |
| `content-visibility: auto` | Browser skip render row ngoài viewport |
| `MAX_VISIBLE_DESIGNS = 6` | Giới hạn DOM size cho đơn nhiều design |
| Service Worker cache | Cache ảnh lần 2 → instant load |

---

## 3. Tab `Import` (`ImportOrderTab.tsx`)

### 3.1 Flow
```
User paste TSV (Ctrl+V from Google Sheets) vào textarea
  → parseRows() (parseOrders.ts) chia tab + dòng
  → Header detection (auto match column theo tên)
  → Preview table (50 dòng đầu, scrollable)
  → Submit → POST /v1/orders/import
  → BE upsert by productionId → trả về { imported, updated, mapped, unmapped, skipped[] }
  → Toast + reload list nếu user chuyển tab
```

### 3.2 Parse logic (`parseOrders.ts`)
- Detect header row (chứa `productionId` hoặc alias)
- Map column theo header (vd: `Production ID` / `Prod ID` → `productionId`)
- Parse numeric: `quantity`, `weight`, `baseCost`, `shipCost`, `width`, `height`, `length`
- Parse date: `orderAt`, `inProductionAt` (ISO hoặc `M/d/yyyy`)
- Parse designs: detect column như `Front`, `Back Design`, `Sleeve`, ... → nest vào `designs.{key}`

### 3.3 Upsert behavior (BE)
```ts
for (row of rows):
  found = orderRepo.findByProductionId(row.productionId)
  if found:
    updated++ // overwrite tất cả field từ row
  else:
    imported++

  // Mapping
  config = productConfig.findByType(row.type)
  if config:
    set productConfigId, factoryId, machineTypeId, isMapped=true
    set fabricType = config.fabricType  // default fabric from product
    mapped++
  else:
    isMapped=false
    unmapped++

  // Transform URL (mockup + designs)
  row.mockupOriginalUrl = canonicalDriveUrl(row.mockupUrl)
  row.mockupUrl = buildTeehubUrl(row.mockupUrl, 's800')
  row.designsOriginal = clone(row.designs)
  for key in row.designs: row.designs[key] = buildTeehubUrl(row.designs[key], 's800')
```

### 3.4 Trùng productionId
- **Update**, **không** tạo duplicate
- Field nào row mới có → overwrite, field nào không có → giữ nguyên giá trị cũ

### 3.5 Daily summary (`GET /v1/orders/import-summary?date=YYYY-MM-DD`)
Sau import (hoặc khi đổi date), `ImportOrderTab` gọi endpoint này để hiện bảng "Tổng hợp đơn theo ngày":
- BE aggregate theo `(type, size, fabricType)` của các order có `createdAt` trong ngày — gộp toàn bộ batch import trong ngày kể cả import 5-10 lần.
- Sort `orderCount` desc → tổ hợp trùng nhiều nhất xếp đầu (top 3 highlight amber).
- Mỗi group trả `totalQuantity`, `orderCount`, `sampleProductionIds` (5 cái đầu), `fabricName` (resolve từ workshop_config).
- UI hiển thị progress bar tương đối theo group có count cao nhất → workshop nhìn ra ngay combo nào cần in batch chung.

---

## 4. Backend module `order/`

### 4.1 Files
| File | Mô tả |
|------|-------|
| `order.entity.ts` | Schema + 3 virtual (factory, machineType, productConfig) |
| `order.repository.ts` | Extends DatabaseRepositoryAbstract |
| `order.service.ts` | `getOrders`, `getDashboard`, `importOrders`, `deleteOrder`, `refreshImageUrls` |
| `order.controller.ts` | 5 endpoints |

### 4.2 Endpoints
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/v1/orders` | List (filter + paginate, visibility filter theo role) — cache 60s key có gắn `role` |
| GET | `/v1/orders/dashboard` | Aggregation (xem `Dashboard.md`) — cache 60s |
| POST | `/v1/orders/import` | Bulk upsert. Cho phép: Admin / Manager / Support |
| PATCH | `/v1/orders/:id/field` | Inline update 1 workshop field. Phase 2. |
| PATCH | `/v1/orders/bulk-field` | Bulk apply 1 field cho nhiều order. Phase 2. |
| DELETE | `/v1/orders/:id` | Soft delete (Admin only) |
| POST | `/v1/orders/refresh-image-urls` | Re-apply transformDriveUrl cho tất cả order (backfill cũ) |

### 4.3 Cache
- Key list: `orders:list:${md5(query)}` TTL 30s
- Invalidate khi: import / update / delete order

---

## 5. Schema `OrderEntity`

```ts
{
  productionId: string;        // unique index
  userSku?: string;
  userEmail?: string;
  type?: string;               // index
  color?: string;
  size?: string;
  mockupUrl?: string;          // Teehub CDN URL
  mockupOriginalUrl?: string;  // Drive URL gốc
  printMethod?: string;
  weight?, width?, height?, length?: number;
  quantity: number;            // default 1
  baseCost?, shipCost?: number;
  designs?: DesignFields;      // CDN URLs
  designsOriginal?: DesignFields; // Drive URLs gốc
  status?: string;
  orderId?, externalId?: string;
  referent?: string;
  orderAt?, inProductionAt?: Date;
  isMapped: boolean;           // default false, index
  productConfigId?: ObjectId;  // ref ProductConfig
  factoryId?: ObjectId;        // ref Factory
  machineTypeId?: ObjectId;    // ref MachineType

  // ─── Workshop fields (Phase 2) ───
  printStatus?: string;        // workshop_config code, index
  printStatusNote?: string;
  toolResult?: string;
  toolResultNote?: string;     // index — quan trọng vì điều khiển readyForFulfill
  errorFile?: string;
  errorFileNote?: string;      // free text
  assignee?: string;           // index
  assigneeNote?: string;
  readyForFulfill: boolean;    // derived = (toolResultNote === 'ok'), default false, index
}
```

Tất cả workshop fields lưu **code** từ `WorkshopConfigEntity`. FE render qua `useWorkshopConfigStore.resolve(category, code)` → ra `name + color/icon`. Xem `WorkshopConfig.md`.

### 5.1 DesignFields (18 vị trí in)
`front`, `back`, `sleeve`, `hood`, `folder`, `placket`, `chestLeft`, `chestRight`, `left`, `right`, `sleeveLeft`, `sleeveRight`, `leftUpperSleeve`, `rightUpperSleeve`, `leftCuff`, `rightCuff`, `frontEmbroidery`, `backEmbroidery`

### 5.2 Indexes
- `productionId` (unique) — dedupe import
- `type`, `orderId`, `externalId`, `isMapped`, `factoryId`, `machineTypeId` — filter + aggregation perf

---

## 6. URL transformation pipeline

Mọi mockup/design URL chạy qua `apps/api/src/utils/transform-drive-url.ts`:

```
input: any Drive URL form (uc?id=, file/d/{id}/view, open?id=, drive_link...)
  → extractDriveId(url) → "{driveFileId}"
  → buildTeehubUrl(id, variant) → "https://cdn.teehub.io/gimage/{variant}/{id}.webp"
  → canonicalDriveUrl(url) → "https://drive.google.com/file/d/{id}/view" (original)
```

Variants:
- `s200` — thumbnail trong list
- `s800` — preview dialog mặc định
- Original — copy/share, mở Drive

---

## 7. Visibility theo role (Phase 2)

Mỗi request `GET /v1/orders` đi qua `OrderService.buildVisibilityFilter(roleName, dto)` để giới hạn tập kết quả trước khi áp filter của client:

| Role | Filter mặc định |
|------|------------------|
| `SuperAdmin` / `Admin` / `Manager` / `Support` | Không giới hạn (có thể truyền `createdFrom`/`createdTo` để filter ngày) |
| `Designer` | `createdAt` ∈ [7 ngày gần nhất] — override được bằng query |
| `Fulfillment` | `createdAt` ∈ [7 ngày gần nhất] **AND** `readyForFulfill = true` — chỉ date override được, `readyForFulfill` luôn enforce |

`readyForFulfill` được set bằng service: mỗi lần `updateField(toolResultNote)` chạy, nếu value mới là `'ok'` → `readyForFulfill=true`, ngược lại false. Bulk update làm tương tự. Đây là lifecycle handoff Designer → Fulfillment.

---

## 8. Inline / bulk update (Phase 2)

### 8.1 Whitelist field
8 field trong `ORDER_WORKSHOP_FIELDS` (shared):
`printStatus`, `printStatusNote`, `toolResult`, `toolResultNote`, `errorFile`, `errorFileNote`, `assignee`, `assigneeNote`.

### 8.2 Role allow-list per field (`FIELD_EDIT_ROLES`)

| Field | Admin/Manager | Support | Designer | Fulfillment |
|-------|:-------------:|:-------:|:--------:|:-----------:|
| printStatus / printStatusNote | ✅ | ❌ | ❌ | ✅ |
| toolResult / toolResultNote | ✅ | ❌ | ✅ | ❌ |
| errorFile / errorFileNote | ✅ | ❌ | ✅ | ❌ |
| assignee / assigneeNote | ✅ | ❌ | ✅ | ❌ |

Support được xem nhưng không sửa — controller cho qua, service `assertCanEditField` chặn ở field level.

### 8.3 Flow `updateField(id, dto, roleName)`
1. `assertCanEditField` — 403 nếu role không nằm trong allow-list của field.
2. `assertValueAllowed` — nếu field có `FIELD_CONFIG_CATEGORY`, lookup `WorkshopConfig { category, code, isActive }`; missing → 400.
3. `findOneById` → 404 nếu không tồn tại.
4. `$set { [field]: value }`; nếu field là `toolResultNote` thì set thêm `readyForFulfill = (value === 'ok')`.
5. `findOneAndUpdate` trả document mới.
6. `invalidateListCache` (fire-and-forget).

Phase 3 sẽ thêm bước push `OrderLog`.

### 8.4 Bulk `bulkUpdateField(dto, roleName)`
Cùng check permission + validate value, sau đó `updateMany({ _id: { $in: ids }, deletedAt: { $exists: false } })`. Trả `{ matched, modified }`.

### 8.5 Cache key
`orders:list:...` được rebuild kèm `role` để Designer / Fulfillment không bị "kế thừa" cache của Admin (visibility filter khác → key khác).

---

## 9. Permissions tổng quát

| Role | List | Import | Inline update | Delete |
|------|:----:|:------:|:-------------:|:------:|
| SuperAdmin / Admin | ✅ | ✅ | ✅ tất cả field | ✅ |
| Manager | ✅ | ✅ | ✅ tất cả field | ✅ |
| Support | ✅ (full table) | ✅ | ❌ | ❌ |
| Designer | ✅ (today) | ❌ | ✅ tool/file/assignee fields | ❌ |
| Fulfillment | ✅ (today + ready) | ❌ | ✅ printStatus / printStatusNote | ❌ |

---

## 10. Bảng Workshop (Phase 4)

### 10.1 Router quyết định bảng nào

`pages/orders/index.tsx` đọc permission qua hook `usePermission()`:

```tsx
const adminVisible    = canViewAdminTable();       // order.view_admin_table
const workshopVisible = canViewWorkshopTable();    // order.view_workshop_table
const canImport       = has('order.import');
```

Render tab tương ứng. User chỉ có 1 trong các quyền → 1 tab; có nhiều quyền (Admin) → cả 3 tab.

### 10.2 `OrderTableWorkshop.tsx`

#### Cấu trúc 20 cột

| # | Key | Cell | Permission view |
|---|-----|------|-----------------|
| 1 | productionId | text mono | luôn |
| 2 | userSku | text | luôn |
| 3 | size | text | luôn |
| 4 | printStatus | `ColorBadgeSelectCell` | `order.field.printStatus.view` |
| 5 | printStatusNote | `IconSelectCell` | `order.field.printStatusNote.view` |
| 6 | toolResult | `IconSelectCell` | `order.field.toolResult.view` |
| 7 | toolResultNote | `ColorBadgeSelectCell` | `order.field.toolResultNote.view` |
| 8 | errorFile | `IconSelectCell` | `order.field.errorFile.view` |
| 9 | errorFileNote | `TextEditCell` | `order.field.errorFileNote.view` |
| 10 | color | text | luôn |
| 11 | assignee | `IconSelectCell` | `order.field.assignee.view` |
| 12 | assigneeNote | `IconSelectCell` | `order.field.assigneeNote.view` |
| 13 | type | text | luôn |
| 14 | mockup | `ImageThumbCell` | luôn |
| 15 | designFront | `ImageThumbCell` (designs.front) | luôn |
| 16 | orderId | text | luôn |
| 17 | inProductionAt | date | luôn |
| 18 | typeFullName | text (`productConfig.fullName`) | luôn |
| 19 | factory | badge (`factory.name`) | luôn |
| 20 | machineType | badge (`machineType.name`) | luôn |

#### Cell components (`components/orders/cells/`)

- **`SelectPopover`** — shared popover với "Bỏ chọn" + list options.
- **`ColorBadgeSelectCell`** — badge nền `workshop_config.color`. Click → popover → PATCH `/v1/orders/:id/field`. Hiển thị spinner trong khi save, toast success/error. Update optimistic qua callback `onUpdated(newCode)` để patch row local.
- **`IconSelectCell`** — chip màu nhẹ + icon Lucide từ `workshop_config.icon`. Cùng flow.
- **`TextEditCell`** — Input inline (chỉ cho `errorFileNote`). Commit khi `blur` hoặc `Enter`, `Escape` revert.
- **`ImageThumbCell`** — thumb 36px (variant `s200`), click mở `ImagePreviewDialog`.

Mỗi cell tự đọc `canEditField(field)` từ `usePermission()`:
- Có quyền → click sửa được.
- Không → readonly hiển thị giá trị.

### 10.3 Filter bar

Render conditional theo `order.field.X.view`:
- `printStatus` (multi, badge màu)
- `toolResultNote` (multi, badge màu)
- `assignee` (multi, text)
+ Search productionId/userSku/orderId/type

Filter gửi qua query string `?printStatus=code1,code2&...&createdFrom=...`. Service split CSV.

### 10.4 Bulk edit (`BulkEditToolbar`)

- Cột checkbox đầu mỗi row + select-all header.
- Khi chọn ít nhất 1 row → toolbar nổi sticky bottom: "Đã chọn N · Bulk update · Bỏ chọn".
- Dialog confirm: chọn field (chỉ field user có `edit` perm) + giá trị (workshop config select hoặc text). Apply → `PATCH /v1/orders/bulk-field`. Toast "Đã update X/Y đơn".

### 10.5 Hook `usePermission` (`apps/web/src/hooks/usePermission.ts`)

```ts
const { has, canViewField, canEditField, canViewAdminTable, canViewWorkshopTable, isAdmin } = usePermission();
```

Đọc `profile.role.permissionCodes` từ `useAuthStore`. SuperAdmin / Admin role name bypass (legacy fallback).

### 10.6 Performance

| Tối ưu | Vị trí |
|--------|--------|
| Optimistic update qua `patchRow` | Cell `onUpdated` → cập nhật local state, không re-fetch toàn list |
| Thumbnail `s200` | `ImageThumbCell.smallThumb()` |
| Debounce search 300ms | `useDebounce(search, 300)` |
| Service Worker cache ảnh CDN | `apps/web/public/sw.js` |
| BE cache key gắn `role` | Tránh Designer thấy cache của Admin |
