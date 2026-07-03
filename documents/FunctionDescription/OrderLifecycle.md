# Vòng đời đơn hàng (Order Lifecycle Dashboard) — Function Description

> **File FE:** `apps/web/src/pages/home/LifecycleTab.tsx` (tab chi tiết trong `apps/web/src/pages/home/index.tsx`) + `apps/web/src/pages/home/LifecycleStrip.tsx` (strip gọn trên đầu Dashboard)
> **File BE:** `apps/api/src/modules/order/order.service.ts` → `getLifecycleOverview()` + `getLifecycleTrack()`; `order.controller.ts` → `GET /v1/orders/lifecycle-overview` + `GET /v1/orders/lifecycle-track/:code`
> **Route:** `/` (Dashboard) → strip luôn hiện trên đầu + tab `?tab=lifecycle`
> **API:** `GET /v1/orders/lifecycle-overview`, `GET /v1/orders/lifecycle-track/:code`

## 1. Overview

Dashboard thống kê **vòng đời đơn** theo 9 chặng tuần tự — cho biết tại mỗi
công đoạn hiện đang **chứa** bao nhiêu đơn (chờ), **đang làm** bao nhiêu, **lỗi**,
**rework**, **thời gian hoàn thành trung bình**, và **throughput** (số hoàn thành
trong kỳ).

Phễu 9 chặng:

```
Soát tool → Thiết kế → In → Ép → QC sau ép → QC phân hàng → May vào → May ra → Đóng hàng → ✅ Hoàn thành
(support)   (designer)  └────────────────── 7 stage Fulfillment ──────────────────┘
```

- **Mọi tài khoản** đều thấy vòng đời đơn (strip gọn trên đầu + tab chi tiết);
  tài khoản `Fulfillment` gắn xưởng tự **khóa theo xưởng** (BE), role khác thấy
  toàn bộ (xem §7).
- **Strip** (`LifecycleStrip`) hiện trên đầu Dashboard, trên MỌI tab — không cuộn ngang:
  - **Hàng điều khiển tách riêng:** tiêu đề + ô tra cứu `productionId` + nút **"Nhiều mã"** + `DateRangePicker`.
  - **Tra cứu nhiều mã:** nút "Nhiều mã" (`ListChecks`) mở `BulkProductionIdDialog` (mode=`lookup`,
    `apps/web/src/components/orders/BulkProductionIdDialog.tsx`). Dán nhiều `productionId` (mỗi mã 1 dòng) →
    "Tìm" → gọi `GET /orders?productionIds=<CSV>` → bảng tóm tắt trong modal (Production ID · Sản phẩm ·
    Chặng · Trạng thái) + cảnh báo mã không tìm thấy. Click 1 dòng → set `pid`/`debouncedPid` = mã đó →
    strip chuyển sang hành trình đơn đó.
  - **Hàng phễu:** card **"Tổng đơn tất cả"** (`totals.totalOrders` + Đang chạy `totalActive` /
    Xong kỳ `completedInRange`) → 9 chặng. Mỗi card chặng: **Tổng đơn** (= Chờ + Làm + Lại,
    đơn đang ở chặng) + 4 chỉ số nhỏ **Chờ** (`backlog`) / **Làm** (`inProgress`) /
    **Lại** (`rework`) / **Xong** (`passedTotal`). Card bottleneck viền hổ phách.
  - Nhập `productionId` → hành trình riêng của đơn đó (đã qua ✓ / đang ở ● / chưa tới ○ /
    lỗi ✕ / rework ↻); ẩn date filter, hiện info đơn + "đang ở …".
- **Chặng "Soát tool"** = tài khoản Support soát; "đã soát" = `toolResultNote` có
  giá trị, "chưa soát" = rỗng/null.
- **Lọc xưởng:** admin chọn mọi xưởng qua dropdown (mặc định "Tất cả xưởng").
  (Service vẫn có nhánh khóa xưởng cho role `Fulfillment` — nhánh phòng hờ vì
  endpoint hiện đã giới hạn về admin; xem §5/§7.)

## 2. Luồng hoạt động

1. User mở Dashboard → tab "Vòng đời đơn".
2. FE gọi `GET /v1/orders/lifecycle-overview?from=&to=&factoryId=`.
   - `from`/`to` (mặc định 7 ngày gần nhất) = **ngày VÀO SẢN XUẤT** (`inProductionAt`).
     Lọc TOÀN BỘ tập đơn → snapshot cho biết "đơn vào (các) ngày đó hiện đang ở
     công đoạn nào". Đồng bộ cách lọc của `getDashboard`/`getFactoryOverview`.
   - Trong tập đơn đó, **throughput** (hoàn thành/kỳ, thời gian TB, completionTimeline)
     lọc thêm theo mốc hoàn thành nằm trong `from`/`to`.
3. FE render: KPI row → Phễu công đoạn → Bảng chi tiết → 2 biểu đồ.

## 3. API / Schema

| Method | Path | Mô tả |
|---|---|---|
| GET | `/v1/orders/lifecycle-overview` | Phễu 9 chặng + KPI + timeline + danh sách xưởng |
| GET | `/v1/orders/lifecycle-track/:code` | Hành trình 9 chặng của 1 đơn theo `productionId` (cho strip) |

`getLifecycleTrack(code, roleName, userFactoryId)`: `findOne` theo `productionId`
(exact, case-insensitive), khóa xưởng cho `Fulfillment`. Suy **currentIndex** (0..8)
từ field sẵn có — ưu tiên `toolResultNote='error'` (support-hold → về chặng 0) >
`currentFulfillmentStage` (`2 + FULFILLMENT_STAGE_ORDER`) > `designerStatus` >
`toolResultNote` rỗng. Response `LifecycleTrack`:

```ts
{
  productionId; userSku?; type?; inProductionAt?; fulfillmentCompletedAt?;
  currentStageKey: string | null;   // null nếu completed
  completed: boolean;
  stages: { key; label; status: 'done'|'current'|'pending'|'error'|'rework'; at? }[]; // 9 phần tử
}
```

Request `GetLifecycleOverviewDto` (`packages/shared/dtos/production-order.dto.ts`):

```ts
{ factoryId?: string; from?: string; to?: string } // YYYY-MM-DD (VN tz)
```

Response `LifecycleOverview`:

```ts
{
  stages: LifecycleStageRow[];          // 9 chặng theo thứ tự
  totals: {
    totalOrders: number;                // tổng đơn trong tập đã lọc (facet totalAll)
    totalActive: number;                // đơn chưa pack done, chưa hủy
    completedInRange: number;           // pack.done trong kỳ
    avgTotalCycleMs: number;            // designerFirstStartedAt/createdAt → fulfillmentCompletedAt
    bottleneckStage: string | null;     // chặng có backlog lớn nhất
  };
  completionTimeline: { date: string; completed: number }[]; // line chart
  factories: { factoryId: string; factoryName: string }[];   // dropdown options
  filter: { factoryId?: string; from?: string; to?: string };
}

LifecycleStageRow = {
  stage: string;        // 'tool-check' | 'designer' | 7 FulfillmentStage
  label: string;        // nhãn VN (BE authoritative)
  backlog: number;      // đang chứa (snapshot). tool-check = chưa soát
  waitingToStart: number; // chờ nhận task (đã tới, chưa bấm Bắt đầu). designer='assigned'; fulfillment='waiting'; tool=0
  inProgress: number;   // đang làm (snapshot). tool-check = 0
  rework: number;       // rework (snapshot)
  error: number;        // lỗi (snapshot)
  doneInRange: number;  // hoàn thành chặng trong kỳ (throughput)
  passedTotal: number;  // đã từng qua chặng (cumulative). tool-check = đã soát
  avgWorkMs: number;    // thời gian hoàn thành TB của đơn done trong kỳ (ms)
}
```

`LIFECYCLE_STAGE_KEYS` (shared) liệt kê 9 khóa chặng.

### Field mới: `toolCheckedAt`

- `OrderEntity.toolCheckedAt?: Date` (index) — mốc đơn **lần đầu** được soát tool
  (`toolResultNote` rỗng → có giá trị).
- Set tại: `updateField` (field `toolResultNote` hoặc nhánh `productionError`→'error'),
  `bulkUpdateField` (field `toolResultNote`, updateMany riêng cho subset chưa có),
  `importRework` (khi gán `toolResultNote` từ sheet soát). Set **một lần** (first-soát).
- Backfill legacy: `OrderService.onModuleInit` set `= updatedAt` cho đơn đã có
  `toolResultNote` nhưng thiếu `toolCheckedAt` (best-effort, idempotent).

## 4. UI Components

`LifecycleTab.tsx`:

- **Filter bar** (`OrderFilterBar`): date range + dropdown xưởng (ẩn + hiện chip
  khóa khi `lockedFactoryId`). URL prefix `l` (`lfrom`, `lto`, `lfactory`).
- **KPI row** (4 thẻ): Đơn đang trong quy trình · Hoàn thành trong kỳ · Cycle time
  TB · Công đoạn tắc nghẽn (highlight hổ phách).
- **Phễu công đoạn** — bố cục **rắn bò (boustrophedon)**: chia node thành lưới
  `cols` cột (responsive 4/3/2/1 theo bề rộng cửa sổ), hàng chẵn chạy trái→phải,
  hàng lẻ lấp phải→trái + mũi tên rẽ xuống nối hàng (helper `buildSlots` +
  `turnColumn`) → thấy hết 10 node không cuộn ngang. Các node nối bằng **đường ray
  (rail) indigo liền mạch** (`RAIL_H`/`RAIL_V` + mũi tên chevron ở đầu ray) thay
  cho mũi tên rời — đọc như một dòng chảy thống nhất. Mỗi node (lớn) hiện: số thứ
  tự + tên, backlog (số lớn), lưới 2×3 (**Chờ nhận** / Đang làm / Rework / Lỗi /
  HT kỳ / Time TB), footer (Đã qua·Đã soát tổng). **Mỗi chỉ số có tooltip** (Radix
  `@/components/ui/tooltip`) giải thích trường đó. Node bottleneck viền hổ phách;
  node cuối "Hoàn thành" (xanh).
- **Bảng chi tiết**: cột Công đoạn | Đang chứa | Chờ nhận | Đang làm | Rework | Lỗi | Hoàn thành (kỳ) | Đã qua | Time TB.
- **Biểu đồ** (Recharts): stacked `BarChart` (tồn đọng theo chặng) + `LineChart`
  (đơn hoàn thành/ngày).

Áp dụng skill redesign cho data dashboard: `tabular-nums`, skeleton loader, empty
state, hover, 1 accent indigo, semantic màu (slate=chứa, indigo=làm, amber=rework, rose=lỗi).

## 5. Backend logic

`getLifecycleOverview(dto, roleName, userFactoryId)` — **một** aggregate `$facet`
trên collection `orders`:

- `$match` cơ bản: loại `deletedAt` + `cancelledAt`; lọc `inProductionAt` trong
  `[from,to]` (ngày vào sản xuất). Factory scope: `Fulfillment` → khóa
  `{ $or: [factoryId, originalFactoryId] }`; role khác → theo `dto.factoryId`.
- Facet `tool` / `designer`: `$group _id:null` với `$cond` đếm backlog/inProgress/
  rework/error/passed + `doneInRange`/`workSum`/`workCnt` (lọc qua helper `inRange`).
- Facet `fulfillmentSnapshot`: group theo `currentFulfillmentStage`; status hiện tại
  trích bằng `$let`+`$filter` trên `$objectToArray(fulfillmentStages)` (tránh field
  path có dấu gạch `qc-post-press`).
- Facet `fulfillmentByStage`: `$objectToArray` → `$unwind` → group theo `stages.k`
  → passed/doneInRange/avgWork per stage.
- Facet `totalActive` / `totalCycle` / `completionTimeline` / `factories`.

`avgWorkMs = workSum / workCnt` (làm tròn). `bottleneckStage` = chặng backlog max.

## 6. Performance notes

- Một aggregate `$facet` (~9 sub-pipeline) — tương tự `getStatusOverview` /
  `getFactoryOverview`. Không cache (on-demand). Index hỗ trợ: `toolResultNote`,
  `toolCheckedAt`, `currentFulfillmentStage`, `fulfillmentCompletedAt`, `factoryId`,
  `originalFactoryId`, `designerStatus` (đều đã có).
- Base `$match` lọc theo `inProductionAt` (index sẵn) + factory scope → giới hạn
  tập đơn cho cả snapshot lẫn throughput; throughput lọc thêm mốc hoàn thành trong sub-pipeline.

## 7. Permissions

- **Mọi tài khoản** — cả 2 endpoint `@Auth(ORDER_VIEW_ROLES)`; FE render strip +
  tab chi tiết cho mọi role (`canSeeLifecycle = true`).
- **Factory isolation** trong service khóa role `Fulfillment` về xưởng của họ
  (`isFactoryBound`); role khác thấy toàn bộ (hoặc lọc theo dropdown xưởng ở tab
  chi tiết). Strip không có dropdown xưởng → không truyền `factoryId`, để BE tự lo.
