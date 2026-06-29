# Orders — Function Description

> **File FE:** `apps/web/src/pages/orders/index.tsx` (Tabs wrapper, route theo permission)
> **File FE tabs:** `ListOrderTab.tsx` (Admin), `ErrorLogTab.tsx` (mọi role — Nhật ký bù lỗi), `OrderTableWorkshop.tsx` (Designer/Fulfill/Support), `ImportOrderTab.tsx`, `parseOrders.ts`
> **Cell components:** `apps/web/src/components/orders/cells/{ColorBadgeSelectCell,IconSelectCell,TextEditCell,ImageThumbCell,DesignThumbsCell,SelectPopover,AssigneeSelectCell,ProductionErrorSelectCell,ProductionErrorOtherDialog,ErrorSourceCell}.tsx`
> **Bulk edit:** `apps/web/src/components/orders/BulkEditToolbar.tsx` + `AssignDesignerDialog.tsx`
> **Workshop columns (shared with Dashboard Tab C):** `apps/web/src/components/orders/workshopTableConfig.tsx` (`WORKSHOP_COLS` + `WorkshopOrderRow` + `WorkshopRenderCtx`)
> **Designer KPI panel (Admin/Leader):** `apps/web/src/pages/orders/DesignerSummaryPanel.tsx`
> **File BE:** `apps/api/src/modules/order/`
> **Route:** `/orders`
> **API:**
>  - `GET /v1/orders` · `GET /v1/orders/:id` · `GET /v1/orders/grouped` · `GET /v1/orders/workshop-filters` · `GET /v1/orders/fulfillment-status-counts` · `GET /v1/orders/import-summary` · `GET /v1/orders/error-log`
>  - `GET /v1/orders/export` (full-list, không phân trang — xem `Dashboard.md §10.3`)
>  - `GET /v1/orders/factory-overview` (xem `Dashboard.md §10.2`)
>  - `GET /v1/orders/designer-breakdown` (KPI panel Designer — xem `DesignerTaskWorkflow.md §2.5`)
>  - `POST /v1/orders/import` · `POST /v1/orders/backfill-fabric` · `POST /v1/orders/backfill-designer-status`
>  - `PATCH /v1/orders/:id/field` · `PATCH /v1/orders/bulk-field`
>  - `POST /v1/orders/:id/set-production-error` (atomic — bắt buộc khi code='other')
>  - `POST /v1/orders/bulk-assign-designer-preview` + `POST /v1/orders/bulk-assign-designer`
>  - `POST /v1/orders/:id/designer-transition` · `POST /v1/designer/bulk-transition` (xem `DesignerTaskWorkflow.md`)
>  - `PATCH /v1/orders/:id/transfer` · `PATCH /v1/orders/bulk-transfer`
>  - `GET /v1/orders/:id/logs` · `DELETE /v1/orders/:id`

---

## 1. Overview

Module **Orders** quản lý đơn hàng sản xuất từ hệ thống ngoài (Google Sheets / TikTok / Etsy export...). UI chia tab động theo quyền của user:

- **Tab List Order** — bảng admin cũ (card row, preview mockup/design, copy URL). Cần `order.view_admin_table`.
- **Tab Nhật ký bù lỗi** — danh sách đơn đang chờ xử lý lỗi (xem `§14`). Hiển thị cho mọi role có quyền xem orders; visibility BE tự scope theo role. **Sidebar có entry riêng** `Orders → Nhật ký bù lỗi` link thẳng vào `?tab=error-log`.
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

Có **2 mode** (toggle button ở header card):
- **"Import đơn mới"** (`mode=new`) — flow gốc, parse + upsert đơn mới qua `POST /v1/orders/import`.
- **"Import file soát"** (`mode=rework`) — UPDATE QC fields cho đơn hiện có qua `POST /v1/orders/import-rework`. Không tạo mới.

### 3.1 Flow

**Mode `new`:**
```
User paste TSV (Ctrl+V from Google Sheets) vào textarea
  → parseOrderRows() (parseOrders.ts) chia tab + dòng
  → Header detection (auto match column theo tên)
  → Preview table (50 dòng đầu, scrollable)
  → Submit → POST /v1/orders/import
  → BE upsert by productionId → trả về { imported, updated, mapped, unmapped, skipped[] }
  → Toast + reload list nếu user chuyển tab
```

**Mode `rework` (file soát):**
```
Header sheet (20 cột):
  Production ID | User SKU | Size | Trang_thai_in | Note_trang_thai_in |
  ket_qua_tool | Note_kq_Tool | File_sua_loi | Ghi_chu_file_loi |
  Nguoi_thuc_hien | Note_nguoi_thuc_hien | Type | Color | Mockup |
  Design Front | Order ID | In Production At | Type.1 | Nhà máy | Phòng

parseReworkOrderRows() chỉ lấy 5 cột: productionId + 4 QC field (toolResultNote,
errorFile, errorFileNote, assignee). Các cột khác BỎ QUA (không đè dữ liệu cũ).

  → Submit → POST /v1/orders/import-rework
  → BE `importRework`:
      1. Preload workshop_config (tool_result_note + error_file_type) + tất cả User.
      2. Loop từng row → lookup order theo productionId:
         - Nếu không tồn tại → notFound++ + skipped[].
         - Match `Note_kq_Tool` (vd "loi") → workshop_config.name normalize → code → set `toolResultNote`.
         - Match `File_sua_loi` (vd "Vien co") → tương tự.
         - `Ghi_chu_file_loi` → set `errorFileNote` (raw). Nếu chứa "huy don" (normalize) → set
           `cancelledAt = new Date()` + `cancelReason = note` (counter `cancelled++`).
         - Match `Nguoi_thuc_hien` (fullName normalize) → user._id → set `assignee` +
           `designerStatus='assigned'` + `designerAssignedAt=new Date()` (counter `assigneeMatched++`).
      3. Cell rỗng → giữ DB cũ. Match fail → skip field đó, log warning, các field còn
         lại vẫn update (không reject cả row).
      4. Audit log: `action='bulk_update'`, `field='import_rework'`, before/after = $set object.
  → Response: { updated, notFound, cancelled, assigneeMatched, skipped[] }
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

  // URL pipeline (xem Design-R2-Pipeline.md)
  //   - mockupUrl = mockupOriginalUrl = raw URL user paste
  //   - designsOriginal = clone(row.designs)
  //   - designs.{k}: rỗng + designsStatus.{k}='pending' khi R2 đã configure
  //     (worker BullMQ ghi sau khi download/encode/upload xong) — nếu R2 chưa
  //     configure (env R2_* trống) → designs.{k} = raw URL để không transform
```

`fabricType` và `toolResult` được **derived từ product config** tại lúc import — workshop không phải gõ tay. Nếu product config thay đổi sau khi import (admin chỉnh fabric default), gọi `POST /v1/orders/backfill-fabric` để re-derive cho các đơn còn thiếu (chỉ điền chỗ trống, **không overwrite** giá trị admin đã chỉnh).

### 3.4 Trùng productionId
- **Update**, **không** tạo duplicate
- Field nào row mới có → overwrite, field nào không có → giữ nguyên giá trị cũ

### 3.5 Daily summary (`GET /v1/orders/import-summary?date=YYYY-MM-DD`)
Sau import (hoặc khi đổi date), `ImportOrderTab` gọi endpoint này để hiện bảng "Tổng hợp đơn theo ngày":
- BE aggregate theo `(type, size, fabricType)` của các order có `orderAt` trong ngày (đổi từ `createdAt` tháng 2026-06) — gộp đơn theo ngày khách đặt, không phải ngày import. Xem §7 lưu ý filter ngày.
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
| `order.service.ts` | `getOrders`, `getDashboard`, `getStatusOverview`, `getFactoryOverview`, `getOrdersGroupedByType`, `getImportSummary`, `exportOrders`, `importOrders`, `updateField`, `bulkUpdateField`, `transferOrder`, `bulkTransferOrders`, `backfillOrderFabric`, `deleteOrder` |
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
| GET | `/v1/orders/fulfillment-status-counts` | Đếm đơn theo 5 trạng thái stage Fulfillment (waiting/in-progress/rework/done/watching) — dùng cho thanh filter trang "In". Xem `FulfillmentWorkflow.md §4.5`. |
| GET | `/v1/orders/import-summary?date=YYYY-MM-DD` | Bảng tổng hợp `(type, size, fabricType)` theo ngày import. Phase 5. |
| GET | `/v1/orders/:id/logs` | Audit timeline 1 order (xem `OrderLog.md`) |
| GET | `/v1/orders/error-log` | Tab "Nhật ký bù lỗi" — đơn đang chờ xử lý lỗi (productionError set, toolResultNote≠ok). Sort theo `productionFirstErrorAt` ASC. Trả thêm `byUrgency`. Visibility theo role (Fulfillment scope factory, Designer scope assignee). Xem `§14`. |
| POST | `/v1/orders/import` | Bulk upsert. `ORDER_WRITE_ROLES` (Admin / Manager / Support). |
| POST | `/v1/orders/cutting-files/preview` | Preview cutting-file mapping — fetch tên file từ Drive + parse productionId + match đơn. Xem §15. |
| POST | `/v1/orders/cutting-files/apply` | Apply mappings (bulk write `cuttingFileUrl/Name`) + audit log event `production-file-mapped`. |
| POST | `/v1/orders/backfill-fabric` | Re-derive `fabricType` + `toolResult` từ product config cho đơn còn thiếu (non-destructive). |
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
  mockupUrl?: string;          // raw URL (Drive/CDN/...) — không transform
  mockupOriginalUrl?: string;  // = mockupUrl (giữ để FE share/copy)
  printMethod?: string;
  weight?, width?, height?, length?: number;
  quantity: number;            // default 1
  baseCost?, shipCost?: number;
  designs?: DesignFields;      // R2 CDN URLs (worker ghi sau khi xử lý) hoặc raw URL khi R2 chưa configure
  designsOriginal?: DesignFields; // Raw URL user paste lúc import
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
  assignee?: string;           // = user._id (string). Phase Designer-Task-Workflow Phase 6 đổi từ workshop_config code → userId thuần. Index.
  assigneeNote?: string;
  fabricType?: string;         // workshop_config code (category=fabric_type), index — derived từ productConfig.fabricType lúc import (Phase 7)
  machineNumber?: string;      // workshop_config code (category=machine), index

  // ─── Production error (Phase 8 + Fulfillment per-factory) — xưởng báo lỗi đơn hàng ───
  productionError?: string;    // workshop_config code (category=production_error), index. Set khác null/empty ⇒ đơn ở trạng thái "có lỗi".
  productionErrorNote?: string;// free text mô tả chi tiết lỗi
  productionErrorSource?: 'designer' | 'factory'; // index. Auto-fill từ workshop_config.errorSource khi user set productionError; user override được. 'other' bắt buộc user pick (BE 400 nếu thiếu).
  productionErrorCount: number;// default 0. $inc mỗi lần xưởng set productionError (cumulative, không reset). FE hiển thị "Lỗi ×N" trên cell toolResultNote khi count ≥ 2.
  productionFirstErrorAt?: Date; // index. Set khi `productionError` chuyển null→value (và field chưa có giá trị) → mốc bắt đầu "đang chờ xử lý lỗi" của cycle hiện tại. Clear (=null) khi đơn rời tab "Nhật ký bù lỗi": `toolResultNote='ok'` HOẶC `productionError` được clear. Dùng cho sort + tính mức độ khẩn cấp (24h/48h/72h).

  // ─── Designer task workflow (xem DesignerTaskWorkflow.md) ───
  designerStatus: DesignerStatus;   // enum, default unassigned, index
  designerAssignedAt?, designerStartedAt?, designerFirstStartedAt?, designerCompletedAt?, designerRejectedAt?, designerReworkAt?: Date;
  designerRejectedReason?: string;
  designerReworkCount: number;      // $inc khi xưởng báo lỗi designer
  designerWorkMs: number;           // cumulative work time (ms), $inc khi complete

  readyForFulfill: boolean;    // derived = (toolResultNote === 'ok' OR productionError set). default false, index. Mềm hoá invariant: khi xưởng báo lỗi (toolResultNote='error') vẫn giữ true để fulfillment thấy trong list mặc định.
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
- `type`, `orderId`, `externalId`, `isMapped`, `factoryId`, `originalFactoryId`, `machineTypeId`, `printStatus`, `toolResultNote`, `assignee`, `fabricType`, `machineNumber`, `productionError`, `productionErrorSource`, `designerStatus`, `readyForFulfill` — filter + aggregation perf

### 5.3 Virtuals
- `factory` (`factoryId` → `FactoryEntity`)
- `originalFactory` (`originalFactoryId` → `FactoryEntity`)
- `machineType` (`machineTypeId` → `MachineTypeEntity`)
- `productConfig` (`productConfigId` → `ProductConfigEntity`)

---

## 6. URL pipeline (R2 self-hosted)

Xem chi tiết: [`documents/Plans/Design-R2-Pipeline.md`](../Plans/Design-R2-Pipeline.md). Tóm tắt:

- **Mockup URL**: lưu raw (no transform). `mockupUrl = mockupOriginalUrl = URL user paste`.
- **Design URL**: nếu R2 đã configure (`R2_*` env đủ) → enqueue BullMQ job `design-image`, worker tải về → resize webp 2 variant → upload R2 → ghi `designs.{k} = https://<R2_PUBLIC_BASE>/designs/preview/{hash}.webp`. Trước khi worker xong, `designsStatus.{k} = 'pending'` (FE show spinner amber).
- Nếu R2 **chưa** configure → `designs.{k} = designsOriginal.{k} = raw URL`, không tự transform. BE log warning. FE preview có thể không render được URL Drive `?usp=sharing` — phải setup R2 để pipeline hoạt động đầy đủ.
- Helper: `apps/api/src/utils/design-url.ts` (`extractDriveId`, `hashForR2`, `buildR2Url`, `buildDriveDownloadUrl`).

---

## 7. Visibility theo role (Phase 2 + Fulfillment per-factory)

Mỗi request `GET /v1/orders` đi qua `OrderService.buildVisibilityFilter(roleName, dto, assigneeUserId?, fulfillmentFactoryId?)` để giới hạn tập kết quả trước khi áp filter của client:

| Role | Filter mặc định |
|------|------------------|
| `SuperAdmin` / `Admin` / `Manager` / `Support` / `DesignerLeader` | Không giới hạn (có thể truyền `createdFrom`/`createdTo` để filter ngày — semantics: filter trên `orderAt`, xem §7.0) |
| `Designer` (sub) | `assignee = user._id` — chỉ thấy task của mình (KHÔNG ép date window, đã narrow bởi assignee). Phase Designer-Task-Workflow Phase 6 đổi từ `assigneeCode` → `user._id`. |
| `Fulfillment` | `orderAt` ∈ [7 ngày gần nhất] **AND** `readyForFulfill = true` **AND** `$or: [{factoryId: user.factoryId}, {originalFactoryId: user.factoryId}]` — Per-factory scope (cả 2 xưởng thấy đơn transfer). Nếu user chưa gán `factoryId` → filter trả empty (an toàn). |

> **§7.0 Lưu ý filter & sort ngày (cập nhật 2026-06):** DTO `createdFrom` / `createdTo` (cộng `wfrom` / `wto` ở URL Workshop, `ffrom` / `fto` ở Factory dashboard, `startDate` / `endDate` ở Dashboard stats) được giữ tên cũ để không phá URL bookmark, **nhưng thực tế filter + sort đều trên `inProductionAt`** (thời gian đơn vào sản xuất theo sheet import).
>
> Tiến triển:
> 1. **Cũ:** filter + sort theo Mongo `createdAt` (thời gian import doc) → đơn cùng batch cluster bất kể thật sự sản xuất khi nào.
> 2. **Phase 2026-06 sớm:** đổi filter sang `orderAt` (thời gian khách đặt hàng marketplace) cho phù hợp business.
> 3. **Phase 2026-06 hiện tại:** đồng bộ filter + sort sang `inProductionAt` — manager mở Dashboard "hôm nay" thấy đơn **VÀO sản xuất hôm nay**, không phải đơn khách đặt hôm nay. Đây là metric mà xưởng care nhất (capacity tracking, queue depth).
>
> **Áp dụng filter** (5 vị trí trong `order.service.ts`): `buildVisibilityFilter()` (Designer/Fulfillment/general date override), `getDashboard()`, `getStatusOverview()` today count, `getImportSummary()` day group, `getFactoryOverview()`.
>
> **Áp dụng sort** (9 vị trí): `getOrders()` (grouped + default), `exportOrders()`, `getOrdersGroupedByType()`, `DesignerTaskService.getMyTasks()` (4 cột kanban), `FulfillmentTaskService.getMyTasks()`.
>
> Đơn legacy không có `inProductionAt` → bị loại khỏi date filter + Mongo desc sort đẩy về cuối list — chấp nhận (data cũ là test).
>
> Field có `@Prop({ index: true })` trên entity để tránh full collection scan.
>
> **Vẫn giữ `createdAt`** ở: `orderLogRepository.findAll({sort:{createdAt:1}})` (audit log chronological), `backfillDesignerStatus()` fallback (one-shot migration), `User.createdAt`, Mongoose auto timestamps. **Vẫn giữ `orderAt`** ở: `parseImportDate(row.orderAt)` (import field từ sheet, lưu cho reference + future analytics).
> Trường `orderAt` được import từ cột 37 ("Order at") của sheet. Đơn cũ thiếu `orderAt` sẽ bị filter loại khỏi date range — do data hiện tại là test, không backfill.
>
> **Timezone (quan trọng):** filter "yyyy-mm-dd" được parse là **VN local midnight** (qua helper `vnDayStart` / `vnDayEnd` ở `order.service.ts`). Lý do: MongoDB lưu UTC, `new Date("2026-06-22")` của JS parse là UTC midnight = 07:00 sáng VN → lệch ngày. Helper thêm offset `+07:00` để filter "ngày 22-06" khớp với đơn có `orderAt` từ `2026-06-21T17:00:00Z` (= 00:00 VN 22-06) đến `2026-06-22T16:59:59Z`. Áp ở mọi nơi build range trong `OrderService`.
>
> **Import date parsing:** `parseImportDate()` ở `order.service.ts` parse string từ sheet (vd "2026-06-22 00:30:48") thành Date — **giữ nguyên HH:mm:ss + interpret là VN local** (append `+07:00` nếu chuỗi không có tz). Phía FE `ImportOrderTab.tsx` đọc xlsx với `cellDates: true` + `dateNF: 'yyyy-mm-dd HH:mm:ss'` để SheetJS không truncate time component theo cell display format.

`readyForFulfill` semantic mềm hoá: vẫn `true` khi xưởng báo lỗi (`toolResultNote='error'`) — để fulfillment thấy đơn lỗi trong list mặc định mà không cần switch filter. Set lifecycle: `complete` action (state machine designer) set `toolResultNote='ok'` + `readyForFulfill=true`; user clear `toolResultNote` qua updateField trực tiếp mới set false.

**Cross-feature — fulfillment entry hook:** Khi `toolResultNote` chuyển sang `'ok'` qua bất kỳ path nào (`updateField`, `bulkUpdateField`, `importRework`) **VÀ** đơn chưa từng vào fulfillment (`!currentFulfillmentStage`) → spread `buildFulfillmentEntrySet()` (`order.service.ts:155`) vào patch để đẩy đơn vào tab "Đang chờ" của user In + set `waitingAt` mốc nhận task. Đồng bộ với hook ở `DesignerTaskService.transition(complete)`. Chi tiết xem `FulfillmentWorkflow.md §2.1 + §5.4 Entry B`.

Controller pass `user._id` + `user.factoryId` cho tất cả endpoint GET. Xem `DesignerTaskWorkflow.md §5.5`.

### 7.x Query filter mở rộng

Ngoài các filter cơ bản (`createdFrom/To`, `factoryId`, `machineTypeId`, `printStatus`, ...), Phase 7 thêm:

| Query param | Format | Mô tả |
|-------------|--------|-------|
| `fabricType` | CSV codes | Lọc theo nhiều fabric. |
| `originalFactoryId` | CSV IDs | Lọc theo xưởng gốc. |
| `transferStatus` | token | `transferred` · `pure` · `transferred-in:<factoryId>` · `transferred-out:<factoryId>`. Build `$expr` so sánh `originalFactoryId` vs `factoryId`. |
| `printStage` | enum | `printed` · `printing` · `not-printed`. Mutually exclusive — Dashboard Tab C drill-down 3 button trên `FactoryCard`. Định nghĩa "đã in xong" = `printStatus ∈ PRINTED_MACHINE_CODES` (`['machine-1','machine-2','machine-3','machine-4','machine-94']`). |
| `productionError` | CSV codes | (Phase 8) Lọc theo lý do lỗi xưởng (`wrong-size`, `print-misalign`, ...). |
| `hasError` | boolean | (Phase 8) `true` → đơn có `productionError` set. `false` không hỗ trợ (dùng cách không truyền filter). |
| `sort` | `'grouped'` | Sort `(type, size, fabricType, inProductionAt desc)` thay vì `inProductionAt` mặc định — để combo trùng nhau gom liền nhau (Workshop dùng để in batch chung). |

---

## 8. Inline / bulk update (Phase 2)

### 8.1 Whitelist field
13 field trong `ORDER_WORKSHOP_FIELDS` (shared):
`printStatus`, `printStatusNote`, `toolResult`, `toolResultNote`, `errorFile`, `errorFileNote`, `assignee`, `assigneeNote`, `fabricType`, `machineNumber`, `productionError`, `productionErrorNote`, `productionErrorSource`.

Mỗi field có category workshop_config tương ứng trong `FIELD_CONFIG_CATEGORY` (BE) trừ:
- Free-text: `errorFileNote`, `productionErrorNote`
- `assignee` — value là `user._id` (validate qua `assertAssigneeUserValid`, không workshop_config)
- `productionErrorSource` — enum cố định `designer | factory`

### 8.2 Role allow-list per field (`FIELD_EDIT_ROLES`)

| Field | Admin/Manager | Support | DesignerLeader | Designer (sub) | Fulfillment |
|-------|:-------------:|:-------:|:--------------:|:--------------:|:-----------:|
| printStatus / printStatusNote | ✅ | ❌ | ❌ | ❌ | ✅ |
| toolResult | ✅ | ❌ | ✅ | ✅ | ❌ |
| **toolResultNote** | ✅ | ❌ | ✅ | ❌ (BE auto derive khi state machine complete) | ❌ |
| errorFile / errorFileNote | ✅ | ❌ | ✅ | ✅ | ❌ |
| **assignee** | ✅ | ❌ | ✅ | ❌ (BE đặt qua state machine) | ❌ |
| assigneeNote | ✅ | ❌ | ✅ | ✅ | ❌ |
| **fabricType** | ✅ (admin-managed) | ❌ | ❌ | ❌ | ❌ |
| **machineNumber** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **productionError / productionErrorNote** | ✅ | ❌ (view) | ❌ (view) | ❌ (view) | ✅ (Phase 8) |
| **productionErrorSource** | ✅ | ❌ (view) | ✅ | ❌ (view) | ✅ |

Support được xem nhưng không sửa — controller cho qua, service `assertCanEditField` chặn ở field level.

`fabricType` được coi như product-attribute (không phải workshop status) nên chỉ Admin / Manager / SuperAdmin sửa được; mặc định auto-derive từ product config tại lúc import.

### 8.3 Flow `updateField(id, dto, roleName)` — hooks tự động
1. `assertCanEditField` — 403 nếu role không nằm trong allow-list của field.
2. Field validation:
   - `assignee`: `assertAssigneeUserValid(value)` — check user exists + role=Designer (BE)
   - Field khác có `FIELD_CONFIG_CATEGORY`: lookup `WorkshopConfig { category, code, isActive }`
   - Missing → 400.
3. `findOneById` → 404 nếu không tồn tại.
4. `$set { [field]: value }` + hooks:
   - **`toolResultNote`**: set `readyForFulfill = (value === 'ok')`; nếu value='ok' → clear `productionFirstErrorAt` (đơn rời tab Nhật ký bù lỗi)
   - **`assignee`**: 
     - Block 409 nếu `designerStatus ∉ {unassigned, assigned, rejected}` (đang in-progress/done/rework)
     - Set value: `designerStatus='assigned'`, `designerAssignedAt=now`, clear reject fields
     - Clear value: reset tất cả designer* fields về null/0
   - **`productionError`** (xem `DesignerTaskWorkflow.md §5.3`):
     - Lookup workshop_config.errorSource → auto-fill `productionErrorSource`
     - Set `toolResultNote='error'` + `$inc productionErrorCount` (signal cho xưởng + counter cho "Lỗi ×N")
     - Nếu `productionFirstErrorAt` chưa có giá trị → set = `now` (mốc bắt đầu cycle lỗi hiện tại cho tab Nhật ký bù lỗi)
     - Clear value (=null) → clear cả `productionErrorSource` + `productionFirstErrorAt`
     - Nếu source=designer + status=done → auto rework + `$inc designerReworkCount`
   - **`productionErrorSource`**: nếu set 'designer' + status=done → auto rework
5. `findOneAndUpdate` trả document mới.
6. Audit log per field. Auto-rework cũng log riêng.
7. `invalidateListCache` (fire-and-forget).

### 8.3.1 Atomic `setProductionError(id, dto)` — POST `/v1/orders/:id/set-production-error`
Wrapper riêng cho việc set 3 field cùng lúc (productionError + source + note). Bắt buộc khi user pick code='other':
- BE 400 nếu code='other' mà thiếu source HOẶC note
- Code khác: auto-fill source từ config nếu user không pass
- Trigger cùng hook (toolResultNote='error', `$inc productionErrorCount`, auto-rework)
- Log 3 entries (1 cho mỗi field)

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

`handleTabChange` (Phase 7.2) strip param của 2 tab kia khi switch tab để URL không lẫn lộn:
- Switch sang `list` → strip `w*`.
- Switch sang `workshop` → strip `l*`.
- Switch sang `import` → strip cả 2 (import tab không có filter).

### 10.2 `OrderTableWorkshop.tsx`

#### Cấu trúc cột (định nghĩa tập trung trong `apps/web/src/components/orders/workshopTableConfig.tsx` → `WORKSHOP_COLS`)

| # | Key | Cell | Permission view |
|---|-----|------|-----------------|
| 1 | productionId | Composite (Production ID + Order ID + In Production At) | luôn |
| 2 | mockupTypeSize | `ImageThumbCell` + Type + Size/Color | luôn |
| 2b | **designs** | `DesignThumbsCell` — tối đa 2 thumb inline (32px) + "+N" badge nếu nhiều hơn 2 → click badge mở Popover grid 4 cột tất cả design. Click thumb mở `ImagePreviewDialog`. Tận dụng `ImageThumbCell` cho từng thumb (pending/failed/ready state). | luôn |
| 3 | **fabricType** | `IconSelectCell` (category `fabric_type`) — Phase 7 | `order.field.fabricType.view` |
| 3b | **machineNumber** | `ColorBadgeSelectCell` (category `machine`) — badge có color (94/27/56…). Lấy từ ProductConfig khi import; xưởng có thể click sửa nếu phải chuyển máy in giữa chừng. | `order.field.machineNumber.view` / `.edit` |
| 4 | printStatus | `ColorBadgeSelectCell` | `order.field.printStatus.view` |
| 5 | printStatusNote | `IconSelectCell` | `order.field.printStatusNote.view` |
| 6 | toolResult | `IconSelectCell` | `order.field.toolResult.view` |
| 7 | **toolResultNote** | `ColorBadgeSelectCell` + suffix badge **"×N"** (rose) khi `productionErrorCount >= 2` AND value='error'. Signal cho fulfillment rằng đơn đã bị báo lỗi nhiều lần. | `order.field.toolResultNote.view` |
| 8 | errorFile | `IconSelectCell` | `order.field.errorFile.view` |
| 9 | errorFileNote | `TextEditCell` | `order.field.errorFileNote.view` |
| 10 | **productionError** | `ProductionErrorSelectCell` (category `production_error`). Pick code='other' → mở `ProductionErrorOtherDialog` bắt buộc source + note. Popover options có badge "DES"/"XƯỞNG"/"CẦN CHI TIẾT". | `order.field.productionError.view` |
| 10b | **productionErrorSource** | `ErrorSourceCell` (label "Loại lỗi") — picker designer/factory. Auto-fill từ workshop_config; user override khi cần. | `order.field.productionErrorSource.view` |
| 11 | **productionErrorNote** | `TextEditCell` — mô tả lỗi free text | `order.field.productionErrorNote.view` |
| 12 | **assignee** | `AssigneeSelectCell` — picker user từ designer team (`designerTeamStore`), value = `user._id`, display = `fullName`. KHÔNG còn dùng workshop_config. | `order.field.assignee.view` |
| 13 | assigneeNote | `IconSelectCell` | `order.field.assigneeNote.view` |
| 13b | **designerStatus** | Read-only badge color 6 state (Chưa gán/Cần làm/Đang làm/Đã xong/Đã trả/Cần làm lại) + suffix "×N" khi `designerReworkCount > 0`. | `order.field.designerStatus.view` |
| 14 | userSku | text + CopyButton | luôn |
| 15 | typeFullName | text (`productConfig.fullName`) | luôn |
| 16 | factoryMachine | badge `factory.name` + badge `machineType.name` (gộp 2 dòng) | luôn |

`WORKSHOP_COLS` được reuse bởi cả Tab `OrderTableWorkshop` (apps/web/src/pages/orders) **và** Dashboard Tab C `OrderFactoryTab`. Dashboard Tab C thêm 1 cột "Xưởng (đang / gốc)" ở đầu để hiển thị badge transfer.

> **Trang Fulfillment "In"** dùng bảng **phẳng riêng** `PrintOrderTable` (KHÔNG group sản phẩm), KHÔNG reuse `OrderTableWorkshop`. Lấy data từ `GET /v1/orders` (`sort=grouped`). Xem `FulfillmentWorkflow.md §4.5`.

`WorkshopOrderRow` có thêm field optional `currentFulfillmentStage` + `fulfillmentStages` để consumer (PrintOrderTable) quyết định hiển thị action theo trạng thái stage.

**DTO / endpoint liên quan** (dùng bởi `PrintOrderTable`):
- `GetProductionOrdersDto.fulfillmentStatus` (enum `waiting|in-progress|rework|done|watching`) + `userSku` (CSV filter) — `buildOrderListFilter` + `applyFulfillmentStatusFilter` áp vào `getOrders`/`getOrdersGroupedByType`.
- `GET /v1/orders/fulfillment-status-counts` → `{all, waiting, inProgress, rework, done, watching}`.
- `getWorkshopAvailableFilters` thêm facet `type` + `userSku` (dropdown Tên sản phẩm + Khách hàng).

**"No tool" row highlight** (tô nền xanh dương nhạt) — hook `useIsNoTool()` (`apps/web/src/hooks/useIsNoTool.ts`) + class `NO_TOOL_ROW_CLASS = 'bg-sky-50/70 dark:bg-sky-500/10'`. Logic: `toolResult` set + resolve qua `workshopConfigStore` + `name` KHÔNG bắt đầu bằng "Có" (đồng bộ với BE convention ở `order.service.ts:1706` `toolHasCodes` regex `^Có`). Áp dụng tại `<TableRow>` của 4 bảng order:
- `OrderTableWorkshop` (priority: selected > heaviest-combo > no-tool tint).
- `OrderFactoryTab` (priority: selected > no-tool tint).
- `OrdersMiniTable` (selected tint không có → no-tool áp trực tiếp).
- `ErrorLogTab` (urgency badge ở cell riêng nên row class chỉ no-tool tint).

Row `toolResult` null/empty (chưa check) → KHÔNG tô (tránh hiểu nhầm "chưa biết" thành "không có tool").

#### Cell components (`components/orders/cells/`)

- **`SelectPopover`** — shared popover với "Bỏ chọn" + list options.
- **`ColorBadgeSelectCell`** — badge nền `workshop_config.color`. Click → popover → PATCH `/v1/orders/:id/field`. Hiển thị spinner trong khi save, toast success/error. Update optimistic qua callback `onUpdated(newCode)` để patch row local.
- **`IconSelectCell`** — chip màu nhẹ + icon Lucide từ `workshop_config.icon`. Cùng flow.
- **`TextEditCell`** — Input inline (dùng cho `errorFileNote` và `productionErrorNote`). Commit khi `blur` hoặc `Enter`, `Escape` revert.
- **`ImageThumbCell`** — thumb 36px (variant `s200`), click mở `ImagePreviewDialog`.

Mỗi cell tự đọc `canEditField(field)` từ `usePermission()`:
- Có quyền → click sửa được.
- Không → readonly hiển thị giá trị.

### 10.2b Selection (Phase tiếp theo Phase 7.2)

- **Header global checkbox** (cũ): tick/untick toàn bộ rows hiện tại trên page.
- **Group checkbox**: mỗi row tiêu đề sản phẩm có 1 checkbox riêng (state `all` / `some` indeterminate / `none`) → tick toàn bộ đơn của nhóm. Badge `N/M chọn` hiển thị khi nhóm có ít nhất 1 đơn được chọn.
- **Shift+click range** (Excel/Google Sheets style): user click checkbox đầu, giữ `Shift`, click checkbox khác → mọi row giữa 2 vị trí được set theo state mới của row vừa click. Anchor (`lastClickedId`) update mỗi lần click. Range chỉ tính các order ĐANG HIỂN THỊ (group đã collapse → bỏ qua). Thứ tự range đọc từ memo `visibleOrderedIds` phải khớp với thứ tự render xuống body (same sort: `comboCount` desc → key asc).

### 10.3 Filter bar

**Đồng bộ via `<OrderFilterBar>` reusable** (`apps/web/src/components/orders/OrderFilterBar.tsx`). Cùng layout dùng ở 4 bảng order: `OrderTableWorkshop` (reference) · `ErrorLogTab` · `OrderFactoryTab` (Dashboard Tab C) · `OrderStatusTab` (Dashboard Tab B). Component:
- Top row: search input (flex-1) + `<DateRangePicker>` + nút Tải lại + slot `topActionsRight` (view switcher / export / ...).
- Middle row (optional slot `middleRow`): active chip bar / factory chip bar.
- Facet grid: 2/3/5 cột responsive, mỗi cell `<SelectFilter>` đã gate qua `usePermission().has(perm)` từ `OrderFilterFacet.perm`.

Mỗi consumer truyền `facets: OrderFilterFacet[]` để cấu hình field set riêng — tránh ép tất cả tab dùng cùng 1 list:
- `OrderTableWorkshop` — 9 facet workshop chuẩn từ `getWorkshopFilters`.
- `ErrorLogTab` — 5 facet error-log: assignee · fabricType · toolResult · productionError · productionErrorSource. Date range thêm vào endpoint qua field `createdFrom`/`createdTo` mới trong `GetErrorLogZod` (filter `inProductionAt` VN tz, đồng bộ convention với 3 bảng kia).
- `OrderFactoryTab` — 5 facet factory-specific: type · fabricType · machineTypeId · machineNumber · toolResult (lấy từ `overview.availableFilters`). Search debounce 300ms, thêm vào `getOrders` qua `search` param.
- `OrderStatusTab` — không dùng facet grid (BreakdownCard grid bên dưới làm role này với multi-select chip). Chỉ search + date + reload + slot extras ("Lỗi cần xử lý" + active chips + Xóa filter) qua `<StatusFilterTopActions>`/`<StatusActiveChips>` (`apps/web/src/pages/home/status/StatusFilterExtras.tsx`).
- `OrderStatsTab` — không dùng facet grid (stats hiển thị MetricCard + pie chart, không list đơn). Search chính = `searchType` (tên sản phẩm); `searchUser` (SKU/email khách) chèn vào `topActionsRight` vì stats có 2 search term. Cả 2 search debounce 300ms; auto-fetch khi date hoặc debounced search đổi — bỏ nút "Áp dụng" cũ vì pattern đồng bộ.

**`OrderTableWorkshop` cụ thể** — 9 facet workshop chuẩn từ BE endpoint `GET /v1/orders/workshop-filters` theo **faceted-search pattern**:
- BE method `getWorkshopAvailableFilters(dto, role, assigneeCode?, fulfillmentFactoryId?)` — với mỗi facet, build `buildOrderListFilter` sau khi strip facet đó khỏi dto, rồi `$group` field tương ứng. Count phản ánh subset đã narrow theo các facet khác đang active.
- **9 facet** support: `fabricType` / `machineNumber` / `printStatus` / `toolResult` / `toolResultNote` / `errorFile` / `assignee` / `productionError` / `designerStatus`. Cell hiển thị phụ thuộc permission `order.field.X.view`.
- `assignee` facet labels **resolve fullName từ users collection** (BE lookup users theo userIds trong facet rows). Value vẫn = user._id.
- `designerStatus` facet labels VN (Chưa gán/Cần làm/Đang làm/Đã xong/Đã trả/Cần làm lại).
- Token đặc biệt `__none__` cho assignee + designerStatus filter: trả đơn chưa gán (`assignee in [null,'']`) hoặc chưa có designerStatus (`$exists: false`).
- Search productionId / userSku / orderId / type (debounced 300ms).
- `<DateRangePicker>` — 8 preset quick + 2 input custom + popover gói gọn (Phase 7.2).

Filter gửi qua query string `?printStatus=code&fabricType=code&designerStatus=...&...`. Service nhận chuỗi đơn (`$in` vẫn dùng split CSV — single value vẫn parse được).

**URL state persistence** (Phase 7.2): tất cả filter sync ↔ URL params với prefix `w` (workshop) để F5 / share link giữ nguyên state:

| Param | Default (strip URL khi == default) | Mapping |
|-------|------------------------------------|---------|
| `wsearch` | `''` | search |
| `wfrom` / `wto` | **today** (always-write, kể cả today) | `createdFrom` / `createdTo` |
| `wprint` | `[]` | CSV `printStatus` codes |
| `wnote` | `[]` | CSV `toolResultNote` codes |
| `wassign` | `[]` | CSV `assignee` codes |
| `werror` | `[]` | CSV `productionError` codes (Phase 8) |
| `wpage` | `1` | trang |
| `wsize` | `20` | dòng/trang |

Workshop tab dùng date always-write vào URL (kể cả today) để URL hiển thị explicit ngày đang xem — tránh user share link mà không biết filter ngày nào. Các param khác strip khi rỗng/default.

### 10.4 Bulk edit (`BulkEditToolbar`)

- Cột checkbox đầu mỗi row + select-all header + shift+click range select.
- Khi chọn ít nhất 1 row → toolbar nổi sticky bottom: "Đã chọn N · Bulk update · **Gán design** (Leader/Admin) · Bỏ chọn".
- **"Bulk update" dialog**: chọn field (chỉ field user có `edit` perm, EXCEPT `assignee` — bị BLACKLIST khỏi dropdown vì đã có dialog "Gán design" riêng) + giá trị → `PATCH /v1/orders/bulk-field`. Toast "Đã update X/Y đơn".
- **"Gán design" button** (`AssignDesignerDialog`): chỉ hiện khi `canEditField('assignee')`. Pre-flight `POST /bulk-assign-designer-preview` → dialog hiển thị 6 KPI status box + alreadyAssigned list (fullName + count) + designer dropdown (load từ `/designer/team`). Detect conflict đa-người → banner cảnh báo + "Ghi đè & Gán". Submit `POST /bulk-assign-designer { ids, userId, reassignOthers }` → skip + report. Xem `DesignerTaskWorkflow.md §2.2`.

### 10.4b Designer KPI panel (Admin/Manager/Leader)

Trên cùng tab **List Order** + tab **Bảng Workshop** khi user có quyền `page.designer_stats` hoặc `designer.task.assign`:

Render `<DesignerSummaryPanel filterQs={...} onClickCell={...}>`:
- 6 KPI button-card (Chưa gán/Cần làm/Cần làm lại/Đang làm/Đã xong/Đã trả) — click → set filter list (`assignee` / `designerStatus`)
- Bảng matrix per-designer collapsible — click cell → set filter list. Click tên designer → chỉ set `assignee`
- Toggle "Xem theo filter / Xem tổng" swap scoped ↔ overall counts
- Data từ `GET /v1/orders/designer-breakdown` (cùng filter shape với list)

Filter `Designer` SelectFilter có option **"Chưa gán"** (`__none__`); filter `TT Designer` SelectFilter mới với 6 option theo `DesignerStatus` enum.

Xem `DesignerTaskWorkflow.md §2.5` + §4.4.

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
| `<PaginationBar position="top|bottom">` | Phân trang ở CẢ trên + dưới table, dùng chung `paginationProps` object — user không phải kéo lên/xuống mỗi lần đổi trang. |

### 10.7 List tab — URL state persistence

`ListOrderTab.tsx` dùng prefix `l` cho param:

| Param | Default | Mapping |
|-------|---------|---------|
| `lsearch` | `''` | search Production ID / Order ID / SKU |
| `lmapped` | `all` | `all` / `mapped` / `unmapped` |
| `lerror` | `false` | toggle "Lỗi xưởng" — gửi `hasError=true` (Phase 8) |
| `lpage` | `1` | trang |
| `lsize` | `20` | dòng/trang |

Pattern sync state ↔ URL giống Dashboard Tab Factory (xem `Dashboard.md §11`).

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

`GET /v1/orders/import-summary?date=YYYY-MM-DD` — bảng tổng hợp `(type, size, fabricType)` của các order có **`orderAt`** trong ngày được chỉ định (gộp theo ngày khách đặt). Tham số `date` vẫn là ngày khách lên đơn.

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

---

## 14. Tab `Nhật ký bù lỗi` (`ErrorLogTab.tsx`)

> **File FE:** `apps/web/src/pages/orders/ErrorLogTab.tsx`
> **Endpoint:** `GET /v1/orders/error-log`
> **Service BE:** `order.service.ts → getErrorLog(dto, role, userId?, factoryId?)`

### 14.1 Mục đích

Danh sách đơn **đang chờ xử lý lỗi xưởng** — tách hẳn khỏi list orders mặc định để workshop / designer / fulfillment dễ pin xử lý theo độ ưu tiên. Đơn sort theo `productionFirstErrorAt` ASC nên đơn nằm lâu nhất xuất hiện đầu tiên.

**Điều kiện vào tab:** `productionError ≠ null/''` AND `productionFirstErrorAt` đã set.

**Điều kiện rời tab** (hook tự động, xem `§8.3`):
- `toolResultNote='ok'` — xưởng xác nhận xử lý xong → clear `productionFirstErrorAt`
- HOẶC `productionError` được clear

→ Cycle lỗi tiếp theo (nếu có) sẽ set lại `productionFirstErrorAt = now` từ đầu.

### 14.2 Mức độ khẩn cấp (24h calendar)

Tính client-side từ `now - productionFirstErrorAt`:

| Mức độ | Ngưỡng | Màu | Mô tả |
|--------|--------|-----|-------|
| **Mới** | < 24h | Sky | Vừa báo lỗi, trong ngày |
| **Cần làm** | 24h – 48h | Amber | Đã 1 ngày, cần ưu tiên |
| **Gấp** | 48h – 72h | Orange | Đã 2 ngày, sắp critical |
| **Khẩn cấp** | ≥ 72h | Rose (animate-pulse) | Đã ≥ 3 ngày — flash đỏ |

Header tab có 4 chip filter mức độ + count. Click chip để toggle filter; chỉ 1 mức độ active tại 1 lúc.

### 14.3 Visibility

| Role | Scope |
|------|-------|
| SuperAdmin / Admin / Manager / DesignerLeader / Support | Toàn bộ đơn lỗi |
| **Fulfillment** | Chỉ đơn `factoryId = user.factoryId` HOẶC `originalFactoryId = user.factoryId` |
| **Designer (sub)** | Chỉ đơn `assignee = user._id` |

BE filter ở `getErrorLog()` áp visibility cùng quy tắc với list orders. Tab visible cho mọi role có quyền xem orders.

### 14.4 Filters

| Filter | Field | Source |
|--------|-------|--------|
| Search | `productionId / userSku / userEmail / orderId / type` | text |
| Người thực hiện | `assignee` (CSV user._id, token `__none__` = chưa gán) | `designerTeamStore` |
| Loại vải | `fabricType` (CSV code) | `workshopConfigStore.fabric_type` |
| Kết quả Tool | `toolResult` (CSV code) | `workshopConfigStore.tool_result` |
| Mã lỗi | `productionError` (CSV code) | `workshopConfigStore.production_error` |
| Nguồn lỗi | `productionErrorSource` (CSV `designer\|factory`) | static |
| Mức độ | `urgency` (CSV `new\|attention\|urgent\|critical`) | chip filter |

Mỗi filter đổi → reset về page 1. URL state persist với prefix `e*` (`esearch`, `eassign`, `efabric`, `etool`, `ecode`, `esource`, `eurg`, `epage`, `esize`).

### 14.5 Bảng

Cột (reuse từ `WORKSHOP_COLS` của `workshopTableConfig.tsx` nhưng filter chỉ các key liên quan):

| Cột | Cell |
|-----|------|
| Mức độ | Badge `new/attention/urgent/critical` |
| Đã chờ | Duration text `Nd Mh` + thời điểm bắt đầu |
| Production ID | `WORKSHOP_COLS.productionId` cell (copy + tooltip) |
| Sản phẩm | `WORKSHOP_COLS.mockupTypeSize` cell (thumb + type + size) |
| Loại vải | `WORKSHOP_COLS.fabricType` (IconSelectCell) |
| Tool | `WORKSHOP_COLS.toolResult` (IconSelectCell) |
| Người thực hiện | `WORKSHOP_COLS.assignee` (AssigneeSelectCell) |
| Lỗi xưởng | `WORKSHOP_COLS.productionError` (ProductionErrorSelectCell) |
| Nguồn | `WORKSHOP_COLS.productionErrorSource` (ErrorSourceCell) |
| Số lần lỗi | Badge `×N` (= `productionErrorCount`) |
| (action) | History button → `OrderLogTimelineDialog` |

Cell vẫn cho phép inline edit (theo `FIELD_EDIT_ROLES`) — workshop/designer có thể clear lỗi hoặc đổi source trực tiếp từ tab này.

### 14.6 Response shape

```ts
GET /v1/orders/error-log?... → {
  success: true,
  data: ProductionOrder[],       // page items, sort productionFirstErrorAt ASC
  total: number,                 // tổng đơn match filter (cho pagination)
  byUrgency: {                   // count theo mức độ, scope = filter HIỆN TẠI trừ chip urgency
    new: number,
    attention: number,
    urgent: number,
    critical: number,
  }
}
```

`byUrgency` tính qua `$switch` trong aggregation BE (xem `getErrorLog`). Sticky filter — `byUrgency` không bị thu hẹp bởi chip urgency hiện tại, để user nhìn thấy đủ 4 mức độ và biết click chip nào.

### 14.7 Backfill cho legacy

`OrderService.onModuleInit()` có thêm 1 step idempotent:
```ts
updateMany(
  {
    productionError: { $exists: true, $nin: [null, ''] },
    productionFirstErrorAt: { $in: [null, undefined] },
    $or: [{ toolResultNote: { $ne: 'ok' } }, { toolResultNote: { $exists: false } }],
  },
  [{ $set: { productionFirstErrorAt: '$updatedAt' } }],
)
```

→ Đơn legacy đang lỗi nhưng chưa có `productionFirstErrorAt` được set = `updatedAt` (best-effort). Đơn lỗi tương lai dùng `now` chính xác từ hook.

### 14.8 Permissions

| Action | Role |
|--------|------|
| Vào tab | mọi role trong `ORDER_VIEW_ROLES` (Admin/Manager/Support/DesignerLeader/Designer/Fulfillment) |
| Edit cell | theo `FIELD_EDIT_ROLES` từng field (xem `§8.2`) |
| Filter factory | không expose — Admin/Manager xem all, role khác bị visibility filter scope |



---

## 15. Cutting File Mapping (post-import)

> **Flow độc lập** với import đơn. Đơn ban đầu KHÔNG có `cuttingFileUrl` — flow này map link Drive vào đơn dựa trên `productionId` parse từ filename. Pattern filename: `XX-XXXXX-XXXXX-*.pdf` — `XX` = 2 chữ cái A-Z (không cố định, vd `BH`, `ML`, `TN`...), tiếp theo 5 số + 5 số.

### 15.1 Files

**FE:**
- `apps/web/src/pages/orders/ImportCuttingFilesTab.tsx` — tab UI (paste / xlsx col A → preview → apply)
- `apps/web/src/components/orders/OrderDetailDialog.tsx` — modal hiện preview file (iframe Drive embed `/file/d/{id}/preview`)
- `apps/web/src/services/order.ts` → `previewCuttingFiles()` + `applyCuttingFiles()`

**BE:**
- `apps/api/src/modules/order/drive-file-name.service.ts` — fetch tên file từ Drive public preview page (retry x2, backoff 500ms, concurrency cap 5)
- `apps/api/src/modules/order/order.service.ts` → `previewCuttingFiles()` + `applyCuttingFiles()`
- `apps/api/src/modules/order/order.controller.ts` → 2 endpoint mới
- `apps/api/src/modules/order/order.entity.ts` — field `cuttingFileUrl` + `cuttingFileName`

**Shared:**
- `packages/shared/dtos/production-order.dto.ts` → `PreviewCuttingFilesDto/Res`, `ApplyCuttingFilesDto/Res`, util `parseProductionIdFromCuttingFilename()`

### 15.2 Luồng

1. **User paste / upload xlsx** list Drive link (1 link/dòng; xlsx lấy cột A, không header).
2. FE call `POST /v1/orders/cutting-files/preview`.
3. BE với mỗi link:
   - Extract Drive fileId (regex `/file/d/{id}/` hoặc `?id={id}`).
   - Fetch `https://drive.google.com/file/d/{id}/view` (public — no auth).
   - Parse filename từ HTML (`og:title` → `<title>` → JSON fallback).
   - Retry x2 với backoff 500ms cho mọi error.
   - Parse productionId từ filename: regex `^([A-Z]{2}-\d{5}-\d{5})/i`.
   - Lookup đơn theo productionId (`$in`).
4. BE trả response 4 bucket:
   - `matched`: link OK + tìm thấy đơn (kèm `existingCuttingFileUrl` nếu đã có file cũ).
   - `notFound`: link OK nhưng không có đơn với productionId đó.
   - `invalid`: URL không hợp lệ / fetch fail / parse fail / không match pattern (2 chữ cái + 5 số + 5 số).
   - `conflicts`: cùng productionId xuất hiện > 1 link — user phải xoá bớt trước khi apply.
5. UI hiện summary cards + breakdown by `factory` + `machineType` + 4 collapsible section.
6. User tick **"Ghi đè file cũ"** (default OFF) → cho phép overwrite các đơn đã có cuttingFileUrl cũ.
7. User bấm **Mapping** → FE call `POST /v1/orders/cutting-files/apply` với mảng `mappings` (đã filter theo overwrite ở FE).
8. BE bulk write + ghi `OrderLog` event `production-file-mapped` (`action='bulk_update'`, `field='cuttingFileUrl'`, `after.event='production-file-mapped'`).

### 15.3 Drive name fetch chi tiết

```
extractFileId → fetchOnce (timeout 8s, browser UA) → parseFileName (3 regex fallback)
              → retry (x2, backoff 500ms) → outcome: { fileName } | { error: 'fetch-failed' | 'parse-failed' }
```

**Concurrency:** cap 5 worker song song (xem `previewCuttingFiles` factory). Tránh Drive rate-limit khi user paste 1000+ link.

**Pattern productionId:** parse trong `parseProductionIdFromCuttingFilename` (shared package). 2 chữ cái đầu không cố định — bất kỳ `[A-Z]{2}`:
```ts
/^([A-Z]{2}-\d{5}-\d{5})/i
// BH-96341-30608-M-BR-KL.pdf → "BH-96341-30608"
// ML-12345-67890-foo.pdf    → "ML-12345-67890"
```

### 15.4 OrderDetailDialog

- Trigger: click productionId trong Workshop table cell (`workshopTableConfig.tsx` đã wire `ctx.openDetail`).
- Layout: Info chung + Workshop status + Cutting file preview (iframe `https://drive.google.com/file/d/{id}/preview`).
- Khi đơn chưa có cuttingFile → hiện hint "Vào tab Import File Cutting để map".
- Icon ✂ xanh emerald cạnh productionId báo đơn đã có cuttingFile (workshop table cell).

### 15.5 Permissions

| Endpoint | Roles |
|---|---|
| `POST /v1/orders/cutting-files/preview` | SuperAdmin, Admin, Manager, Support |
| `POST /v1/orders/cutting-files/apply` | SuperAdmin, Admin, Manager, Support |

Tab `Import File Cutting` hiển thị khi `permission('order.import')` — đồng bộ với tab Import Order.

### 15.6 Performance notes

- Drive fetch ~ 200ms-1s/link (single attempt). 100 link với concurrency 5 ≈ ~10-20s.
- Worst-case retry: 3 attempt × 8s timeout = 24s/link → batch lớn (>500 link) nên chia nhỏ.
- Bulk apply: 1 `bulkWrite` Mongo + 1 `OrderLog.writeMany` — O(N) database write.
- `cuttingFileUrl` index không cần (chỉ dùng cho display + iframe embed, không query).
