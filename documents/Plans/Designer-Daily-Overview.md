# Kế hoạch — Bảng "Tổng quan Designer theo ngày" (Dashboard tab Designer)

> **Trạng thái:** 📋 PLAN — chưa implement. Chỉ code khi user xác nhận "implement".
> **Vị trí:** Dashboard → tab Designer (`apps/web/src/pages/home/DesignerStatsTab.tsx`).
> **Liên quan:** `Dashboard.md` Tab D, `DesignerTaskWorkflow.md`, ma trận `TeamDailyMatrix.tsx`, biểu đồ `StatusBarCharts.tsx`.

---

## 1. Mục tiêu

Thêm 1 bảng nhỏ tổng hợp **4 hàng × N ngày** (N = 7/14/30, mặc định 7), cột = ngày (past→present, trái→phải), để leader/admin thấy nhanh sức khỏe pipeline designer theo ngày.

| Hàng | Ý nghĩa (mỗi ô = 1 ngày) |
|------|--------------------------|
| **1. Tổng đơn** | **Tất cả đơn** có `inProductionAt` trong ngày — **bất kể trạng thái nào** (không lọc assignee, không lọc designerStatus/toolResultNote) |
| **2. Chưa soát** | Đơn có `toolResultNote` rỗng/null (chưa soát tool) |
| **3. Tổng lỗi** | Đơn có `toolResultNote` đã set & ≠ `'ok'`. Hover/expand → breakdown theo từng mã note (mỗi note ≠ ok = 1 dòng + count) |
| **4. Tổng tồn** | Đơn **chưa `done`** = **unassigned + assigned + in-progress + rework + rejected** (= tổng đơn − đã xong). **Click hàng → xổ bảng con**: từng designer còn tồn ở trạng thái nào + 1 dòng riêng **"Chưa gán" (unassigned)** (ẩn designer tồn = 0) |

- **Switcher 7/14/30 ngày** riêng cho bảng (state nội bộ, độc lập period switcher của tab) — giống `TeamDailyMatrix`.
- **Áp bộ lọc chung** sản phẩm (`type`) + khách hàng (`userSku`) ở đầu tab (props `type`/`customer`, thêm vào deps refetch).
- **Vị trí:** render **TRÊN CÙNG** tab — section data đầu tiên (ngay dưới card "Bộ lọc chung", trên `StatusBarCharts` + `TeamDailyMatrix`).

---

## 2. Định nghĩa số liệu (chốt với user)

| Khái niệm | Định nghĩa chính xác trong code |
|-----------|---------------------------------|
| Ngày | `$dateToString(inProductionAt, tz '+07:00')` — **giống ma trận** (snapshot theo ngày vào SX) |
| `'ok'` | `READY_FOR_FULFILL_CODE = 'ok'` (`order.service.ts:171`) |
| Chưa soát | `toolResultNote` ∈ {null, '', chưa tồn tại} |
| Lỗi | `toolResultNote` tồn tại & ≠ `''` & ≠ `'ok'` |
| Tồn (backlog) | `designerStatus ≠ done` = **unassigned + assigned + in-progress + rework + rejected** (mọi đơn chưa hoàn thành, GỒM trả lại + chưa gán). = `total − doneCount`. Định nghĩa này **rộng hơn** `unfinished` của `TeamDailyMatrix` (matrix chỉ đếm assigned+rework+in-progress). |

- **Tổng đơn / Chưa soát / Tổng lỗi / Tổng tồn:** đều tính trên **mọi đơn** trong window (không cần assignee).
- **Bảng con per-designer:** các trạng thái CÓ assignee (assigned/in-progress/rework/rejected) gom theo `assignee`; **unassigned** không có designer → gom vào 1 dòng riêng "Chưa gán".

---

## 3. API mới

`GET /v1/designer/daily-overview`

**Query:** `days=7|14|30` (default 7), `type?` (order.type), `customer?` (order.userSku).
**Auth:** `LEADER_ROLES` (SuperAdmin/Admin/Manager/DesignerLeader + Designer — giống các endpoint designer-stats khác).
**Controller:** `apps/api/src/modules/designer/designer-stats.controller.ts` (thêm endpoint).
**Service:** `apps/api/src/modules/designer/designer-stats.service.ts` → `getDailyOverview(rangeDays, type?, customer?)`.

**Response shape:**
```ts
{
  days: string[];                         // YYYY-MM-DD, mới→cũ (FE reverse để hiển thị cũ→mới)
  rows: {
    day: string;
    total: number;                        // tất cả đơn inProductionAt ngày đó (mọi trạng thái)
    unreviewed: number;                   // toolResultNote null/''
    error: number;                        // toolResultNote set & != 'ok'
    errorByNote: { code: string; count: number }[];  // breakdown non-ok, sort count desc
    backlog: number;                      // designerStatus != done (unassigned+assigned+in-progress+rework+rejected)
    unassigned: number;                   // riêng số đơn unassigned trong ngày (subset của backlog)
  }[];
  // Tồn per-designer trên TOÀN window (cho bảng con expand hàng "Tổng tồn")
  backlogByDesigner: {
    userId: string;
    fullName: string;
    email?: string;
    assigned: number;
    inProgress: number;
    rework: number;
    rejected: number;                     // trả lại
    total: number;                        // = assigned+inProgress+rework+rejected, chỉ trả khi >0
  }[];                                     // sort total desc
  // Đơn chưa gán (unassigned) — không thuộc designer nào → dòng riêng "Chưa gán" trong bảng con
  unassignedBacklog: number;              // tổng unassigned trên toàn window
  columnTotals: { total: number; unreviewed: number; error: number; backlog: number };
  rangeDays: number;
}
```

---

## 4. Backend — aggregation (phác thảo)

Window: `vnStart(today-(N-1))` .. `vnEnd(today)`; match `inProductionAt ∈ [start,end]` + (nếu có) `type`, `userSku`.

**(a) rows** — 1 `$group` theo ngày với `$sum`/`$cond`:
```
total:      { $sum: 1 }                                   // mọi đơn, mọi trạng thái
unreviewed: { $sum: { $cond: [ { $in: ['$toolResultNote', [null, '']] }, 1, 0 ] } }
error:      { $sum: { $cond: [ { $and: [ note not in [null,''], note != 'ok' ] }, 1, 0 ] } }
backlog:    { $sum: { $cond: [ { $ne: ['$designerStatus', 'done'] }, 1, 0 ] } }   // tất cả chưa done
unassigned: { $sum: { $cond: [ { $eq: ['$designerStatus', 'unassigned'] }, 1, 0 ] } }
```
Fill 0 cho ngày trống, sort ngày mới→cũ (đồng bộ style với `getTeamDailyBreakdown`).

**(b) errorByNote** — `$group` theo `{ day, toolResultNote }` (match note set & ≠ 'ok') → gom vào từng ngày. Có thể dùng `$facet` chung pipeline hoặc query riêng.

**(c) backlogByDesigner** — `$group` theo `{ assignee, designerStatus }` (match `designerStatus ∈ [assigned,in-progress,rework,rejected]` + `assignee != null` + window) → map per-designer {assigned,inProgress,rework,rejected}. Resolve `fullName/email` từ `users` (giống `getTeamDailyBreakdown`, tái dùng lookup Designer team + nameMap). Chỉ trả designer total>0, sort total desc.

**(d) unassignedBacklog** — `$sum` số đơn `designerStatus = 'unassigned'` trong window (không group theo designer). Hiển thị dòng riêng "Chưa gán" trong bảng con.

> **Tái dùng:** logic tồn + resolve tên **trùng** với `getTeamDailyBreakdown`. Có thể extract helper chung (vnStart/vnEnd/vnToday, nameMap) — cân nhắc lúc implement, tránh copy-paste.

---

## 5. Shared DTO

`packages/shared/dtos/designer.dto.ts` — thêm:
- `GetDailyOverviewZod` = `{ days: enum(['7','14','30']).default('7'), type?, customer? }` + DTO class.
- `DailyOverviewRowZod`, `DailyOverviewBacklogDesignerZod`, `GetDailyOverviewResZod` + ResDto.
- Nhớ **rebuild shared** (`pnpm --filter shared build`) + **restart API** (Pitfall #5, #6).

---

## 6. Frontend

**Component mới:** `apps/web/src/pages/home/DesignerDailyOverview.tsx`
- Props: `{ reloadToken?, type?, customer? }`.
- State nội bộ: `range` (7/14/30), `expanded` (bool cho hàng Tồn), `data`, `loading`, seq-guard.
- Fetch `RepositoryRemote.designer.dailyOverview({ days, type, customer })`; **reverse** `days` + `rows` để hiển thị cũ→mới (giống `TeamDailyMatrix`).
- Bảng: cột trái = tên hàng (Tổng đơn / Chưa soát / Tổng lỗi / Tổng tồn), cột phải = từng ngày. Footer/cột cuối = tổng (columnTotals).
- **Hàng Tổng lỗi:** mỗi ô có tooltip (Radix `Hint forceRich` + `TooltipProvider`, giống matrix) show `errorByNote` (resolve code→name qua `workshopConfigStore`).
- **Hàng Tổng tồn:** click toggle `expanded` → render bảng con `backlogByDesigner` (designer × [Cần làm/Đang làm/Làm lại/**Trả lại**], ẩn designer total=0) + **1 dòng cuối "Chưa gán"** = `unassignedBacklog` (không thuộc designer nào).
- Màu trạng thái đồng bộ: assigned zinc `#71717A`, in-progress indigo `#6366F1`, rework amber `#F59E0B`, **rejected rose `#F43F5E`**, unassigned slate `#94A3B8`, done emerald `#10B981`.

**Service:** `apps/web/src/services/designer.ts` → `dailyOverview({ days?, type?, customer? })` (giống `teamDailyBreakdown`).

**Wiring:** `DesignerStatsTab.tsx` — render `<DesignerDailyOverview reloadToken={matrixToken} type={filterType||undefined} customer={filterCustomer||undefined} />` **TRÊN CÙNG** khối data: ngay dưới card "Bộ lọc chung", **trên** `StatusBarCharts` + `TeamDailyMatrix`. Render order mới: Bộ lọc chung → **DesignerDailyOverview** → StatusBarCharts → TeamDailyMatrix → Period switcher → Leaderboard → Timeline → Error pie.

---

## 7. Edge cases / lưu ý

- **30 ngày:** 30 cột → cuộn ngang (giống matrix `overflow-x-auto`). OK.
- **errorByNote nhiều mã:** giới hạn hiển thị trong tooltip; sort count desc.
- **toolResultNote code → tên:** FE resolve qua `workshopConfigStore` (category tool_result_note). Nếu code không có trong store → hiển thị raw code.
- **backlog KHÁC matrix unfinished:** hàng Tồn (= total − done, gồm rejected+unassigned) **rộng hơn** `TeamDailyMatrix.columnTotals.unfinished` (chỉ assigned+rework+in-progress). QA: `backlog = unfinished(matrix) + rejected + unassigned` cùng ngày.
- **Tổng tồn = Tổng đơn − Đã xong.** Subset assigned+in-progress+rework của bảng con phải khớp matrix.
- **Tổng đơn = chưa soát + lỗi + (đã ok):** total theo toolResultNote = unreviewed + error + ok-count. Có thể thêm dòng phụ "Đã ok" nếu cần (hiện KHÔNG yêu cầu).
- **Filter chung:** `type`/`customer` áp cho **cả 4 hàng** (thêm vào `$match`).
- **Auth:** endpoint cho phép cả `RoleType.Designer` (tab đã mở cho sub-designer).

---

## 8. Doc cần update (khi implement)

- `documents/FunctionDescription/Dashboard.md` — Tab D: thêm section bảng tổng quan + render order + endpoint.
- `documents/FunctionDescription/DesignerTaskWorkflow.md` — bảng endpoint: thêm `GET /v1/designer/daily-overview` + API list.

---

## 9. Checklist thứ tự implement

1. [ ] Shared DTO (`designer.dto.ts`) + `pnpm --filter shared build`.
2. [ ] Service `getDailyOverview()` + aggregation (rows + errorByNote + backlogByDesigner).
3. [ ] Controller endpoint `GET designer/daily-overview` (`@Auth(LEADER_ROLES)`).
4. [ ] FE service `dailyOverview()`.
5. [ ] Component `DesignerDailyOverview.tsx` (bảng 4 hàng + switcher + tooltip lỗi + expand tồn).
6. [ ] Wire vào `DesignerStatsTab.tsx` (props filter + reloadToken).
7. [ ] Typecheck BE/FE (giữ baseline), rebuild shared, **restart API**.
8. [ ] Update 2 doc FunctionDescription.
9. [ ] QA: đối chiếu hàng Tồn với `TeamDailyMatrix`, total = unreviewed+error+ok.
