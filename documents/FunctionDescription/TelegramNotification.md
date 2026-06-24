# Telegram Notification & Scheduled Reports — Function Description

> **File BE:**
>  - `apps/api/src/modules/telegram-notification/` — gửi tin + format message
>  - `apps/api/src/modules/scheduled-reports/` — cron 3 lần/ngày + aggregate dữ liệu
>  - `packages/core/services/telegram.service.ts` — HTTP client bot Telegram
>  - `apps/api/src/shared/services/api-config.service.ts` → `config.telegram` + `config.scheduledReports`
>
> **File FE:**
> - `apps/web/src/pages/home/SendTelegramReportButton.tsx` — Popover button trên Dashboard header (chỉ Admin/SuperAdmin)
> - `apps/web/src/pages/home/index.tsx` → conditional render `{isAdmin && <SendTelegramReportButton />}`
> - `apps/web/src/services/reports.ts` → `runNow({ slot?, report? })`
>
> **API:** `POST /api/v1/reports/run-now` (Admin manual trigger)
>
> **Plan gốc:**
>  - [`documents/Plans/telegram-notification.md`](../Plans/telegram-notification.md) — Phase 1
>  - [`documents/Plans/telegram-scheduled-reports.md`](../Plans/telegram-scheduled-reports.md) — Phase 2

---

## 1. Overview

Hệ thống bắn thông báo + báo cáo qua **Telegram Bot** tới 1 channel duy nhất (kiến trúc đã ready cho multi-channel + tag user). Gồm 2 luồng:

### 1.1 Phase 1 — Notification theo sự kiện
Bắn tin ngay khi có sự kiện business. Hiện tại có 1 trigger: **import đơn hàng** (`POST /v1/orders/import`).

### 1.2 Phase 2 — Báo cáo định kỳ (Scheduled Reports)
Cron tự fire 3 lần/ngày (giờ VN), mỗi lần gửi **3 message độc lập**:
- **Designer report** — số task theo từng designer + tổng + chưa gán
- **Factory report** — số đơn theo từng xưởng (chưa in / đã in xong / lỗi / nhận / chuyển đi)
- **Error report** — tổng đơn lỗi đang mở, phân loại theo nguồn + urgency 4 mức

### 1.3 Mục tiêu thiết kế
- **Tách concerns**: `scheduled-reports` lo aggregate data + cron; `telegram-notification` lo format + send.
- **Multi-channel ready**: refactor `channelFor → channelsFor` trả `string[]`, env hỗ trợ comma-separated.
- **Mention user ready**: payload có hook `mentions?: TelegramMention[]`, formatter append `[Name](tg://user?id=...)` ở cuối.
- **Fault-tolerant**: mọi noti chạy `void` + try/catch — Telegram down không block business logic.

---

## 2. Luồng hoạt động

### 2.1 Import summary notification
```
User import file đơn hàng (POST /v1/orders/import)
  ↓
OrderService.importOrders() chạy loop, gom factoryCount + unassignedFactoryCount
  ↓
Cuối hàm: void this.sendImportSummaryNotification({...}) — fire-and-forget
  ↓
OrderService.sendImportSummaryNotification:
  - FactoryRepository.findAll({_id: $in ids}) → resolve ID → name
  - TelegramNotificationService.notifyImportSummary({...})
  ↓
formatImportSummary() build message Markdown
  ↓
TelegramService.sendMessageToChannel(channelId, text, {parseMode: 'Markdown'})
  ↓
Channel Telegram nhận message:
  📦 Import đơn — 22/06/2026 15:42
  👤 Bởi: tam.cbec@gmail.com
  📊 Tổng quan
     • Tạo mới: 124 · Cập nhật: 38 · Bỏ qua: 2
  🏭 Theo xưởng
     • Xưởng A: 80 · Xưởng B: 42
  ⚠️ Chưa xác định xưởng: 28
  ⏱ Thời gian: 4.2s
```

### 2.2 Scheduled reports flow
```
@Cron('30 7 * * *', timeZone: 'Asia/Ho_Chi_Minh')
  → ScheduledReportsService.morningReport()
  → runAll('morning')

runAll(slot):
  if (!config.scheduledReports.enabled) return
  return run({ slot, reports: ['designer', 'factory', 'error'] })

run(options):
  period = buildShiftPeriod(now, slot)  // { from, to, slot, slotLabel }
  for each reportKey in options.reports:
    safe(reportKey, async () => {
      data = await xxxAggregator.aggregate(period)
      await telegram.notifyXReport({ period, data, generatedAt: new Date() })
    })

  → 3 message gửi liên tiếp tới channel
  → Trả về { ran: [...], skipped: [...] }
```

### 2.3 Manual trigger flow (debug)
```
Admin POST /v1/reports/run-now?slot=noon&report=designer
  ↓
ScheduledReportsController.runNow():
  - validateSlot(slot)
  - parseReports(report) → ['designer'] hoặc undefined (all)
  - ScheduledReportsService.run({ slot, reports })
  ↓
Response: { success: true, data: { ran: ['designer'], skipped: [], slot: 'noon' } }
```

---

## 3. API / Schema

### 3.1 Endpoint

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/v1/reports/run-now` | SuperAdmin / Admin | Manual trigger báo cáo theo cron. Query: `slot=morning\|noon\|evening` (optional, default = current slot), `report=designer\|factory\|error\|all` (optional, default = all). Trả `{ ran[], skipped[], slot }`. |

### 3.2 Lịch chạy cron (giờ VN)

| Cron name | Expression | Slot | Period nội bộ (cho metric "Trong ca") |
|---|---|---|---|
| `scheduled-reports-morning` | `30 7 * * *` | `morning` | 18:30 hôm trước → 07:30 hôm nay |
| `scheduled-reports-noon` | `0 13 * * *` | `noon` | 07:30 → 13:00 cùng ngày |
| `scheduled-reports-evening` | `30 18 * * *` | `evening` | 13:00 → 18:30 cùng ngày |

> Tất cả pin `timeZone: 'Asia/Ho_Chi_Minh'`. Server múi giờ khác vẫn fire đúng giờ VN.

### 3.3 Env vars

```env
# Telegram bot
TELEGRAM_BOT_TOKEN=<token, có hoặc không prefix 'bot' đều OK>
TELEGRAM_CHANNEL_ID=<chat_id fallback>
TELEGRAM_NOTIFICATION_CHANNEL_ID=<chat_id channel nhận noti, có thể là CSV để gửi nhiều channel>
TELEGRAM_SCAN_NOTIFICATION_CHANNEL_ID=<chat_id cho criticalError key>
TELEGRAM_NOTIFICATION_ENABLED=true|false   # master switch cho mọi Telegram noti
SCHEDULED_REPORTS_ENABLED=true|false       # bật/tắt cron + manual trigger
```

### 3.4 Schema dữ liệu nguồn

Không thêm field mới. Các field đã có sẵn được dùng:

**OrderEntity:**
- `assignee` (string user._id), `designerStatus` (6 trạng thái)
- `designerAssignedAt`, `designerCompletedAt` (period "Trong ca")
- `factoryId`, `originalFactoryId` (transfer state)
- `printStatus` (chưa in / đã in xong via `PRINTED_MACHINE_CODES`)
- `productionError`, `productionErrorSource`, `productionFirstErrorAt` (urgency bucket)

**UserEntity:** `roleId` (filter Designer/DesignerLeader).
**RoleEntity:** `name: RoleType`.
**FactoryEntity:** `name`, `shortName`, `isActive`.
**WorkshopConfigEntity:** category `production_error` — resolve error code → name.

---

## 4. Backend modules

### 4.1 `apps/api/src/modules/telegram-notification/`

```
telegram-notification/
├── telegram-notification.module.ts
├── telegram-notification.service.ts    ← gửi tin, multi-channel ready
├── types.ts                            ← 4 notification type + TelegramMention + NotificationChannelKey
└── format/
    ├── _helpers.ts                     ← escapeMd, N(n), clamp, DIVIDER — dùng chung 4 formatter
    ├── import-summary.formatter.ts     ← Phase 1
    ├── designer-report.formatter.ts    ← compact + N() bold-non-zero
    ├── factory-report.formatter.ts     ← compact + N() bold-non-zero
    └── error-report.formatter.ts       ← skip empty buckets + critical alert
```

**`TelegramNotificationService`** — 4 method public:
- `notifyImportSummary(payload)` — Phase 1
- `notifyDesignerReport(payload)` — Phase 2
- `notifyFactoryReport(payload)` — Phase 2
- `notifyErrorReport(payload)` — Phase 2

**Internal `dispatch(key, text)`:**
1. Check `config.telegram.notificationEnabled` — skip nếu false
2. `channelsFor(key)` → trả `string[]` (parse CSV từ env)
3. `Promise.allSettled(channels.map((id) => telegramService.sendMessageToChannel(...)))`
4. Log warning nếu có channel fail (không throw)

**Channel routing** (`channelsFor`):
| Key | Env source |
|---|---|
| `importSummary` / `hourlyStats` / `dailyReport` | `TELEGRAM_NOTIFICATION_CHANNEL_ID` (fallback `TELEGRAM_CHANNEL_ID`) |
| `criticalError` | `TELEGRAM_SCAN_NOTIFICATION_CHANNEL_ID` (fallback `TELEGRAM_CHANNEL_ID`) |

**Mention hook** (`withMentions(text, mentions?)`):
- Nếu payload có `mentions: [{telegramUserId, displayName}]` → append `cc: [Name](tg://user?id=xxx)` ở cuối message
- Telegram sẽ push notification cho user nếu họ là member của chat

### 4.2 `apps/api/src/modules/scheduled-reports/`

```
scheduled-reports/
├── scheduled-reports.module.ts
├── scheduled-reports.service.ts           ← 3 @Cron + runAll + run(options) + safe()
├── scheduled-reports.controller.ts        ← POST /v1/reports/run-now
├── build-period.ts                        ← buildShiftPeriod() + formatVn helpers
├── types.ts                               ← DesignerReportData / FactoryReportData / ErrorReportData / ReportPeriod
└── aggregators/
    ├── designer-aggregator.ts
    ├── factory-aggregator.ts
    └── error-aggregator.ts
```

**`ScheduledReportsService`:**
- `@Cron` × 3 — gọi `runAll(slot)`
- `runAll(slot)` — check enabled flag, gọi `run({slot, reports:['designer','factory','error']})`
- `run(options)` — core logic: build period → aggregate → notify, mỗi report wrap trong `safe()` để không kéo cái khác fail
- `safe(name, fn)` — try/catch + Winston log warning, return boolean

### 4.3 `DesignerAggregator`

1 pipeline `$facet` 4 nhánh:
- **snapshot**: group `(assignee, designerStatus)` → count current state
- **assignedInShift**: `designerAssignedAt ∈ [from, to]` → count per assignee
- **doneInShift**: `designerCompletedAt ∈ [from, to]` → count per assignee
- **unassigned**: `assignee in [null, '', missing] AND designerStatus='unassigned'` → count global

Sort row theo (`totalInShift + assignedNow + inProgressNow + reworkNow`) desc, top 15.

### 4.4 `FactoryAggregator`

3 query song song:
- **byCurrent**: group theo `factoryId` (hiện tại), conditional sum `notPrinted / printed / error / transferredIn`
- **byOrigin**: group theo `originalFactoryId` với `$expr: factoryId ≠ originalFactoryId` → đếm `transferredOut`
- **unmappedCount**: `countDocuments({factoryId: null|missing|''})`

Constant `PRINTED_MACHINE_CODES = ['machine-1', 'machine-2', 'machine-3', 'machine-4', 'machine-94']` (dùng chung với `order.service.ts`).

Catch-all: orders với `factoryId` không match factory active (legacy/orphan) cũng được liệt kê dùng `nameById` map.

### 4.5 `ErrorAggregator`

1 pipeline `$facet` 4 nhánh:
- **total**: `countDocuments({productionError ≠ null, ≠ ''})`
- **bySource**: group `productionErrorSource` → designer/factory/unknown
- **byUrgency**: `$bucket` boundaries `[0, 24h, 48h, 72h, ∞]` theo `ageMs = now - (productionFirstErrorAt || updatedAt)`
- **topCodes**: group `productionError`, sort desc, limit 10

Resolve error code → name qua `WorkshopConfigRepository.findAll({category: ProductionError, code: $in})`.

### 4.6 Helper `buildShiftPeriod(now, slot)`

Tính `from` + `to` theo VN time (UTC+7) bằng cách offset UTC:
- `morning`: 18:30 yesterday → 07:30 today
- `noon`: 07:30 → 13:00
- `evening`: 13:00 → 18:30

Helper `formatVnDateTime` + `formatVnHourMinute` — render VN time cho header message.

### 4.7 `packages/core/services/telegram.service.ts`

`TelegramService.sendMessageToChannel(channelId, message, options)`:
- POST `https://api.telegram.org/bot${token}/sendMessage` (auto strip prefix `bot` từ token nếu env có)
- Body JSON: `{chat_id, text, parse_mode, disable_web_page_preview, disable_notification}`
- Timeout default 5s
- Catch axios error → log warning với `description` từ Telegram API → return false
- Caller dùng return value để log thất bại

---

## 5. Message format

### 5.1 Quy tắc chung
- `parse_mode: 'Markdown'` — tương thích cả desktop + mobile
- Escape `_ * \` [ ]` trong tên/email/factory name (helper `escapeMd`)
- Max 4096 char — nếu vượt thì cắt + append `... (cắt bớt)`
- **Shared helpers** ở `format/_helpers.ts`: `escapeMd`, `N(n)`, `clamp`, `DIVIDER`

### 5.2 Triết lý hiển thị (refactored 2026-06-24)

**Vấn đề trước:** mỗi metric kèm 1 emoji (📥 ✅ 📌 ⏳ ⚠️) → mỗi designer/xưởng 5 emoji × N entity = wall of icons. Khi đa số là 0 vẫn bold → mắt mệt.

**Quy tắc mới:**

1. **Emoji chỉ ở section header** (🎨 designer, 🏭 xưởng, ⚠️ lỗi, 📦 import). KHÔNG dùng emoji per metric.
2. **Helper `N(n)`** — `n > 0` → `*N*` bold, `n = 0` → text thường (sink into background). Mắt quét nhanh thấy ngay số đáng chú ý.
3. **Bullet `▸`** thay cho `1.` `2.` numbering.
4. **Compact mode** — designer/xưởng không có hoạt động → 1 dòng `▸ *Name* — _chưa có hoạt động_` thay vì 2-3 dòng zeros.
5. **Skip metric line khi all-zero** — vd "Gán/Lỗi" chỉ render khi có ≥ 1 metric > 0.
6. **`─────────────`** divider thanh nhẹ thay `━━━━━━━━━━━━━━━━━━━━━━` dày.
7. **Critical alert tách block riêng cuối message** — `🚨` cho số nguy hiểm (chưa gán, khẩn cấp ≥ 3 ngày).

### 5.3 Ví dụ — Designer report (low activity)
```
🎨 *Báo cáo Designer*
_Ca đêm/sáng sớm · 18:30 → 07:30_
_Snapshot 24/06/2026 07:30_

▸ *designer* — _chưa có hoạt động_
▸ *Huy hiển thị* — _chưa có hoạt động_

─────────────
🎯 *Tổng (2 designer)*
   Trong ca 0 · Xong 0 · Đang làm 0

🚨 *Đơn chưa gán cho ai: 157*
```

### 5.4 Ví dụ — Designer report (có hoạt động)
```
🎨 *Báo cáo Designer*
_Ca sáng · 07:30 → 13:00_
_Snapshot 24/06/2026 13:00_

▸ *Nguyễn Văn A*
   Trong ca *12* · Xong *8* · Đang làm *2*
   Gán *3* · ⚠️ Lỗi *2*

▸ *Huy hiển thị*
   Trong ca *5* · Xong *3* · Đang làm *1*

▸ *designer* — _chưa có hoạt động_

─────────────
🎯 *Tổng (3 designer)*
   Trong ca *17* · Xong *11* · Đang làm *3*
   Gán *3* · ⚠️ Lỗi *2*

🚨 *Đơn chưa gán cho ai: 88*
```

### 5.5 Ví dụ — Factory report
```
🏭 *Báo cáo Xưởng*
_Ca đêm/sáng sớm · Snapshot 24/06/2026 07:30_

▸ *ML* · *102* đơn
   Chưa in *102* · Đã xong 0

▸ *TN* · *55* đơn
   Chưa in *55* · Đã xong 0

▸ *US* · 0 đơn — _không có đơn_

─────────────
🎯 *Tổng (3 xưởng) · 157 đơn*
   Chưa in *157* · Đã xong 0
```

### 5.6 Ví dụ — Error report (no issues)
```
⚠️ *Báo cáo Đơn lỗi*
_Ca sáng · Snapshot 24/06/2026 13:00_

✅ _Không có đơn lỗi nào đang mở._
```

### 5.7 Ví dụ — Error report (có lỗi khẩn cấp)
```
⚠️ *Báo cáo Đơn lỗi*
_Ca chiều · Snapshot 24/06/2026 18:30_

📊 *Tổng đơn lỗi: 24*
   Do xưởng *18* · Do designer *6*

*Theo mức độ ưu tiên*
   🟡 Cần làm (1–2 ngày): *8*
   🟠 Gấp (2–3 ngày): *6*
   🔴 Khẩn cấp (≥ 3 ngày): *5*

*Top mã lỗi*
   • Lỗi in sai: *8*
   • Lỗi kích thước: *6*

─────────────
🚨 *5 đơn khẩn cấp cần xử lý ngay (≥ 3 ngày)*
```

### 5.8 Ví dụ — Import summary
```
📦 *Đã import xong*
_24/06/2026 15:42 · 4.2s_
👤 _Nguyễn Văn A (tam.cbec@gmail.com)_

📊 Tạo mới *124* · Cập nhật *38*

🏭 *Theo xưởng*
   • Xưởng A: *80*
   • Xưởng B: *42*

⚠️ *Chưa xác định xưởng: 28*
```

---

## 6. Performance notes

| Tối ưu | Vị trí |
|---|---|
| 1 round-trip `$facet` mỗi aggregator | Designer / Error (4 nhánh song song) |
| 3 query parallel cho Factory | `Promise.all([byCurrent, byOrigin, unmappedCount])` |
| Fire-and-forget import noti | `void this.sendImportSummaryNotification()` không block response import |
| `Promise.allSettled` cho multi-channel | 1 channel fail không kéo cái khác |
| Workshop code resolve 1 bulk fetch | `WorkshopConfigRepository.findAll({code: $in topCodes})` thay vì N+1 |
| Timeout HTTP Telegram 5s | Tránh hang khi API down |
| `safe()` wrapper từng report | 1 report aggregate fail không kéo cái khác fail; `runAll` vẫn tiếp tục |

Aggregate query thời gian (tham khảo, ~10K orders):
- Designer aggregator: ~50–100ms
- Factory aggregator: ~50ms
- Error aggregator: ~30–80ms

3 message gửi liên tiếp ~1.5s tổng (bao gồm round-trip Telegram API).

---

## 7. Permissions

| Role | Endpoint `/v1/reports/run-now` | Mục đích |
|---|---|---|
| SuperAdmin | ✅ | Manual trigger debug |
| Admin | ✅ | Manual trigger debug |
| Khác | ❌ (403) | Cron tự fire — không cần user trigger |

Cron là **system-triggered** — không có user context. Service log Winston warn nếu có lỗi.

Permission catalog (`packages/shared/constants/permission-catalog.ts`) **không thêm** code mới cho phase này (endpoint debug check role tĩnh).

---

## 8. Edge cases

| Tình huống | Hành vi |
|---|---|
| `TELEGRAM_NOTIFICATION_ENABLED=false` | Mọi noti skip (cả import + scheduled) |
| `SCHEDULED_REPORTS_ENABLED=false` | Cron + manual trigger đều return early, không aggregate, không gửi |
| Channel ID rỗng (cả 2 env) | Log warning `"<key> skipped: no channel configured"`, không throw |
| Telegram timeout/sai token | Log warning với `error.description`, return false; report khác trong cùng `run()` vẫn tiếp tục |
| Designer/Factory list rỗng | Message hiển thị `"Chưa có designer nào..."` thay vì lỗi |
| 0 đơn lỗi trong system | Message hiển thị `"Không có đơn lỗi nào đang mở 🎉"` |
| Message > 4096 char | Truncate cuối + `... (cắt bớt)` |
| Tên có ký tự đặc biệt `*` `_` `[` `]` `` ` `` | Tự động escape qua `escapeMd()` |
| 2 instance API chạy (PM2 cluster) | **Cảnh báo:** sẽ fire 2 lần — hiện PM2 single instance nên không vấn đề. Khi scale cluster cần thêm distributed lock (Redis SETNX) |
| `productionFirstErrorAt` null (legacy data) | Aggregator fallback dùng `updatedAt` cho urgency bucket |

---

## 9. Roll-out & test

### 9.1 Phase 1 — Import notification
Đã enable trong `.env` (`TELEGRAM_NOTIFICATION_ENABLED=true`). Test bằng:
```bash
POST /v1/orders/import — import 1 file Excel small
→ Tin Telegram đến trong < 5s
```

### 9.2 Phase 2 — Scheduled reports
Đã enable (`SCHEDULED_REPORTS_ENABLED=true`). Global prefix BE: `app.setGlobalPrefix('api/v1')` → endpoint thực tế = `/api/v1/reports/run-now`.

Test manual:
```bash
# Login lấy token (15-60 phút TTL)
curl -X POST 'http://localhost:3007/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"email":"<email>","password":"<password>"}'
# → response.data.accessToken

# Trigger report
curl -X POST 'http://localhost:3007/api/v1/reports/run-now' \
  -H "Authorization: Bearer <TOKEN>"
# → { success: true, data: { ran: ['designer','factory','error'], skipped: [], slot: 'noon' } }
# → 3 message Telegram đến liên tiếp
```

Hoặc chỉ 1 report:
```bash
POST /api/v1/reports/run-now?slot=morning&report=designer
```

**401 Unauthorized — checklist:**
- Header `Authorization: Bearer <token>` (chữ B hoa, có space sau Bearer)
- Token chưa expired (login lại nếu > 1 giờ)
- Token ký bằng `JWT_PRIVATE_KEY` hiện tại (login lại nếu vừa rotate key)
- Role user phải là `SuperAdmin` hoặc `Admin`

### 9.3 Verify số liệu
| Báo cáo | So với UI |
|---|---|
| Designer | `/dashboard?tab=designer` Leaderboard |
| Factory | `/dashboard?tab=factory` Factory cards (Tổng / Chưa in / Đã in xong / Lỗi / Nhận / Đi) |
| Error | `/orders?tab=error-log` urgency badges 4 mức |

> Có thể lệch nhẹ vì Dashboard có visibility filter theo role; report là system-wide snapshot.

---

## 10. Khả năng mở rộng tương lai

### 10.1 Multi-channel
Đã ready — chỉ cần đổi env:
```env
TELEGRAM_NOTIFICATION_CHANNEL_ID=-1004398820066,-1009999888777
```
Service `channelsFor()` tự parse CSV, `Promise.allSettled` gửi parallel. Không cần sửa code.

### 10.2 Tag user
Đã có hook `mentions?: TelegramMention[]` trong payload + `withMentions()` formatter. Để implement đầy đủ cần:
1. Thêm field `UserEntity.telegramUserId?: string` (numeric ID Telegram, không phải username)
2. Aggregator quyết định khi nào tag ai (vd. `unassignedNow > 10` → tag DesignerLeader)
3. Pass `mentions` vào `notify*Report({...payload, mentions})`

User cần ở trong chat thì notification mới push (bot không add được user vào chat).

### 10.3 Thêm trigger noti khác
Pattern: thêm method vào `TelegramNotificationService` + formatter mới + caller `void this.telegram.notifyXxx(...)` từ business service tương ứng.

Ví dụ candidates:
- Critical error / system down → `notifyCriticalError()` dùng key `criticalError` (channel riêng)
- Đơn mới gấp (productionFirstErrorAt > 3 days) → noti realtime
- Daily summary tổng kết cuối ngày

### 10.4 Distributed cron (khi scale)
Nếu chạy nhiều API instance:
- Wrap `runAll()` bằng Redis lock `SETNX scheduled-reports:lock:${slot}:${dateISO} 1 EX 300`
- Chỉ instance giữ lock mới chạy

---

## 11. Lịch sử thay đổi

| Phase | Ngày | Việc làm |
|---|---|---|
| Phase 1 | 2026-06-19 | Hạ tầng `TelegramService` (fix POST + parseMode + timeout); module `telegram-notification`; hook `OrderService.importOrders` → bắn summary |
| Phase 2 | 2026-06-22 → 2026-06-23 | Module `scheduled-reports`; 3 cron (07:30/13:00/18:30 VN); 3 aggregator (designer/factory/error); 3 formatter list-based; endpoint manual trigger `/v1/reports/run-now`; refactor `channelFor → channelsFor` multi-channel ready; hook `mentions` cho future tag user |
| Phase 2.1 | 2026-06-23 | Refactor 2 formatter (designer + factory) từ ASCII table → list-based sau khi phát hiện table vỡ trên mobile |
| Phase 2.2 | 2026-06-24 | Redesign 4 formatter: shared `_helpers.ts`, helper `N(n)` (bold > 0, plain = 0), bỏ emoji per metric, bullet `▸`, compact mode "_chưa có hoạt động_", skip empty rows, critical alert tách block riêng. Mục tiêu: giảm "rối mắt" trên mobile khi đa số metric là 0. |
| Phase 2.3 | 2026-06-24 | FE nút manual trigger trên Dashboard header (Admin only). `SendTelegramReportButton.tsx` Popover chọn slot (auto/morning/noon/evening) + loại báo cáo (all/designer/factory/error) → `RepositoryRemote.reports.runNow()` → toast feedback `Đã gửi N báo cáo (...)`. |

---

## Tài liệu liên quan

- [Plans/telegram-notification.md](../Plans/telegram-notification.md) — Plan Phase 1
- [Plans/telegram-scheduled-reports.md](../Plans/telegram-scheduled-reports.md) — Plan Phase 2
- [Dashboard.md](./Dashboard.md) — Source aggregate cho factory/designer
- [DesignerTaskWorkflow.md](./DesignerTaskWorkflow.md) — Schema + state machine designer
- [WorkshopConfig.md](./WorkshopConfig.md) — Production_error codes
- [Orders.md](./Orders.md) — `importOrders` hook point
