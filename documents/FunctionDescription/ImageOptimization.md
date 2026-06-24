# Image Optimization & Caching — Function Description

> **Cross-cutting infrastructure** — không phải 1 module duy nhất.
> Pipeline ảnh đã migrate sang R2 self-hosted (xem [`Design-R2-Pipeline.md`](../Plans/Design-R2-Pipeline.md) cho ngữ cảnh lịch sử). File này mô tả pipeline R2 hiện tại + Service Worker + Redis cache + FE polling.
>
> **Files chính:**
> - `apps/api/src/modules/design-image/` — module BE (service, processor, controller, buffer cache, repo, entity)
> - `apps/api/src/utils/design-url.ts` — helpers `extractDriveId`, `hashForR2`, `buildR2Url`, `buildDriveDownloadUrl`, `isOwnR2Url`, `r2KeyFor`
> - `apps/api/src/modules/order/order.service.ts` → `processDesigns()` enqueue + `checkPendingDesigns()` polling endpoint
> - `apps/web/public/sw.js` — Service Worker stale-while-revalidate, cache `image-cache-v5`
> - `apps/web/src/components/common/ImagePreviewDialog.tsx` — preview dialog (có on-demand `ensurePreview`)
> - `apps/web/src/components/orders/cells/{ImageThumbCell,DesignThumbsCell}.tsx` — cell thumb
> - `apps/web/src/hooks/usePendingDesignsPoll.ts` — auto refresh khi worker xong
> - `apps/web/src/utils/driveThumb.ts` — `smallThumb()` swap URL preview → thumb cho table
> - `apps/web/src/theme/globals.css` — `.bg-checker` / `.bg-checker-sm` (checkered transparency pattern)

---

## 1. Vấn đề ban đầu (lịch sử)

Trước khi migrate, đơn import từ Google Sheets có URL Drive gốc cho mockup + 18 vị trí design. Hiển thị trực tiếp gây:

| Vấn đề | Hậu quả |
|--------|---------|
| Drive URL `?usp=sharing` không render `<img>` | Ảnh không hiện |
| Drive `thumbnail?id=` size cố định, không cache CDN | Chậm, lag khi list nhiều đơn |
| Mỗi đơn 6+ ảnh × 20 đơn/page = 120 request | Console: 150MB transferred / trang |
| Reload trang → tải lại từ đầu | UX kém, lãng phí băng thông |
| Phụ thuộc bên thứ 3 (Teehub CDN) | Không control được pricing, downtime, rate-limit |

**Đã xóa Teehub hoàn toàn** (2026-06-23) — không còn fallback, file `transform-drive-url.ts` đã xóa.

---

## 2. Kiến trúc R2 pipeline (hiện tại)

```
┌─ Import order ─────────────────────────────────────────────────┐
│  Row paste/Excel → BE parse → enqueue 2 jobs cho mỗi URL      │
│  (response trả về ngay, KHÔNG chờ xử lý ảnh)                  │
└────────────────────────────────────────────────────────────────┘
                    │
            ┌───────┴───────┐
            ▼               ▼
┌─ Thumb queue ────┐  ┌─ Preview queue ─┐
│ design-image-     │  │ design-image-    │
│ thumb             │  │ preview          │
│ concurrency 3     │  │ concurrency 1    │
│ priority cao      │  │ chạy lần lượt    │
└──────────────────┘  └──────────────────┘
        │                       │
        ├───────────────────────┤
        │                       │
        ▼                       ▼
┌─ DesignBufferCache (disk, TTL 7 ngày) ────────────────────────┐
│ /tmp/onos-design-cache/{hash}.bin                             │
│ Thumb job download → cache → preview job đọc lại không tải    │
└────────────────────────────────────────────────────────────────┘
        │                       │
        ▼                       ▼
┌─ sharp encode ─────────────────────────────────────────────────┐
│ Thumb   : 300×300 fit:inside  webp q=70  (~5 KB)               │
│ Preview : 1000×1000 fit:inside webp q=80 (~50-150 KB)          │
└────────────────────────────────────────────────────────────────┘
        │                       │
        ▼                       ▼
┌─ R2 PutObject ─────────────────────────────────────────────────┐
│ designs/thumb/{hash}.webp                                      │
│ designs/preview/{hash}.webp                                    │
│ CacheControl: public, max-age=31536000, immutable              │
└────────────────────────────────────────────────────────────────┘
        │                       │
        ▼                       ▼
┌─ Mongo update ─────────────────────────────────────────────────┐
│ Thumb job:                                                     │
│   designs.{k}        = R2 preview URL (URL "lý thuyết")        │
│   designsStatus.{k}  = 'ready'  ← user thấy thumb ngay         │
│ Preview job:                                                   │
│   không update Mongo (URL đã đúng)                             │
└────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─ FE auto-refresh ──────────────────────────────────────────────┐
│ usePendingDesignsPoll: 5s/lần POST /v1/orders/check-pending    │
│ → patch state → thumb amber tự thành thumb thật                │
└────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─ User click thumb ─────────────────────────────────────────────┐
│ Dialog open → POST /v1/design-image/ensure-preview { sourceUrl}│
│   HEAD preview → có → return URL (~100ms)                      │
│   Chưa có → đọc buffer cache hoặc download → encode → upload   │
│             → return URL (3-8s, spinner "Đang chuẩn bị...")    │
└────────────────────────────────────────────────────────────────┘
```

### Tại sao tách 2 queue?

- **Thumb ưu tiên cao**: ngay sau import, user thấy table có thumb trong vài giây. UX chính.
- **Preview chạy lần lượt**: ảnh 70 MB encode preview tốn RAM/CPU. Chạy concurrency 1 tránh OOM. 90% design không bao giờ được click preview → tiết kiệm.
- **Buffer cache 7 ngày**: thumb đã download → preview KHÔNG phải tải lại Drive (rate-limit), cũng KHÔNG tốn băng thông. File ở `{tmpdir}/onos-design-cache/{hash}.bin`, cleanup mỗi 6h xóa file mtime > 7 ngày.

---

## 3. Backend module `design-image/`

### 3.1 Files
| File | Mô tả |
|------|-------|
| `design-image.service.ts` | `isEnabled()`, `processThumb(sourceUrl)`, `processPreview(sourceUrl)`, `deleteByHash(hash)` |
| `design-image.processor.ts` | 2 worker class: `DesignThumbProcessor` + `DesignPreviewProcessor` |
| `design-image.module.ts` | Register 2 BullMQ queue + 2 processor + cache |
| `design-image.controller.ts` | `GET /stats`, `POST /drain-failed`, `POST /ensure-preview` |
| `buffer-cache.service.ts` | `DesignBufferCache.get/put/cleanup` — disk cache TTL 7d |
| `r2-design-object.entity.ts` | Collection `r2DesignObjects` — track hash, refCount, sizeBytes |
| `r2-design-object.repository.ts` | `upsertObject`, `incrementRefCount`, `incrementSizeBytes`, `getTotalStats` |

### 3.2 Khi nào pipeline active?

`DesignImageService.isEnabled()` returns `cfg.r2Config !== null`. `r2Config` lấy từ env (lenient — thiếu bất kỳ field nào → null):
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE`

Nếu chưa configure: import vẫn chạy, log warning `[design] R2 chưa configure...`, lưu raw URL vào cả `designs.{k}` và `designsOriginal.{k}` — không transform. FE preview Drive URL `?usp=sharing` thường không render được trong `<img>` → đó là tín hiệu phải setup R2.

### 3.3 Hash deterministic
- Drive URL → `hash = driveFileId` (10-128 hex chars)
- Non-Drive → `hash = sha256(url).slice(0, 24)`
- Cùng URL → cùng hash → R2 dedup tự nhiên (`HeadObjectCommand` hit → skip toàn bộ)

### 3.4 Concurrency
| Env | Default | Mô tả |
|-----|---------|-------|
| `DESIGN_THUMB_CONCURRENCY` | `3` | Số worker thumb song song. Fallback `DESIGN_QUEUE_CONCURRENCY` cho backward compat. |
| `DESIGN_PREVIEW_CONCURRENCY` | `1` | Worker preview — 1 để giảm áp lực RAM khi file 70 MB |

### 3.5 Retry
Mỗi queue config `attempts: 4` + `backoff: exponential 5000ms`. Sau 4 lần fail:
- Thumb: `designsStatus.{k} = 'failed'`, FE show fallback link.
- Preview: job stay ở `failed` state, không update Mongo. User click thumb → BE ensure-preview retry inline.

---

## 4. URL pipeline

### 4.1 Mockup
**Không transform** — lưu raw URL user paste vào cả `mockupUrl` và `mockupOriginalUrl`. Mockup không đi qua R2 (TODO sau khi pipeline ổn định mới migrate).

### 4.2 Design
| Field Mongo | Giá trị |
|---|---|
| `designsOriginal.{k}` | Raw URL user paste lúc import (luôn giữ, không bao giờ thay đổi) |
| `designs.{k}` | URL preview R2 sau khi thumb job xong: `https://<R2_PUBLIC_BASE>/designs/preview/{hash}.webp`. *URL "lý thuyết"* — preview file thực tế chỉ tồn tại sau khi preview job hoặc ensure-preview chạy xong. FE swap qua `/thumb/` qua `smallThumb()` cho ảnh nhỏ. |
| `designsStatus.{k}` | `'pending'` lúc import, `'ready'` khi thumb upload xong, `'failed'` nếu retry hết. |

### 4.3 Trên R2
```
Bucket: onosfactory-designs
Custom domain: ${R2_PUBLIC_BASE}

Structure:
  designs/thumb/{hash}.webp     ~5 KB  (worker thumb chạy trước)
  designs/preview/{hash}.webp   ~50-150 KB (worker preview chạy sau, hoặc on-demand)
```

KHÔNG lưu original lên R2 (file gốc giữ ở Drive/CDN bên thứ 3, tiết kiệm 80% storage).

---

## 5. API endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/v1/design-image/stats` | Object count, total size, queue waiting/active/failed per queue |
| `POST` | `/v1/design-image/drain-failed` | Retry all failed jobs ở cả 2 queue |
| `POST` | `/v1/design-image/ensure-preview` | Body `{ sourceUrl }`. HEAD R2 preview → có thì return ngay. Chưa có → process inline (3-8s) → return URL. Permission: mọi role view orders. |
| `POST` | `/v1/orders/check-pending` | Body `{ ids: string[] }` (max 200). Trả `[{ _id, designs, designsStatus }]` — FE polling 5s/lần khi có row pending. |

---

## 6. Service Worker (`apps/web/public/sw.js`)

### 6.1 Strategy: stale-while-revalidate
```
fetch event:
  → Whitelist host check
  → caches.match(req) → trả ngay cached response (nếu có)
  → Song song: fetch network → update cache
  → Lần load tiếp theo → cache đã mới
```

### 6.2 Whitelist
```js
const CACHEABLE_HOSTS = [
  'cdn.onosfactory.com',         // R2 custom domain (primary)
  'r2.dev',                       // R2.dev subdomain (test mode)
  'drive.google.com',
  'drive.usercontent.google.com',
  'lh3-6.googleusercontent.com', 'googleusercontent.com',
  'cdn.onospod.com', 'cdn.podorder.io',
  'podorder.sgp1.digitaloceanspaces.com',
];
```

### 6.3 Cache versioning
- `CACHE_NAME = 'image-cache-v5'` — bump khi đổi strategy (v4 → v5 sau khi xóa Teehub).
- `activate` event → delete cache cũ tên khác `image-cache-*`.

### 6.4 Đăng ký SW
`apps/web/src/main.tsx`:
```ts
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
```

---

## 7. Frontend: components & hooks

### 7.1 `ImagePreviewDialog`
Props:
```ts
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url?: string;                    // Display URL (preview R2)
  originalUrl?: string;            // Raw URL user paste (Drive/CDN)
  title?: string;
  ensurePreviewSource?: string;    // Nếu set → gọi BE ensure-preview lúc open
}
```

UI:
- shadcn `Dialog` max-w-3xl
- Container `bg-checker` — checkered transparency pattern (xem `§7.5`)
- Ảnh `max-h-[70vh] object-contain` với fade-in opacity
- 3 trạng thái:
  - **Resolving** (khi `ensurePreviewSource` set, đang gọi BE): spinner + label "Đang chuẩn bị preview…"
  - **Loading**: spinner (sau khi resolve xong, chờ `<img>` load)
  - **Loaded**: ảnh hiện full
  - **Error**: message "Không tải được ảnh — có thể link đã hết hạn hoặc bị chặn CORS"
- 2 hàng URL ở dưới: **Display** + **Original** (nếu khác)
- `referrerPolicy="no-referrer"` cho `<img>` → tránh Drive chặn

### 7.2 `ImageThumbCell`
Props: `{ url, originalUrl, title, onOpen, size, status }`.

Render theo `status`:
| Status | UI |
|--------|----|
| `'pending'` | Border amber dashed + `Loader2` animate-spin + `cursor-not-allowed` + `title="Đang xử lý ảnh thumb trên R2…"` |
| `'failed'` + originalUrl | Link rose `AlertTriangle` → mở URL gốc |
| `'failed'` | Border rose + `AlertTriangle` |
| undefined + url | Button click `onOpen` → ảnh `object-contain` với `bg-checker bg-checker-sm` |

`smallThumb()` swap `/designs/preview/` → `/designs/thumb/` cho URL nhỏ.

### 7.3 `DesignThumbsCell`
Cell tái sử dụng cho tất cả bảng order (Workshop, ErrorLog, Dashboard Tab C, OrdersMiniTable, ListOrderTab).

- Hiển thị **tối đa 2 thumb inline** (32px default).
- Nếu nhiều hơn → "+N" badge → click → Popover grid 4 cột hiện đủ 18 vị trí.
- Order cố định: front → back → sleeve → hood → folder → placket → chestLeft/Right → left/right → sleeveLeft/Right → leftUpperSleeve/rightUpperSleeve → leftCuff/rightCuff → frontEmbroidery/backEmbroidery.
- Click thumb → `openPreview(url, title, originalUrl, sourceUrl=designsOriginal[k])` — pass sourceUrl cho ensure-preview.

### 7.4 `usePendingDesignsPoll(rows, patchRow)`
Hook tự động polling khi list có row pending:
- Detect `rows.some(r => Object.values(r.designsStatus || {}).some(v => v === 'pending'))`.
- `setInterval(5000)` gọi `POST /v1/orders/check-pending { ids: pendingIds }`.
- Patch row qua callback `patchRow(id, { designs, designsStatus })` → React re-render thumb.
- Stop khi mảng pending = [] hoặc timeout 5 phút (safety net).
- Cleanup interval khi unmount.

Wired vào: `ListOrderTab`, `OrderTableWorkshop`, `ErrorLogTab`.

### 7.5 Checkered transparency pattern (`bg-checker`)
Trong `globals.css`:
```css
.bg-checker {
  background-color: #fff;
  background-image: linear-gradient(45deg, #e5e7eb 25%, transparent 25%), ... (4 layers);
  background-size: 12px 12px;
}
.bg-checker-sm { background-size: 8px 8px; }
.dark .bg-checker { background-color: #1f2937; ... gray-700 squares; }
```

Dùng cho:
- `ImagePreviewDialog` container (12px squares)
- `ImageThumbCell` button (8px squares - `bg-checker bg-checker-sm`)
- Mockup thumb ở ListOrderTab, OrderStatsTab, TaskCard, TaskDetailDialog

→ Vùng transparent của PNG/WebP hiện rõ (giống Photoshop / Figma).

### 7.6 Object-fit
Đã đổi **tất cả thumb từ `object-cover` → `object-contain`** để hiển thị toàn bộ ảnh (không crop). Letterbox bù bằng `bg-checker`.

---

## 8. Redis cache (BE)

### 8.1 Cache keys
| Key | TTL | Mục đích |
|-----|-----|----------|
| `orders:list:${md5(query)}` | 60s | Tránh aggregate lặp lại. Gắn `role` để Designer/Fulfillment không share cache với Admin. |
| `dashboard:${md5(query)}` | 60s | Aggregate nặng nhất |
| `factories:all` | 5m | Lookup khi import |
| `machineTypes:all` | 5m | Lookup khi import |
| `productConfigs:type:{shortName}` | 5m | Lookup mapping khi import |

### 8.2 Invalidate
```
order.import / update / delete / transfer → invalidate orders:list:*, dashboard:*
productConfig.create / update / delete → invalidate productConfigs:type:*
factory / machineType create / update / delete → invalidate factories:all / machineTypes:all
```

### 8.3 Redis DB
- App dùng **DB 1** (env `REDIS_DB=1`)
- Debug: `docker exec -it redis redis-cli` → `SELECT 1` → `KEYS *`

---

## 9. Frontend performance helpers

| Tối ưu | Vị trí | Mục đích |
|--------|--------|----------|
| `React.memo(OrderRowItem)` | List orders | Skip re-render unchanged rows |
| `React.memo(MetricCard, RankBadge, TopUserRow)` | Dashboard | Stable refs |
| `useMemo` chartData, mergedFactory | Dashboard | Tránh re-compute pie + drill-down |
| `useCallback` event handlers | Dashboard pie + ListOrderTab patchRow | Stable refs cho child memo |
| `useDebounce` search input | List + Dashboard | 300ms delay tránh spam API |
| Native HTML `title` attr | Tooltip thumb | Nhẹ hơn Radix Tooltip ~100x |
| `content-visibility: auto` | Long rows | Browser skip off-screen render |
| `decoding="async"` | `<img>` | Decode ảnh không block main thread |
| `referrerPolicy="no-referrer"` | `<img>` Drive | Tránh Drive trả 403 |
| `loading="lazy"` | thumb `<img>` | Defer ảnh ngoài viewport |
| `usePendingDesignsPoll` chỉ poll id còn pending | Polling | Giảm payload mỗi tick |

---

## 10. Đo kết quả

| Metric | Trước (Teehub) | Sau (R2 split queue) |
|--------|----------------|----------------------|
| Import 100 đơn × 5 design — thấy thumb đầu tiên | 3-5 phút (sync transform) | ~3-5 giây (job thumb đầu tiên xong) |
| Import 100 đơn × 5 design — tất cả thumb ready | 3-5 phút | ~1-2 phút (concurrency 3) |
| Preview cho ảnh chưa cached | N/A (Teehub fail nếu file > 100 MB) | 3-8s on-demand (block dialog) |
| Preview cached | <100ms (CDN edge) | <100ms (R2 + SW cache) |
| Re-import cùng URL | tạo duplicate Teehub URL | HEAD R2 hit → skip toàn bộ |
| Drive download / 1 ảnh trong cả lifecycle | 2 lần (thumb + preview) | 1 lần (buffer cache 7 ngày) |
| Storage R2 vs Teehub | N/A | ~2 lần variant × 50 KB = ~100 KB/design |

---

## 11. Khi nào dùng cái nào

| Tình huống | Dùng |
|------------|------|
| Hiển thị thumbnail trong table | `smallThumb(url)` swap `/preview/` → `/thumb/` |
| Preview ảnh trong dialog | `url` mặc định (URL preview) + `ensurePreviewSource={originalUrl}` đảm bảo preview tồn tại |
| User muốn ảnh gốc / share / download | `originalUrl` (URL Drive/CDN gốc) |
| Force regenerate cho 1 ảnh | Xóa file R2 thủ công (mongosh `r2DesignObjects.deleteOne({hash})`) → re-import sẽ HEAD miss → re-process |
| Bump SW cache | Tăng `CACHE_NAME` version trong `sw.js` |
| Check pipeline state | `GET /v1/design-image/stats` → enabled flag + queue counts |
| FE list cần auto refresh khi worker xong | `usePendingDesignsPoll(items, patchRow)` |

---

## 12. Edge cases & known issues

| Case | Hành vi |
|------|---------|
| R2 PUT thumb thành công, PUT preview fail mid-flight | Thumb ready, preview chưa lên. User click preview → `ensure-preview` re-encode (buffer cache hit, không tải Drive). |
| File Drive > 120 MB (`R2_MAX_DOWNLOAD_MB`) | Worker throw, `designsStatus='failed'`, FE show link gốc. |
| Drive trả HTML confirm page (file > 100 MB cần auth) | Worker throw `BadRequestException`. Cần dùng Drive API + service account (TODO). |
| 2 user cùng click preview chưa có | Không dedup — cả 2 cùng download + encode + upload. Idempotent nên kết quả OK, chỉ tốn CPU 2 lần. |
| Sharp crash với file lạ (HEIC, AVIF) | `failOn: 'none'` mềm hoá → vẫn cố encode. Nếu fail thật → mark failed. |
| Polling khi user F5 trang | `usePendingDesignsPoll` reset từ đầu sau khi list fetch lại. Timeout 5 phút mỗi session. |
| OOM khi import 1000+ đơn | Concurrency 3 × buffer ~70MB = 210MB. VPS 4GB RAM OK. Nếu RAM thấp → giảm `DESIGN_THUMB_CONCURRENCY=2`. |
| Buffer cache đầy ổ | Cron cleanup mỗi 6h xóa file mtime > 7 ngày. Manual: `rm /tmp/onos-design-cache/*.bin`. |
