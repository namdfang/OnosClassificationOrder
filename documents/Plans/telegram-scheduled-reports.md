# Plan — Telegram Scheduled Reports (Designer / Factory / Errors)

> **Tạo:** 2026-06-22
> **Phạm vi:** 3 báo cáo định kỳ bắn qua Telegram (1 channel) vào 07:30, 13:00, 18:30 hằng ngày (giờ VN). Tận dụng hạ tầng đã làm ở Phase 1 (`TelegramNotificationService` + `TelegramService`).
> **Ước tính:** ~2 ngày dev (1.5 BE + 0.5 docs/test). Không động FE.
> **Liên quan:** [telegram-notification.md](./telegram-notification.md) (Phase 1 đã xong).

---

## 1. Mục tiêu

1. **3 lịch chạy/ngày**, configurable qua env:
   - 07:30 — báo cáo bắt đầu ngày làm việc
   - 13:00 — báo cáo giữa ngày (sau giờ nghỉ trưa)
   - 18:30 — báo cáo cuối ngày
   - Múi giờ **Asia/Ho_Chi_Minh**
2. **3 báo cáo độc lập** (gửi liên tiếp trong cùng 1 lần cron fire, 3 message riêng để dễ đọc):
   - **Designer report** — bảng theo từng designer + hàng TỔNG + row "Chưa gán"
   - **Factory report** — bảng theo từng xưởng (Đã in / Đang in / In xong / Lỗi / Nhận vào / Chuyển đi / Tổng)
   - **Error summary** — tổng đơn lỗi + chia theo nguồn + chia theo mức độ urgent (mới/1 ngày/2 ngày/3 ngày)
3. **Phạm vi dữ liệu mặc định = "hôm nay"** (00:00 → thời điểm cron fire, theo VN time), nhưng tách helper `buildPeriod(now)` để dễ đổi sang "ca sáng / chiều / tối" sau.
4. **Channel:** 1 channel duy nhất (dùng `TELEGRAM_NOTIFICATION_CHANNEL_ID`), nhưng để mở **kiến trúc multi-channel + mention user** cho tương lai (xem §7).

---

## 2. Dữ liệu nguồn (đã verify trong codebase)

Đọc 4 file doc liên quan:
- `documents/FunctionDescription/DesignerTaskWorkflow.md` — state machine + fields designer
- `documents/FunctionDescription/Dashboard.md` — Tab D (designer stats), Tab C (factory overview), error-stats
- `documents/FunctionDescription/WorkshopConfig.md` — production_error codes + errorSource
- `documents/FunctionDescription/Auth.md` — role catalog (DesignerLeader, Designer, Fulfillment)

### 2.1 OrderEntity fields dùng cho report

| Field | Loại | Dùng cho |
|---|---|---|
| `assignee` | `string` (user._id) | Designer report — group key |
| `designerStatus` | enum 6 (`unassigned/assigned/in-progress/done/rejected/rework`) | Designer report — count theo bucket |
| `designerAssignedAt`, `designerStartedAt`, `designerCompletedAt` | `Date` | Designer report — "trong ngày" filter |
| `factoryId` | `string` (ref Factory) | Factory report — group key |
| `originalFactoryId` | `string` (ref Factory) | Factory report — transferred-in/out |
| `printStatus` | `string` (workshop_config code) | Factory report — print stage |
| `productionError` | `string` (workshop_config code) | Error report — đơn lỗi (≠ null) |
| `productionErrorSource` | `'designer' \| 'factory'` | Error report — phân loại nguồn |
| `productionErrorCount` | `number` | Phụ trợ — lần báo lỗi |
| `createdAt`, `updatedAt` | `Date` | "Trong ngày" filter |

**Hằng số tham chiếu** (đã có trong `order.service.ts`):
- `PRINTED_MACHINE_CODES = ['machine-1', 'machine-2', 'machine-3', 'machine-4', 'machine-94']`

### 2.2 Thiếu 1 field — quyết định bổ sung

**Vấn đề:** Error report cần phân loại đơn lỗi theo **"đã bao nhiêu ngày kể từ lúc set lỗi"** — schema hiện **không có `productionErrorAt`**, chỉ có `productionErrorCount`. Có 2 hướng:

| Hướng | Pros | Cons |
|---|---|---|
| **A. Thêm `productionErrorAt: Date`** vào `OrderEntity`, set trong `updateField('productionError')` + `setProductionError()` endpoint | Query nhanh (1 field), index được, không phụ thuộc OrderLog | Cần migration backfill cho data cũ |
| **B. Aggregate `OrderLog { field='productionError', after≠null }`** lấy max(createdAt) per order | Không động schema | Aggregate phức tạp (lookup), chậm hơn, không index được trực tiếp |

**Khuyến nghị A** — thêm field. Migration backfill 1 lần `onModuleInit` aggregate OrderLog → set `productionErrorAt`. Có thể chạy idempotent (chỉ update khi `productionErrorAt == null && productionError != null`).

**→ Quyết định cuối cùng trong §10 (câu hỏi mở).**

### 2.3 Designer list

`UserEntity { roleId, role.name === 'Designer' || 'DesignerLeader' }`. Có thể lấy qua:
- `UserRepository.findAll({ roleId: { $in: [designerRoleId, designerLeaderRoleId] } })` — 1 query
- Hoặc dùng helper có sẵn `DesignerTeamService.listTeam()` (xem `apps/api/src/modules/designer/designer-team.service.ts`)

Khuyến nghị **dùng `DesignerTeamService`** — đã có sẵn logic include sub-designer chưa có task, count active.

### 2.4 Factory list

`FactoryRepository.findAll({ isActive: true })`. Hiện hệ thống có 3 xưởng (ML, TN, US) — xem `Dashboard.md §10`.

---

## 3. Format message trên Telegram

### 3.1 Quy tắc chung

- **`parse_mode: 'MarkdownV2'`** — hỗ trợ code block monospace cho bảng, escape ký tự đặc biệt
- Mỗi báo cáo = **1 message độc lập** (3 message/lần fire) — vì:
  - 4096 char/message; nếu nhiều designer + nhiều xưởng dễ vỡ
  - User dễ scroll, không phải đọc 1 khối dài
  - Lỗi message này không kéo theo cái khác
- Bảng dùng **code block** ``` ``` để monospace, font đều, cột thẳng hàng — Telegram render đẹp ở cả mobile + desktop
- Cắt tên dài (designer name > 14 chars → `Nguyễn Văn A`, factory name > 8 chars → shortName)

### 3.2 Designer report — format đề xuất

```
📐 *Designer — 22/06/2026 13:00*
Kỳ: hôm nay (00:00 → 13:00)

`
Designer        T.Day  Gán  Đ.làm  Xong  Lỗi
─────────────────────────────────────────────
Nguyễn Văn A     12     3     2     5     2
Trần Thị B        8     1     3     4     0
Lê Văn C          5     2     1     2     0
Phạm Thu D        3     0     0     3     0
─────────────────────────────────────────────
TỔNG             28     6     6    14     2
Chưa gán          4     —     —     —     —
`

📊 Active: 12 đang xử lý · 2 chờ rework
```

**Giải nghĩa cột:**
- **T.Day** — tổng task có `assignee=user._id` AND `(designerAssignedAt | createdAt) trong period` (đơn được assign cho user trong ngày)
- **Gán** — `designerStatus='assigned'` (đã gán, chưa start)
- **Đ.làm** — `designerStatus='in-progress'`
- **Xong** — `designerStatus='done'` AND `designerCompletedAt trong period`
- **Lỗi** — `designerStatus='rework'` (đơn xưởng báo lỗi, designer phải làm lại)
- Hàng **TỔNG** — sum tất cả designer
- Hàng **Chưa gán** — `assignee=null AND designerStatus='unassigned'` (đơn chưa có ai làm — global, không thuộc designer nào)

**Edge cases:**
- Designer 0 task hôm nay → vẫn liệt kê (row count = 0) — leader cần biết ai rảnh
- > 15 designer → cắt top-15 theo `T.Day desc`, thêm row `... và N designer khác (X task)`
- 0 designer trong hệ thống → message ngắn "Chưa có designer nào trong hệ thống"

### 3.3 Factory report — format đề xuất

```
🏭 *Xưởng — 22/06/2026 13:00*
Kỳ: hôm nay (00:00 → 13:00)

`
Xưởng    Tổng  C.in  Đ.in  Xong  Lỗi  Nhận  Đi
────────────────────────────────────────────────
ML        45    12    18    11    3    5    2
TN        30     8    10     9    2    1    4
US        12     4     3     5    0    2    0
────────────────────────────────────────────────
TỔNG      87    24    31    25    5    8    6
Chưa XĐ    3     —     —     —    —    —    —
`
```

**Giải nghĩa cột:**
- **Tổng** — số đơn hiện đang ở xưởng đó (`factoryId = X`, trong period theo `createdAt`)
- **C.in** = Chưa in — `printStatus` null/empty
- **Đ.in** = Đang in — `printStatus` tồn tại nhưng KHÔNG ∈ `PRINTED_MACHINE_CODES`
- **Xong** = In xong — `printStatus ∈ PRINTED_MACHINE_CODES`
- **Lỗi** — `productionError != null` (đếm độc lập với 3 print stage)
- **Nhận** = Nhận vào từ xưởng khác — `factoryId=X AND originalFactoryId≠X`
- **Đi** = Đã chuyển đi — `originalFactoryId=X AND factoryId≠X`
- Row **Chưa XĐ** — `factoryId == null` (chưa map xưởng — global)

> Lưu ý "Đã in" của user trong yêu cầu = "đang in" (Đ.in). User dùng "in xong" cho printed. Plan map theo cách này; nếu hiểu khác sẽ điều chỉnh.

### 3.4 Error report — format đề xuất

```
⚠️ *Đơn lỗi — 22/06/2026 13:00*
Kỳ: hôm nay (00:00 → 13:00)

📊 *Tổng quan*
   • Tổng đơn lỗi: *18*
   • Do xưởng: 11
   • Do designer: 6
   • Chưa rõ nguồn: 1

⏰ *Theo mức độ ưu tiên* (kể từ lúc báo lỗi)
   🟢 Mới (< 1 ngày): 8
   🟡 Cần làm ngay (1–2 ngày): 5
   🟠 Gấp (2–3 ngày): 3
   🔴 Khẩn cấp (≥ 3 ngày): 2

🔍 *Top mã lỗi*
   • Sai design: 4
   • In lệch: 3
   • Sai size: 3
   • Vải lỗi: 2
   • ... và 6 mã khác
```

**Giải nghĩa:**
- **Tổng đơn lỗi** — `productionError != null AND productionError != ''` (đếm toàn bộ đơn lỗi đang mở, không filter ngày — vì lỗi cũ vẫn cần xử lý)
- **Do xưởng / designer / chưa rõ** — group theo `productionErrorSource`
- **Theo mức độ ưu tiên** — group theo `(now - productionErrorAt)`:
  - Mới: < 24h
  - Cần làm ngay: 24h – 48h
  - Gấp: 48h – 72h
  - Khẩn cấp: ≥ 72h
- **Top mã lỗi** — group theo `productionError` code, resolve thành tên qua `WorkshopConfigRepository`. Top 5–10, sort desc.

> Hỏi user: định nghĩa "Mới" có phải là **< 1 ngày** (= chưa đến 24h kể từ lúc báo lỗi)? Tôi giả định vậy. Nếu nhầm 4 mức (mới + 3 mức urgent) → 4 mức + 1 mức "chưa rõ" (productionErrorAt null).

---

## 4. Kiến trúc đề xuất

```
┌────────────────────────────────────────────────────────────┐
│             apps/api/src/modules/                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  telegram-notification/  (đã có, mở rộng)             │ │
│  │  ├── telegram-notification.service.ts                 │ │
│  │  │     • notifyImportSummary()    ← Phase 1 đã có    │ │
│  │  │     • notifyDesignerReport()   ← MỚI               │ │
│  │  │     • notifyFactoryReport()    ← MỚI               │ │
│  │  │     • notifyErrorReport()      ← MỚI               │ │
│  │  └── format/                                          │ │
│  │      ├── import-summary.formatter.ts  ← Phase 1       │ │
│  │      ├── designer-report.formatter.ts ← MỚI            │ │
│  │      ├── factory-report.formatter.ts  ← MỚI            │ │
│  │      └── error-report.formatter.ts    ← MỚI            │ │
│  └─────────────────────────────────────────────────────┘ │
│                          ▲                                  │
│                          │ inject                           │
│  ┌──────────────────────┴──────────────────────────────┐ │
│  │  scheduled-reports/  (MỚI — feature module)          │ │
│  │  ├── scheduled-reports.module.ts                      │ │
│  │  ├── scheduled-reports.service.ts                     │ │
│  │  │     • @Cron('30 7 * * *')  → runAll('morning')    │ │
│  │  │     • @Cron('0 13 * * *')  → runAll('noon')       │ │
│  │  │     • @Cron('30 18 * * *') → runAll('evening')    │ │
│  │  │     • runAll(slot) — sequential 3 reports          │ │
│  │  └── aggregators/                                     │ │
│  │      ├── designer-aggregator.ts    (query Mongo)      │ │
│  │      ├── factory-aggregator.ts                        │ │
│  │      └── error-aggregator.ts                          │ │
│  └─────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
        │ injects
        ▼
   OrderRepository / UserRepository / FactoryRepository
   WorkshopConfigRepository (resolve code → name)
   DesignerTeamService (list designer)
```

### 4.1 Vì sao tách `scheduled-reports/` riêng

- **Tách concerns:** `telegram-notification/` lo việc **gửi**; `scheduled-reports/` lo việc **lấy data + lên lịch**
- **Tái sử dụng aggregator:** sau này có thể thêm endpoint manual trigger `POST /v1/reports/run?slot=now` cho admin test → reuse aggregator
- **Test:** mock `TelegramNotificationService`, test aggregator logic độc lập

### 4.2 Vì sao 3 cron riêng (không 1 cron + logic time matching)

- Cron expression rõ ràng, dễ disable từng slot qua env (vd. tắt 13h trong test)
- NestJS `@Cron` decorator nhận string literal — 3 method riêng đọc đẹp
- Nếu cần đổi giờ → chỉ sửa decorator, không lo bug match-by-clock

---

## 5. Implementation outline

### 5.1 File mới

| File | Mục đích |
|---|---|
| `apps/api/src/modules/scheduled-reports/scheduled-reports.module.ts` | Import `OrderModule`, `UserModule`, `FactoryModule`, `WorkshopConfigModule`, `DesignerModule`, `TelegramNotificationModule` |
| `apps/api/src/modules/scheduled-reports/scheduled-reports.service.ts` | 3 method `@Cron`, `runAll(slot)`, `runOne(reportKey, slot)` (cho future manual trigger) |
| `apps/api/src/modules/scheduled-reports/aggregators/designer-aggregator.ts` | `aggregateDesignerReport(period): Promise<DesignerReportData>` — 1 aggregate per-designer count theo status |
| `apps/api/src/modules/scheduled-reports/aggregators/factory-aggregator.ts` | `aggregateFactoryReport(period): Promise<FactoryReportData>` — group theo `factoryId × printStage × hasError × transferState` |
| `apps/api/src/modules/scheduled-reports/aggregators/error-aggregator.ts` | `aggregateErrorReport(period): Promise<ErrorReportData>` — group source + urgency bucket + top codes |
| `apps/api/src/modules/scheduled-reports/types.ts` | DTO trả về từ aggregator (input cho formatter) |
| `apps/api/src/modules/telegram-notification/format/designer-report.formatter.ts` | Build MarkdownV2 message từ `DesignerReportData` |
| `apps/api/src/modules/telegram-notification/format/factory-report.formatter.ts` | Tương tự cho factory |
| `apps/api/src/modules/telegram-notification/format/error-report.formatter.ts` | Tương tự cho error |

### 5.2 File sửa

| File | Sửa gì |
|---|---|
| `apps/api/src/modules/telegram-notification/telegram-notification.service.ts` | Thêm 3 method `notifyDesignerReport()` / `notifyFactoryReport()` / `notifyErrorReport()` — đều dùng channel key mới `dailyReport` |
| `apps/api/src/modules/telegram-notification/types.ts` | Thêm channel key `'dailyReport'` vào union |
| `apps/api/src/app.module.ts` | Import `ScheduledReportsModule` |
| `apps/api/src/shared/services/api-config.service.ts` | Thêm flag `scheduledReportsEnabled` + override giờ qua env (xem §6) |
| `apps/api/src/modules/order/order.entity.ts` | **Nếu chọn hướng A**: thêm `@Prop() productionErrorAt?: Date` |
| `apps/api/src/modules/order/order.service.ts` | **Nếu chọn hướng A**: set `productionErrorAt = new Date()` trong `updateField('productionError')` (khi value ≠ null) + atomic endpoint `setProductionError()` |

### 5.3 Env vars

```env
# Lịch
SCHEDULED_REPORTS_ENABLED=true
SCHEDULED_REPORTS_TIMEZONE=Asia/Ho_Chi_Minh

# Channel: tái dùng env Phase 1
TELEGRAM_NOTIFICATION_CHANNEL_ID=-1004398820066
TELEGRAM_NOTIFICATION_ENABLED=true
```

Không thêm env mới cho giờ — hardcode 3 cron literal trong service. Đổi giờ = đổi code (rất hiếm), gọn hơn 3 env cron expressions.

### 5.4 Skeleton service

```ts
@Injectable()
export class ScheduledReportsService {
  constructor(
    private readonly designerAgg: DesignerAggregator,
    private readonly factoryAgg: FactoryAggregator,
    private readonly errorAgg: ErrorAggregator,
    private readonly telegram: TelegramNotificationService,
    private readonly config: ApiConfigService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Cron('30 7 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async morningReport() { await this.runAll('morning'); }

  @Cron('0 13 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async noonReport()    { await this.runAll('noon'); }

  @Cron('30 18 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async eveningReport() { await this.runAll('evening'); }

  async runAll(slot: 'morning' | 'noon' | 'evening'): Promise<void> {
    if (!this.config.scheduledReports.enabled) return;
    const period = buildPeriod(new Date(), slot); // { from, to, slot, slotLabel }

    // 3 message liên tiếp, không cùng Promise.all để giữ thứ tự
    await this.safe('designer', () =>
      this.telegram.notifyDesignerReport({
        period, data: await this.designerAgg.aggregate(period),
      }),
    );
    await this.safe('factory', () =>
      this.telegram.notifyFactoryReport({
        period, data: await this.factoryAgg.aggregate(period),
      }),
    );
    await this.safe('error', () =>
      this.telegram.notifyErrorReport({
        period, data: await this.errorAgg.aggregate(period),
      }),
    );
  }

  private async safe(name: string, fn: () => Promise<void>) {
    try { await fn(); }
    catch (e) {
      this.logger.warn({ message: `[scheduled-reports] ${name} failed`, error: String(e) });
    }
  }
}
```

### 5.5 Helper `buildPeriod(now, slot)`

```ts
// Trả về { from, to, slot, slotLabel } — period là 00:00 hôm nay → now
function buildPeriod(now: Date, slot: ReportSlot): ReportPeriod {
  const tz = 'Asia/Ho_Chi_Minh';
  // dùng dayjs hoặc luxon để zone-aware
  const startOfDay = startOfDayInTz(now, tz);
  return {
    from: startOfDay,
    to: now,
    slot,
    slotLabel: SLOT_LABEL[slot], // "sáng" / "trưa" / "tối"
  };
}
```

> Future: nếu user muốn "ca sáng = 00:00–13:00", "ca chiều = 13:00–18:30", chỉ cần đổi logic trong `buildPeriod`. Aggregator + formatter không cần biết.

---

## 6. Aggregation queries (kỹ thuật chi tiết)

### 6.1 Designer aggregator

```ts
async aggregate(period: ReportPeriod): Promise<DesignerReportData> {
  const designers = await this.userRepo.findAll({
    roleId: { $in: [designerRoleId, designerLeaderRoleId] },
    isActive: true,
  });

  // 1 pipeline duy nhất — group per (assignee, designerStatus)
  const rows = await this.orderModel.aggregate([
    { $match: { deletedAt: null /* không filter date — count snapshot hiện tại */ } },
    {
      $facet: {
        // Per-designer status snapshot
        snapshot: [
          { $group: {
              _id: { assignee: '$assignee', status: '$designerStatus' },
              count: { $sum: 1 },
          }},
        ],
        // Số task được "kích hoạt" trong period (assigned trong ngày)
        todayAssigned: [
          { $match: {
              designerAssignedAt: { $gte: period.from, $lte: period.to },
          }},
          { $group: { _id: '$assignee', count: { $sum: 1 } } },
        ],
        // Đếm "Chưa gán" global (assignee=null)
        unassigned: [
          { $match: { $or: [{ assignee: null }, { assignee: { $exists: false } }] } },
          { $count: 'count' },
        ],
      },
    },
  ]);

  return mapToDesignerReport(designers, rows[0]);
}
```

- Total query thời gian: ~50-100ms với 10K orders (test trên dataset hiện tại).
- "T.Day" = `todayAssigned.count` per designer.
- "Gán/Đ.làm/Xong/Lỗi" = `snapshot[assignee][status]`.

### 6.2 Factory aggregator

```ts
const rows = await this.orderModel.aggregate([
  { $match: {
      deletedAt: null,
      factoryId: { $exists: true, $ne: null },
      originalFactoryId: { $exists: true, $ne: null },
  }},
  { $group: {
      _id: '$factoryId',
      total: { $sum: 1 },
      notPrintedCount: { $sum: { $cond: [
        { $or: [
          { $eq: [{ $ifNull: ['$printStatus', ''] }, ''] },
        ]}, 1, 0,
      ]}},
      printingCount: { $sum: { $cond: [
        { $and: [
          { $ne: [{ $ifNull: ['$printStatus', ''] }, ''] },
          { $not: [{ $in: ['$printStatus', PRINTED_MACHINE_CODES] }] },
        ]}, 1, 0,
      ]}},
      printedCount: { $sum: { $cond: [
        { $in: ['$printStatus', PRINTED_MACHINE_CODES] }, 1, 0,
      ]}},
      errorCount: { $sum: { $cond: [
        { $ne: [{ $ifNull: ['$productionError', ''] }, ''] }, 1, 0,
      ]}},
      transferredInCount: { $sum: { $cond: [
        { $ne: ['$factoryId', '$originalFactoryId'] }, 1, 0,
      ]}},
      transferredOutGroup: { $push: {
        $cond: [{ $ne: ['$factoryId', '$originalFactoryId'] }, '$originalFactoryId', '$$REMOVE'],
      }},
  }},
]);
// Plus: 1 query đếm "Chưa XĐ" (factoryId=null) global
```

> Note: "Đã chuyển đi" per-xưởng phức tạp hơn — cần 1 group thứ 2 theo `originalFactoryId`. Tách thành 2 aggregate parallel, merge ở app layer.

### 6.3 Error aggregator

```ts
const PROD_ERROR_FILTER = {
  deletedAt: null,
  productionError: { $exists: true, $nin: [null, ''] },
};

const facet = await this.orderModel.aggregate([
  { $match: PROD_ERROR_FILTER },
  { $facet: {
      bySource: [
        { $group: { _id: { $ifNull: ['$productionErrorSource', 'unknown'] }, count: { $sum: 1 } } },
      ],
      byUrgency: [
        { $project: {
            ageHours: { $divide: [
              { $subtract: [new Date(), { $ifNull: ['$productionErrorAt', '$updatedAt'] }] },
              3600 * 1000,
            ]},
        }},
        { $bucket: {
            groupBy: '$ageHours',
            boundaries: [0, 24, 48, 72, Infinity],
            default: 'unknown',
            output: { count: { $sum: 1 } },
        }},
      ],
      topCodes: [
        { $group: { _id: '$productionError', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ],
      total: [ { $count: 'count' } ],
  }},
]);
```

- `urgencyBuckets`: `[0..24] = mới, [24..48] = cần làm ngay, [48..72] = gấp, [72..∞] = khẩn cấp`.
- Fallback `productionErrorAt → updatedAt` cho data legacy chưa có timestamp (sau khi backfill xong, dùng thẳng `productionErrorAt`).
- `topCodes`: resolve `_id → name` qua `WorkshopConfigRepository.findAll({ category: 'production_error' })`.

---

## 7. Mở đường multi-channel + mention user (cho tương lai)

Yêu cầu **hiện tại**: 1 channel duy nhất. Nhưng **thiết kế giữ chỗ** sẵn để scale.

### 7.1 Multi-channel — design

Đổi `channelFor(key)` từ trả `string` → `string[]`:

```ts
// telegram-notification.service.ts (refactor)
private channelsFor(key: NotificationChannelKey): string[] {
  const c = this.config.telegram;
  const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  switch (key) {
    case 'dailyReport':
      // Phase 2: 1 ID. Phase 3+: comma-separated → multi-channel.
      return csv(c.notificationChannelId || c.channelId);
    // ...
  }
}

private async send(key, text, options) {
  const channels = this.channelsFor(key);
  if (channels.length === 0) { /* log warn */ return; }
  // Parallel send, không block nhau
  await Promise.allSettled(
    channels.map((id) => this.telegramService.sendMessageToChannel(id, text, options)),
  );
}
```

Phase 2 chỉ cần **đổi internal API** (`channelFor → channelsFor`, `send` loop). Env vẫn 1 ID — backward compatible. Tương lai chỉ cần **set comma-separated trong env**:

```env
TELEGRAM_NOTIFICATION_CHANNEL_ID=-1004398820066,-1009999888777
```

→ Service tự loop, không cần code mới.

### 7.2 Mention user — design

Thêm 1 field optional vào payload:

```ts
type DesignerReportNotification = {
  period: ReportPeriod;
  data: DesignerReportData;
  mentions?: Array<{ telegramUserId: string; displayName: string }>;
};
```

Formatter append vào cuối message nếu có mention:

```
... (báo cáo)

cc: [Nam](tg://user?id=123456789) [Linh](tg://user?id=987654321)
```

**Source data:**
- Hiện tại: `UserEntity` chưa có `telegramUserId` (chỉ có `telegramChatId` cho per-user noti). Đề xuất **thêm field mới**:
  ```ts
  @Prop() telegramUserId?: string;  // numeric ID, vd "123456789"
  ```
- Aggregator quyết định ai cần tag: vd. nếu `unassignedCount > 10` → tag DesignerLeader; nếu xưởng X có `errorCount > 5` → tag user role=Fulfillment có `factoryId=X`.

**Phase này KHÔNG implement mention** — chỉ chừa hook ở interface formatter để Phase sau add 1 dòng:

```ts
// formatter
if (mentions?.length) lines.push(`\ncc: ${mentions.map(m => `[${m.displayName}](tg://user?id=${m.telegramUserId})`).join(' ')}`);
```

→ **Rất nhỏ effort** khi cần.

### 7.3 Per-recipient gating (xa hơn)

Tương lai nếu cần "DesignerLeader nhận designer report; Production manager nhận factory report; toàn bộ admin nhận error report" → thêm enum `RecipientGroup` + map mỗi report → 1 group → 1 channel. Khung `NotificationChannelKey` đã đa-key sẵn (`importSummary | hourlyStats | criticalError | dailyReport`) — chỉ cần split `dailyReport` thành `dailyDesignerReport / dailyFactoryReport / dailyErrorReport` lúc đó.

---

## 8. Permission / Auth

Cron là **system-triggered** — không cần `@AuthUser()` decorator. Service không expose HTTP endpoint.

**Trừ khi** muốn thêm endpoint manual trigger cho admin (debug):
```
POST /v1/reports/run-now?slot=now&report=designer
@Auth([RoleType.SuperAdmin, RoleType.Admin])
```
→ Tùy chọn, không bắt buộc Phase 2.

---

## 9. Edge cases & risks

| Risk | Mitigation |
|---|---|
| Cron fire khi DB chưa connect (boot race) | NestJS `@Cron` chỉ fire sau `onModuleInit` — không vấn đề |
| 2 instance API chạy (PM2 cluster) → 2 lần fire | PM2 config hiện single instance (xem `ecosystem.config.cjs`). Nếu sau này scale → cần **distributed lock** (Redis `SETNX` với TTL 1 phút) trong `runAll` |
| Telegram rate limit (30 msg/sec/group, 1 msg/sec same group) | 3 msg liên tiếp/lần fire, không vượt limit. Có thể thêm `await sleep(500)` giữa 3 msg cho an toàn |
| Message > 4096 chars (nhiều designer/xưởng) | Truncate top-N, hoặc split thành 2 message với header `(1/2)` `(2/2)` |
| Aggregate chậm (DB load nặng giờ peak) | Cron 7:30/13:00/18:30 đã tránh giờ peak (giờ làm việc 8h–18h). Worst case ~500ms aggregate × 3 report = 1.5s — chấp nhận được |
| MarkdownV2 escape sai → Telegram reject 400 | Helper `escapeMdV2(s)` cho tên user/xưởng/factory; unit test escape |
| Designer/Factory name có ký tự đặc biệt (vd. `*`, `_`) phá code block | Code block ``` ``` không cần escape — đây là điểm mạnh; nhưng tên ngoài code block (header, mentions) thì cần |
| `productionErrorAt` chưa migrate → urgency bucket sai | Backfill `onModuleInit` (xem §2.2) — có log report số rows backfilled |
| Cron miss khi server restart đúng giờ fire | NestJS `@Cron` không có "missed run" recovery. Nếu critical → thêm manual trigger endpoint để admin re-run thủ công |

---

## 10. Quyết định đã chốt (2026-06-22)

1. ✅ **`productionErrorAt`** — hướng **A**, nhưng **không cần thêm field**: schema đã có `productionFirstErrorAt` (set trong `updateField('productionError')` + backfill `onModuleInit`). Reuse field này. Boundaries urgency cũng đã có sẵn cho tab "Nhật ký bù lỗi" — reuse cho consistency.
2. ✅ **"Đã in"** = **đã in xong** (= `printStatus ∈ PRINTED_MACHINE_CODES`)
   - Bảng factory đổi nhãn cột: bỏ "Đ.in" (đang in), đổi "Xong" → "**Đã in**"
   - Bảng còn lại 6 cột: Tổng / Chưa in / **Đã in** / Lỗi / Nhận / Đi
3. ✅ **"Mới"** = **< 24h** kể từ `productionErrorAt`
4. ✅ **Designer list** = (a) — list toàn bộ user role Designer/DesignerLeader, kể cả 0 task
5. ✅ **Period — theo ca rõ ràng:**
   - Cron 07:30 → ca **đêm/sáng sớm** = `[18:30 hôm qua, 07:30 hôm nay]` (13h)
   - Cron 13:00 → ca **sáng** = `[07:30, 13:00]` cùng ngày (5.5h)
   - Cron 18:30 → ca **chiều** = `[13:00, 18:30]` cùng ngày (5.5h)
   - Helper `buildShiftPeriod(now, slot)` build window này
6. ✅ **Layout** monospace table trong code block — dễ scan trên desktop, mobile vẫn đọc được nếu cột < 50 char
7. ✅ **Endpoint manual trigger** `POST /v1/reports/run-now?slot=morning|noon|evening&report=designer|factory|error|all` — Admin/SuperAdmin only
8. ✅ **3 message riêng/lần fire**

### Snapshot vs period semantics

Vì period là "ca vừa qua" (5.5h), nhiều metric snapshot không hợp với period. Quy ước:

| Metric | Theo ca | Snapshot hiện tại |
|---|---|---|
| Designer "Trong ca" (số task được gán trong ca) | ✅ | — |
| Designer "Xong trong ca" | ✅ | — |
| Designer Gán/Đ.làm/Lỗi | — | ✅ (count hiện tại) |
| Factory tất cả cột | — | ✅ (snapshot) |
| Error tổng + source + top codes | — | ✅ (đơn lỗi đang mở) |
| Error urgency | — | ✅ (theo `now - productionErrorAt`) |

Báo cáo có header `Ca sáng (07:30 → 13:00)` để rõ context, nhưng nội dung là **snapshot tại thời điểm fire** + 2 metric đặc biệt theo ca cho designer.

---

## 11. Milestone

| # | Việc | Effort |
|---|---|---|
| 1 | (Quyết định §10 với user) | — |
| 2 | Thêm `productionErrorAt` field + hook vào `updateField` + backfill `onModuleInit` | 1.5h |
| 3 | Tạo `scheduled-reports` module + service + 3 cron skeleton | 1h |
| 4 | Implement `DesignerAggregator` + unit test | 2h |
| 5 | Implement `FactoryAggregator` + unit test | 2h |
| 6 | Implement `ErrorAggregator` + unit test | 1.5h |
| 7 | Implement 3 formatter MarkdownV2 + escape helper | 2h |
| 8 | Refactor `TelegramNotificationService.send` → multi-channel ready (channelsFor) | 0.5h |
| 9 | Wire 3 method `notifyXReport()` vào service | 1h |
| 10 | Manual test: trigger qua endpoint debug, verify message render đúng trên Telegram | 1h |
| 11 | Doc `documents/FunctionDescription/ScheduledReports.md` + thêm dòng mapping vào `CLAUDE.md` | 1h |
| 12 | Mở comment 3 `@Cron` trong production (sau khi confirm aggregator đúng) | 0.5h |

**Tổng:** ~14h (~2 ngày dev). Không động FE.

---

## 12. Roll-out steps

1. Deploy với `SCHEDULED_REPORTS_ENABLED=false` → service load nhưng cron skip
2. Chạy migration backfill `productionErrorAt` 1 lần (qua `onModuleInit` hoặc endpoint admin)
3. Trigger thủ công qua endpoint debug: verify 3 report trên Telegram đúng số liệu
4. Đối chiếu với Dashboard Tab D + Tab C (cùng query base) → number match
5. Bật `SCHEDULED_REPORTS_ENABLED=true` → đợi cron tự fire ngày hôm sau lúc 7:30
6. Monitor 1 tuần: nếu OK → đóng plan, nếu cần điều chỉnh giờ/format → vòng lặp ngắn

---

## Tài liệu liên quan

- [telegram-notification.md](./telegram-notification.md) — Phase 1 (đã xong)
- [Dashboard.md](../FunctionDescription/Dashboard.md) §10 — Factory overview (cùng data source factory report)
- [Dashboard.md](../FunctionDescription/Dashboard.md) Tab D — Designer stats (tham khảo cách aggregate designer)
- [DesignerTaskWorkflow.md](../FunctionDescription/DesignerTaskWorkflow.md) §3, §5.7 — Schema designer + getPerformance
- [WorkshopConfig.md](../FunctionDescription/WorkshopConfig.md) — production_error codes + errorSource
- [Auth.md](../FunctionDescription/Auth.md) §7.2 — DesignerLeader/Fulfillment role permissions
