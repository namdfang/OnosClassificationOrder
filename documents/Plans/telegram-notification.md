# Plan — Telegram Notification (Import Stats + Hourly Stats)

> **Tạo:** 2026-06-19
> **Phạm vi:** Dựng hạ tầng bắn thông báo Telegram cho `apps/api`, trước mắt bắn thống kê khi import đơn (`POST /v1/orders/import`), sau này mở rộng sang thống kê theo giờ (cronjob).
> **Ước tính:** ~1.5 ngày dev (1 BE + 0.5 docs/test). Không động FE.

---

## 1. Mục tiêu

1. **Hồi sinh hạ tầng Telegram** đã có sẵn (`TelegramService`, env, DI) — chuẩn hóa cách bắn, format message, chọn channel.
2. **Phase 1 (làm ngay):** Mỗi lần `OrderService.importOrders()` chạy xong → gửi 1 message tới channel Telegram với:
   - Tổng đơn import (imported / updated / skipped)
   - Số đơn theo từng xưởng (factory)
   - Số đơn **chưa xác định xưởng** (`factoryId == null`, tức `isMapped = false` hoặc productConfig không có factory)
3. **Phase 2 (sau, để sẵn khung):** Cronjob hằng giờ tổng hợp đơn được import/created trong giờ vừa rồi → gửi cùng format.
4. Đặt nền cho các loại notification khác (lỗi critical, đơn mới, status change...) — đóng gói thành một module dùng chung.

---

## 2. Trạng thái hiện tại (đã verify trong code)

| Hạng mục | Trạng thái | Đường dẫn |
|---|---|---|
| `TelegramService.sendMessageToChannel` | Có | `packages/core/services/telegram.service.ts` |
| DI provider (botToken) | Có, @Global | `apps/api/src/shared/shared.module.ts:26-32` |
| Env vars | Có | `apps/api/.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_NOTIFICATION_CHANNEL_ID`, `TELEGRAM_SCAN_NOTIFICATION_CHANNEL_ID`) |
| Config getter | Có | `apps/api/src/shared/services/api-config.service.ts:133-138` (`configService.telegram.*`) |
| Per-user telegramConfig | Có schema, **chưa dùng tới** ở Phase 1 | `apps/api/src/modules/user/user.entity.ts:126-131` |
| RabbitMQ consumer `*.message.telegram` | **Hỏng** — gọi `userService.sendNotification` không tồn tại | `apps/api/src/modules/user/notification.consumer.ts` |
| Publisher gửi tin | **KHÔNG có** | — |
| `importOrders` đã có counters | Có sẵn `imported / updated / mapped / unmapped / skipped` | `apps/api/src/modules/order/order.service.ts:2063` |

**Hệ quả:** Hạ tầng đủ để gọi trực tiếp `TelegramService.sendMessageToChannel()`. Không cần đi qua RabbitMQ ở Phase 1 (consumer hỏng, mà import là synchronous use-case nên gọi trực tiếp + `void` cho fire-and-forget là đủ).

---

## 3. Kiến trúc đề xuất

```
┌───────────────────────────────────────────────────────────┐
│              apps/api/src/modules/                         │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  telegram-notification/  (mới — feature module)       │ │
│  │  ├── telegram-notification.module.ts                  │ │
│  │  ├── telegram-notification.service.ts                 │ │
│  │  │     • notifyImportSummary(stats)                   │ │
│  │  │     • notifyHourlyStats(stats)         ← Phase 2   │ │
│  │  │     • send(channelKey, message) — internal         │ │
│  │  └── format/                                          │ │
│  │      └── import-summary.formatter.ts                  │ │
│  └─────────────────────────────────────────────────────┘ │
│            ▲                                              │
│            │ inject                                       │
│  ┌─────────┴──────────────────┐                          │
│  │  order/order.service.ts     │                          │
│  │  importOrders() — gọi cuối  │                          │
│  └─────────────────────────────┘                          │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  cronjob/  (đã @Global)                              │ │
│  │  └── thêm 1 cron `@Cron('0 0 * * * *')`              │ │
│  │       gọi telegramNotificationService.notifyHourly() │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
        │
        ▼
   TelegramService.sendMessageToChannel(channelId, text)
   (đã có sẵn ở packages/core)
```

### 3.1 Tại sao tách module riêng (không gọi `TelegramService` thẳng trong `OrderService`)?

- **Tách concerns:** order service chỉ biết "import xong rồi" → gọi 1 method semantic `notifyImportSummary(stats)`. Format/channel/i18n là việc của module noti.
- **Reuse:** Phase 2 (hourly), Phase 3+ (errors, status changes) dùng chung formatter + channel routing.
- **Test:** mock 1 service, không cần mock `TelegramService` ở mọi service.
- **Channel routing:** map từ key semantic (`importSummary`, `hourlyStats`, `criticalError`) sang channelId — dễ đổi env mà không sửa caller.

### 3.2 Fix `TelegramService` (packages/core)

Service hiện tại có vài vấn đề cần xử lý:

| Vấn đề | Fix |
|---|---|
| URL ghép sai: `https://api.telegram.org/${botToken}/sendMessage` → token trong `.env` đã có prefix `bot` nên may mắn không sai, nhưng dễ nhầm | Đổi thành `https://api.telegram.org/bot${botToken}/sendMessage` và **bỏ prefix `bot` trong env** (chuẩn Telegram Bot API) |
| Dùng GET với params, không hỗ trợ `parse_mode` (Markdown/HTML) | Đổi sang POST JSON body, thêm tham số `parseMode?: 'Markdown' \| 'MarkdownV2' \| 'HTML'`, `disableWebPagePreview?: boolean` |
| Không trả lỗi (chỉ `console.log`) — caller không biết có gửi thành công không | Vẫn fire-and-forget được nhưng nên log qua Winston (DI vào API layer), giữ method return `Promise<boolean>` |
| Không có retry / timeout | Thêm `axios` timeout 5s; **không retry trong Phase 1** (đơn giản hóa) — Phase 2+ tính sau nếu cần |

**Lưu ý:** `packages/core` là pure NestJS utility, không inject Winston. Có 2 option:
- **(A)** Giữ `console` ở core, log thật ở `TelegramNotificationService` (wrap call + catch).
- **(B)** Cho `TelegramService` nhận logger qua constructor (như `botToken`).

→ Chọn **(A)** — đơn giản, không phá structure hiện tại.

---

## 4. Phase 1 — Bắn thống kê khi import

### 4.1 Trigger

Cuối hàm `OrderService.importOrders()` (`apps/api/src/modules/order/order.service.ts:2063`), ngay sau `void this.invalidateListCache()` và trước `return`.

```ts
void this.telegramNotificationService.notifyImportSummary({
  triggeredBy: ctx?.user ? { id: String(ctx.user._id), email: ctx.user.email } : undefined,
  totals: { imported, updated, mapped, unmapped, skipped: skipped.length },
  byFactory: await this.buildFactoryBreakdown(logRows),
  unassignedFactoryCount: /* số row có factoryId == undefined */,
  startedAt, finishedAt,
});
```

- `void` — không block response import.
- `try/catch` nuốt lỗi trong service noti — không vì Telegram lỗi mà fail import.

### 4.2 Tính `byFactory` & `unassignedFactoryCount`

Trong vòng for hiện tại đã có `factoryId` per-row. Cách rẻ nhất: **gom đếm ngay trong loop** (không phải query thêm):

```ts
const factoryCount = new Map<string, number>(); // factoryId → count
let unassignedFactoryCount = 0;

// trong loop:
if (factoryId) {
  factoryCount.set(factoryId, (factoryCount.get(factoryId) ?? 0) + 1);
} else {
  unassignedFactoryCount++;
}
```

Sau loop, resolve `factoryId → factoryName`:
- 1 query duy nhất: `factoryRepository.find({ _id: { $in: [...factoryCount.keys()] } })` → map `id → name`.
- Add `OrderModule` import `FactoryModule` (hoặc dùng `FactoryRepository` qua DI — kiểm tra xem đã export chưa).

### 4.3 Format message (Markdown)

```
📦 *Import đơn — 2026-06-19 15:42*

👤 Bởi: tam.cbec@gmail.com
📊 Tổng quan
   • Tạo mới: 124
   • Cập nhật: 38
   • Bỏ qua: 2

🏭 Theo xưởng
   • Xưởng A: 80
   • Xưởng B: 42
   • Xưởng C: 12

⚠️ Chưa xác định xưởng: 28
⏱ Thời gian: 4.2s
```

- `parseMode: 'Markdown'`.
- Escape ký tự đặc biệt (`_`, `*`, `` ` ``, `[`) trong tên xưởng / email.
- Nếu message > 4096 ký tự → cắt list factory, để lại top N + "...và X xưởng khác".
- Sort `byFactory` desc theo count.
- Skip dòng `Theo xưởng` nếu `factoryCount.size === 0`.
- Skip dòng `Chưa xác định` nếu `= 0`.

### 4.4 Channel routing

Map env → key:

```ts
// telegram-notification.service.ts
private channelFor(key: 'importSummary' | 'hourlyStats' | 'criticalError'): string | undefined {
  const c = this.config.telegram;
  switch (key) {
    case 'importSummary':
    case 'hourlyStats':
      return c.notificationChannelId || c.channelId; // fallback
    case 'criticalError':
      return c.scanNotificationChannelId || c.channelId;
  }
}
```

- `TELEGRAM_NOTIFICATION_CHANNEL_ID` đang rỗng trong `.env` → **user phải fill trước khi deploy**.
- Có fallback sang `TELEGRAM_CHANNEL_ID` để không silent-fail.
- Nếu cả 2 rỗng → service log warning + return, không throw.

### 4.5 Edge cases

- **Import 0 row** (tất cả skipped): vẫn gửi message → cho user thấy ai import file lỗi.
- **Telegram timeout/lỗi:** catch, log Winston warn, không retry, không ảnh hưởng response API.
- **Concurrent imports:** mỗi lần import = 1 message độc lập, không cần debounce.
- **Test environment:** thêm env `TELEGRAM_NOTIFICATION_ENABLED=true|false` → service check đầu method, false thì return luôn. Default false ở dev.

---

## 5. Phase 2 — Thống kê theo giờ (để khung sẵn)

### 5.1 Khung cron

Trong `CronjobModule`, thêm:

```ts
@Cron('0 5 * * * *') // mỗi giờ, phút 05 — tránh giờ cao điểm
async hourlyStatsCron() {
  const to = new Date();
  const from = new Date(to.getTime() - 60 * 60 * 1000);
  const stats = await this.orderService.aggregateImportStats({ from, to });
  await this.telegramNotificationService.notifyHourlyStats({ from, to, ...stats });
}
```

### 5.2 Query aggregate

Thêm method `OrderService.aggregateImportStats(range)` dùng Mongo aggregate:

```ts
this.orderModel.aggregate([
  { $match: { createdAt: { $gte: from, $lt: to } } },
  { $group: { _id: '$factoryId', count: { $sum: 1 } } },
]);
```

- Group theo `factoryId` (null = chưa xác định).
- Populate factory name sau khi aggregate.
- Total = sum.

### 5.3 Message format Phase 2

Tương tự Phase 1, header đổi:

```
📈 *Thống kê đơn — Giờ 14:00–15:00 (2026-06-19)*
...
```

### 5.4 Phase 2 chỉ làm khi user xác nhận

Phase 1 đẩy trước. Phase 2 viết khung file (commented `@Cron` + method aggregate) nhưng **chưa enable** — user bật khi đã verify Phase 1 chạy ổn.

---

## 6. Files cần thêm / sửa

### Thêm mới

| File | Mục đích |
|---|---|
| `apps/api/src/modules/telegram-notification/telegram-notification.module.ts` | Module, import `FactoryModule` (cho FactoryRepository) |
| `apps/api/src/modules/telegram-notification/telegram-notification.service.ts` | `notifyImportSummary`, `notifyHourlyStats`, `send` (private), `channelFor` (private) |
| `apps/api/src/modules/telegram-notification/format/import-summary.formatter.ts` | Pure function build message Markdown từ stats |
| `apps/api/src/modules/telegram-notification/types.ts` | `ImportSummaryNotification`, `HourlyStatsNotification` types |

### Sửa

| File | Sửa gì |
|---|---|
| `packages/core/services/telegram.service.ts` | Fix URL, đổi sang POST, thêm `parseMode`, timeout, types |
| `packages/core/services/index.ts` | (đã export) — không cần sửa |
| `apps/api/src/modules/order/order.module.ts` | Import `TelegramNotificationModule` |
| `apps/api/src/modules/order/order.service.ts` | Inject `TelegramNotificationService`; trong loop import build `factoryCount` + `unassignedFactoryCount`; cuối hàm `void this.telegramNotificationService.notifyImportSummary(...)` |
| `apps/api/src/app.module.ts` | Import `TelegramNotificationModule` |
| `apps/api/.env`, `.env.development.example` | Document `TELEGRAM_NOTIFICATION_ENABLED`, điền `TELEGRAM_NOTIFICATION_CHANNEL_ID` (production) |
| `apps/api/src/shared/services/api-config.service.ts` | Thêm getter `notificationEnabled` (boolean) |

### Cleanup (tùy chọn, làm trong cùng PR)

- `apps/api/src/modules/user/notification.consumer.ts` — đang reference `userService.sendNotification` không tồn tại → xóa file + bỏ khỏi module hoặc implement. Khuyến nghị **xóa** vì model RabbitMQ hiện không có producer.

### Documentation update

- Cập nhật `documents/FunctionDescription/Orders.md` — thêm section "Telegram notification on import".
- Tạo `documents/FunctionDescription/TelegramNotification.md` — feature description (tham chiếu vào bảng mapping ở `CLAUDE.md`).
- Thêm dòng mapping vào bảng "Feature → Doc mapping" trong `CLAUDE.md`.

---

## 7. Env vars cần set trước khi deploy

```env
# .env (production)
TELEGRAM_BOT_TOKEN=<token thật, KHÔNG có prefix `bot`>
TELEGRAM_NOTIFICATION_CHANNEL_ID=<chat_id của group nhận noti import>
TELEGRAM_NOTIFICATION_ENABLED=true
```

**Lưu ý migration:** `.env` hiện đang lưu token dạng `bot<TOKEN>` → cần bỏ prefix `bot` sau khi đổi service ghép URL `bot${token}`. Kiểm tra lại env trên VPS trước khi deploy.

---

## 8. Milestone

| # | Việc | Effort |
|---|---|---|
| 1 | Fix `TelegramService` (core) + viết unit test format URL | 1h |
| 2 | Tạo `telegram-notification` module + service + formatter | 3h |
| 3 | Wire vào `OrderService.importOrders` + tính `byFactory` + `unassignedFactoryCount` | 2h |
| 4 | Update env files + ApiConfigService getter | 0.5h |
| 5 | Test end-to-end import → message vào Telegram group thật | 1h |
| 6 | Cleanup consumer hỏng + viết doc `Orders.md` / `TelegramNotification.md` | 1.5h |
| 7 | **(Phase 2)** Thêm khung cron hourly stats (chưa enable) | 2h |

**Tổng Phase 1:** ~9h. **Phase 2:** +2h khi user bật đèn xanh.

---

## 9. Rủi ro & mitigation

| Rủi ro | Mitigation |
|---|---|
| Telegram API down / timeout → block import response | `void` + try/catch trong service noti, timeout 5s |
| Token leak vào log | Không log message gửi, chỉ log success/fail + channel key |
| Channel ID rỗng | Service check & warn, không throw → import vẫn chạy |
| Format Markdown vỡ vì tên xưởng có `_` hoặc `*` | Escape ký tự đặc biệt trong formatter |
| Message > 4096 chars (nhiều xưởng) | Top-N + "..." |
| Spam channel khi user import file 1000-row 10 lần | Phase 1 chấp nhận (1 noti/lần import). Phase 2 nếu cần thì debounce 5s |
| Token format env không nhất quán (`bot<token>` vs `<token>`) | Section §7 docs migration; service log clear error nếu 401 |

---

## 10. Câu hỏi mở (cần user xác nhận trước khi code)

1. **Channel nhận noti import:** dùng channel cũ (`TELEGRAM_CHANNEL_ID`) hay tạo channel riêng mới? Plan đang giả định channel riêng (`TELEGRAM_NOTIFICATION_CHANNEL_ID`) với fallback.
2. **Có cần tag user @username trong message** (ví dụ `@admin` khi unassignedFactoryCount > 10)? Plan đang không có — gọn message.
3. **Format:** giữ Markdown + emoji như mock §4.3 hay plain text? Khuyến nghị Markdown.
4. **Cleanup consumer:** xóa luôn `notification.consumer.ts` hay để lại + implement `userService.sendNotification` cho future per-user noti? Khuyến nghị xóa, Phase 1 không cần.

---

## Tài liệu liên quan

- [System Overview](../Foundation/System_Overview.md) §4 — Telegram Bot đã được nhắc tới ở Third-party services
- [Orders.md](../FunctionDescription/Orders.md) — flow import sẽ được cập nhật
- `packages/core/services/telegram.service.ts` — service base
- `apps/api/src/modules/order/order.service.ts:2063` — `importOrders` hook point
