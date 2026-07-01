# Kế hoạch — Filter ngày + Bảng "Cần gán designer" (gom theo sản phẩm)

> **Trạng thái:** ✅ ĐÃ IMPLEMENT (endpoint `GET /v1/designer/assign-backlog` + `DesignerAssignBacklog.tsx` + switcher 7/14/30 ở filter bar). Doc: `Dashboard.md` §0/§0c + `DesignerTaskWorkflow.md`.
> **Vị trí:** Dashboard → tab Designer (`DesignerStatsTab.tsx`), dưới bảng `DesignerDailyOverview`.
> **Liên quan:** `Dashboard.md` Tab D, `DesignerTaskWorkflow.md`, `Products.md` (mockup/level), `workshopTableConfig.tsx`, `AssignDesignerDialog.tsx`.

---

## 0. Chốt từ user

1. **Filter ngày:** **Chuyển switcher 7/14/30 lên thanh Bộ lọc chung** (top), điều khiển **CẢ 2 bảng** — `DesignerDailyOverview` (bỏ switcher nội bộ) + bảng mới. (KHÔNG áp StatusBarCharts/TeamDailyMatrix — chúng giữ control riêng.) → endpoint giữ param `days` (KHÔNG cần đổi sang from/to).
2. **Pool đơn bảng mới:** `toolResultNote` **đã soát (có giá trị) & ≠ ok** (KHÔNG gồm null/rỗng chưa soát) **VÀ** (`unassigned` **hoặc** `rejected` **hoặc** `rework chưa ôm` = rework + `assignee` rỗng).
3. **Đơn trong sản phẩm:** hiển thị **rút gọn read-only + ảnh** (không dùng full WORKSHOP_COLS editable).
4. **Gom nhóm:** theo `order.type`; đơn **chưa map** (không có `productConfigId`) dồn vào 1 nhóm **"Chưa map"**.
5. **Volume:** v1 trả toàn bộ compact rows 1 lần (thu/mở chỉ là UI) — đã duyệt.

---

## 1. Phần A — Filter ngày (switcher 7/14/30 ở Bộ lọc chung)

**FE `DesignerStatsTab.tsx`:**
- Thêm **switcher 7/14/30** (3 nút) vào thanh Bộ lọc chung cạnh Sản phẩm/Khách hàng. State `rangeDays` (mặc định 7).
- Truyền `days={rangeDays}` xuống `DesignerDailyOverview` + `DesignerAssignBacklog`.

**Đổi `DesignerDailyOverview`:**
- **Bỏ switcher 7/14/30 nội bộ** — nhận `days` từ props (parent điều khiển). Không đổi endpoint (vẫn `?days=`).

---

## 2. Phần B — Bảng "Cần gán designer"

### 2.1 Endpoint mới `GET /v1/designer/assign-backlog`
- **Query:** `days=7|14|30` (mặc định 7), `type?`, `customer?`.
- **Auth:** `LEADER_ROLES` (gồm Designer, như các endpoint designer-stats khác).
- **Controller/Service:** `designer-stats.controller.ts` + `designer-stats.service.ts` → `getAssignBacklog(rangeDays,type,customer)`.
- **Match:**
  ```
  inProductionAt ∈ [today-(N-1) .. today]
  toolResultNote ∉ [null, '', 'ok']         // đã soát & khác ok (KHÔNG gồm chưa soát)
  $or: [
    { designerStatus: 'unassigned' },
    { designerStatus: 'rejected' },
    { designerStatus: 'rework', $or:[{assignee:null},{assignee:{$exists:false}}] },
  ]
  (+ type, + userSku nếu có filter)
  ```
- **Gom nhóm:** theo `productConfigId` (mapped) → resolve `fullName/shortName/mockup/level` từ `productConfigs`; đơn không có `productConfigId` → nhóm `key='unmapped'` tên "Chưa map".
- **Response:**
  ```ts
  {
    groups: {
      key: string;                 // productConfigId | 'unmapped'
      fullName: string;            // productConfig.fullName | 'Chưa map'
      shortName?: string;
      mockup?: string;             // ảnh sản phẩm (ProductConfig)
      level?: number;              // 1..10
      count: number;
      orderIds: string[];          // toàn bộ id trong nhóm (cho chọn-cả-nhóm + assign)
      orders: {                    // rút gọn read-only
        _id: string;
        productionId: string;
        userSku?: string;
        size?: string;
        color?: string;
        type?: string;
        mockupUrl?: string;
        designs?: { front?: string } & Record<string,string|undefined>;
        designsStatus?: Record<string,'pending'|'ready'|'failed'>;
        toolResultNote?: string;
        designerStatus?: string;
        inProductionAt?: string;
      }[];
    }[];
    total: number;                 // tổng đơn cần gán
    days: string[];                // ngày trong window (nếu cần)
    rangeDays: number;
  }
  ```
- Sort groups theo `count` desc; nhóm "Chưa map" xuống cuối.
- **Tái dùng cách làm** của `getOrdersGroupedByType` (agg group + `findAll` + re-attach), thêm populate/lookup `productConfig` để lấy mockup/level.

> **Lưu ý volume:** trả toàn bộ compact rows upfront, expand/collapse chỉ là UI. Nếu backlog quá lớn → chuyển lazy-load orders theo nhóm (endpoint 2) sau. Ghi nhận, chưa làm.

### 2.2 Shared DTO (`designer.dto.ts`)
- `GetAssignBacklogZod` = `{ days: enum(['7','14','30']).default('7'), type?, customer? }` + DTO class.
- `AssignBacklogOrderZod` (compact), `AssignBacklogGroupZod`, `GetAssignBacklogResZod` + ResDto.
- `GetDailyOverviewZod` **giữ nguyên** (`days`) — không đổi.
- **Rebuild shared** + **restart API** (Pitfall #5/#6).

### 2.3 FE service (`services/designer.ts`)
- `assignBacklog({ days?, type?, customer? })`.

### 2.4 FE component `DesignerAssignBacklog.tsx` (mới)
- **Props:** `{ days?, type?, customer?, reloadToken?, onAssigned?: () => void }`.
- Fetch `assignBacklog`, seq-guard. Header card + tổng số đơn cần gán.
- **Accordion sản phẩm:** mỗi group 1 hàng header:
  - Checkbox chọn-cả-nhóm (tristate: full/none/partial theo selection).
  - Nút thu/mở (chevron).
  - **Ảnh mockup** thumbnail (click → `ImagePreviewDialog` phóng to). Không có → placeholder.
  - **Badge level** (màu từ `PRODUCT_LEVEL_MAP`).
  - Tên sản phẩm (`fullName`) + `count` đơn.
- **Mở nhóm →** bảng đơn rút gọn: `checkbox | ảnh design (DesignThumbsCell/ImageThumbCell — zoom) | productionId (+CopyButton) | size·color | Note Tool (badge) | Trạng thái designer (badge)`.
- **Selection:** `Set<orderId>`. Checkbox nhóm toggle toàn bộ `orderIds` của nhóm (kể cả khi chưa mở). Checkbox từng đơn.
- **Toolbar (sticky, hiện khi có chọn):** "Gán design (N)" → mở `AssignDesignerDialog` (`selectedIds={[...selection]}`) — **tái dùng nguyên** preview + `bulk-assign-designer`.
- **onApplied (sau gán):** clear selection → refetch bảng này → gọi `onAssigned()` để **bump token refetch `DesignerDailyOverview`** (cập nhật số Tổng tồn/Chưa gán bên trên).

### 2.5 Wiring `DesignerStatsTab.tsx`
- Thêm state `rangeDays` (7/14/30) + **switcher 7/14/30** trong card Bộ lọc chung.
- State `assignReloadToken` — bump trong `onAssigned` + trong `fetchAll` (Refresh).
- **Render order (mới):** Bộ lọc chung (+ switcher 7/14/30) → **DesignerDailyOverview** (`days`) → **DesignerAssignBacklog** (`days`, onAssigned bump overview) → StatusBarCharts → TeamDailyMatrix → Period switcher → Leaderboard → Timeline → Error pie.

---

## 3. Tái dùng
| Cần | Dùng lại |
|-----|----------|
| Gán bulk + preview | `AssignDesignerDialog` (`selectedIds`, `onApplied`) → `bulkAssignDesignerPreview` + `bulk-assign-designer` |
| Ảnh design zoom | `DesignThumbsCell` / `ImageThumbCell` (workshop cells) |
| Ảnh mockup sản phẩm zoom | `ImagePreviewDialog` (`open`,`url`) |
| Level màu | `PRODUCT_LEVELS` / `PRODUCT_LEVEL_MAP` (shared) |
| Gom theo type | pattern `getOrdersGroupedByType` (order.service) |

---

## 4. Edge cases / lưu ý
- **note ≠ ok = đã soát & khác ok:** `toolResultNote ∉ [null,'','ok']` → đơn CHƯA soát KHÔNG vào pool.
- **rework chưa ôm:** chỉ rework + `assignee` rỗng (rework đang có người ôm KHÔNG vào pool — người đó tự làm).
- **Cập nhật số sau gán:** gán xong → refetch cả bảng backlog + overview (token). Con số Tổng tồn/Chưa gán bên trên phải giảm tương ứng.
- **Đơn "Chưa map":** không có mockup/level → header placeholder; vẫn gán được.
- **Overview:** chỉ bỏ switcher nội bộ, nhận `days` từ parent — endpoint không đổi.
- **Volume lớn:** cân nhắc lazy-load orders theo nhóm nếu chậm (chưa làm ở v1).
- **AssignDesignerDialog** tự skip đơn không hợp lệ (in-progress/done/ok/rework-held) — pool đã lọc sẵn nên hầu hết eligible; vẫn giữ banner cảnh báo của dialog.

---

## 5. Doc cần update (khi implement)
- `Dashboard.md` Tab D — thêm section bảng "Cần gán designer" + filter ngày + đổi overview sang from/to.
- `DesignerTaskWorkflow.md` — endpoint `GET /v1/designer/assign-backlog` + cập nhật `daily-overview` (from/to).

---

## 6. Checklist implement
1. [ ] Shared DTO: `GetAssignBacklogZod`/Res → build shared. (`GetDailyOverviewZod` giữ nguyên.)
2. [ ] Service `getAssignBacklog(rangeDays,type,customer)`.
3. [ ] Controller: `GET designer/assign-backlog`.
4. [ ] FE service `assignBacklog({days,type,customer})`.
5. [ ] Component `DesignerAssignBacklog.tsx` (accordion + selection + AssignDesignerDialog).
6. [ ] Sửa `DesignerDailyOverview.tsx` (bỏ switcher nội bộ, nhận `days` từ props).
7. [ ] Wire `DesignerStatsTab.tsx` (switcher 7/14/30 ở filter bar + render order + token refetch overview sau gán).
8. [ ] Typecheck BE/FE (giữ baseline), rebuild shared, restart API.
9. [ ] Update 2 doc FunctionDescription.
10. [ ] QA: gán thử → số Tổng tồn/Chưa gán bên trên giảm; nhóm Chưa map hoạt động; ảnh mockup/design zoom.
