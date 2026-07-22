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
>  - `GET /v1/orders` · `GET /v1/orders/:id` · `GET /v1/orders/grouped` · `GET /v1/orders/overview-list` · `GET /v1/orders/by-ids` · `GET /v1/orders/workshop-filters` · `GET /v1/orders/fulfillment-status-counts` · `GET /v1/orders/import-summary` · `GET /v1/orders/error-log`
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
- **Tab Danh sách đơn** — bảng nghiệp vụ 20 cột với inline select / bulk edit. Cần `order.view_workshop_table`.
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
| Search | `productionId`, `userSku`, `userEmail`, `orderId`, `type` (regex contains, case-insensitive). **Hỗ trợ nhiều mã**: dán/nhập nhiều token cách nhau bằng khoảng trắng / dấu phẩy (paste 1 cột từ Google Sheets → newline tự đổi thành khoảng trắng) → BE tách token qua `buildSearchOr()` → match nếu BẤT KỲ token nào khớp BẤT KỲ field nào (OR). Badge "N mã" hiện trong ô khi parse ra >1 mã. Enter để tìm. |
| Tìm bulk Production ID | Nút icon `ListChecks` cạnh ô search → mở `BulkProductionIdDialog` (mode=`filter`). Dán nhiều mã (mỗi mã 1 dòng / phẩy / khoảng trắng) → "Lọc bảng" → set `bulkIds` (state, **không** sync URL) → param `productionIds` (CSV, exact match) khi fetch → bảng chính chỉ còn các mã đó. Badge "Đang lọc N mã ✕" để xoá. Khác ô search ở chỗ: dialog match **exact** từng mã (chỉ `productionId`), ô search match **contains** trên 5 field. Bulk và search thường loại trừ nhau. |
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
           Code ≠ 'ok' → kèm `$addToSet toolCheckErrorNotes` (lịch sử soát lỗi bền vững — xem `ToolCheckWorkflow.md`).
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

### 3.6 Lấy đơn tự động từ OnosPod QC (nút "Lấy đơn từ OnosPod")

Thay cho thao tác thủ công hàng ngày (8h/17h): vào `qc.onospod.com` bấm export → tải file
xlsx → paste vào tab Import. Nút "Lấy đơn từ OnosPod" (chỉ hiện ở mode `new`) tự động hoá
toàn bộ chuỗi này trong 1 click.

**Cách lấy dữ liệu:** query GraphQL `paginateMrpProduct` trực tiếp (KHÔNG dùng cơ chế
export/tải file — thử ban đầu nhưng mutation `createExportProductionReport` chạy bất đồng
bộ và không tìm được API polling đúng, xem lịch sử ở git log nếu cần). `paginateMrpProduct`
trả JSON structured ngay lập tức, nhanh hơn nhiều và không cần chờ. Pull từ **TẤT CẢ
manufacture** của account trong **1 lượt phân trang duy nhất** — KHÔNG truyền tham số
`manufacture_id` (verify bằng test gọi thật 2026-07-18: tổng `total_items` khi bỏ trống
`manufacture_id` khớp 100% với cộng dồn kết quả gọi riêng từng manufacture: ML 299 + TN 216 +
GRABINK 15 + 2DUS 0 = 530). Trước đây phải gọi `manufactures` lấy danh sách rồi loop tuần tự
từng manufacture — đã bỏ, vì mỗi item trả về đã tự mang sẵn field `manufacture{_id,name,sku}`.

```
User bấm "Lấy đơn từ OnosPod"
  → POST /v1/orders/import-from-onospod (body {} → BE tự tính period theo giờ gọi, xem bên dưới)
  → OnospodImportService:
      1. Loop page=1.. gọi query `paginateMrpProduct(status="To Do", start, end, page,
         perpage=500)` — KHÔNG truyền `manufacture_id` — tới khi hết `paginate.total_pages`.
         (Bearer token tĩnh lưu trong env `ONOSPOD_QC_API_URL` / `ONOSPOD_QC_BEARER_TOKEN`
         — đọc qua `ApiConfigService.onospodQcConfig`, trả `null` nếu chưa cấu hình thay
         vì crash app boot, giống `r2Config`)
      2. Map từng `MrpProduct` → `ImportProductionOrderRow` (field mapping xác nhận qua
         test đối chiếu 1:1 với dòng CSV export thật — xem bảng field mapping bên dưới)
      3. `groupByManufacture()` — group lại TẤT CẢ item theo field `manufacture` có sẵn
         trên mỗi item (KHÔNG gọi/loop riêng) → chỉ để hiển thị số lượng theo manufacture
         trên toast FE, KHÔNG ảnh hưởng mapping xưởng nội bộ (vẫn qua `ProductConfig` như
         CSV, xem §3.1/§3.3)
      4. Gọi lại OrderService.importOrders({ rows }) MỘT LẦN cho toàn bộ rows đã gộp —
         TÁI DÙNG 100% pipeline upsert/mapping/design-job/notification đã có ở §3.1/§3.3
  → Response giống ImportProductionOrdersResDto + { totalFetched, period, byManufacture[] }
     (byManufacture: { id, name, sku, fetched, error? } — hiện trên toast FE; `error` giờ
     luôn rỗng vì gọi 1 lượt duy nhất, fail = throw luôn thay vì cô lập theo manufacture)
```

**Field mapping (`MrpProduct` GraphQL → `ImportProductionOrderRow`):**

| Field đích | Nguồn GraphQL | Ghi chú |
|---|---|---|
| `productionId` | `increment_id` | |
| `orderId` | `increment_order_id` | |
| `userSku` | `auth.identity_label` | |
| `userEmail` | `auth.email` | |
| `type` | `product_type.name` | |
| `mockupUrl` | `src` | |
| `designs.{key}` | quét ĐỘNG mọi key `design_*` trong `print` (`extractDesigns()`) — snake→camel (`design_chest_left`→`chestLeft`), đối chiếu whitelist 18 key `DesignFields`; response chỉ chứa key ở vị trí đơn CÓ design | query thêm vị trí mới là tự map, không phải sửa code; key lạ ngoài `DesignFields` bị bỏ qua |
| `designs.frontEmbroidery` / `backEmbroidery` | fallback khi quét động chưa có: `print.print_areas_customs[]` — entry `is_embroidery=true` + `file.src`, match front/back qua `key`/`name` lowercase (`pickEmbroiderySrc()`) | nguồn mới từ khi đồng bộ `PAGINATE_QUERY` với query thật FE OnosPod (2026-07); không match → để trống |
| `status` | `mrp_status` | luôn filter `status: "To Do"` khi query (chỉ lấy đơn MỚI chưa vào sản xuất) |
| `quantity` | `quantity` | |
| `inProductionAt` | `mrp_created_at` (ISO) → format VN local | |
| `orderAt` | decode timestamp từ 4 byte đầu của `order_id` (ObjectId) → format VN local | **KHÔNG có field ngày riêng** — order_id là Mongo ObjectId, tự chứa timestamp tạo doc |
| `size` | `print.meta_data` key `"Size"` | nguồn chính thức OnosPod dùng cho export xlsx — nhận mọi giá trị ("5x78in-Pointed", "L"...), KHÔNG dùng heuristic SKU |
| `color` | `print.meta_data` key `"Color"` | vd "As Design"; null với 1 số sản phẩm |
| `baseCost` | `price` (parse number) | field gộp, KHÔNG tách được base/ship |
| `weight`, `width`, `height`, `length`, `shipCost`, `externalId`, `referent` | — | không tìm được field nguồn nào trên schema (đã probe qua GraphQL error "Did you mean" — introspection bị chặn), để trống (đều optional) |

**Dedupe trong batch:** cùng 1 `productionId` có thể lặp lại giữa các trang (data live dịch
chuyển khi đang phân trang) — `dedupeByProductionId()` gom trước khi gọi `importOrders()`
(giữ bản ghi xuất hiện sau cùng), tránh lệch số liệu `imported`/`updated`. Response trả thêm
`duplicatesInBatch`. Chống trùng ở tầng DB: `orders.productionId` có **unique index** (schema
đã khai báo `unique: true` nhưng Mongoose autoIndex không tự tạo trên DB restore từ dump —
phải `createIndex` tay; nhớ bước này khi restore DB mới) — chặn race 2 request import đồng
thời (cron + nút UI) cùng insert 1 đơn.

**Error semantics (quan trọng cho cron monitoring):**
- Batch rỗng (không có đơn "To Do" mới — sáng vắng/ngày lễ) → **200 success** với
  `totalFetched: 0`, KHÔNG phải 400 — tránh báo động giả làm nhờn cảnh báo.
- Fetch lỗi (token hết hạn, OnosPod down, network) ở BẤT KỲ trang nào → **400**, throw ngay
  (KHÔNG còn cô lập lỗi theo từng manufacture như trước — giờ chỉ 1 lượt phân trang duy
  nhất nên fail = fail toàn bộ).
- `start`/`end` nhận cả ISO có offset (`+07:00`) lẫn `Z` (Zod `datetime({offset:true})`).
  Truyền `start` không kèm `end` → `end` = thời điểm gọi (backfill). Truyền `end` lẻ → 400.

**Lịch chạy do EXTERNAL crontab quản lý** (KHÔNG dùng `@nestjs/schedule` nội bộ — đã bỏ,
xem git history nếu cần bản cũ) — endpoint public để crontab `curl` trực tiếp, không cần
config token/env:

```
GET /v1/orders/import-from-onospod/cron
```

- **Public — không cần Authorization header** (`@Auth([], [], { public: true })`). `RateLimiterGuard`
  vẫn áp dụng (per-IP) dù bỏ qua JWT — hạn chế spam nhưng KHÔNG có auth thật; ai biết URL đều
  gọi được và trigger ghi dữ liệu thật + gọi OnosPod API tốn quota. Chấp nhận đánh đổi này theo
  yêu cầu "không cần config trong env" — cân nhắc thêm firewall rule giới hạn nguồn gọi nếu cần
  chặt hơn.
- **Tự tính period theo giờ gọi thực tế** (`OnospodImportService.resolvePeriod()`, giờ VN):
  - Gọi **trước 12h trưa** → lấy đơn từ **12h trưa hôm trước** tới hiện tại.
  - Gọi **từ 12h trưa trở đi** → lấy đơn từ **00h00 hôm nay** tới hiện tại.
  - Logic này cũng là default khi gọi `POST /v1/orders/import-from-onospod` (nút "Lấy đơn từ
    OnosPod" trên UI) mà không truyền `start`/`end` — dùng chung 1 rule cho cả 2 đường vào.
  - Không cộng buffer riêng — biên 12h trưa/00h00 đã đủ rộng cho lịch 2 lần/ngày (8h + 17h),
    và `importOrders()` upsert theo `productionId` nên overlap giữa các lần gọi không tạo
    trùng dữ liệu, cứ gọi lại thoải mái nếu nghi ngờ sót đơn.
- User tự cấu hình crontab hệ thống (hoặc dịch vụ cron ngoài) gọi `curl` vào URL trên đúng
  8h00 và 17h00 hàng ngày — app không tự chạy cron nội bộ nữa.

---

## 4. Backend module `order/`

### 4.1 Files
| File | Mô tả |
|------|-------|
| `order.entity.ts` | Schema + 4 virtual (`factory`, `originalFactory`, `machineType`, `productConfig`) |
| `order.repository.ts` | Extends DatabaseRepositoryAbstract |
| `order.service.ts` | `getOrders`, `getDashboard`, `getStatusOverview`, `getFactoryOverview`, `getOrdersGroupedByType`, `getImportSummary`, `exportOrders`, `importOrders`, `updateField`, `bulkUpdateField`, `transferOrder`, `bulkTransferOrders`, `backfillOrderFabric`, `deleteOrder` |
| `onospod-import.service.ts` | `OnospodImportService.importFromOnosPod()` — query GraphQL `paginateMrpProduct` từ `qc.onospod.com`, map JSON → rows rồi gọi lại `OrderService.importOrders()`. Xem §3.6. |
| `order.controller.ts` | Endpoints (xem §4.2) |

### 4.2 Endpoints
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/v1/orders` | List (filter + paginate, visibility filter theo role) — cache 60s key có gắn `role`. Populate `factory`/`machineType`/`productConfig (fullName, shortName, mockup, level)` — mockup/level phục vụ panel drill-down Dashboard Designer gom nhóm theo sản phẩm (`Dashboard.md §0b`). |
| GET | `/v1/orders/grouped` | Phân trang theo **product type** thay vì row (Phase 4 — workshop cần combo toàn vẹn) |
| GET | `/v1/orders/overview-list` | Giống `GET /orders` (cùng filter: date/toolResultNote/assignee/designerStatus…) NHƯNG **KHÔNG áp visibility filter theo role** → gọi `getOrders(dto)` với `roleName=undefined`. Dùng cho **drill-down bấm con số** ở Dashboard: mọi role (Designer/Support/Fulfillment…) thấy **CÙNG tập đơn** khớp con số như admin; cột hiển thị vẫn lọc theo quyền qua `canViewField` ở FE. Xem `Dashboard.md §0b`. |
| GET | `/v1/orders/by-ids?ids=<CSV _id>&page&limit` | Lookup đơn theo danh sách `_id`, full workshop fields (populate factory/machineType/productConfig), **KHÔNG áp visibility filter theo role** (`getOrdersByIds`). Dùng cho **lazy-load bảng đơn đầy đủ inline** khi mở rộng 1 nhóm ở "Cần gán designer" Dashboard (nhóm gồm đơn CHƯA gán → `getOrders` sẽ ẩn hết với role Designer do scoping `assignee=self`). Cũng dùng được cho `OrderListDialog` (prop `ids?: string[]`). Xem `Dashboard.md §0c`. |
| GET | `/v1/orders/dashboard` | Aggregation (xem `Dashboard.md` Tab A) — cache 60s |
| GET | `/v1/orders/status-overview` | Aggregation (xem `Dashboard.md` Tab B) |
| GET | `/v1/orders/factory-overview` | Aggregation (xem `Dashboard.md` Tab C) |
| GET | `/v1/orders/export` | Trả toàn bộ đơn theo filter, **không phân trang**. Dùng cho Excel export Tab C. Nhận thêm param `ids` (CSV `_id`) → xuất đúng đơn đã tick chọn (`BulkEditToolbar`, xem §8.6). |
| GET | `/v1/orders/fulfillment-status-counts` | Đếm đơn theo 5 trạng thái stage Fulfillment (waiting/in-progress/rework/done/watching) — dùng cho thanh filter trang "In". Xem `FulfillmentWorkflow.md §4.5`. |
| GET | `/v1/orders/import-summary?date=YYYY-MM-DD` | Bảng tổng hợp `(type, size, fabricType)` theo ngày import. Phase 5. |
| GET | `/v1/orders/:id/logs` | Audit timeline 1 order (xem `OrderLog.md`) |
| GET | `/v1/orders/error-log` | Tab "Nhật ký bù lỗi" — mọi đơn từng lỗi (productionError set), 2 sub-tab `tab=todo\|done` positional theo chặng viewer. Trả thêm `byUrgency`. Xem `§14`. |
| POST | `/v1/orders/:id/resolve-error` | Admin/Manager đánh dấu hoàn thành lỗi tồn đọng → set `errorResolvedAt`, đơn rời tab "Cần xử lý". `@Auth([SuperAdmin,Admin,Manager])`. Xem `§14.3`. |
| POST | `/v1/orders/bulk-resolve-error` | Đánh dấu hoàn thành lỗi HÀNG LOẠT (`{ids}` → `updateMany`). `@Auth([SuperAdmin,Admin,Manager])`. |
| POST | `/v1/orders/import` | Bulk upsert. `ORDER_WRITE_ROLES` (Admin / Manager / Support). |
| POST | `/v1/orders/import-from-onospod` | Tự động fetch export từ OnosPod QC + import (xem §3.6). `ORDER_WRITE_ROLES`. Body optional `{ start?, end? }` ISO string — mặc định tự tính theo giờ gọi (trước/sau 12h trưa). |
| GET | `/v1/orders/import-from-onospod/cron` | **Public** (không cần auth) — bản GET không tham số cho external crontab `curl`. Cùng logic period tự tính. Xem §3.6. |
| POST | `/v1/orders/cutting-files/preview` | Preview cutting-file mapping — fetch tên file từ Drive + parse productionId + match đơn. Xem §15. |
| POST | `/v1/orders/cutting-files/apply` | Apply mappings (bulk write `cuttingFileUrl/Name`) + audit log event `production-file-mapped`. |
| POST | `/v1/orders/backfill-fabric` | Re-derive `fabricType` + `toolResult` từ product config cho đơn còn thiếu (non-destructive). |
| PATCH | `/v1/orders/:id/field` | Inline update 1 workshop field. Phase 2. |
| PATCH | `/v1/orders/bulk-field` | Bulk apply 1 field cho nhiều order. Phase 2. |
| PATCH | `/v1/orders/:id/transfer` | Chuyển 1 đơn sang xưởng khác. Phase 7. `ORDER_WRITE_ROLES`. |
| PATCH | `/v1/orders/bulk-transfer` | Chuyển nhiều đơn sang xưởng khác. Phase 7. Pre-filter ID đã ở target. |
| POST | `/v1/orders/:id/tool-check-done` | Nút "Đã soát xong" (tab Soát tool, list "Cần làm lại") — đơn hold cần thiết kế → designer cũ (rework) / auto-gán / backlog "Cần gán". `@Auth([SuperAdmin,Admin,Manager,SupportManager,Support])`. Xem `ToolCheckWorkflow.md §2.2b`. |
| DELETE | `/v1/orders/:id` | Soft delete (Admin only) |

### 4.3 Cache
- Key list: `orders:list:${md5(query)}` TTL 60s, key có gắn `role` để Designer / Fulfillment không kế thừa cache của Admin (visibility filter khác).
- Invalidate khi: import / update field / bulk field / transfer / bulk-transfer / delete order.

---

## 5. Schema `OrderEntity`

> Shared: `ProductionOrder` (= `z.infer<ProductionOrderZod>`, `_id` optional theo `BaseEntityZod`) + helper type `ProductionOrderRow = ProductionOrder & { _id: string }` cho row đã lưu DB — FE dùng cho list/kanban/scan dialog để khỏi phải guard `_id` từng chỗ.

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
  productionFirstErrorAt?: Date; // index. Set khi `productionError` chuyển null→value (và field chưa có giá trị) → mốc bắt đầu "đang chờ xử lý lỗi" của cycle hiện tại. Clear (=null) khi đơn rời tab "Nhật ký bù lỗi": `toolResultNote='ok'` (qua `updateField`/`bulkUpdateField`/`importRework` **VÀ qua `DesignerTaskService.transition(complete)`** — designer fix rework xong) HOẶC `productionError` được clear. Dùng cho sort + tính mức độ khẩn cấp (24h/48h/72h).

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
| `search` | string (nhiều token) | Contains-match (case-insensitive) trên `productionId` / `userSku` / `userEmail` / `orderId` / `type`. **Tách đa mã** qua helper module-scope `buildSearchOr(search)` (`order.service.ts`) — split `/[\s,]+/` → mỗi token 5 clause field → 1 flat `$or` (match nếu BẤT KỲ token khớp BẤT KỲ field). Token được escape regex. Dùng chung bởi cả 3 chỗ build search: `buildOrderListFilter` (list + factory), `getWorkshopAvailableFilters` (facet counts), `buildVisibilityFilter`-path (`~L5972`). **FE**: ô search ở `ListOrderTab` (input riêng) + `<OrderFilterBar>` (shared cho `OrderTableWorkshop` / `ErrorLogTab` / `OrderFactoryTab` / `OrderStatusTab`) — `onPaste` chuẩn hoá newline→khoảng trắng để dán 1 cột mã từ Google Sheets, badge "N mã" khi parse ra >1 mã (`parseProductionIds`). |
| `productionIds` | CSV | Bulk lookup — lọc đúng danh sách productionId (exact, case-insensitive qua `$in` regex anchored `^..$`). Dùng bởi `BulkProductionIdDialog` (mode filter). Build trong `buildOrderListFilter` ngay sau khối `search`. Khác `search`: exact + chỉ `productionId`. |
| `fabricType` | CSV codes | Lọc theo nhiều fabric. |
| `originalFactoryId` | CSV IDs | Lọc theo xưởng gốc. |
| `transferStatus` | token | `transferred` · `pure` · `transferred-in:<factoryId>` · `transferred-out:<factoryId>`. Build `$expr` so sánh `originalFactoryId` vs `factoryId`. |
| `printStage` | enum | `printed` · `printing` · `not-printed`. Mutually exclusive — Dashboard Tab C drill-down 3 button trên `FactoryCard`. Định nghĩa "đã in xong" = `printStatus ∈ PRINTED_MACHINE_CODES` (`['machine-1','machine-2','machine-3','machine-4','machine-94']`). |
| `productionError` | CSV codes | (Phase 8) Lọc theo lý do lỗi xưởng (`wrong-size`, `print-misalign`, ...). |
| `hasError` | boolean | (Phase 8) `true` → đơn có `productionError` set. `false` không hỗ trợ (dùng cách không truyền filter). |
| `errorSource` | CSV | Lọc theo `productionErrorSource` (`designer`/`factory`/`tool-check`) — filter generic theo nguồn lỗi hiện tại. Kết hợp `toolResultNote=error` → drill hàng "Cần làm lại" (In trả về) dải ngày tab Soát tool. |
| `toolResultNote` | CSV codes | Lọc note kq Tool. Token: `__none__` = chưa soát (null/''/missing) · `__any__` = ĐÃ soát, note bất kỳ (`$nin [null,'']`) · `__error__` = đã soát & ≠ 'ok' (`$nin [null,'','ok']`) — 2 token sau cho drill hàng "Đã soát"/"Soát lỗi" dải "Tổng quan theo ngày" tab Soát tool (`ToolCheckTab.tsx`). |
| `priority` | `'1'`\|`'2'`\|`'3'` | Lọc theo mức ưu tiên (`filter.priority = Number(...)`) — drill tab Soát tool mang theo filter "Ưu tiên" của tab. |
| `toolCheckedError` | `'1'` \| `'0'` | `'1'` → đơn TỪNG bị soát tool đánh note lỗi: `'toolCheckErrorNotes.0': {$exists:true}`; `'0'` → chưa từng (`$exists:false`) — lịch sử bền vững, xem `ToolCheckWorkflow.md`. Drill hàng "Soát lỗi" + 2 nhóm "Đẩy lại · từng lỗi/từng ok" bảng Tổng quan N ngày. |
| `toolErrorNote` | CSV codes | Lọc theo **mã lỗi soát tool MỚI NHẤT** của đơn (`$expr $in` trên `$arrayElemAt(toolCheckErrorNotes, -1)` — push vào `$and` để không đè `$expr` của `transferStatus`). Drill dòng mã lỗi trong tooltip hàng "Soát lỗi". |
| `assignee` | CSV user._id | Lọc theo designer được gán. Token: `__none__` = chưa gán (null/''/missing) · `__any__` = ĐÃ gán bất kỳ ai (`$exists + $nin [null,'']` — drill hàng "Đã gán designer" bảng Tổng quan N ngày). |
| `needDesigner` | boolean | `true` → pool cần/qua designer: `toolCheckErrorNotes` non-empty ∨ `designerStatus ∈ [assigned, in-progress, rework, done]` ($or push vào $and). Kết hợp `assignee=__none__` → drill hàng "Chưa gán designer" bảng Tổng quan N ngày. |
| `designBacklog` | boolean | `true` → union "Tổng tồn" lăng kính designer: chưa soát (note rỗng) ∨ đã gán & chưa xong (assignee + `designerStatus ∈ [assigned,in-progress,rework]`) ∨ đang lỗi & chưa gán (pool cần designer). Drill hàng Tổng tồn bảng Tổng quan N ngày. |
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

### 8.6 Xuất Excel các đơn đã chọn (`BulkEditToolbar`)
- Nút **"Xuất Excel"** (`Download`, `variant="outline"`) trong pill nổi `BulkEditToolbar.tsx` — xuất **đúng** các đơn đang tick chọn (không theo filter, đúng cả khi chọn xuyên trang).
- FE `handleExport`: gọi `RepositoryRemote.order.exportOrders('?ids=' + selectedIds.join(','))` → `buildDetailOnlyWorkbook(data, { resolve })` (`apps/web/src/pages/home/exportOrders.ts`) → `downloadWorkbook('don-hang-chon-<timestamp>.xlsx')`. File chỉ **1 sheet "Chi tiết đơn"** (21 cột giống export xưởng); tên workshop_config resolve client-side qua `workshopConfigStore`.
- BE: `GET /v1/orders/export` nhận thêm param **`ids`** (CSV các `_id`, `GetProductionOrdersZod.ids`) → `buildOrderListFilter` thêm `filter._id = { $in: ids }`. Dùng chung filter builder với `getOrders`/`exportOrders`.

---

## 9. Permissions tổng quát

| Role | List | Import | Inline update | Transfer xưởng | Delete |
|------|:----:|:------:|:-------------:|:--------------:|:------:|
| SuperAdmin / Admin | ✅ | ✅ | ✅ tất cả field | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ tất cả field | ✅ | ✅ |
| Support | ✅ (full table) | ✅ | ❌ | ✅ | ❌ |
| Designer | ✅ (7 ngày) | ❌ | ✅ tool / file / assignee fields | ❌ | ❌ |
| Fulfillment | ✅ (7 ngày + ready) | ❌ | ✅ printStatus / printStatusNote / **toolResultNote** | ❌ | ❌ |

Permission code chi tiết — xem `packages/shared/constants/permission-catalog.ts`. Hook FE: `usePermission()` expose `has(code)`, `canViewField(field)`, `canEditField(field)`, `canViewAdminTable()`, `canViewWorkshopTable()`, `isAdmin`, `roleName`.

---

## 9b. Giữ đơn (Hold / Unhold)

> **Mục tiêu:** Tạm dừng 1 đơn — tô xám cả dòng + **khóa mọi thao tác** (FE + BE) cho tới khi **mở lại**. Khác đơn HỦY (`cancelledAt`): hold **REVERSIBLE** và **KHÔNG** loại đơn khỏi số liệu (chỉ tạm dừng). Ai được giữ: `ORDER_WRITE_ROLES` (Admin/Manager/Support/DesignerLeader/Fulfillment).

### 9b.1 Schema
- `OrderEntity.heldAt?: Date` (index) + `holdReason?: string` (`order.entity.ts`). Set khác null ⇒ đơn "đang giữ".
- Shared `ProductionOrderZod`: `heldAt` + `holdReason`. Filter param `held: z.coerce.boolean()` trong `GetProductionOrdersZod` (held=true → chỉ đơn giữ; false → chỉ đơn không giữ; bỏ trống → cả 2).
- `ORDER_LOG_ACTIONS` thêm `'hold'` + `'unhold'`.

### 9b.2 Endpoints (`@Auth(ORDER_WRITE_ROLES)`)
| Method | Path | Service | Mô tả |
|--------|------|---------|-------|
| POST | `/v1/orders/:id/hold` | `holdOrder` | Set `heldAt=now` + `holdReason`. 400 nếu đã giữ / đã hủy. Log `hold`. |
| POST | `/v1/orders/:id/unhold` | `unholdOrder` | `$unset heldAt/holdReason`. 400 nếu không đang giữ. Log `unhold`. |
| PATCH | `/v1/orders/bulk-hold` | `bulkSetHold` | `{ ids, hold: boolean, reason? }`. hold=true chỉ set đơn chưa giữ & chưa hủy; false chỉ clear đơn đang giữ. Trả `{ matched, modified }`. |

### 9b.3 Khóa thao tác (BE guard `assertNotHeld`)
Đơn `heldAt` set → chặn (400 *"Đơn đang bị giữ — mở lại…"*) ở: `updateField`, `setProductionError`, `DesignerTaskService.transition`, `FulfillmentTaskService.transition`. `bulkUpdateField` (nhánh updateMany) + `bulkAssignDesigner` **loại** đơn giữ qua filter `heldAt: { $exists: false }` → `matched` thấp hơn để FE biết bị bỏ (nhánh side-effect loop `updateField` tự skip vì guard throw). **Không** chặn `/unhold` (để mở lại được).

### 9b.4 Thống kê
- **Dashboard tab Stats** (`getDashboard` → `totals.heldOrders`): card **"Đơn đang giữ"** (hổ phách) ở `OrderStatsTab.tsx`. VẪN nằm trong `totalOrders` (chỉ tạm dừng, không loại như đơn hủy).
- **Danh sách đơn** (`getWorkshopAvailableFilters` → `data.heldCount`): nút toggle **"Đang giữ (N)"** ở `topActionsRight` `OrderFilterBar` → set param `held=true` (URL `wheld`) + chip "Trạng thái: Đang giữ".

### 9b.5 Frontend
- Util `apps/web/src/utils/orderActions.ts`: `isHeld(o)`, `canUserHold(roleName)` (mirror `ORDER_WRITE_ROLES`).
- `HeldBadge.tsx` (hổ phách "Đang giữ" + reason) — mirror `CancelledBadge`.
- `HoldOrderDialog.tsx` (giữ 1 đơn, lý do KHÔNG bắt buộc).
- Tô xám + badge + **cell read-only** (override `ctx.canEditField=()=>false`) ở: `OrderTableWorkshop`, `ErrorLogTab`, `OrdersMiniTable`; tô xám + badge ở `ListOrderTab`.
- `OrderRowActionsMenu.tsx`: item **"Giữ đơn"** (mở dialog) / **"Mở giữ"** (gọi trực tiếp) cho role `canUserHold`; menu hiện khi `isAdmin || canUserHold`.
- `BulkEditToolbar.tsx`: nút **"Giữ đơn"** (dialog lý do bulk) + **"Mở giữ"** (bulk trực tiếp) → `RepositoryRemote.order.bulkHold({ ids, hold, reason })`.
- Service `services/order.ts`: `holdOrder` · `unholdOrder` · `bulkHold`.

---

## 10. Danh sách đơn (Phase 4)

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
| 12 | **assignee** | `AssigneeSelectCell` — picker user từ designer team (`designerTeamStore`), value = `user._id`, display = `fullName`. KHÔNG còn dùng workshop_config. **Đơn `toolResultNote='ok'` → cell khoá (`blockedReason` + tooltip), không gán được** — xem `DesignerTaskWorkflow.md §2.2`. | `order.field.assignee.view` |
| 13 | assigneeNote | `IconSelectCell` | `order.field.assigneeNote.view` |
| 13b | **designerStatus** | Read-only badge color 6 state (Chưa gán/Cần làm/Đang làm/Đã xong/Không làm được/Cần làm lại) + suffix "×N" khi `designerReworkCount > 0`. | `order.field.designerStatus.view` |
| 14 | userSku | text + CopyButton | luôn |
| 15 | typeFullName | text (`productConfig.fullName`) | luôn |
| 16 | factoryMachine | badge `factory.name` + badge `machineType.name` (gộp 2 dòng) | luôn |

`WORKSHOP_COLS` được reuse bởi cả Tab `OrderTableWorkshop` (apps/web/src/pages/orders) **và** Dashboard Tab C `OrderFactoryTab`. Dashboard Tab C thêm 1 cột "Xưởng (đang / gốc)" ở đầu để hiển thị badge transfer.

#### 10.2a Compact grouped columns (`OrderTableWorkshop` + Dashboard `OrdersMiniTable`/`OrderFactoryTab` — giảm scroll ngang)

`WORKSHOP_COLS` gốc có ~20 cột riêng lẻ → các bảng đơn (`/orders/workshop`, Dashboard tab Trạng thái + tab Xưởng) scroll ngang rất sâu. Logic gom nhóm sống trong **`workshopTableConfig.tsx`** (dùng chung, KHÔNG duplicate ở từng trang):
- `BASE_GROUP_DEFS` + `SUPPORT_GROUP_ORDER` + `HEADLINE_KEYS` + `FIELD_LABELS` — định nghĩa group + field label.
- `buildColGroups(visibleCols, roleName)` — build group đã resolve (lọc quyền + đổi thứ tự theo role) từ `visibleCols`.
- `GroupCellContent` — component render nội dung 1 group cell (field xếp CHIỀU DỌC, tự thêm label field không có cột riêng), nhận `renderedByKey` (Map key→ReactNode đã render sẵn) + `extra` optional (chèn node cạnh 1 member, vd Badge combo cạnh `mockupTypeSize`).

3 nơi dùng: `OrderTableWorkshop.tsx` (`/orders/workshop`, có thêm sticky + virtualization), `OrdersMiniTable.tsx` (Dashboard tab Trạng thái — Tab B), `OrderFactoryTab.tsx` (Dashboard tab Xưởng — Tab C, giữ nguyên cột "Xưởng (đang / gốc)" riêng TRƯỚC các group). `ErrorLogTab`/`PrintOrderTable` (không thuộc Dashboard) vẫn dùng layout cột phẳng như cũ.

7 group hiển thị — mỗi group là 1 cột bảng nhưng bên trong xếp field CHIỀU DỌC (nhiều dòng) thay vì mỗi field 1 cột ngang:

| Group | Title header | Member field keys (thứ tự hiển thị trong cell) |
|---|---|---|
| `identity` (sticky đầu bảng) | Mã đơn / Ưu tiên | `productionId`, `priority`, `userSku`, `typeFullName` |
| `product` | Sản phẩm | `mockupTypeSize` |
| `toolCheck` | Kết quả Tool / File lỗi | `toolResult`, `toolResultNote`, `errorFile`, `errorFileNote` |
| `factory` | Xưởng · Vải · Máy | `factoryMachine`, `fabricType`, `machineNumber` |
| `print` | Trạng thái in | `printStatus`, `printStatusNote` |
| `productionError` | Lỗi xưởng | `productionError`, `productionErrorSource`, `productionErrorNote` |
| `assignee` | Người thực hiện | `assignee`, `assigneeNote`, `designerStatus` |

> Group `toolCheck` GỘP "Kết quả Tool" + "File sửa lỗi" cũ (trước là 2 group `toolCheck`/`errorFile` riêng) thành 1 cột duy nhất, 4 field xếp dọc: `toolResult` → `toolResultNote` → `errorFile` → `errorFileNote`. Áp dụng cho MỌI bảng dùng `buildColGroups` (workshop, `OrdersMiniTable`, `OrderFactoryTab`…).

Thứ tự group MẶC ĐỊNH (mọi role trừ Support) đặt `toolCheck` (gồm cả file lỗi) ngay sau `product`, TRƯỚC `factory` (soát kết quả Tool + file sửa lỗi là bước đầu tiên cần thấy). Role Support dùng `SUPPORT_GROUP_ORDER` cùng thứ tự này. Member field nào bị ẩn quyền thì loại khỏi group; group rỗng hết member thì ẩn cả cột.

- **Label cho field không còn cột riêng**: field không thuộc `HEADLINE_KEYS` (`productionId`, `mockupTypeSize`, `factoryMachine` — đã tự mô tả qua tên/ảnh/badge) được thêm 1 label ngắn phía trước value, lấy từ `FIELD_LABELS` (vd `fabricType` → "Vải", `machineNumber` → "Máy", `productionErrorNote` → "Mô tả").
- **Width cột** tính theo GROUP (`ColGroupDef.width`, cố định px) thay vì cộng dồn width từng field lẻ — tổng width bảng giảm từ ~3100px (20 cột) xuống ~1500-1700px (8 group + checkbox + action).
- **Sticky đầu bảng**: group `identity` (chứa `productionId`) luôn là group index 0 → giữ class sticky `left-8` cũ; badge "Đã hủy"/"Đang giữ" (`CancelledBadge`/`HeldBadge`) gắn ở đầu cell group này (trước đây gắn ở cột đầu tiên nói chung).
- **Header hàng tiêu đề loại sản phẩm** (`kind: 'header'` trong `flatItems`) — `position: sticky` trên 1 `<TableCell colSpan={nhiều}>` KHÔNG ghim khi cuộn ngang (browser bug thực tế, đã xác nhận qua test tay). Fix: tách 2 cell — 1 cell sticky `left-8` KHÔNG `colSpan` (ghim đúng) chứa chevron/tên/badge với `overflow-visible` + `shrink-0` mọi item (bỏ `line-clamp-1`) để nội dung TRÀN ra ngoài biên cell thay vì bị cắt, đè lên cell filler colSpan rỗng bên cạnh nhờ z-index của element sticky — filler luôn trống (không có data thật) nên phần tràn không bao giờ che thông tin khác, kể cả khi đã cuộn ngang.
- **Nền cell sticky PHẢI là màu ĐẶC (không alpha `/NN`)** — sticky cell (checkbox, group `identity`, action, checkbox+tên nhóm ở hàng tiêu đề loại sản phẩm) dùng chính `rowBgClass`/`bg-muted` làm nền để CHE nội dung cuộn phía sau nó. Trước đây dùng màu có alpha (`bg-primary/10`, `dark:bg-primary/20`, `bg-muted/40`…) → khi cuộn ngang, chữ của cột phía sau xuyên qua lớp nền trong suốt, đè lên cột đang ghim (rõ nhất ở group `identity` khi row đang được TICK CHỌN). Đã đổi `rowBgClass` (`ProductRow`) sang màu đặc: `bg-indigo-50`/`dark:bg-indigo-950` (selected), `bg-amber-50`/`dark:bg-amber-950` (heaviest combo), `bg-sky-100`/`dark:bg-sky-950` (no-tool); sticky cell của hàng tiêu đề loại sản phẩm đổi `bg-muted/40` → `bg-muted` (đặc).
- **Badge combo "×N"** vẫn gắn cạnh giá trị `mockupTypeSize` bên trong group `product`.
- **Virtualizer**: `estimateSize` row thường tăng từ 68px → 130px vì field giờ xếp dọc nhiều dòng trong 1 group (group `identity` có tới 4 dòng); `measureElement` vẫn tự đo lại chính xác sau render.

> **Trang Fulfillment "In"** dùng bảng **phẳng riêng** `PrintOrderTable` (KHÔNG group sản phẩm), KHÔNG reuse `OrderTableWorkshop`. Lấy data từ `GET /v1/orders` (`sort=grouped`). Xem `FulfillmentWorkflow.md §4.5`.

`WorkshopOrderRow` có thêm field optional `currentFulfillmentStage` + `fulfillmentStages` để consumer (PrintOrderTable) quyết định hiển thị action theo trạng thái stage.

**Filter chips "Đang lọc" + reset selection** (`OrderTableWorkshop.tsx`):
- **Reset chọn đơn về 0 khi BẤT KỲ filter nào đổi** (search/date/9 facet) — `useEffect` deps = toàn bộ filter, KHÔNG gồm `page/pageSize` (đổi trang vẫn giữ selection). Tránh gán nhầm đơn không còn hiển thị sau khi đổi filter.
- **Thanh chip "Đang lọc:"** ngay dưới `OrderFilterBar` — render mỗi filter đang active (facet có value + search + date khi KHÁC mặc định hôm nay) thành 1 chip **màu riêng theo loại** (`FILTER_CHIP_COLORS` — static class cho Tailwind purge), có nút `×` bỏ lẻ từng filter. Chỉ hiện facet user có quyền xem (lọc theo `perm`/`hidden` như `OrderFilterBar`).
- **Nút "Xóa tất cả lọc"** (`FilterX` icon) → reset toàn bộ facet + search về rỗng, date về hôm nay, page về 1 (selection tự reset qua effect trên). Thanh chỉ hiện khi có ≥1 filter active.
- `facets` được tách thành 1 `const` dùng chung cho cả `OrderFilterBar` lẫn tính chip (1 nguồn).

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
- Top row: search input (flex-1) + nút **"Nhiều mã"** (opt-in) + `<DateRangePicker>` + nút Tải lại + slot `topActionsRight` (view switcher / export / ...).
- Middle row (optional slot `middleRow`): active chip bar / factory chip bar.
- Facet grid: 2/3/5 cột responsive, mỗi cell `<SelectFilter>` đã gate qua `usePermission().has(perm)` từ `OrderFilterFacet.perm`.
- **Nút "Nhiều mã"** (prop `onBulkApply`): chỉ hiện khi caller truyền callback. Mở `BulkProductionIdDialog` (mode=`filter`) — dán danh sách mã mỗi dòng 1 mã (hoặc phẩy/khoảng trắng) → trả mảng mã cho caller set param `productionIds`. `OrderTableWorkshop` wire vào state `bulkIds` (transient, không sync URL), thêm chip "Nhiều mã: N mã" vào thanh "Đang lọc", loại trừ nhau với ô search thường (set cái này clear cái kia). Search input cũng tự nhận đa mã khi dán trực tiếp (xem §7.x `search`) — nút modal chỉ tiện cho danh sách dài nhiều dòng.

Mỗi consumer truyền `facets: OrderFilterFacet[]` để cấu hình field set riêng — tránh ép tất cả tab dùng cùng 1 list:
- `OrderTableWorkshop` — 10 facet workshop chuẩn từ `getWorkshopFilters`.
- `ErrorLogTab` — 5 facet error-log: assignee · fabricType · toolResult · productionError · productionErrorSource. Date range thêm vào endpoint qua field `createdFrom`/`createdTo` mới trong `GetErrorLogZod` (filter `inProductionAt` VN tz, đồng bộ convention với 3 bảng kia).
- `OrderFactoryTab` — 5 facet factory-specific: type · fabricType · machineTypeId · machineNumber · toolResult (lấy từ `overview.availableFilters`). Search debounce 300ms, thêm vào `getOrders` qua `search` param.
- `OrderStatusTab` — không dùng facet grid (BreakdownCard grid bên dưới làm role này với multi-select chip). Chỉ search + date + reload + slot extras ("Lỗi cần xử lý" + active chips + Xóa filter) qua `<StatusFilterTopActions>`/`<StatusActiveChips>` (`apps/web/src/pages/home/status/StatusFilterExtras.tsx`).
- `OrderStatsTab` — không dùng facet grid (stats hiển thị MetricCard + pie chart, không list đơn). Search chính = `searchType` (tên sản phẩm); `searchUser` (SKU/email khách) chèn vào `topActionsRight` vì stats có 2 search term. Cả 2 search debounce 300ms; auto-fetch khi date hoặc debounced search đổi — bỏ nút "Áp dụng" cũ vì pattern đồng bộ.

**`OrderTableWorkshop` cụ thể** — 10 facet workshop chuẩn từ BE endpoint `GET /v1/orders/workshop-filters` theo **faceted-search pattern**:
- BE method `getWorkshopAvailableFilters(dto, role, assigneeCode?, fulfillmentFactoryId?)` — với mỗi facet, build `buildOrderListFilter` sau khi strip facet đó khỏi dto, rồi `$group` field tương ứng. Count phản ánh subset đã narrow theo các facet khác đang active.
- **Đơn đã hủy (`cancelledAt`) MẶC ĐỊNH bị LOẠI khỏi CẢ list LẪN mọi facet count**: `buildOrderListFilter` set `filter.cancelledAt = { $exists: dto.cancelled === true }` → mặc định (`cancelled` không bật) loại đơn hủy khỏi **mọi caller** (`getOrders`/`getOrdersGroupedByType`/`exportOrders`/`getFulfillmentStatusCounts`/facet). Facet còn spread hằng `excludeCancelled` cho các nhánh count phụ (`toolResultNoteNoneCount`/`unassignedSplit`/`heldCount`). `getErrorLog` vốn đã tự loại cancelled. **Toggle "Đã hủy (N)"** (`data.cancelledCount`, nút `Ban` cạnh "Đang giữ", URL `wcancel`) → set `cancelled=true` → **list + facet CHỈ hiện đơn hủy** (xem riêng) + chip "Trạng thái: Đã hủy". Xem đơn hủy cũng qua dialog "Đơn đã hủy" riêng. DTO `GetProductionOrdersZod.cancelled` (`z.coerce.boolean`).
- **10 facet** support: `fabricType` / `machineNumber` / `printStatus` / `toolResult` / `toolResultNote` / `errorFile` / **`userSku` (Khách hàng — luôn hiện, không perm)** / `assignee` / `productionError` / `designerStatus`. Cell hiển thị phụ thuộc permission `order.field.X.view` (trừ `userSku` không gate). URL param `wusersku`.
- `assignee` facet labels **resolve fullName từ users collection** (BE lookup users theo userIds trong facet rows). Value vẫn = user._id.
- `designerStatus` facet labels VN (Cần làm/Đang làm/Đã xong/Không làm được/Cần làm lại). **Option `unassigned` (Chưa gán) được TÁCH thành 2 token `__unassigned_notool__` ("Chưa gán · không tool", M) + `__unassigned_tool__` ("Chưa gán · có tool", N)** — loại đơn `toolResultNote='ok'`, chia theo `toolResult` "Có tool" (name `^Có`). **M = KPI "Chưa gán không tool" panel Designer** (panel chỉ hiện M; N chỉ ở dropdown). Xem `DesignerTaskWorkflow.md §5.7`.
- Token đặc biệt `__none__` cho assignee + designerStatus filter: trả đơn chưa gán (`assignee in [null,'']`) hoặc chưa có designerStatus (`$exists: false`).
- **`toolResult` facet có option "Chưa xác định"** (`value: '__none__'`) cho đơn chưa soát tool (field missing/null/rỗng) — mirror 100% pattern `toolResultNote`/"Chưa soát": BE tính `toolResultNoneCount` riêng (strip `toolResult` khỏi filter, count theo `$or: [{$exists:false},{null},{''}]`, exclude cancelled) rồi prepend vào mảng `toolResult` trong `getWorkshopAvailableFilters()` (chỉ hiện nếu count > 0). `buildOrderListFilter()` có nhánh `__none__` riêng cho `dto.toolResult` (giống `toolResultNote` — hasNone+real kết hợp qua `$or`). FE **KHÔNG cần đổi gì** — facet `toolResult` trong `OrderTableWorkshop.tsx` đã đọc thẳng `workshopFilters?.toolResult` (không như `assignee`, field này không cần FE-side wrapper vì BE đã trả `__none__` kèm count thật).
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
- **"Gán design" button** (`AssignDesignerDialog`): chỉ hiện khi `canEditField('assignee')`. Pre-flight `POST /bulk-assign-designer-preview` → dialog hiển thị KPI status + alreadyAssigned + `blockedCount`/`reworkHeldCount`/`okCount`/`noToolCount`/`eligibleCount`/`eligibleWithToolCount` + designer dropdown. **Đơn `toolResultNote='ok'` KHÔNG gán được** (banner đỏ). **Đơn CHƯA soát → banner vàng + 2 nút "Gán tất cả" / "Chỉ gán đơn đã soát"** (`skipUnreviewed`). **Đơn `rework` đang có người ôm → banner + skip** (chỉ gán được đơn rework chưa ai ôm); `in-progress/done` → skip. Conflict đa-người → ghi đè. Submit `POST /bulk-assign-designer { ids, userId, reassignOthers, skipUnreviewed }` → skip + report. Xem `DesignerTaskWorkflow.md §2.2`.

### 10.4b Designer KPI panel (Admin/Manager/Leader)

Trên cùng tab **List Order** + tab **Danh sách đơn** khi user có quyền `page.designer_stats` hoặc `designer.task.assign`:

Render `<DesignerSummaryPanel filterQs={...} onClickCell={...}>`:
- 7 KPI button-card (**Tổng chưa gán** N+M / **Chưa gán không tool** M / Cần làm/Cần làm lại/Đang làm/Đã xong/Không làm được) — click → set filter list (`assignee` / `designerStatus`)
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
| **Render memo hóa** (tránh re-render cả bảng) | `decoratedGroups`/`selectedCountByType`/`visibleOrderedIds` = `useMemo`; mọi handler (`patchRow`, `openPreview`, `handleCheckboxChange`, `toggleGroupSelection`…) = `useCallback` (dùng functional setState + refs); `renderCtx` = `useMemo`. Combo-count + sort chỉ tính 1 lần theo `[groups]` thay vì mỗi render × 2. |
| **`ProductRow` = `React.memo`** | Mỗi hàng đơn tách thành component memo, props primitive/stable (`isSelected`, `comboN`, `noTool`, `row`, callbacks). Tick checkbox / mở dialog / poll design KHÔNG re-render toàn bảng, chỉ hàng đổi. Bên trong dùng `renderedCells = useMemo(cols.map(c.render), [cols,row,ctx])` → đổi selection (bg sticky) không render lại các cell component. |
| **Virtualization (window scroll)** | `useWindowVirtualizer` (`@tanstack/react-virtual`) trên danh sách phẳng `flatItems` (header + row theo collapse). Cuộn cả trang, chỉ render ~hàng đang thấy + 2 spacer row (padTop/padBottom); `measureElement` đo chiều cao thật (dynamic). `scrollMargin` = offset `<tbody>` đo qua `ResizeObserver(document.body)`. Bảng dùng `table-fixed` + `<colgroup>` width cố định (lấy từ `min-w-[…px]` mỗi cột, `parseColWidth`) để cột không giật khi cuộn. Ảnh đã lazy sẵn (`ImageThumbCell` `loading="lazy"`) → chỉ tải khi cuộn tới. |
| **Poll design ổn định** | `usePendingDesignsPoll`: giữ `rows`/`patchRow` trong ref, effect chỉ depend `[hasPending]` → không tạo lại `setInterval` mỗi lần `items` đổi reference. |

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
> **Service BE:** `order.service.ts → getErrorLog(dto, role, userId?, factoryId?, fulfillmentStage?)` + helper `applyErrorLogViewFilter(filter, tab, role, stage, factoryId, assigneeUserId)`

### 14.1 Mục đích — theo dõi lỗi ĐÃ VÀO FULFILLMENT (positional)

Bảng theo dõi **đơn từng bị báo lỗi mà ĐÃ vào fulfillment** (in → ép → … → đóng gói), tách theo **góc nhìn CHẶNG của người xem** qua 2 sub-tab. Dùng mô hình vị trí + reflow của [`Plans/UpstreamWatching-ReflowChain.md`](../Plans/UpstreamWatching-ReflowChain.md) — mirror `applyFulfillmentStatusFilter`.

**Điều kiện vào bảng (base filter, mọi role):**
- `productionError ≠ null/''` AND **KHÔNG hủy/xóa** (`cancelledAt`/`deletedAt` không tồn tại).
- **`currentFulfillmentStage` đã set** — CHỈ đơn đã vào fulfillment. Loại đơn còn ở soát-tool / thiết kế trước fulfillment.
- **`productionErrorSource ≠ 'tool-check'`** — **bỏ hẳn lỗi soát-tool** khỏi tab này (Support tạm ẩn tab — xem `§14.3`).
- **KHÔNG** ràng buộc `productionFirstErrorAt` (đơn designer sửa xong vẫn còn lỗi ở các chặng sau, phải hiển thị tiếp).

**2 sub-tab (param `tab`, positional theo chặng viewer `S` index `i` so với vị trí đơn `P`):**
- **`todo` (Cần xử lý)** — chặng `S` còn việc: đơn ĐANG ở `S` (`i==P`, có nút thao tác) HOẶC đơn ở chặng trước mà `S` đã từng làm / là người báo lỗi (`i>P` → "đang chờ quay lại", xám).
- **`done` (Đã xong)** — chặng `S` đã làm lại xong, đơn đã đi qua (`i<P`); **giới hạn 14 ngày** gần nhất (theo `updatedAt`), sort `updatedAt` DESC.

Ví dụ Ép báo lỗi → đẩy về designer: designer/in/ép đều thấy ở `todo`; designer xong → designer sang `done`, in vẫn `todo`; in xong → in sang `done`; ép (reporter) xong → tất cả `done`.

Sort `todo` vẫn theo `productionFirstErrorAt` ASC (lỗi cũ nhất trước).

### 14.2 Mức độ khẩn cấp (theo GIỜ)

Tính theo **tuổi đơn kể từ ngày VÀO SẢN XUẤT** (`now - inProductionAt`), **KHÔNG** phải ngày báo lỗi (`productionFirstErrorAt`) — đơn vào sản xuất càng lâu mà còn lỗi thì càng ưu tiên. Cột "Tuổi đơn (từ SX)" hiển thị duration + ngày vào SX, khớp với badge mức độ. `inProductionAt` rỗng → xếp mức "Mới" (cả FE `urgencyOf` lẫn BE `$switch` do null < số).

| Mức độ | Ngưỡng (từ `inProductionAt`) | Màu | Mô tả |
|--------|--------|-----|-------|
| **Mới** | < 2h | Sky | Vừa vào SX |
| **Cần làm** | 2h – 4h | Amber | Cần ưu tiên |
| **Gấp** | 4h – 6h | Orange | Sắp critical |
| **Khẩn cấp** | > 6h | Rose (animate-pulse) | Quá 6 giờ — flash đỏ |

Header tab có 4 chip filter mức độ + count. Click chip để toggle filter; chỉ 1 mức độ active tại 1 lúc.

**BE (`getErrorLog`):** badge counts (`byUrgency` aggregation) + filter chip đều tính trên `inProductionAt` (aggregation `$subtract: [now, '$inProductionAt']`; filter đẩy range vào clause `$and/$or` riêng theo `inProductionAt`, KHÔNG merge vào `filter.inProductionAt` của date-range để tránh đè). `countFilter` snapshot **trước** khi thêm clause urgency → badge luôn hiện đủ 4 mức. **Sort danh sách vẫn theo `productionFirstErrorAt` ASC** (đơn báo lỗi lâu nhất lên đầu) — độc lập với thang mức độ.

### 14.3 Góc nhìn chặng + phạm vi + thao tác (theo role)

`applyErrorLogViewFilter` suy "chặng của viewer" từ role → dựng clause positional `todo`/`done`:

| Role | Chặng viewer | Phạm vi xưởng | Có nút thao tác khi |
|------|------|------|------|
| **Fulfillment** | `user.fulfillmentStage` (in→đóng) | **chỉ xưởng mình** (`factoryId`/`originalFactoryId`) | `currentFulfillmentStage === myStage` & cùng xưởng → Bắt đầu/Hoàn thành/Báo lỗi (`fulfillment.transition` + `ReworkBackDialog`) |
| **Support** | — (**tab tạm ẩn**) | — | Lỗi soát-tool không còn hiển thị ở tab này. BE trả rỗng (`_id: '__support_hidden__'`); FE ẩn tab + sidebar entry (`orders/index.tsx errorLogVisible`, `Sidebar.tsx hideForRoles:['Support']`). |
| **Designer / DesignerLeader** | designer (đơn bị đẩy lỗi NGƯỢC từ fulfillment về) | **chỉ task của mình** (`assignee = user._id`) | `todo` = `designerStatus ∈ {rework, in-progress}` → Bắt đầu/Hoàn thành (`designer.transition`); `done` = `designerStatus=done` & timeline có `reworkTarget:'designer'` (đã sửa xong, đẩy lại vào fulfillment) |
| **Admin / Manager / SuperAdmin** | — (toàn cục, trong scope base = đã vào fulfillment) | mọi xưởng | thấy MỌI đơn lỗi fulfillment: `todo` = chưa hoàn tất pipeline (`fulfillmentCompletedAt` chưa set); `done` = đã đóng hàng xong HOẶC đã resolve tay. Nút **"Đánh dấu xong"** (`POST /orders/:id/resolve-error` → `resolveError`) set `errorResolvedAt` → đơn rời "Cần xử lý" (mọi role), hiện ở "Đã xong" của Admin 14 ngày. Đảo tự động khi báo lỗi mới (`setProductionError` clear `errorResolvedAt`). **Bulk:** tab "Cần xử lý" của Admin có cột **checkbox** (+ chọn-tất-cả header) + thanh nổi **"Đánh dấu xong (N)"** → `POST /orders/bulk-resolve-error`. |

FE: đơn KHÔNG thuộc chặng viewer → hàng **xám** (`opacity-50`) + cell read-only + không nút. Với Fulfillment/Admin visibility KHÔNG lọc theo assignee (thấy hết đơn trong chặng/scope mình) — chỉ nút thao tác mới gate. Riêng **Designer** visibility LỌC theo `assignee = mình` (chỉ task được đẩy về cho mình).

### 14.4 Filters

| Filter | Field | Source |
|--------|-------|--------|
| Search | `productionId / userSku / userEmail / orderId / type` | text |
| Người thực hiện | `assignee` (CSV user._id, token `__none__` = chưa gán) | `designerTeamStore` |
| Loại vải | `fabricType` (CSV code) | `workshopConfigStore.fabric_type` |
| Kết quả Tool | `toolResult` (CSV code) | `workshopConfigStore.tool_result` |
| Mã lỗi | `productionError` (CSV code) | `workshopConfigStore.production_error` |
| Nguồn lỗi | `productionErrorSource` (CSV `designer\|factory`) | static |
| Mức độ | `urgency` (CSV `new\|attention\|urgent\|critical`) | chip filter (chỉ tab `todo`) |

Mỗi filter đổi → reset về page 1. URL state persist với prefix `e*` (`etab`, `esearch`, `eassign`, `efabric`, `etool`, `ecode`, `esource`, `eurg`, `epage`, `esize`).

### 14.5 Bảng

Cột (reuse từ `WORKSHOP_COLS` của `workshopTableConfig.tsx` nhưng filter chỉ các key liên quan):

| Cột | Cell |
|-----|------|
| Mức độ | Badge `new/attention/urgent/critical` |
| Tuổi đơn | Duration text `Nd Mh` + ngày vào SX |
| Xưởng | `factory.shortName` |
| Production ID | `WORKSHOP_COLS.productionId` cell (copy + tooltip). **Click mã → mở `OrderDetailDialog`** (fetch qua `getByProductionId`, hiện info + link mockup/design + preview file cutting) — wire qua `renderCtx.openDetail` |
| Sản phẩm | `WORKSHOP_COLS.mockupTypeSize` cell (thumb + type + size) |
| Design | `WORKSHOP_COLS.designs` |
| Lỗi xưởng | `WORKSHOP_COLS.productionError` (ProductionErrorSelectCell) |
| Nguồn | `WORKSHOP_COLS.productionErrorSource` (ErrorSourceCell) |
| **Chặng hiện tại** | Badge chặng đơn đang đứng (suy positional: tool-check marker → designer rework → `currentFulfillmentStage` → designer assigned/in-progress) |
| **Nêu lỗi** | Chặng reporter + người báo (từ `fulfillmentTimeline` entry `rework-back` gần nhất) |
| **Ghi chú lỗi** | Note người báo nhập — `errorNote(row)`: ưu tiên `reason` của rework-back gần nhất, fallback `productionErrorNote`. Clamp 2 dòng + `title` full text |
| **Người sửa** | designer `assignee` (nếu ở designer) / `byUserName` timeline của chặng hiện tại / "Support" |
| Số lần | Badge `×N` (= `productionErrorCount`) |
| (action) | Nút thao tác theo chặng (§14.3) + History → `OrderLogTimelineDialog` + `OrderRowActionsMenu` |

Hàng thuộc chặng viewer → cho inline edit + nút thao tác; hàng khác → xám + read-only (`canEditField: () => false`).

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

---

## 16. Hủy đơn + Đổi design (Admin) — menu "..." mỗi hàng

> **File FE:** `apps/web/src/components/orders/{OrderRowActionsMenu,CancelOrderDialog,EditOrderDesignDialog}.tsx`, `apps/web/src/utils/orderActions.ts`
> **File BE:** `order.service.ts` → `canCancelOrder()` + `cancelOrder()` + `updateOrderDesign()`; `order.controller.ts` → `POST /:id/cancel` + `PATCH /:id/design`
> **API:** `POST /v1/orders/:id/cancel` · `PATCH /v1/orders/:id/design`

### 16.1 Overview
Mỗi hàng đơn (ở MỌI bảng order) có nút **"..."** (`MoreHorizontal`) ở **cột thao tác pin cố định bên phải** (§16.4) — **CHỈ Admin** (`OrderRowActionsMenu` tự `usePermission().isAdmin` → non-admin render null). 2 action, mỗi cái mở dialog:
- **Đổi design** (`EditOrderDesignDialog`) — đổi URL mockup + **các vị trí design đơn ĐANG CÓ**. Lưu **raw URL** (không qua R2); URL cũ giữ trong OrderLog.
- **Hủy đơn** (`CancelOrderDialog`) — soft cancel + lý do (bắt buộc ≤200).

**Đơn đã hủy:** vẫn hiện trong mọi bảng với component chung **`CancelledBadge`** = badge "Đã hủy" (đỏ) **+ hiện luôn LÝ DO hủy** (note, truncate + full tooltip) + **row mờ** (`opacity-60`); **KHÔNG loại khỏi thống kê/filter** (đếm bình thường). Cả 2 action **disable** khi đơn đã hủy (read-only).

**Optimistic update:** cancel/đổi design trả về order đã cập nhật → `OrderTableWorkshop` **patch tại chỗ** (`patchRow`, KHÔNG refetch) → **giữ nguyên group sản phẩm đang mở** + cập nhật tức thì. Bảng phẳng khác refetch (không có group).

**Lịch sử (`OrderLogTimelineDialog`):** `update_design` render **từng vị trí URL cũ→mới**; `cancel` hiện **lý do hủy**.

### 16.2 Điều kiện HỦY (`canCancelOrder`)
```
ok = !cancelledAt
```
- **Admin hủy đơn ở BẤT KỲ trạng thái nào** (đã in / ép / QC / may / đóng / rework…) — theo yêu cầu vận hành. Chỉ **chặn** đơn ĐÃ hủy sẵn (không hủy 2 lần).
- Trước đây gate chặt (chỉ cho hủy khi chưa vào pipeline In hoặc In=`waiting`); đã gỡ theo yêu cầu — Admin toàn quyền hủy (action vốn Admin-only).
- **Lưu ý side-effect:** hủy đơn ĐANG ở stage giữa (Ép/QC/May…) → đơn vẫn nằm trong queue kanban của worker stage đó (my-tasks KHÔNG filter `cancelledAt` để khớp Factory Tab) nhưng **không thao tác được** (transition throw ở `FulfillmentTaskService` khi `cancelledAt`). Worker thấy card "kẹt". Nếu muốn ẩn hẳn khỏi queue worker cần thêm filter `cancelledAt: null` vào `applyTabFilter` (chưa làm — đụng invariant Factory-Tab parity).
- **1 nguồn sự thật:** helper `OrderService.canCancelOrder` (BE) ↔ mirror `apps/web/src/utils/orderActions.ts` (`canCancelOrder` — dùng disable + tooltip). Sửa 1 nơi phải sửa cả 2.

### 16.3 Backend
- `POST /:id/cancel` + `PATCH /:id/design`: `@Auth([SuperAdmin, Admin])` **VÀ** service check lại `assertOrderAdmin(roleName)` (chặn cả Manager) — enforce 2 lớp.
- `cancelOrder`: guard `canCancelOrder` → `BadRequestException(reason)` nếu fail → `$set cancelledAt+cancelReason` → OrderLog `action='cancel'` (before=null, after=reason).
- `updateOrderDesign`: set `mockupUrl`+`mockupOriginalUrl` (nếu gửi) + từng `designs.<k>`+`designsOriginal.<k>` (raw). OrderLog `action='update_design'` before/after = snapshot URL cũ→mới.
- OrderLog enum thêm 2 action: `cancel`, `update_design` (`ORDER_LOG_ACTIONS`) — render nhãn+màu trong `OrderLogTimelineDialog`.
- `ProductionOrderZod` thêm `cancelledAt`/`cancelReason` (FE hiện badge).

### 16.4 Gắn vào bảng
`OrderRowActionsMenu` + badge "Đã hủy" gắn ở: `OrderTableWorkshop`, `OrderFactoryTab` (Tab C), `ErrorLogTab`, `OrdersMiniTable` (Tab B), `PrintOrderTable` (qua `PrintWorkshopView.renderRowAction`), `ListOrderTab`. `onChanged` → refetch bảng tương ứng.

**Cột thao tác PIN CỐ ĐỊNH BÊN PHẢI** (`sticky right-0` + shadow trái) ở **mọi bảng** chứa `OrderRowActionsMenu` — luôn thấy nút "..." + Lịch sử khi cuộn ngang:
- `OrderTableWorkshop` + `PrintOrderTable`: cột action là cột cuối (`sticky right-0`), checkbox + productionId vẫn sticky-left (`left-0`/`left-8`).
- `ListOrderTab` / `ErrorLogTab` / `OrderFactoryTab` / `OrdersMiniTable`: cột action cuối bảng thêm `sticky right-0 z-10 bg-card shadow-[-1px_0_0_0_var(--border)]` (trước đây cột action bình thường, không dính); header thêm `<TableHead sticky right-0>` tương ứng.

### 16.5 Permissions
Dùng **role gate `isAdmin`** (SuperAdmin/Admin) cả FE lẫn BE — KHÔNG thêm permission-catalog. Cancel là **soft** (`cancelledAt`), khác `deleteOrder` (`deletedAt`).

## 17. Ưu tiên đơn hàng + hạn dự kiến từng bước

> **File FE:** `apps/web/src/components/orders/cells/PrioritySelectCell.tsx` (`PrioritySelectCell` + `PriorityBadge` + `PRIORITY_META`), `apps/web/src/utils/priorityEstimate.ts` (`getStageDeadline` + `getActiveStageKey` + `formatCountdown`), `apps/web/src/hooks/useNow.ts` (tick chip đếm ngược), cột "Ưu tiên" (`PriorityCell`) trong `apps/web/src/components/orders/workshopTableConfig.tsx`, cell trong `apps/web/src/pages/orders/ListOrderTab.tsx`, nút + dialog bulk riêng trong `apps/web/src/components/orders/BulkEditToolbar.tsx`, cột hiển thị + filter trong `apps/web/src/pages/home/ToolCheckTab.tsx` (`toPriorityOpts`), badge + estimate trong `apps/web/src/pages/home/DesignerAssignBacklog.tsx`
> **File BE:** `apps/api/src/modules/order/order.entity.ts` (`priority?: OrderPriority`), `apps/api/src/modules/order/order.service.ts` (`FIELD_CONFIG_CATEGORY`/`FIELD_EDIT_ROLES`/`assertPriorityValueValid` + sort `getOrders`/`getOrdersGroupedByType`/`exportOrders`/`getErrorLog`), `apps/api/src/modules/designer/designer-stats.service.ts` (`getToolCheckOverview` — filter `priority` + facet `priorityFacetAgg` + sort; `getAssignBacklog` — projection + map `priority` + sort; `getPersonErrorOrders` sort)
> **Shared:** `packages/shared/enums/order-priority.ts` (`OrderPriority` 1=Ưu tiên/2=Ưu tiên cao/3=Ưu tiên nhất + `ORDER_PRIORITIES` + `ORDER_PRIORITY_LABELS`), `packages/shared/dtos/production-order.dto.ts` (`priority` trong `ProductionOrderZod` + `'priority'` trong `ORDER_WORKSHOP_FIELDS` + `ORDER_PRIORITY_STAGE_ESTIMATE_HOURS` cạnh `LIFECYCLE_STAGE_KEYS` + `priority` trong `GetToolCheckOverviewZod`/`ToolCheckOrderZod`/`ToolCheckOverviewResZod.facets`), `packages/shared/dtos/designer.dto.ts` (`priority` trong `AssignBacklogOrderZod`)
> **API:** tái dùng `PATCH /v1/orders/:id/field` + `PATCH /v1/orders/bulk-field` (field=`priority`) — KHÔNG có endpoint riêng. `GET /designer/tool-check-overview` nhận thêm query `priority` ('1'|'2'|'3').

### 17.1 Overview
3 mức ưu tiên cố định (không qua workshop_config): **Ưu tiên** (1, xanh lam) / **Ưu tiên cao** (2, vàng) / **Ưu tiên nhất** (3, đỏ) — số càng cao càng ưu tiên. Không set = đơn thường (không badge, không estimate, không đẩy lên đầu). Field `priority` được đưa vào `ORDER_WORKSHOP_FIELDS` nên **tái dùng nguyên vẹn** pipeline `updateField`/`bulkUpdateField` (permission gate, audit log, cache invalidate) — chỉ thêm validate riêng (`assertPriorityValueValid`: chỉ nhận `'1'|'2'|'3'`|null) vì đây không phải field workshop_config.

### 17.2 Sửa ưu tiên
- **Danh sách đơn** (`OrderTableWorkshop.tsx`): cột "Ưu tiên" (đầu bảng, cạnh Production ID) — sửa từng dòng qua `PrioritySelectCell`; **bulk gán** qua nút riêng **"Ưu tiên"** (`Flag` icon) trên `BulkEditToolbar` — mirror pattern nút "Gán design" (`UserPlus` → `AssignDesignerDialog`): mở dialog riêng chọn 1 trong 3 mức/bỏ ưu tiên, KHÔNG nằm trong dropdown "Bulk update" chung (field `priority` nằm trong `BULK_UPDATE_BLACKLIST` cùng `assignee`).
- **Tab List** (`ListOrderTab.tsx`): cột "Ưu tiên" tương tự (sửa từng dòng), **không có bulk** (tab này không có cơ chế chọn nhiều dòng).
- **Tab "Soát tool"** (`ToolCheckTab.tsx`, dashboard): chỉ **hiển thị** (`PriorityBadge` + chip đếm ngược, không sửa được ở đây) — cột "Ưu tiên" cạnh "Mã đơn" trong cả 2 list `reworkList`/`unreviewedList` + dropdown filter "Ưu tiên" (4 cột filter cùng hàng với Sản phẩm/Khách hàng/Máy). Estimate tính theo bước `tool-check` (bước đầu `LIFECYCLE_STAGE_KEYS`), mốc `enteredAt` = thẳng `inProductionAt` (không có mốc riêng "vào hàng chờ soát"/"quay lại Support" trong dữ liệu — xem `Orders.md §17.4`). Muốn đổi mức ưu tiên của đơn → sửa ở Danh sách đơn/Tab List.
- Permission: `order.field.priority.view` / `.edit` (permission-catalog, nhóm `order_field`). Fallback hard-code (`FIELD_EDIT_ROLES.priority`): Admin/SuperAdmin/Manager + DesignerLeader.

### 17.3 Sort — đơn ưu tiên lên đầu
`priority: -1` là **sort key đầu tiên** (trước mọi sort/trục nhóm khác) ở **toàn bộ danh sách đơn trong dự án** — đơn KHÔNG có `priority` (missing field) tự nhiên xếp cuối khi sort desc, không ảnh hưởng thứ tự đơn thường:
- `OrderService.getOrders()` (List tab, non-grouped) + nhánh `sort=grouped` (aggregation `$sort` — batch in theo type/size, dùng bởi `OrderFactoryTab`/`PrintOrderTable`/`OrdersMiniTable`: `priority` đứng trước `type`/`__sizeRank` nên đơn ưu tiên trồi lên đầu toàn cục, chấp nhận batch bị chia nhỏ theo type để đơn gấp luôn được in trước) + `exportOrders()` (export "Đơn hàng theo xưởng").
- `OrderService.getOrdersGroupedByType()` (Workshop table — trong từng nhóm type) + client sort `decoratedGroups` (`OrderTableWorkshop.tsx`, cùng comparator trước combo-count).
- `OrderService.getErrorLog()` (tab "Nhật ký bù lỗi") — đứng trước sort theo tuổi lỗi `productionFirstErrorAt`.
- Mọi query kanban: `DesignerTaskService.getMyTasks` (cả 7 cột), `FulfillmentTaskService.getMyTasks`.
- `DesignerStatsService`: `getAssignBacklog()` (backlog "Cần gán"), `getToolCheckOverview()` (2 list `reworkRaw`/`unreviewedRaw` — tab "Soát tool"), `getPersonErrorOrders()` (drill-down "Lỗi theo người").

**Ngoài phạm vi (cố ý không đụng):** `getCancelledOrders()` (dialog đơn đã hủy) — đơn hủy đã ra khỏi mọi công đoạn sản xuất (xem `CancelledOrders-ExcludeFromStages.md`), ưu tiên không còn ý nghĩa vận hành với đơn đã đóng.

### 17.4 Hạn dự kiến từng bước (estimate) — chip đếm ngược
Với đơn CÓ priority, hạn dự kiến của bước hiện tại = **thời điểm đơn VÀO bước đó** (`waitingAt`/`startedAt`/`designerAssignedAt` tuỳ bước) **+ số giờ cấu hình** theo `(priority, bước)` — map `ORDER_PRIORITY_STAGE_ESTIMATE_HOURS` (8 bước theo `LIFECYCLE_STAGE_KEYS`: tool-check/designer/6 stage fulfillment). **Hiện tại đặt đồng loạt 4 tiếng** cho mọi bước/mức (`DEFAULT_STAGE_ESTIMATE_HOURS`) — tinh chỉnh sau bằng cách sửa trực tiếp map, không cần đổi code gọi. Tính deadline thuần FE (`getStageDeadline`, `@/utils/priorityEstimate`).

**Đơn CHƯA chạy bước nào** (`designerStatus` rỗng/`unassigned`, chưa có `currentFulfillmentStage`) — vẫn tính là đang chờ bước `designer` (`getActiveStageKey` coi `unassigned`/thiếu status = `designer`) + dùng **`inProductionAt`** (giờ vào sản xuất) làm mốc `enteredAt` khi field entered-at riêng của bước (`designerAssignedAt`/`waitingAt`...) chưa có — cả 3 nơi hiển thị (`PriorityCell`, `TaskCard`, `FulfillmentTaskCard`) đều fallback `... || inProductionAt`. Nhờ vậy đơn mới import/chưa ai nhận vẫn thấy đếm ngược ngay từ lúc vào sản xuất thay vì trống trơn.

**Hiển thị dạng đếm ngược** (không phải giờ tuyệt đối) — `formatCountdown(deadline, now)` (cùng file `priorityEstimate.ts`) trả `"Còn 2h30p"` / `"Quá hạn 45p"` (đỏ, in đậm); hover vào chip mới thấy mốc giờ tuyệt đối (`HH:mm`) qua `Hint`. `now` tick lại mỗi 30s qua hook `useNow` (`@/hooks/useNow.ts`, `setInterval` + `useState`) để chip tự cập nhật real-time không cần refetch.
- Trong `render()` thuần (không phải component — vd cột `WORKSHOP_COLS`) **KHÔNG được gọi hook trực tiếp** (số hàng đổi → vi phạm Rules of Hooks). Danh sách đơn tách riêng `PriorityCell` (component thật trong `workshopTableConfig.tsx`) rồi `render: (r, ctx) => <PriorityCell row={r} ctx={ctx} />` — Kanban Designer/Fulfillment gọi `useNow` thẳng vì `TaskCard`/`FulfillmentTaskCard` vốn đã là component.

Hiển thị (chip đồng hồ, đỏ nếu quá hạn):
- **Kanban Designer** (`TaskCard.tsx`): bước `designer`, chỉ khi status ∈ {Assigned, InProgress}.
- **Kanban Fulfillment** (`FulfillmentTaskCard.tsx`): bước = `myStage`, chỉ khi status ∈ {Waiting, InProgress}.
- **Danh sách đơn**: cột "Ưu tiên" (`PriorityCell`) tự suy bước hiện tại qua `getActiveStageKey` (ưu tiên `currentFulfillmentStage`, fallback `designer` cho assigned/in-progress/rework/unassigned/thiếu status).
- **Dashboard → backlog "Cần gán designer"** (`DesignerAssignBacklog.tsx`, xem `Dashboard.md §0c`): bước luôn = `designer`, mốc `enteredAt` = thẳng `inProductionAt` (mọi đơn trong backlog này chưa từng chạy bước designer). `useNow` gọi 1 lần ở component cha, truyền `now` xuống từng dòng trong `.map()`.
- **Dashboard → tab "Soát tool"** (`ToolCheckTab.tsx`, xem `ToolCheckWorkflow.md §2.3`): bước luôn = `tool-check`, mốc `enteredAt` = thẳng `inProductionAt` (cả `reworkList` lẫn `unreviewedList` — không có mốc riêng "vào hàng chờ soát"/"quay lại Support"). `renderRow` là closure bên trong component (không phải hàm module-level như `WORKSHOP_COLS`) nên đọc thẳng `now` từ state cha, không cần tách component riêng.
- **Tab List**: KHÔNG hiện estimate (view này không có thông tin bước/stage nào khác để tính mốc).

## 18. Design Review — public API cho tool ngoài duyệt thiết kế

> **File BE:** `apps/api/src/modules/order/order.controller.ts` → `GET /v1/orders/design-review/next` + `POST /v1/orders/design-review/result`, `apps/api/src/modules/order/order.service.ts` → `getNextDesignReviewOrder()` + `setDesignReviewResult()`, `apps/api/src/modules/order/design-review-product-code.ts` (`mapProductTypeToCode()` — bảng mapping cố định `type` → mã sản phẩm)
> **Shared:** `packages/shared/dtos/production-order.dto.ts` (`GetNextDesignReviewOrderZod`/`GetNextDesignReviewOrderDto` + `DesignReviewOrderZod`/`DesignReviewAttributesZod`/`GetNextDesignReviewOrderResDto` + `SetDesignReviewResultZod`/`SetDesignReviewResultResDto`)
> **Route:** không có FE — chỉ API cho hệ thống ngoài gọi.
> **API:** `GET /v1/orders/design-review/next`, `POST /v1/orders/design-review/result`

### 18.1 Overview
2 endpoint **hoàn toàn public** (`@Auth([], [], { public: true })` — không JWT, không API key, theo quyết định người dùng khi tạo tính năng), cho **nhiều client song song** (bot duyệt thiết kế) dùng theo cặp, xoay quanh field **`toolResult`** ("Kết quả Tool", KHÁC `toolResultNote` "Note kq Tool 1" — field đó giờ CHỈ nhân viên sửa tay, ngoài luồng automation này):
1. `GET /design-review/next` — lấy **1 đơn mỗi lần gọi**, luôn là đơn đang ở **bước đầu tiên của tiến trình**: chưa có Kết quả Tool (`toolResult` rỗng) **và** chưa gán designer (`designerStatus='unassigned'`). Query optional `from`/`to` (`YYYY-MM-DD`) lọc thêm theo khoảng ngày `inProductionAt` (VN tz) — cùng semantics `createdFrom`/`createdTo` ở danh sách đơn (§7.0b), chỉ đổi tên field cho gọn vì đây là API public riêng. Không truyền `from`/`to` → không giới hạn ngày (hành vi mặc định, không breaking client cũ).
2. `POST /design-review/result` — sau khi client xử lý xong, gọi lại để lưu **Kết quả Tool** (`toolResult`) — tương đương thao tác tay ở cột "Kết quả Tool" (Danh sách đơn, `/orders?tab=list`). Đơn tự rời khỏi hàng đợi `next` ngay khi `toolResult` được set (không rỗng nữa).

`toolResult` **vẫn được map từ `ProductConfig.toolResult` lúc import** (CSV hoặc API OnosPod — cùng chung pipeline `importOrders()`, khớp theo `type` ↔ `ProductConfig.fullName`), giống mọi field insert-only khác — chỉ set **lần đầu tạo đơn** (`$setOnInsert`, KHÔNG bị ghi đè khi re-import). **Để tạm** như vậy (comment `// Để tạm, tool ổn sẽ xóa không lưu toolResult vào đơn nữa` ở `importOrders()`) — dự định khi tool duyệt thiết kế ổn định sẽ bỏ mapping này để MỌI đơn mới đều tự vào hàng đợi `/next` ngay từ đầu. Trong lúc chờ: đơn nào product config đã có sẵn `toolResult` sẽ KHÔNG vào hàng đợi `/next` (vì điều kiện §18.3 là `toolResult` rỗng) — chỉ đơn chưa map/product config chưa set `toolResult` mới vào hàng đợi.

### 18.2 Chống trùng — claim + lease (nhiều client gọi song song)
`findOne` thuần sẽ bị race (2 client nhận trùng đơn trước khi ai kịp set `toolResult`). Giải quyết bằng **atomic claim**: `getNextDesignReviewOrder()` dùng `findOneAndUpdate` — filter + `$set: { designReviewClaimedAt: now }` chạy atomic per-document ở Mongo, nên 2 request cùng lúc không bao giờ khớp cùng 1 doc.

- Field `OrderEntity.designReviewClaimedAt?: Date` (index) — mốc client claim đơn.
- Filter loại thêm đơn đang trong lease: `designReviewClaimedAt` không tồn tại HOẶC `< now - DESIGN_REVIEW_CLAIM_LEASE_MS`.
- `DESIGN_REVIEW_CLAIM_LEASE_MS` (`order.service.ts`, hiện = **3 phút**) — client xử lý thực tế mất ~1-2 phút, đặt gấp ~1.5x làm buffer. Sửa trực tiếp hằng số này để tinh chỉnh, không cần đổi code gọi.
- Hết lease mà đơn vẫn chưa có `toolResult` (client crash giữa chừng, không kịp báo kết quả) → đơn tự nhả lại cho lần gọi kế tiếp — KHÔNG cần endpoint release/cancel-claim riêng.
- Đơn claim xong nhưng sau đó được set `toolResult` thì bị loại khỏi query bởi điều kiện `toolResult` (không phụ thuộc lease nữa) — không cần clear `designReviewClaimedAt`.

### 18.3 Query + sort
Filter (`getNextDesignReviewOrder(dto)`):
```
deletedAt   không tồn tại
cancelledAt không tồn tại   // đơn hủy loại khỏi mọi công đoạn (quy ước chung)
heldAt      không tồn tại   // đơn đang giữ không đưa cho tool ngoài xử lý
toolResult  rỗng/null   // chưa có Kết quả Tool
designerStatus  = 'unassigned'
designReviewClaimedAt  không tồn tại HOẶC quá hạn lease (§18.2)
inProductionAt  trong [vnDayStart(dto.from), vnDayEnd(dto.to)]  // CHỈ áp khi dto.from hoặc dto.to có giá trị
```
Sort: `priority desc` → `inProductionAt asc` → `createdAt asc` (đơn ưu tiên cao trước; cùng mức ưu tiên thì đơn nhập sản xuất trước lấy trước). `findOneAndUpdate` + implicit limit 1 + `new: true` (trả doc SAU khi claim).

### 18.4 Response shape
```ts
{
  success: true,
  data: {
    productionId: string;          // khóa duy nhất, luôn có — dùng để gọi lại POST /design-review/result
    orderId?: string;              // mã đơn marketplace/sàn (import từ sheet) — có thể rỗng với 1 số đơn
    productCode: string | null;    // map từ `type` qua bảng cố định trong design-review-product-code.ts, null nếu type không khớp bảng
    attributes: { size?: string; color?: string };
    designs: DesignFields;        // chỉ các key có URL (front/back/sleeve/...), raw Drive URL (R2 pipeline đang tắt — xem ImageOptimization.md)
  } | null;   // null khi không còn đơn nào ở bước đầu tiên
  remaining: number;   // tổng số đơn còn cần xử lý (đúng điều kiện §18.3, KHÔNG xét claim/lease) — bao gồm cả đơn trong `data`, đếm bằng countDocuments() song song (Promise.all) với findOneAndUpdate
}
```

### 18.5 Bảng mapping `type` → `productCode`
Bảng cố định trong `design-review-product-code.ts` (`PRODUCT_TYPE_CODE_MAP`, so khớp case-insensitive theo `ProductConfig.fullName`/`OrderEntity.type`) — sửa/thêm mã trực tiếp trong file này, không cần đổi code gọi.

### 18.6 `POST /design-review/result` — lưu Kết quả Tool

Body request (`SetDesignReviewResultDto`, `packages/shared/dtos/production-order.dto.ts`):

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `productionId` | `string` | Có | Mã đơn — khóa duy nhất, luôn có, exact match case-insensitive (giống `by-production-id/:code`). KHÁC `orderId` (mã đơn marketplace gốc, KHÔNG unique vì 1 đơn có thể nhiều line item) — cố tình dùng `productionId` để tránh nhầm đơn khi update. |
| `toolResult` | `string \| null` | Có | Code `workshop_config` category `tool_result`. `null` = xoá giá trị hiện có. |

`productionId` không khớp đơn nào → 404. `toolResult` không khớp code `workshop_config` category `tool_result` đang active → 400.

**KHÔNG có `toolResultNote`** ("Note kq Tool 1") trong request/response của endpoint này — field đó chỉ nhân viên sửa tay qua Danh sách đơn/tab "Soát tool" (Dashboard), ngoài phạm vi automation.

**Giá trị mẫu hiện có** (seed `workshop-config.seed.ts` — admin có thể thêm code mới qua trang Workshop Config, đây không phải enum cứng):

| Field | Code mẫu | Nhãn |
|---|---|---|
| `toolResult` | `has-tool` | Có Tool |
| `toolResult` | `no-tool` | Không có Tool |

Request mẫu:
```json
POST /v1/orders/design-review/result
{
  "productionId": "RR-03884-24456",
  "toolResult": "has-tool"
}
```

Response mẫu (`SetDesignReviewResultResDto` — `data` = `ProductionOrderZod` đầy đủ của đơn SAU khi cập nhật, rút gọn các field liên quan):
```json
{
  "success": true,
  "data": {
    "productionId": "RR-03884-24456",
    "toolResult": "has-tool",
    "toolResultNote": null,
    "designerStatus": "unassigned"
  }
}
```

**Cơ chế:** `setDesignReviewResult()` resolve `productionId` → `_id` (exact match case-insensitive, giống `getByProductionId`), rồi gọi lại **nguyên vẹn** `updateField()` (field `toolResult` — cùng hàm dùng cho sửa tay ở Danh sách đơn) với role giả `SuperAdmin` để bypass permission gate (roleName chỉ được đọc ở đúng chỗ đó bên trong `updateField`, không ảnh hưởng business logic khác). Khác `toolResultNote`, field `toolResult` **KHÔNG có side-effect hook nào** trong `updateField` (không đụng `readyForFulfill`, không auto-assign designer, không rework-back) — chỉ là 1 field workshop_config đơn thuần. `assertNotHeld` vẫn chạy (đơn đang giữ → 409).

### 18.7 Performance
1 `findOneAndUpdate` (GET `/next`) với index sẵn có trên `toolResultNote`/`designerStatus`/`priority`/`cancelledAt`/`heldAt`/`designReviewClaimedAt` (đều đã đánh index ở `order.entity.ts`) — không cần index tổng hợp riêng vì volume đơn ở bước đầu tiên thường nhỏ. POST `/result` tái dùng `updateField()` nên chi phí giống hệt sửa tay 1 cell (1-2 lần gọi tuần tự tùy số field truyền).

## 19. "Không xác định xưởng" — tách đơn chưa map xưởng khỏi hệ thống (menu tạm)

> **Mục tiêu:** Đơn không có `factoryId` (không khớp Product Config lúc import, và không có Customer Override cứu — xem `importOrders()`) trước đây bị trộn lẫn vào mọi view. Nay bị **loại trừ mặc định** khỏi toàn bộ Danh sách đơn / Dashboard / task Designer / Fulfillment override view / Nhật ký bù lỗi / Soát tool / Lỗi theo người — chỉ xem được qua 1 menu tạm riêng.

### 19.1 Cơ chế lọc (backend)
- Không có entity field mới — vẫn dùng `factoryId` missing/null như trước, qua filter param sẵn có `unmapped: z.coerce.boolean()` trong `GetProductionOrdersZod` (`production-order.dto.ts`).
- `order.service.ts` → `buildVisibilityFilter()` (dùng chung bởi `getOrders`/`getOrdersGroupedByType`, `getStatusOverview`, `getDesignerBreakdown`, `getDesignerBacklog`): thêm `factoryId: { $exists: true, $ne: null }` mặc định, **trừ khi** `dto.unmapped === true` (trang mới opt-in xem CHỈ đơn unmapped qua chính flag này).
- Áp cùng pattern (`factoryId: { $exists: true, $ne: null }` vào base match) cho các hàm không dùng chung `buildVisibilityFilter`: `getDashboard`, `getLifecycleOverview`, `getCancelledOrders`, `getErrorLog` (`order.service.ts`); `getMyTasks`/`buildMyTaskBase` nhánh override-role (`fulfillment-task.service.ts`); `getToolCheckOverview`, `getPersonErrorOverview`, `getStageErrorDaily`, `getAssignBacklog`, `getDailyOverview`, `getErrorStats` (`designer-stats.service.ts`).
- **Không đụng** `designer-task.service.ts` (`getMyTasks`/`buildMyTaskFilter`) — chỉ lọc theo `assignee` (đơn ĐÃ gán); đơn unmapped không có `factoryId` nên auto-assign (`designer-assignment.service.ts`) không bao giờ set `assignee` cho nó.
- `getFactoryOverview` (tab Dashboard "Đơn hàng theo xưởng"): bỏ hẳn `unmappedCount`/`totals.unmapped` (không còn tiêu thụ ở FE) — `matchMapped`/`cardMatch` giữ nguyên logic cũ (đã đúng từ trước).

### 19.2 Endpoint tái dùng (không có route mới)
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/v1/orders?unmapped=true` | `getOrders` — trả đúng tập đơn chưa map xưởng, tái dùng nguyên vẹn. |
| PATCH | `/v1/orders/bulk-assign` | `bulkAssignOrders` (`BulkAssignOrderDto`) — gán xưởng + fabric/machine/tool mặc định ban đầu cho đơn đã chọn. |

### 19.3 Frontend
- Trang: `apps/web/src/pages/orders/unmapped/index.tsx` (route `PATHS.ORDERS_UNMAPPED = '/orders/unmapped'`). Guard quyền y hệt `scan-error`: `!isAdmin && !has('page.unmapped_factory')` → `<Navigate to={PATHS.ORDERS} />`.
- Tái dùng nguyên bộ component bảng workshop: `WORKSHOP_COLS`/`buildColGroups`/`GroupCellContent` (`workshopTableConfig.tsx`), `OrderFilterBar`, `OrderRowActionsMenu`, `PaginationBar`, `ImagePreviewDialog`, `OrderLogTimelineDialog` — không viết bảng mới.
- Dialog "Gán xưởng" được **extract** từ `OrderFactoryTab.tsx` (trước đây gắn với chip "Chưa xác định xưởng" đã bỏ) sang `apps/web/src/components/orders/AssignFactoryDialog.tsx` — tự fetch danh sách xưởng qua `RepositoryRemote.factory.getFactories()` (không còn phụ thuộc `getFactoryOverview`). Nút "Gán xưởng" (đơn lẻ + bulk) gate bởi `isAdmin || has('order.transfer')`.
- Sidebar: child "Không xác định xưởng" trong group "Quản lý đơn" (`Sidebar.tsx`, icon `MapPin`), gate `perm: 'page.unmapped_factory'`.

### 19.4 Permissions
- `page.unmapped_factory` (mới, group `page`) — Admin/SuperAdmin/Manager có sẵn qua `ALL_PERMISSION_CODES`; Support được cấp thêm trong `DEFAULT_ROLE_PERMISSIONS` (kèm `order.transfer` để nút "Gán xưởng" hiện ra — trước đó Support không có quyền này).
