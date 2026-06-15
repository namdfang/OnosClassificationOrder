# Image Optimization & Caching — Function Description

> **Cross-cutting infrastructure** — không phải 1 module duy nhất
> **Files:**
> - `apps/api/src/utils/transform-drive-url.ts` (BE transform)
> - `apps/web/public/sw.js` (Service Worker)
> - `apps/web/src/components/common/ImagePreviewDialog.tsx` (FE preview)
> - `apps/api/src/modules/order/order.service.ts` → `processDesigns()`, `refreshImageUrls()`

---

## 1. Vấn đề ban đầu

Đơn hàng import từ Google Sheets có URL Drive gốc cho mockup + 18 vị trí design. Hiển thị trực tiếp gây:

| Vấn đề | Hậu quả |
|--------|---------|
| Drive URL `uc?export=download` không render `<img>` | Ảnh không hiện |
| Drive `thumbnail?id=` size cố định, không cache CDN | Chậm, lag khi list nhiều đơn |
| Mỗi đơn 6+ ảnh × 20 đơn/page = 120 request | Console: 150MB transferred / trang |
| Reload trang → tải lại từ đầu | UX kém, lãng phí băng thông |

---

## 2. Giải pháp tổng thể (3 lớp)

```
┌─ Backend transform ────────────────────────────────────┐
│  Drive URL gốc → extractDriveId → Teehub CDN URL       │
│  Lưu cả 2: mockupUrl (CDN) + mockupOriginalUrl (Drive) │
└────────────────────────────────────────────────────────┘
            ↓
┌─ Teehub CDN ───────────────────────────────────────────┐
│  https://cdn.teehub.io/gimage/{variant}/{id}.webp      │
│  Variants: s200 (thumb) / s800 (preview)               │
│  Cloudflare edge cache, ETag, gzip                     │
└────────────────────────────────────────────────────────┘
            ↓
┌─ Browser Service Worker ───────────────────────────────┐
│  Stale-while-revalidate cho ảnh CDN                    │
│  Lần 2 trở đi → instant từ Cache API                   │
└────────────────────────────────────────────────────────┘
```

---

## 3. Backend transform (`transform-drive-url.ts`)

### 3.1 Helpers
```ts
extractDriveId(url): string | undefined
  // Regex match nhiều format Drive: file/d/{id}, ?id={id}, /d/{id}/, drive_link...

buildTeehubUrl(idOrUrl, variant): string
  // → https://cdn.teehub.io/gimage/{variant}/{id}.webp

canonicalDriveUrl(url): string
  // → https://drive.google.com/file/d/{id}/view (form chuẩn để mở/copy)

processImageUrl(url, variant): { displayUrl, originalUrl }
  // 1 call duy nhất → trả về 2 form
```

### 3.2 Áp dụng khi import order
`order.service.ts → importOrders()`:
```ts
for each row:
  // Mockup
  if row.mockupUrl:
    row.mockupOriginalUrl = canonicalDriveUrl(row.mockupUrl)
    row.mockupUrl = buildTeehubUrl(row.mockupUrl, 's800')

  // Designs (18 vị trí)
  row.designsOriginal = { ...row.designs } // clone
  for key in row.designs:
    row.designs[key] = buildTeehubUrl(row.designs[key], 's800')
```

### 3.3 Backfill endpoint
`POST /v1/orders/refresh-image-urls` — re-apply transform cho mọi order cũ trong DB. Dùng khi:
- Thay đổi variant mặc định
- Migrate dữ liệu legacy còn lưu Drive URL trong `mockupUrl`

---

## 4. Service Worker (`apps/web/public/sw.js`)

### 4.1 Strategy: stale-while-revalidate
```
fetch event:
  → Whitelist host check (CDN Teehub, Drive, googleusercontent...)
  → caches.match(req) → trả ngay cached response (nếu có)
  → Song song: fetch network → update cache
  → Lần load tiếp theo → cache đã mới
```

### 4.2 Whitelist
```js
const ALLOWED_HOSTS = [
  'cdn.teehub.io',
  'drive.google.com',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
];
```

### 4.3 Cache versioning
- `CACHE_NAME = 'images-v3'` — bump number khi đổi strategy
- `activate` event → delete cache cũ tên khác

### 4.4 Đăng ký SW
`apps/web/src/main.tsx`:
```ts
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
```

---

## 5. Frontend: `ImagePreviewDialog`

### 5.1 Props
```ts
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url?: string;          // Display URL (Teehub CDN)
  originalUrl?: string;  // Drive URL gốc
  title?: string;
}
```

### 5.2 UI
- shadcn `Dialog` max-w-3xl
- Ảnh `max-h-[70vh]` `object-contain` với fade-in opacity
- **Spinner** overlay trong khi load (controlled by `imgLoaded` state)
- **Error state**: hiển thị message "Không tải được ảnh — có thể link đã hết hạn hoặc bị chặn CORS. Thử mở link Original ở dưới."
- 2 hàng URL ở dưới:
  - **Display:** copy button + link (font-mono 11px, truncate, có `ExternalLink` icon)
  - **Original:** copy button + link (font-bold để nổi bật, click mở Drive)
- `referrerPolicy="no-referrer"` cho `<img>` → tránh Drive chặn

### 5.3 Loading state reset
```ts
useEffect(() => {
  setImgLoaded(false);
  setImgError(false);
}, [url]);
```
Reset khi URL đổi (vd: chuyển preview design này → design khác).

---

## 6. Smaller thumb URL helper

`ListOrderTab.tsx` có helper `smallThumb(url)` đổi variant `s800` → `s200` cho thumbnail card:

```ts
function smallThumb(url?: string): string | undefined {
  return url?.replace('/gimage/s800/', '/gimage/s200/');
}
```

`s200` (~5KB) thay `s800` (~50KB) cho list view → giảm 10x bandwidth.

---

## 7. Redis cache (BE)

### 7.1 Cache keys
| Key | TTL | Mục đích |
|-----|-----|----------|
| `orders:list:${md5(query)}` | 30s | Tránh aggregate lặp lại khi user F5 |
| `dashboard:${md5(query)}` | 60s | Aggregate nặng nhất |
| `factories:all` | 5m | Lookup khi import |
| `machineTypes:all` | 5m | Lookup khi import |
| `productConfigs:type:{shortName}` | 5m | Lookup mapping khi import |

### 7.2 Invalidate
```
order.import / update / delete → invalidate orders:list:*, dashboard:*
productConfig.create / update / delete → invalidate productConfigs:type:*
factory / machineType create / update / delete → invalidate factories:all / machineTypes:all
```

### 7.3 Redis DB
- App dùng **DB 1** (env `REDIS_DB=1`)
- Khi debug: `docker exec -it redis redis-cli` → `SELECT 1` → `KEYS *`

---

## 8. Frontend performance helpers

| Tối ưu | Vị trí | Mục đích |
|--------|--------|----------|
| `React.memo(OrderRowItem)` | List orders | Skip re-render unchanged rows |
| `React.memo(MetricCard, RankBadge, TopUserRow)` | Dashboard | Stable refs |
| `useMemo` chartData, mergedFactory | Dashboard | Tránh re-compute pie + drill-down |
| `useCallback` event handlers | Dashboard pie | Stable refs cho child memo |
| `useDebounce` search input | List + Dashboard | 300ms delay tránh spam API |
| Native HTML `title` attr | Tooltip thumb | Nhẹ hơn Radix Tooltip ~100x |
| `content-visibility: auto` | Long rows | Browser skip off-screen render |
| `decoding="async"` | `<img>` | Decode ảnh không block main thread |
| `referrerPolicy="no-referrer"` | `<img>` Drive | Tránh Drive trả 403 |

---

## 9. Đo kết quả

| Metric | Trước | Sau |
|--------|-------|-----|
| List 20 đơn × 6 design | 150MB / load | ~3MB / load lần đầu, ~0 lần 2 |
| Preview dialog open lag | 800ms+ | <100ms (cached) |
| Dashboard reload | 2.5s | 0.4s (Redis cache hit) |
| Pie chart hover frame rate | jank | smooth 60fps |

---

## 10. Khi nào dùng cái nào

| Tình huống | Dùng |
|------------|------|
| Hiển thị thumbnail trong list | `smallThumb(url)` → `s200` |
| Preview ảnh trong dialog | `url` mặc định `s800` |
| User muốn ảnh gốc / share / download | `originalUrl` (Drive view) |
| Migration data cũ | `POST /v1/orders/refresh-image-urls` |
| Bump SW cache | Tăng `CACHE_NAME` version trong `sw.js` |
