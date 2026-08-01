# Telegram Notification & Scheduled Reports — Function Description

> **File BE:**
>  - `apps/api/src/modules/telegram-notification/` — gửi tin + format 3 view báo cáo (+ `REPORT_CALLBACKS`)
>  - `apps/api/src/modules/scheduled-reports/` — cron 3 lần/ngày + aggregate + webhook nút bấm Telegram
>  - `apps/api/src/utils/designer-flow.ts` — `designerFlowConds()` (TÁCH từ `DesignerStatsService`, dùng chung Dashboard + sidebar + báo cáo)
>  - `packages/core/services/telegram.service.ts` — HTTP client bot (`sendMessage` + `answerCallbackQuery` + `setWebhook`)
>  - `apps/api/src/shared/services/api-config.service.ts` → `config.telegram` (+ `webhookUrl`/`webhookSecret`) + `config.scheduledReports`
>
> **File FE:**
> - `apps/web/src/pages/home/SendTelegramReportButton.tsx` — nút Dashboard header (Admin) mở **popover 3 lựa chọn**: Tổng quan / Theo designer / Theo xưởng → gửi view tương ứng vào Telegram
> - `apps/web/src/services/reports.ts` → `runNow(view)` (`?view=daily|designer|factory`)
>
> **API:** `POST /api/v1/reports/run-now` (Admin) + `POST /api/v1/telegram/webhook` (public — Telegram gọi vào, verify secret token)

---

## 1. Overview

### 1.1 Phase 1 — Notification theo sự kiện
Import summary khi `POST /v1/orders/import` — không đổi.

### 1.2 Phase 3 — Báo cáo "Đơn 3 ngày liền kề" + 3 view (2026-08, thay 3 báo cáo cũ)

**1 lần aggregate** (`DailyOrdersAggregator`) cấp dữ liệu cho **3 view**, mỗi view 1 nút trên message Telegram:

| Nút | callback_data | Nội dung |
|---|---|---|
| 🔄 Cập nhật | `rpt:daily` | View chính: từng ngày `total` + `stockOut` + dòng thiết kế (xong/đang làm/làm lại/cần làm + tồn) + section ⭐ Khách ưu tiên |
| 👤 Designer | `rpt:designer` | Tách theo ngày, mỗi designer 1 dòng (mirror bảng "Tất cả designer theo ngày") + dòng 🚨 lỗi chưa gán |
| 🔍 Soát tool | `rpt:tool` | Bảng soát tool xoay ngang (Tổng/Chưa soát/Đã soát/Note ko ok/Soát OK/Cần làm lại × N ngày) — mirror "Tổng quan theo ngày" tab Soát tool |
| 🏭 <tên xưởng> | `rpt:fac:<factoryId>` | **1 nút / xưởng SX** (động, loại US) → phễu Tổng quan LỌC theo xưởng đó (bỏ section khách ưu tiên) |

> `REPORT_DAY_COUNT = 4` ngày. Nút xưởng dựng động từ `data.factories` (`listProductionFactories`). Nút cũ "🏭 Xưởng" gộp (per-day factory summary) đã bỏ.

**Định nghĩa số (đã chốt với user 2026-08-01):**
- Cửa sổ: `REPORT_DAY_COUNT = 3` ngày liền kề (hôm kia/hôm qua/hôm nay), bucket `inProductionAt` giờ VN.
- **Scope MIRROR bảng "Tổng quan N ngày" Dashboard (`getDailyOverview`)**: loại đơn hủy (`cancelledAt`) + **đơn chưa map xưởng** + xưởng US (`productionFactoryClause`).
- `stockOut` — đơn xong công đoạn Đóng hàng (`fulfillmentCompletedAt` có giá trị).
- 4 trạng thái thiết kế = đơn **đã gán designer** theo `designerStatus`: cần làm (assigned) / làm lại (rework) / đang làm (in-progress) / đã xong (done) — khớp ma trận `getTeamDailyBreakdown`.
- **Tồn thiết kế** = `designerFlowConds().backlogCond` (chưa soát ∪ đã gán chưa xong ∪ đang lỗi chưa gán) — KHÔNG còn đếm `designerStatus ≠ done` trên mọi đơn (bug cũ: đơn soát-ok đi thẳng xưởng bị đếm oan).
- Công thức lấy từ `utils/designer-flow.ts` — **1 nguồn duy nhất** với Dashboard/sidebar; sửa ở đó là mọi nơi khớp nhau.
- **Section khách ưu tiên**: khách đã kéo vào cột ở `/adm/settings/customer-priority` (bất kể công tắc bật/tắt — công tắc chỉ điều khiển auto-gán lúc import); mỗi khách 1 block, **chỉ in ngày có đơn**, số = 0 thì ẩn (trừ `tồn` luôn hiện).

### 1.3 Khóa in-flight
Không rate-limit — chỉ chặn chạy chồng: `ScheduledReportsService.running` (in-memory, PM2 single instance). Đang chạy → mọi trigger khác nhận `busy` / toast "⏳ chờ xong rồi bấm lại".

---

## 2. Luồng hoạt động

```
Trigger:
  - Cron 07:30/13:00/18:30 VN (check SCHEDULED_REPORTS_ENABLED) → run('daily')
  - Nút web Dashboard (popover 3 view) → POST /reports/run-now?view=… → run(view)
  - Nút Telegram → webhook → REPORT_CALLBACKS[cq.data] → run(kind)

run(kind):
  if running → { ok:false, busy:true }
  data = DailyOrdersAggregator.aggregate(now, factoryId?)   // 1 aggregation $facet 4 nhánh
  kind='daily' (+factoryId?) → notifyDailyOrdersReport(payload, factoryName?)
  kind='designer'            → notifyDesignerViewReport(payload)
  kind='tool-check'          → notifyToolCheckReport(payload)
  // keyboard động: [🔄 Cập nhật][👤 Designer][🔍 Soát tool] + hàng [🏭 <xưởng>] mỗi xưởng
```

Webhook (`TelegramWebhookController`, boot tự `setWebhook` khi đủ env): 1) secret sai → 401; 2) không phải callback_query → bỏ qua; 3) chat_id ∉ allowlist channel báo cáo / data lạ → answer rỗng; 4) đang chạy → toast chờ; 5) OK → toast "📤 Đang gửi..." + `void run(kind)` (trả 200 ngay).

---

## 3. API / Schema

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/v1/reports/run-now` | SuperAdmin / Admin | Gửi ngay 1 view — query `view=daily\|designer\|factory` (default `daily`). Trả `{ ok, busy? }`. |
| POST | `/v1/telegram/webhook` | public | Callback nút bấm — verify `X-Telegram-Bot-Api-Secret-Token`. |

Env (như cũ + webhook):
```env
TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID / TELEGRAM_NOTIFICATION_CHANNEL_ID (CSV được)
TELEGRAM_SCAN_NOTIFICATION_CHANNEL_ID / TELEGRAM_NOTIFICATION_ENABLED / SCHEDULED_REPORTS_ENABLED
TELEGRAM_WEBHOOK_URL=https://<api-domain>/api/v1/telegram/webhook   # HTTPS public đầy đủ
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>
```

Types (`scheduled-reports/types.ts`):
```ts
ReportKind = 'daily' | 'designer' | 'tool-check'   // xưởng = daily + factoryId
run(kind, factoryId?)   // rpt:fac:<id> → run('daily', id)
ReportDayStats = { label, total, stockOut, needAction, rework, inProgress, done, backlog, unassignedNeed }
PriorityCustomerReportRow = { priority, userSku, userEmail, days: ReportDayStats[] }
DesignerReportDay = { label, rows: { fullName, needAction, rework, inProgress, done }[], unassignedNeed }
FactoryReportRow = { name, total, stockOut, backlog }
DailyOrdersReportData = { days, priorityRows, designerDays, toolCheckDays, factories }
ToolCheckReportDay = { label, total, unreviewed, reviewed, noteNotOk, reviewedOk, rework }
ReportFactory = { id, name }   // dựng nút xưởng
ReportDayStats += { soat, design, inPressQc, sew, pack, completedWithin2d }   // phễu vòng đời (partition)
FactoryReportDay = { label, rows: { name, total, stockOut, backlog }[] }
```

---

## 4. Backend modules

- `telegram-notification/`: service (`notifyImportSummary` + 3 `notify*Report` cùng `REPORT_KEYBOARD` 3 nút + `reportChannelIds()`), `types.ts` (`REPORT_CALLBACKS` map), `format/daily-orders-report.formatter.ts` (3 hàm `formatDailyOrdersReport` / `formatDesignerViewReport` / `formatFactoryViewReport`) + `import-summary.formatter.ts` + `_helpers.ts`.
- `scheduled-reports/`: service (`run(kind)` + lock + onModuleInit setWebhook + 3 @Cron), `scheduled-reports.controller.ts`, `telegram-webhook.controller.ts`, `build-period.ts` (`REPORT_DAY_COUNT` + `buildReportDayWindows` + `formatVnDateTime`), `aggregators/daily-orders-aggregator.ts`.
- Aggregator: 1 aggregation `$facet` 4 nhánh (`days` / `customers` (pre-filter `userSku $in` khách ưu tiên, join JS qua `customerMatchKey`) / `designers` (match assignee set + s4, group (day, assignee), resolve fullName qua `userModel`) / `factories` (group **(day, factoryId)** → per-day, resolve tên qua `FactoryRepository`)). Module imports: OrderEntity + UserEntity mongoose, CustomerAssignmentModule (`getPriorityCustomers()`), FactoryModule, TelegramNotificationModule.
- `DesignerStatsService.designerFlowConds()` giờ là delegate mỏng → `utils/designer-flow.ts`.

---

## 5. Message format (3 view — bảng canh cột + viết tắt)

Số liệu render trong **bảng monospace** (helper `table()` → ` ```code``` ` block, cột đầu canh trái, các cột số canh phải → số thẳng hàng dọc, dễ soi nhất). Telegram **cuộn ngang** trong code block nếu rộng — KHÔNG vỡ dòng như text thường (bài học Phase 2.1). Tiêu đề cột **viết tắt**, giải nghĩa ở dòng legend cuối message. Ô tên (designer/xưởng) qua `fit(s, n)` (cắt gọn + bỏ `` ` ``/newline khỏi phá block). **Số 0 → `-`** (helper `cellStr` trong `table()`) cho đỡ nhiễu mắt.

> **Giới hạn Telegram (đã chốt với user):** tô màu chữ (vàng/xanh) và in đậm **KHÔNG** render trong code block (bảng monospace phẳng), và Telegram vốn không hỗ trợ màu chữ tuỳ ý. User đã chọn **giữ bảng canh cột** thay vì đổi sang kiểu thẻ emoji-màu (mất canh cột) — chấp nhận không màu/đậm, đổi lại số thẳng hàng.

View chính — bảng `Ngày · Đơn · XK · Lỗi · Xong · ĐL · LL · CL · Tồn`, đứng trước Xong. **Lỗi = "soát lỗi + đẩy về" = `poolCond`** (đơn từng soát ra lỗi `toolCheckErrorNotes` ∨ đã vào flow designer `s4`) — KHỚP CHÍNH XÁC hàng "Tổng lỗi" (`totalError` = `toolError + wasOkPushed`) của bảng Tổng quan Dashboard (2 nửa rời nhau, tổng = poolCond). Mỗi khách ưu tiên 1 bảng nhỏ cùng cột. **Nhãn 🟢 PROD / 🧪 DEV** ở đầu mỗi message (phân biệt báo cáo từ production hay dev):
View **Tổng quan = phễu vòng đời đơn** (snapshot **tồn ở mỗi chặng**, mỗi đơn ở đúng 1 chặng → `Tổng = Soát + TK + IÉQ + May + Đóng + Xong`): `Tổng · Soát(chưa soát tool) · TK(đã soát, chờ thiết kế) · IÉQ(in+ép+QC ép) · May(vào+ra) · Đóng · Xong(hoàn thành) · %2n(% xong ≤2 ngày)`. Suy chặng từ: `fulfillmentCompletedAt` set = Xong; `currentFulfillmentStage` ∈ print/press/qc-post-press = IÉQ, sew-in/out = May, pack = Đóng; còn lại (cfs null, chưa xong): `toolResultNote` rỗng = Soát, có giá trị = TK. `%2n = completedWithin2d / total` (xong ≤48h kể từ `inProductionAt`). Section khách ưu tiên **bỏ tiêu đề "⭐ KHÁCH ƯU TIÊN"** + **bỏ dòng trống** (chấm 🔴🟠🔵 + tên đủ nhận biết), cùng cột phễu:
Bảng **xoay ngang** (`funnelTable` + `FUNNEL_ROWS`): **chặng = HÀNG, ngày = CỘT** → chỉ 4 cột (Chặng + 3 ngày), vừa 1 dòng trên điện thoại (KHÔNG wrap). Nhãn hàng đầy đủ nên **bỏ legend**. Tồn 6 chặng (Soát→Hoàn thành) cộng lại = Tổng:
```
🧪 DEV
📊 BÁO CÁO ĐƠN · 4 NGÀY · 🕐 01/08 11:37
| Chặng      30/07 31/07 01/08 |
| Tổng         557   566   133 |
| Soát           -    30    60 |
| Thiết kế       -    19    30 |
| In/Ép/QC       -     8    10 |
| May vào/ra     -    20     3 |
| Đóng hàng      -    10     - |
| Hoàn thành   557   479    30 |
| % ≤2 ngày    92%   61%   22% |
🔴 TIKTOKSHOPUS
| Chặng      30/07 |
| Tổng         125 |
| ...              |
| Hoàn thành   125 |
| % ≤2 ngày    88% |
🔴 THGPARTNER — (không có đơn)

Đơn=tổng·XK=xuất kho·Lỗi=tổng lỗi TK·Xong=TK xong·ĐL=đang làm·LL=làm lại·CL=cần làm·Tồn=TK tồn
[🔄 Cập nhật] [👤 Designer] [🏭 Xưởng]
```
View designer — mỗi ngày 1 bảng `Designer · Lỗi · Xong · ĐL · LL · CL` + **dòng Tổng** (cộng mọi designer trong ngày). Tên `fit` 12 ký tự; **Lỗi** per-designer = số đơn của họ TỪNG bị soát tool ra lỗi `toolErrHasCond` (KHÔNG dùng poolCond vì nhánh này đã lọc s4 → poolCond luôn = tổng đơn):
```
👤 BÁO CÁO DESIGNER · 4 NGÀY · 🕐 01/08 11:37
📅 30/07 · 🚨 chưa gán 3
| Designer      Lỗi Xong ĐL LL CL |
| Nguyễn Văn A     1   40  -  -  - |
| Trần B           -   25  -  2  - |
| Tổng            1   65  -  2  - |
📅 31/07
...
```
View **xưởng** (nút `🏭 <tên>`) = **cùng phễu Tổng quan nhưng LỌC theo 1 xưởng** (`run('daily', factoryId)` → `formatDailyOrdersReport(payload, factoryName)`): header `🏭 XƯỞNG <tên> · N NGÀY`, bảng phễu xoay ngang y hệt view Tổng quan, **bỏ section khách ưu tiên**.

View **soát tool** (nút `🔍 Soát tool`) — xoay ngang, chỉ số soát tool theo ngày (mirror bảng "Tổng quan theo ngày" tab Soát tool):
```
🔍 BÁO CÁO SOÁT TOOL · 4 NGÀY · 🕐 01/08 11:37
| Chỉ số      29/07 30/07 31/07 01/08 |
| Tổng đơn      557   566   540   133 |
| Chưa soát       -     -    10    90 |
| Đã soát       557   566   530    43 |
| Note ko ok     40    30    25     5 |
| Soát OK       517   536   505    38 |
| Cần làm lại     3     2     1     - |
```
> (dấu `|` ở ví dụ chỉ minh họa mép bảng — thực tế là code block monospace, không có viền.)

Số 0 hiện `-` (đỡ nhiễu); ngày khách không có đơn được lọc bỏ trước khi dựng bảng. `clamp` 4096 vẫn áp — priority customers thường ít nên không chạm ngưỡng.

## 6. Performance & security

1 aggregation `$facet` 4 nhánh cho cả 3 view (window 3 ngày nhỏ) + 2 query resolve tên (users/factories). Webhook 3 lớp: secret token → allowlist chat_id → khóa in-flight; endpoint chỉ trả `{ok:true}`, báo cáo luôn gửi vào channel env. Optional: nginx giới hạn path webhook theo dải IP Telegram `149.154.160.0/20`, `91.108.4.0/22`.

## 7. Permissions

SuperAdmin/Admin: nút web + `/reports/run-now`. Member channel báo cáo: 3 nút Telegram (chặn theo chat_id). Cron: system, check `SCHEDULED_REPORTS_ENABLED` (nút web/Telegram KHÔNG bị flag này chặn).

## 8. Edge cases

| Tình huống | Hành vi |
|---|---|
| `TELEGRAM_NOTIFICATION_ENABLED=false` | Mọi noti skip |
| Thiếu env webhook | Không setWebhook; nút hiện nhưng bấm không phản hồi; endpoint luôn 401 |
| 2 người bấm nút gần nhau | Người sau: toast "⏳ Báo cáo đang chạy — chờ xong rồi bấm lại nhé" |
| Chưa kéo khách vào cột ưu tiên | Không có section ⭐ (công tắc bật/tắt KHÔNG ảnh hưởng) |
| Designer đã tắt/xóa | Dòng "Khác (đã tắt)" trong view designer |
| PM2 cluster | Cần Redis lock (chưa cần — single instance) |

## 9. Verify số liệu

| Số | So với UI |
|---|---|
| total / tồn / 4 trạng thái thiết kế | Dashboard tab Designer — bảng "Tổng quan N ngày" + ma trận "Tất cả designer theo ngày" (cùng `designerFlowConds()` + cùng scope) |
| stockOut | Đơn có `fulfillmentCompletedAt`, lọc theo ngày `inProductionAt` |

## 10. Lịch sử thay đổi

| Phase | Ngày | Việc làm |
|---|---|---|
| Phase 1 | 2026-06-19 | TelegramService + import summary noti |
| Phase 2 | 2026-06-22 → 24 | 3 báo cáo designer/factory/error + cron (ĐÃ GỠ) |
| Phase 3 | 2026-08-01 | Bỏ 3 báo cáo cũ → báo cáo "Đơn 3 ngày liền kề"; webhook nút bấm + khóa in-flight; core thêm answerCallbackQuery/setWebhook/replyMarkup |
| Phase 3.1 | 2026-08-01 | **Fix số sai** (tồn thiết kế đếm oan đơn không qua designer; scope lệch Dashboard) → MIRROR `designerFlowConds()` (tách ra `utils/designer-flow.ts`) + scope `getDailyOverview`; redesign section khách ưu tiên (ẩn số 0, bỏ ngày trống); thêm 2 view mới **👤 Theo designer** (tách từng ngày) + **🏭 Theo xưởng** (tổng · stock out · TK tồn) — hàng 3 nút trên mọi message |
| Phase 3.2 | 2026-08-01 | Thử icon-driven (`chip()`/`joinChips()`) — user vẫn thấy rối |
| Phase 3.3 | 2026-08-01 | **Chuyển sang bảng canh cột monospace + viết tắt** (helper `table()` → ` ```code``` `, cột số canh phải thẳng hàng; tiêu đề tắt Đơn/XK/Xong/ĐL/LL/CL/Tồn + legend giải nghĩa; `fit()` cắt tên designer/xưởng). View chính + khách ưu tiên đủ 7 chỉ số/ngày; designer 4 trạng thái; xưởng Đơn/XK/Tồn + Tổng |
| Phase 3.3.1 | 2026-08-01 | Tinh chỉnh sau ảnh thực tế: `RIGHT_PAD` 3 space đuôi bảng để nút `</>` của Telegram không đè tiêu đề cột "Tồn"; bỏ chữ "· Ưu tiên nhất" ở header khách (tránh xuống dòng thừa) → chỉ còn chấm màu 🔴🟠🔵 |
| Phase 3.3.2 | 2026-08-01 | Thêm cột **Lỗi** (Σ `designerReworkCount`) trước cột Xong ở view Designer (aggregator `designerStatusFields.errorCount` + `DesignerDayRow.errorCount`); bỏ dòng chú thích chấm màu ở section khách ưu tiên |
| Phase 3.3.3 | 2026-08-01 | Thêm cột **Lỗi** trước Xong ở **bảng tổng + khách ưu tiên** (`metricFields.errorCount` + `ReportDayStats.errorCount` + `DAY_HEADER`); **số 0 → `-`** (`cellStr` trong `table()`). Màu vàng/xanh + in đậm: user chốt **không làm** vì Telegram code block không render màu/đậm — giữ bảng canh cột |
| Phase 3.3.4 | 2026-08-01 | **Sửa định nghĩa "Lỗi"** khớp Dashboard: bảng tổng + khách = `poolCond` (soát lỗi + đẩy về = `toolError + wasOkPushed`, đúng hàng "Tổng lỗi" `getDailyOverview`); view designer = `toolErrHasCond` (soát lỗi per-designer). Thêm **nhãn 🟢 PROD / 🧪 DEV** đầu mọi message (`DailyOrdersReportNotification.isProduction` từ `config.isProduction`) |
| Phase 3.3.5 | 2026-08-01 | Bỏ dòng "⭐ KHÁCH ƯU TIÊN" + bỏ dòng trống giữa các bảng (compact, gộp `title · 🕐 time`); **nút web → popover 3 view** (Tổng quan/Designer/Xưởng, `runNow(view)` + `run-now?view=`), controller nhận `@Query('view')` → `run(kind)` |
| Phase 3.3.6 | 2026-08-01 | View designer: **dòng Tổng/ngày** (cộng mọi designer). View xưởng: đổi từ 1 bảng cộng dồn → **per-day 3 ngày** (aggregator group `(day, factoryId)` + `buildFactoryDays`, `FactoryReportDay`), mỗi ngày kèm dòng Tổng |
| Phase 3.4 | 2026-08-01 | **Redesign view Tổng quan → phễu vòng đời đơn** (snapshot đơn đang ở chặng nào): cột `Tổng·TK·IÉQ·May·Đóng·Xong·%2n` thay bộ cột design-metric cũ; `metricFields` + `ReportDayStats` thêm `design/inPressQc/sew/pack/completedWithin2d` (suy từ `currentFulfillmentStage`+`fulfillmentCompletedAt`, `%2n` = xong ≤48h kể từ `inProductionAt`). Áp cả bảng khách ưu tiên. Designer/xưởng view giữ nguyên |
| Phase 3.4.1 | 2026-08-01 | Phễu = **tồn ở mỗi chặng, tổng partition = Tổng đơn**; **tách cột Soát** (chưa soát tool: `toolResultNote` rỗng) khỏi TK (đã soát, chờ thiết kế) — thêm `MetricShape.soat`/`ReportDayStats.soat` |
| Phase 3.4.2 | 2026-08-01 | **Gộp cột %2n vào Xong** thành ô "số (%)" (vd `479 (61%)`, helper `xongCell`) — bỏ 1 cột cho đỡ rộng/xuống dòng trên mobile |
| Phase 3.4.3 | 2026-08-01 | Bảng vẫn wrap trên mobile → **xoay ngang phễu** (`funnelTable`/`FUNNEL_ROWS`): chặng=hàng, ngày=cột (4 cột, vừa 1 dòng); nhãn hàng đầy đủ Tổng/Soát/Thiết kế/In/Ép/QC/May vào ra/Đóng hàng/Hoàn thành/% ≤2 ngày → **bỏ legend**; %2n về lại 1 hàng riêng |
| Phase 3.5 | 2026-08-01 | **4 ngày** (`REPORT_DAY_COUNT=4`). **Nút xưởng động**: bỏ view "factory summary" cũ → mỗi xưởng SX (loại US) 1 nút `🏭 <tên>` (`rpt:fac:<id>`) = phễu Tổng quan lọc theo xưởng (`aggregate(now, factoryId)` + `formatDailyOrdersReport(payload, factoryName)`, bỏ section khách). **Nút "🔍 Soát tool"** (`rpt:tool`) = báo cáo soát tool xoay ngang (facet `toolCheck` + `formatToolCheckReport`, mirror bảng "Tổng quan theo ngày" tab Soát tool). `ReportKind`='daily'\|'designer'\|'tool-check'; `run(kind, factoryId?)`; keyboard động `buildReportKeyboard(factories)`; web popover thêm Soát tool + 1 mục/xưởng (`runNow(view, factoryId?)`) |

---

## Tài liệu liên quan

- [CustomerFactoryAssignment.md](./CustomerFactoryAssignment.md) §8 — cấu hình khách ưu tiên
- [Dashboard.md](./Dashboard.md) — bảng Tổng quan N ngày + ma trận designer (nguồn công thức)
- [Orders.md](./Orders.md) §17/§19/§21 — ưu tiên đơn / loại đơn chưa map / loại xưởng US
- [FulfillmentWorkflow.md](./FulfillmentWorkflow.md) — `fulfillmentCompletedAt` (mốc Stock out)
