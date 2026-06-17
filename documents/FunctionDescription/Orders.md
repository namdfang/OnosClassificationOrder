# Orders — Function Description

> **File FE:** `apps/web/src/pages/orders/index.tsx` (Tabs wrapper, route theo permission)
> **File FE tabs:** `ListOrderTab.tsx` (Admin), `OrderTableWorkshop.tsx` (Designer/Fulfill/Support), `ImportOrderTab.tsx`, `parseOrders.ts`
> **Cell components:** `apps/web/src/components/orders/cells/{ColorBadgeSelectCell,IconSelectCell,TextEditCell,ImageThumbCell,SelectPopover}.tsx`
> **Bulk edit:** `apps/web/src/components/orders/BulkEditToolbar.tsx`
> **Workshop columns (shared with Dashboard Tab C):** `apps/web/src/components/orders/workshopTableConfig.tsx` (`WORKSHOP_COLS` + `WorkshopOrderRow` + `WorkshopRenderCtx`)
> **File BE:** `apps/api/src/modules/order/`
> **Route:** `/orders`
> **API:**
>  - `GET /v1/orders` · `GET /v1/orders/grouped` · `GET /v1/orders/import-summary`
>  - `GET /v1/orders/export` (full-list, không phân trang — xem `Dashboard.md §10.3`)
>  - `GET /v1/orders/factory-overview` (xem `Dashboard.md §10.2`)
>  - `POST /v1/orders/import` · `POST /v1/orders/backfill-fabric` · `POST /v1/orders/refresh-image-urls`
>  - `PATCH /v1/orders/:id/field` · `PATCH /v1/orders/bulk-field`
>  - `PATCH /v1/orders/:id/transfer` · `PATCH /v1/orders/bulk-transfer`
>  - `GET /v1/orders/:id/logs` · `DELETE /v1/orders/:id`

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
    updated++ // overwrite các field row.* (giữ workshop fields đã chỉnh)
  else:
    imported++

  // Mapping qua product config (auto-derive xưởng + máy + vải + tool)
  config = productConfig.findByType(row.type)
  if config:
    set productConfigId, factoryId, machineTypeId, isMapped=true
    // insertOnly — chỉ gắn khi tạo mới, không overwrite giá trị workshop đã chỉnh
    insertOnly.originalFactoryId = factoryId
    if config.fabricType: insertOnly.fabricType = config.fabricType
    if config.toolResult: insertOnly.toolResult = config.toolResult
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

`fabricType` và `toolResult` được **derived từ product config** tại lúc import — workshop không phải gõ tay. Nếu product config thay đổi sau khi import (admin chỉnh fabric default), gọi `POST /v1/orders/backfill-fabric` để re-derive cho các đơn còn thiếu (chỉ điền chỗ trống, **không overwrite** giá trị admin đã chỉnh).

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
| `order.entity.ts` | Schema + 4 virtual (`factory`, `originalFactory`, `machineType`, `productConfig`) |
| `order.repository.ts` | Extends DatabaseRepositoryAbstract |
| `order.service.ts` | `getOrders`, `getDashboard`, `getStatusOverview`, `getFactoryOverview`, `getOrdersGroupedByType`, `getImportSummary`, `exportOrders`, `importOrders`, `updateField`, `bulkUpdateField`, `transferOrder`, `bulkTransferOrders`, `backfillOrderFabric`, `deleteOrder`, `refreshImageUrls` |
| `order.controller.ts` | 16 endpoints (xem §4.2) |

### 4.2 Endpoints
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/v1/orders` | List (filter + paginate, visibility filter theo role) — cache 60s key có gắn `role` |
| GET | `/v1/orders/grouped` | Phân trang theo **product type** thay vì row (Phase 4 — workshop cần combo toàn vẹn) |
| GET | `/v1/orders/dashboard` | Aggregation (xem `Dashboard.md` Tab A) — cache 60s |
| GET | `/v1/orders/status-overview` | Aggregation (xem `Dashboard.md` Tab B) |
| GET | `/v1/orders/factory-overview` | Aggregation (xem `Dashboard.md` Tab C) |
| GET | `/v1/orders/export` | Trả toàn bộ đơn theo filter, **không phân trang**. Dùng cho Excel export Tab C. |
| GET | `/v1/orders/import-summary?date=YYYY-MM-DD` | Bảng tổng hợp `(type, size, fabricType)` theo ngày import. Phase 5. |
| GET | `/v1/orders/:id/logs` | Audit timeline 1 order (xem `OrderLog.md`) |
| POST | `/v1/orders/import` | Bulk upsert. `ORDER_WRITE_ROLES` (Admin / Manager / Support). |
| POST | `/v1/orders/backfill-fabric` | Re-derive `fabricType` + `toolResult` từ product config cho đơn còn thiếu (non-destructive). |
| POST | `/v1/orders/refresh-image-urls` | Re-apply transformDriveUrl cho tất cả order (backfill cũ). |
| PATCH | `/v1/orders/:id/field` | Inline update 1 workshop field. Phase 2. |
| PATCH | `/v1/orders/bulk-field` | Bulk apply 1 field cho nhiều order. Phase 2. |
| PATCH | `/v1/orders/:id/transfer` | Chuyển 1 đơn sang xưởng khác. Phase 7. `ORDER_WRITE_ROLES`. |
| PATCH | `/v1/orders/bulk-transfer` | Chuyển nhiều đơn sang xưởng khác. Phase 7. Pre-filter ID đã ở target. |
| DELETE | `/v1/orders/:id` | Soft delete (Admin only) |

### 4.3 Cache
- Key list: `orders:list:${md5(query)}` TTL 60s, key có gắn `role` để Designer / Fulfillment không kế thừa cache của Admin (visibility filter khác).
- Invalidate khi: import / update field / bulk field / transfer / bulk-transfer / delete order.

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
  factoryId?: ObjectId;        // ref Factory — xưởng HIỆN TẠI (mutate qua transfer)
  originalFactoryId?: ObjectId;// ref Factory — xưởng GỐC tại import (immutable, Phase 7)
  machineTypeId?: ObjectId;    // ref MachineType

  // ─── Workshop fields (Phase 2 + 7) ───
  printStatus?: string;        // workshop_config code, index
  printStatusNote?: string;
  toolResult?: string;         // derived từ productConfig.toolResult lúc import (Phase 7)
  toolResultNote?: string;     // index — quan trọng vì điều khiển readyForFulfill
  errorFile?: string;
  errorFileNote?: string;      // free text
  assignee?: string;           // index
  assigneeNote?: string;
  fabricType?: string;         // workshop_config code (category=fabric_type), index — derived từ productConfig.fabricType lúc import (Phase 7)
  readyForFulfill: boolean;    // derived = (toolResultNote === 'ok'), default false, index
}
```

`originalFactoryId` được backfill cho legacy rows ngay tại `OrderService.onModuleInit()`:
```ts
updateMany(
  { originalFactoryId: { $exists: false }, factoryId: { $exists: true, $ne: null } },
  [{ $set: { originalFactoryId: '$factoryId' } }]
)
```
→ Mọi đơn legacy được xem là **pure** (chưa từng chuyển xưởng).

Tất cả workshop fields lưu **code** từ `WorkshopConfigEntity`. FE render qua `useWorkshopConfigStore.resolve(category, code)` → ra `name + color/icon`. Xem `WorkshopConfig.md`.

### 5.1 DesignFields (18 vị trí in)
`front`, `back`, `sleeve`, `hood`, `folder`, `placket`, `chestLeft`, `chestRight`, `left`, `right`, `sleeveLeft`, `sleeveRight`, `leftUpperSleeve`, `rightUpperSleeve`, `leftCuff`, `rightCuff`, `frontEmbroidery`, `backEmbroidery`

### 5.2 Indexes
- `productionId` (unique) — dedupe import
- `type`, `orderId`, `externalId`, `isMapped`, `factoryId`, `originalFactoryId`, `machineTypeId`, `printStatus`, `toolResultNote`, `assignee`, `fabricType`, `readyForFulfill` — filter + aggregation perf

### 5.3 Virtuals
- `factory` (`factoryId` → `FactoryEntity`)
- `originalFactory` (`originalFactoryId` → `FactoryEntity`)
- `machineType` (`machineTypeId` → `MachineTypeEntity`)
- `productConfig` (`productConfigId` → `ProductConfigEntity`)

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

### 7.x Query filter mở rộng

Ngoài các filter cơ bản (`createdFrom/To`, `factoryId`, `machineTypeId`, `printStatus`, ...), Phase 7 thêm:

| Query param | Format | Mô tả |
|-------------|--------|-------|
| `fabricType` | CSV codes | Lọc theo nhiều fabric. |
| `originalFactoryId` | CSV IDs | Lọc theo xưởng gốc. |
| `transferStatus` | token | `transferred` · `pure` · `transferred-in:<factoryId>` · `transferred-out:<factoryId>`. Build `$expr` so sánh `originalFactoryId` vs `factoryId`. |
| `sort` | `'grouped'` | Sort `(type, size, fabricType, createdAt desc)` thay vì `createdAt` mặc định — để combo trùng nhau gom liền nhau (Workshop dùng để in batch chung). |

---

## 8. Inline / bulk update (Phase 2)

### 8.1 Whitelist field
9 field trong `ORDER_WORKSHOP_FIELDS` (shared):
`printStatus`, `printStatusNote`, `toolResult`, `toolResultNote`, `errorFile`, `errorFileNote`, `assignee`, `assigneeNote`, `fabricType`.

Mỗi field có category workshop_config tương ứng trong `FIELD_CONFIG_CATEGORY` (BE), trừ `errorFileNote` (free text).

### 8.2 Role allow-list per field (`FIELD_EDIT_ROLES`)

| Field | Admin/Manager | Support | Designer | Fulfillment |
|-------|:-------------:|:-------:|:--------:|:-----------:|
| printStatus / printStatusNote | ✅ | ❌ | ❌ | ✅ |
| toolResult | ✅ | ❌ | ✅ | ❌ |
| **toolResultNote** | ✅ | ❌ | ✅ | ✅ (Phase 7 — Fulfillment cập nhật sau in) |
| errorFile / errorFileNote | ✅ | ❌ | ✅ | ❌ |
| assignee / assigneeNote | ✅ | ❌ | ✅ | ❌ |
| **fabricType** | ✅ (admin-managed) | ❌ | ❌ | ❌ |

Support được xem nhưng không sửa — controller cho qua, service `assertCanEditField` chặn ở field level.

`fabricType` được coi như product-attribute (không phải workshop status) nên chỉ Admin / Manager / SuperAdmin sửa được; mặc định auto-derive từ product config tại lúc import.

### 8.3 Flow `updateField(id, dto, roleName)`
1. `assertCanEditField` — 403 nếu role không nằm trong allow-list của field.
2. `assertValueAllowed` — nếu field có `FIELD_CONFIG_CATEGORY`, lookup `WorkshopConfig { category, code, isActive }`; missing → 400.
3. `findOneById` → 404 nếu không tồn tại.
4. `$set { [field]: value }`; nếu field là `toolResultNote` thì set thêm `readyForFulfill = (value === 'ok')`.
5. `findOneAndUpdate` trả document mới.
6. `invalidateListCache` (fire-and-forget).

Phase 3 đã thêm bước push `OrderLog` cho mọi `updateField` / `bulkUpdateField` / `transferOrder` / `bulkTransferOrders` (xem `OrderLog.md`).

### 8.4 Bulk `bulkUpdateField(dto, roleName)`
Cùng check permission + validate value, sau đó `updateMany({ _id: { $in: ids }, deletedAt: { $exists: false } })`. Trả `{ matched, modified }`.

### 8.5 Cache key
`orders:list:...` được rebuild kèm `role` để Designer / Fulfillment không bị "kế thừa" cache của Admin (visibility filter khác → key khác).

---

## 9. Permissions tổng quát

| Role | List | Import | Inline update | Transfer xưởng | Delete |
|------|:----:|:------:|:-------------:|:--------------:|:------:|
| SuperAdmin / Admin | ✅ | ✅ | ✅ tất cả field | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ tất cả field | ✅ | ✅ |
| Support | ✅ (full table) | ✅ | ❌ | ✅ | ❌ |
| Designer | ✅ (7 ngày) | ❌ | ✅ tool / file / assignee fields | ❌ | ❌ |
| Fulfillment | ✅ (7 ngày + ready) | ❌ | ✅ printStatus / printStatusNote / **toolResultNote** | ❌ | ❌ |

Permission code chi tiết — xem `packages/shared/constants/permission-catalog.ts`. Hook FE: `usePermission()` expose `has(code)`, `canViewField(field)`, `canEditField(field)`, `canViewAdminTable()`, `canViewWorkshopTable()`, `isAdmin`.

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

#### Cấu trúc cột (định nghĩa tập trung trong `apps/web/src/components/orders/workshopTableConfig.tsx` → `WORKSHOP_COLS`)

| # | Key | Cell | Permission view |
|---|-----|------|-----------------|
| 1 | productionId | Composite (Production ID + Order ID + In Production At) | luôn |
| 2 | mockupTypeSize | `ImageThumbCell` + Type + Size/Color | luôn |
| 3 | **fabricType** | `IconSelectCell` (category `fabric_type`) — Phase 7 | `order.field.fabricType.view` |
| 4 | printStatus | `ColorBadgeSelectCell` | `order.field.printStatus.view` |
| 5 | printStatusNote | `IconSelectCell` | `order.field.printStatusNote.view` |
| 6 | toolResult | `IconSelectCell` | `order.field.toolResult.view` |
| 7 | toolResultNote | `ColorBadgeSelectCell` (label = "Note kq Tool 1") | `order.field.toolResultNote.view` |
| 8 | errorFile | `IconSelectCell` | `order.field.errorFile.view` |
| 9 | errorFileNote | `TextEditCell` | `order.field.errorFileNote.view` |
| 10 | assignee | `IconSelectCell` | `order.field.assignee.view` |
| 11 | assigneeNote | `IconSelectCell` | `order.field.assigneeNote.view` |
| 12 | userSku | text + CopyButton | luôn |
| 13 | typeFullName | text (`productConfig.fullName`) | luôn |
| 14 | factoryMachine | badge `factory.name` + badge `machineType.name` (gộp 2 dòng) | luôn |

`WORKSHOP_COLS` được reuse bởi cả Tab `OrderTableWorkshop` (apps/web/src/pages/orders) **và** Dashboard Tab C `OrderFactoryTab`. Dashboard Tab C thêm 1 cột "Xưởng (đang / gốc)" ở đầu để hiển thị badge transfer.

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

---

## 11. Factory transfer (Phase 7)

### 11.1 Khái niệm
- `factoryId` = xưởng **hiện tại** (mutable, đổi qua `/transfer`).
- `originalFactoryId` = xưởng **gốc tại import** (immutable). Phân biệt "đơn nhận từ xưởng khác" vs "đơn xuất phát tại đây".

### 11.2 Endpoint

| Method | Path | Body | Hành vi |
|--------|------|------|---------|
| PATCH | `/v1/orders/:id/transfer` | `{ targetFactoryId, reason?: string ≤ 200ch }` | Đổi `factoryId`. Trùng target → `modified: 0`. Ghi `OrderLog action='transfer'`. |
| PATCH | `/v1/orders/bulk-transfer` | `{ ids: ID[], targetFactoryId, reason? }` | Pre-filter ID đã ở target (skip no-op), `updateMany` phần còn lại, `writeMany` log cho mỗi ID. |

Cả 2 đều invalidate `orders:list:*` cache.

Decorator: `@Auth(ORDER_WRITE_ROLES)` — chỉ SuperAdmin / Admin / Manager / Support được dùng.

### 11.3 FE entry points

| Nơi | Component | Mô tả |
|-----|-----------|-------|
| Dashboard Tab C | `OrderFactoryTab.tsx` + `TransferDialog` (cùng file) | Bulk select rows → toolbar "Chuyển xưởng" → dialog chọn xưởng đích + lý do. |
| Audit timeline | `OrderLogTimelineDialog.tsx` | Render entry `action='transfer'` với `before.factoryId → after.factoryId` + `reason`. |

### 11.4 Backfill cho legacy
`OrderService.onModuleInit()` chạy 1 lần khi boot, set `originalFactoryId = factoryId` cho rows không có field. Log số rows được set ra console (`[order-backfill] originalFactoryId set on N legacy rows`).

---

## 12. Daily import summary (Phase 5)

`GET /v1/orders/import-summary?date=YYYY-MM-DD` — bảng tổng hợp `(type, size, fabricType)` của các order có `createdAt` trong ngày được chỉ định (gộp toàn bộ batch import trong ngày).

Response (`ImportSummaryZod`):
```ts
{
  date: string,
  groups: Array<{
    type: string;
    size: string;
    fabricType: string;
    fabricName?: string;      // resolve từ workshop_config
    totalQuantity: number;
    orderCount: number;
    sampleProductionIds: string[]; // 5 cái đầu
  }>
}
```

- Sort `orderCount desc` → tổ hợp trùng nhiều nhất xếp đầu (top 3 highlight amber).
- UI hiển thị progress bar tương đối theo group có count cao nhất → workshop thấy ngay combo nào cần in batch chung.
- Aggregation chính: `$group { type, size, fabricType }` → `$lookup` workshop_config `fabric_type` để có `fabricName`.

---

## 13. Backfill fabric / tool (Phase 7)

`POST /v1/orders/backfill-fabric` — re-derive `fabricType` và `toolResult` từ product config cho đơn còn thiếu.

- **Non-destructive**: chỉ điền chỗ trống (`$type: 'missing'` / `null` / `''`). Đã chỉnh tay → giữ nguyên.
- Pipeline `$lookup productConfigs → $set` 2 field conditional.
- Trả `{ scanned, updated }` để UI log số đơn được fix.
- Gọi từ `/products` sau khi admin cập nhật fabric/tool default trong product config.
