# Tính năng Hiển thị Ảnh Drive Public qua R2 CDN (GImage)

Tính năng cho phép Frontend nhận **link Google Drive** từ người dùng (paste vào ô input — thường là design / mockup) và hiển thị ảnh lên UI thông qua **Cloudflare R2 CDN** của hệ thống (`cdn.teehub.io`). Toàn bộ pipeline xử lý fetch Drive → resize → upload R2 → serve CDN được tự động hóa ở backend; frontend chỉ cần render URL deterministic và đợi warm xong.

Ý tưởng tương đương dịch vụ `gimagecdn.iamzic.com` nhưng tự host trong nền tảng TeeHub, kiểm soát được rate limit, log, và bảo mật.

## Tổng quan chức năng

### Vấn đề cần giải quyết
- Designer thường chia sẻ ảnh thiết kế qua Google Drive (link `drive.google.com/file/d/{id}/view`).
- Browser KHÔNG hiển thị thẳng được ảnh Drive vì link không trả về `Content-Type: image/*` (Drive serve HTML viewer).
- Cần một CDN trung gian: nhận id Drive → tải bytes thực → cache → trả về URL public dùng được trong `<img>`.

### Lợi ích
- **3 biến thể tự động**: `thumb` (300×300 cover, webp Q=70), `preview` (1000×1000 max, webp Q=82), `origin` (bytes nguyên bản).
- **Cache vĩnh viễn trên R2** — request thứ 2 trở đi đi thẳng CDN, BE chỉ chạm 1 lần per id.
- **Hỗ trợ paste nhanh**: paste URL → spinner ~500ms → ảnh hiện ngay.
- **Tiết kiệm bandwidth Drive**: BE chỉ fetch Drive 1 lần per id, kể cả khi nhiều variant hoặc nhiều client request cùng lúc (dedup tasks).
- **Lấy được tên file gốc** từ Drive id (vd `Pedo 19.12.png`) — không cần OAuth, không cần API key. Cache 24h trong RAM.

## Quy trình làm việc (User Flow)

1. User dán link Drive (vd `https://drive.google.com/file/d/1OjCBp.../view`) vào ô input Design / Mockup trong các dialog:
   - `BulkCreateDesignSkuDialog` (Bulk Create Design SKU)
   - `DesignSkuTable` (cột Design Front/Back, Mockup Front/Back)
2. FE component (`DesignThumb`, `SmartImage`, `DriveImageCell`) detect là link Drive → trigger warm batch tới BE.
3. BE fetch ảnh từ Drive (qua CDN `lh3.googleusercontent.com/d/{id}`), resize thành các variant, upload lên R2.
4. BE trả về URL CDN (`https://cdn.teehub.io/gimage/{variant}/{id}.webp`).
5. FE render `<ImagePreview>` với URL CDN — thumb hiển thị ngay, click thumb mở lightbox xem preview.

### Trạng thái UI cho mỗi ảnh
- **pending** (đang warm lần đầu): hiển thị spinner trong khung 40×40 / 56×56.
- **ready** (R2 đã có): hiển thị thumb thật, click mở lightbox với preview.
- **failed** (Drive 404 / private file / mạng lỗi): hiển thị icon `ImageOff` + tooltip "Ảnh không tải được" — KHÔNG render `<img>` broken icon.

## Kiến trúc

```
Browser
  │ paste Drive URL
  ▼
FE: extractDriveId(url) → { id: "1OjCBp..." }
  │ useGImage(value, "thumb") + useGImage(value, "preview")
  │   ├─ trigger warmGImages([{id, "thumb"}, {id, "preview"}]) — debounce 80ms
  │   └─ subscribe status → re-render khi BE trả response
  ▼
POST {API}/api/public/v1/gimage/warm
  body: { items: [{id, variant}, ...] }
  ▼
BE: GoogleDriveImageController.Warm
  │ group items by id, parallel concurrency = 6
  ▼
GoogleDriveImageFlow.EnsureCachedManyAsync(id, [thumb, preview])
  │ 1. Fast-path check R2 — nếu cả 2 variant đã có → return ngay
  │ 2. Acquire _idLocks[id] (per-id semaphore, chống stampede)
  │ 3. Re-check R2 fast-path trong lock
  │ 4. Negative cache check (id đã fail 10 phút gần đây)
  │ 5. Fetcher.FetchAsync(id) — 1 lần fetch Drive cho TẤT CẢ variant
  │ 6. Kick off variant uploads SONG SONG (dedup qua _uploadTasks)
  │    Await PRIORITY = thumb (~150-300ms)
  │    Trả về URL dự đoán cho preview/origin (deterministic key) — chạy nền
  │ 7. Release lock
  ▼
GoogleDriveImageFetcher.FetchAsync(id)
  │ GET https://lh3.googleusercontent.com/d/{id}
  │ headers: UA browser-ish, Accept: image/*
  │ timeout 20s, cap 25MB bytes
  ▼
UploadVariantAsync(id, variant, src)
  │ ImageSharp resize (300×300 cover hoặc 1000 max hoặc giữ nguyên)
  │ Encode WebP (Q=70 thumb, Q=82 preview, origin giữ ext gốc)
  │ S3Upload.SendMyFileToS3 (key gimage/{variant}/{id}.{ext}, deterministic)
  ▼
Response: { items: [{id, variant, url: "https://cdn.teehub.io/gimage/.../...webp"}] }
  ▼
FE: setGImageStatus(id, variant, "ready") → component re-render → ảnh hiện
```

## Cấu trúc Triển khai (Technical Implementation)

### Backend

#### Files

| Lớp | File |
|-----|------|
| Service fetch Drive | `Services/GoogleDriveImage/GoogleDriveImageFetcher.cs` |
| Flow (cache + resize) | `ProcessFlow/Interface/IGoogleDriveImageFlow.cs`, `ProcessFlow/Implement/GoogleDriveImageFlow.cs` |
| Controller (Public) | `Controllers/API/Public/V1/GoogleDriveImageController.cs` |
| DI registration | `Middleware/ServiceCollectionMiddleware.cs` (block `AddFlows` cuối) |

#### Endpoint

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET/HEAD | `/api/public/v1/gimage/{variant}/{id}` | AllowAnonymous, rate-limited (`PublicApi`) | Warm + 301 redirect tới CDN. Hữu ích cho fallback hoặc khi browser hit trực tiếp. |
| POST | `/api/public/v1/gimage/warm` | AllowAnonymous | Batch warm `{ items: [{id, variant}] }` → return `{ items: [{id, variant, url}] }`. Cap 200 items / request, concurrency 6. |
| GET/HEAD | `/api/public/v1/gimage/meta/{id}` | AllowAnonymous, rate-limited (`PublicApi`) | Lấy metadata (tên file gốc, MIME, size) từ Drive **không tải bytes**. Cache 24h in-memory + 5 phút negative. Test: `curl -i 'http://localhost:5077/api/public/v1/gimage/meta/18CraUmBYS4ZcxkBo_PysGx6Eu7vWjJdG'` → `{ id, name: "Pedo 19.12.png", contentType, size }`. |

`variant` ∈ `{thumb, preview, origin}`. `id` regex `^[A-Za-z0-9_-]{10,128}$` chống SSRF.

#### Key file & object storage

- R2 bucket: `teehub` (cấu hình `ObjectStore.R2` trong `appsettings.json`).
- Public domain: `https://cdn.teehub.io`.
- Object key format:
  - `gimage/thumb/{driveFileId}.webp`
  - `gimage/preview/{driveFileId}.webp`
  - `gimage/origin/{driveFileId}.{ext}` (ext theo content-type Drive: `.jpg`, `.png`, `.webp`, `.gif`)
- `Cache-Control: public, max-age=31536000, immutable` set khi upload (qua `S3Upload.SendMyFileToS3`).

#### Tối ưu hiệu năng

1. **Per-id semaphore** (`_idLocks`): 2 request cùng id → request 2 đợi → fast-path R2 hit ngay, không double fetch Drive.
2. **Per-(id,variant) upload dedup** (`_uploadTasks`): nếu background task của variant đang chạy, request đến chia sẻ task thay vì start mới. Auto cleanup khi task done.
3. **Negative cache** (`_negativeCache`, TTL 10 phút): id 404 / private file → nhớ → request lặp trả null tức thì, không hammer Drive.
4. **Priority return**: chỉ await thumb (~150-300ms), preview/origin chạy nền. Response trả về sau ~500ms tổng (Drive fetch ~300ms + thumb upload ~200ms) thay vì ~1.3s.
5. **Predictive URL**: response trả URL CDN của tất cả variant (deterministic key), kể cả khi background chưa xong. Browser load preview URL — nếu chưa có thì `<img onError>` ở `ImagePreview` fallback về thumb URL.
6. **Thumb Q=70 webp**: nhỏ hơn 30% so với Q=82, encode/upload nhanh hơn.
7. **Logging filter**: Serilog override `System.Net.Http.HttpClient.GoogleDriveImage.*` = Warning để tắt log spam 4 dòng INF mỗi HTTP request.

#### Tối ưu metadata endpoint (`/gimage/meta/{id}`)

| Optimisation | Tác dụng |
|--------------|----------|
| **In-memory cache 24h** (`_metaCache` `ConcurrentDictionary`) | Hit cache → ~0-5ms. File Drive name không đổi nên cache lâu OK. |
| **Per-id lock** (`_metaLocks` SemaphoreSlim) | 10 client cùng paste 1 id → BE chỉ gọi Drive 1 lần, 9 client còn lại đợi cache. |
| **Negative cache 5 phút** | File private / 404 → không hammer Drive trong 5 phút. |
| **Range request `bytes=0-0`** | Trước: GET full → Drive buffer file rồi mới respond → 1-3s. Sau: chỉ xin 1 byte → Drive trả header + `Content-Range: bytes 0-0/{size}` ngay → **~200-500ms**. Status `206 Partial Content` OK. |
| **Timeout 8s** | Drive hợp lý <1s; nếu >8s thì fail fast. |

Source-of-truth tên file: header `Content-Disposition` — parser ưu tiên `filename*=UTF-8''...` (RFC 5987, support tiếng Việt) trước `filename="..."`. Có raw fallback regex nếu .NET parser bỏ qua.

### Frontend

#### Files

| Lớp | File |
|-----|------|
| Helpers + status store | `src/utils/gimage.ts` |
| Hook subscribe ready state | `src/hooks/use-gimage.ts` |
| Hook batch warm declarative | `src/hooks/use-gimage-warmer.ts` |
| Image lightbox component | `src/components/Image/ImagePreview.tsx` (đã thêm onError fallback) |
| Component DesignSku table | `src/components/design-sku/DesignSkuTable.tsx` (DriveImageCell) |
| Bulk Create dialog | `src/components/design-sku/BulkCreateDesignSkuDialog.jsx` (DesignThumb, SmartImage) |

#### Public API

```ts
// Resolve raw value (Drive URL / id / non-drive URL) → URL hiển thị
getGImageUrl(value: unknown, variant: GImageVariant = "preview"): string

// Extract Drive file id từ URL Drive bất kỳ format
extractDriveId(value: unknown): string  // "" nếu không phải Drive

// Build URL deterministic
buildGImageCdnUrl(id: string, variant: GImageVariant): string

// Trigger warm batch (debounce 80ms, dedupe global session)
warmGImages(items: { id: string; variant: GImageVariant }[]): void

// Hook React: subscribe trạng thái warm cho 1 (value, variant)
// Return: { url, status, loading, failed, ready }
useGImage(value: string | null | undefined, variant: GImageVariant)

// Hook declarative: warm tất cả values trong list (default warm cả thumb + preview)
useGImageWarmer(values: (string | null | undefined)[], variants?: GImageVariant[])
```

#### Pattern sử dụng

**Pattern 1: Hook ready-state (best — spinner → ảnh, không có 404 flicker)**

```jsx
function DesignThumb({ value }) {
  const thumb = useGImage(value, "thumb");
  const preview = useGImage(value, "preview");

  if (thumb.loading || preview.loading) return <Spinner />;
  if (!thumb.url && !preview.url) return <Icon name="ImageOff" />;
  return (
    <ImagePreview
      thumbUrl={thumb.url || preview.url}
      url={preview.url || thumb.url}
      width={40}
      height={40}
    />
  );
}
```

**Pattern 2: Render trực tiếp + batch warm (cho bảng đã có URL trong DB)**

```jsx
function ListView({ items }) {
  // Warm tất cả id trong batch khi mount — fire-and-forget
  useGImageWarmer(items.flatMap((it) => [it.desFront, it.desBack]));

  return items.map((it) => (
    <img src={getGImageUrl(it.desFront, "thumb")} />
  ));
}
```

**Pattern 3: SmartImage / DriveImageCell — auto branch theo loại URL**

Component bao đóng cả 2 trường hợp: Drive (qua warmer) và URL khác (render thẳng).

```jsx
<SmartImage value={anyUrl} width={40} height={40} />
```

#### Trạng thái Status

| Status | Ý nghĩa | UI |
|--------|---------|-----|
| `pending` | Đang warm (POST /warm chưa response, hoặc chưa bắn POST) | Spinner |
| `ready` | BE confirm URL CDN có thể truy cập (R2 hit hoặc upload xong) | `<ImagePreview>` |
| `failed` | Drive 404 / private / mạng lỗi / non-drive URL không hợp lệ | Icon `ImageOff` + tooltip |

Cờ `failed` cho phép FE fallback sang giải pháp khác (vd link gốc) thay vì hiện `<img>` broken.

### Lưu ý về cancel & race

- Drive fetch dùng `CancellationToken.None`: nếu browser cancel POST giữa chừng, Drive fetch + R2 upload vẫn hoàn tất → lần sau request thấy R2 đã có.
- Variant uploads chạy song song qua `Task.WhenAll` (đã sửa từ tuần tự) → cancel chéo không xảy ra.
- Lock theo id (`_idLocks`) chỉ giữ qua thời gian fetch + await thumb, giải phóng sớm → request 2 cùng id chỉ chờ ~500ms thay vì ~1.3s.

### Lưu ý về Drive file private

- BE chỉ fetch được file public (share "Anyone with the link, Viewer").
- File private trả 404 từ `lh3.googleusercontent.com` → BE log `[WRN] [GImage] Drive fetch {id} -> NotFound`, mark negative cache 10 phút, trả `null`.
- FE nhận `failed` status → hiển thị icon `ImageOff` để user biết.

### Lưu ý về metadata endpoint

- File > 25MB Drive trả về HTML "virus scan warning" page thay vì stream → header không có `Content-Disposition` → endpoint trả `404 file not found or not public`. Nếu cần support file lớn, parse `confirm` token + retry (~30 dòng code).
- File private (require sign-in): Drive redirect 302 về login page → cũng `404`.
- Tên có ký tự Unicode (vd tiếng Việt, emoji): `filename*=UTF-8''...` parser xử lý OK.
- Cache trong RAM → restart BE mất cache. Nếu cần persistent (vd lưu vào DB / R2 custom metadata), xem mục [Mở rộng tương lai](#mở-rộng-tương-lai).

## Cấu hình & Vận hành

### appsettings.json

```json
"ObjectStore": {
  "ActiveProvider": "R2",
  "R2": {
    "Enabled": true,
    "AccountId": "...",
    "Endpoint": "{accountId}.r2.cloudflarestorage.com",
    "AccessKey": "...",
    "SecretKey": "...",
    "BucketName": "teehub",
    "PublicDomain": "https://cdn.teehub.io",
    "Region": "auto"
  }
},
"Serilog": {
  "MinimumLevel": {
    "Override": {
      "System.Net.Http.HttpClient.GoogleDriveImage": "Warning",
      "System.Net.Http.HttpClient.GoogleDriveImage.LogicalHandler": "Warning",
      "System.Net.Http.HttpClient.GoogleDriveImage.ClientHandler": "Warning"
    }
  }
}
```

### FE env

```
NEXT_PUBLIC_API_URL=https://api.teehub.io
```

(Phải set đúng vì warm endpoint là cross-origin với CDN domain.)

## UX timeline

### Ảnh đã warm trước (cache hit)

```
t=0    paste URL → useGImage gọi warm POST
t=80ms POST /warm gửi
t=200ms response (R2 fast-path hit, không fetch Drive) → ready
t=300ms <img src=CDN> hiển thị
```

### Ảnh mới (cache miss)

```
t=0     paste URL
t=80ms  POST /warm
t=580ms response (thumb xong) → thumb hiện, preview URL được "predict"
t=1.3s  background preview upload xong R2
        nếu user click lightbox trong 580ms-1.3s: <img preview> 404 → onError fallback thumb
        sau 1.3s: lightbox load preview đẹp
```

## Khi nào cần thêm Cloudflare Worker?

Hiện FE dùng URL `https://cdn.teehub.io/gimage/...` đi thẳng tới R2 public bucket. Nếu R2 chưa có object → 404 cứng (BE không can thiệp được vì cdn.teehub.io trỏ thẳng R2).

Pattern hiện tại bù bằng `warmGImages` (FE chủ động warm trước khi `<img>` render). Nếu muốn URL CDN "tự warm khi miss" (giống `gimagecdn.iamzic.com` thực thụ), cần Cloudflare Worker đặt route `cdn.teehub.io/gimage/*`:

1. Worker bắt request.
2. Forward tới R2 → nếu 200 trả ngay.
3. Nếu 404 → gọi BE `/api/public/v1/gimage/{variant}/{id}` để warm → redirect lại.

Hiện chưa cần — `useGImageWarmer` đã đảm bảo warm trước render.

## Mở rộng tương lai

- **Service Worker FE** cache CDN URLs offline cho admin dashboard.
- **Pre-warm batch khi sync orders**: khi sync order chứa design URL Drive, BE chủ động gọi `EnsureCachedManyAsync` để khi merchant mở trang đã có sẵn.
- **Webhook Drive change notification**: nếu file Drive bị thay (cùng id, content đổi), invalidate R2 cache (delete key, để warm lại).
- **Hỗ trợ Drive private** qua OAuth service account — đã có sẵn `GoogleDriveImageFetcher` nhận token nếu mở rộng.
- **Cloudflare Worker self-warm** (chi tiết ở mục trên).
- **Persist metadata cache** — hiện `_metaCache` chỉ trong RAM, restart BE mất. Có thể lưu vào R2 object custom metadata (`x-amz-meta-original-name`) khi warm ảnh, đọc lại khi cần. Hoặc dùng Redis với same TTL 24h cho cross-instance.
- **Batch metadata endpoint** `POST /api/public/v1/gimage/meta-batch` body `{ ids: [...] }` → cùng pattern như `/warm`, dedup + concurrency. Hữu ích khi FE list nhiều file một lúc.

---

**Liên quan**:
- [Design SKU Management](./design_sku_management.md) — module chính sử dụng tính năng này
- [Bulk Import Products](./bulk_import_products.md)
