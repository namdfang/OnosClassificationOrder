# Design Storage (R2 + Design Worker) — Function Description

> **File FE:** `apps/web/src/components/common/FileUrlOrUploadInput.tsx`, `apps/web/src/utils/driveThumb.ts`, `apps/web/src/services/customerPortal.ts` (`customerDesign`)
> **File BE:** `apps/api/src/modules/design-storage/` (module đủ bộ), hook trong `apps/api/src/modules/customer-portal/customer-order.service.ts`
> **Worker:** `apps/design-worker/` (app riêng trong monorepo — chạy trên server DigitalOcean)
> **Route:** không có page riêng — nhúng vào form đặt đơn `/customer/orders/new` + sửa đơn
> **API:** `/v1/customer/designs/*`
> **Plan gốc:** [`documents/Plans/DesignStorage-R2-ProcessingWorker.md`](../Plans/DesignStorage-R2-ProcessingWorker.md)

## 1. Overview

Design khách hàng (20–100MB+/file, hàng nghìn đơn/ngày) được lưu trên **Cloudflare R2** (egress $0, CDN qua custom domain) và xử lý bởi **`apps/design-worker`** — app Node riêng chạy trên server thuê ngoài, nhận job qua RabbitMQ. **API server KHÔNG đụng byte nào của file** (bài học từ module `design-image` cũ: sharp + BullMQ in-process làm nghẽn VPS, đã bị tắt bằng comment `[QUEUE-disabled]`):

- **Upload trực tiếp browser → R2** bằng presigned URL; API chỉ presign + ghi metadata + enqueue.
- **Dedup theo sha256 NỘI DUNG file** (không phải Drive ID/URL): FE tính sha bằng WebCrypto trước khi upload — file trùng → `exists`, "upload" 0 giây, R2 không thêm object.
- 3 biến thể mỗi design, key theo sha (URL bất biến → cache CDN immutable 1 năm):

```
designs/<sha256>/original       — file gốc giữ nguyên format (file để in)
designs/<sha256>/preview.webp   — 500×500 fit-inside (dialog/drawer)
designs/<sha256>/thumb.webp     — 100×100 (listing/kanban)
uploads/tmp/<uuid>              — vùng chờ upload, worker dọn sau xử lý
```

- **Vòng đời original theo sliding window `lastUsedAt`** (mọi đơn mới tham chiếu design là reset đồng hồ): không dùng 60 ngày → hạ Infrequent Access ($10/TB); nằm IA 12 tháng không ai đụng → xóa thật. **Thumb + preview giữ VĨNH VIỄN** → đơn cũ nhiều tháng mở lại vẫn xem được ảnh. Design bán quanh năm không bao giờ bị dọn.
- Phạm vi đợt đầu: **CHỈ Customer Portal**. Luồng nội bộ (Drive + `transform-drive-url`) giữ nguyên.

## 2. Luồng hoạt động

### 2.1 Upload trực tiếp (form đặt đơn / sửa đơn)

```
FileUrlOrUploadInput: chọn file → sha256 (WebCrypto)
  → POST /customer/designs/presign {sha256,size,mime,fileName}
      dedup hit → mode='exists' → set value = CDN original URL, XONG (0 giây)
      chưa có   → mode='upload' + presigned PUT uploads/tmp/<uuid> (TTL 1h)
  → XHR PUT thẳng lên R2 (progress bar, KHÔNG qua API)
  → POST /customer/designs/confirm {tmpKey,sha256} — BE HEAD verify + publish job RabbitMQ
  → value form = designCdnUrl(publicBase, sha, 'original') (chốt ngay, URL không đổi)
  → FE poll GET /customer/designs/:sha256 mỗi 2.5s tới `ready` (hiện trạng thái xử lý)
```

### 2.2 Ingest từ URL ngoài lúc Push to production (đơn CSV giữ URL Drive)

Đơn CSV/staging giữ nguyên URL Drive ở Pending (**đơn không push = 0 đồng storage**). Lúc `pushToProduction()`: design là URL ngoài → publish job `{kind:'url', url, designKey, productionId, stagingId}`; push **KHÔNG chờ worker** — đơn vào sản xuất ngay với URL Drive, worker xử lý xong **thay URL bằng CDN original ở CẢ `OrderEntity.designs.{k}` lẫn staging `items[].designs.{k}`** (`designsOriginal` giữ URL Drive làm provenance). Cùng link Drive từng ingest → dedup qua `sourceKeys` (URL-hash alias), khỏi tải lại.

### 2.3 Worker xử lý 1 job (`apps/design-worker/src/processor.ts`)

1. Stream download về NVMe tmp (từ R2 `uploads/tmp/` — egress $0, hoặc từ Drive), vừa stream vừa tính sha256 (không giữ cả file trong RAM), cap `DESIGN_MAX_DOWNLOAD_MB` (300).
2. Dedup theo sha thật → đã `ready` thì chỉ update reference. sha FE claim sai → record claim đánh `failed`, sha thật là nguồn chân lý.
3. sharp: preview 500×500 + thumb 100×100 (fit inside, webp). File không phải raster (PSD/AI/PDF) → chỉ lưu original, `hasPreview=false`.
4. Upload 3 biến thể (Cache-Control immutable) → `design_files.status='ready'` → job `url` thay URL đơn → xóa tmp local + R2.
5. Lỗi → retry 3 lần (delay 5s) → DLQ `<exchange>.design.process.dlq` + đánh `failed` + notify Telegram bot sẵn có.

### 2.4 Vòng đời (cron `GET /customer/designs/lifecycle/cron`, public — gọi từ cron ngoài)

1. `ready` + `lastUsedAt` quá 60 ngày (`DESIGN_ORIGINAL_TTL_DAYS`) → CopyObject original sang class `STANDARD_IA` → `archived`.
2. `archived` + `archivedAt` quá 12 tháng (`DESIGN_IA_DELETE_MONTHS`) → xóa original → `deleted` (record + thumb/preview giữ vĩnh viễn).
3. `processing` kẹt quá 24h → `failed`.
4. Restore: đơn mới chạm design `archived` (touchUsage/presign) → CopyObject về `STANDARD` + `ready` — IA vẫn đọc được ngay nên không có downtime.

## 3. API / Schema

### 3.1 Endpoints (`design-storage.controller.ts`)

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| POST | `/v1/customer/designs/presign` | Customer | Dedup check + presigned PUT `uploads/tmp/<uuid>`; res `{mode:'exists'\|'upload', file, publicBase, uploadUrl?, tmpKey?}` |
| POST | `/v1/customer/designs/confirm` | Customer | HEAD verify object + size cap → publish job worker |
| GET | `/v1/customer/designs/lifecycle/cron` | public | Cron vòng đời (archive/delete/stale) — pattern cron endpoint sẵn có |
| GET | `/v1/customer/designs/:sha256` | Customer | Poll trạng thái (FE chờ `ready`) |

### 3.2 Collection `design_files` (`design-file.entity.ts`)

```ts
DesignFileEntity {
  sha256;                      // unique — khóa dedup NỘI DUNG
  status: 'processing'|'ready'|'archived'|'deleted'|'failed';
  fileName?; size; mime?; width?; height?;
  hasPreview;                  // false = PSD/AI/PDF — FE hiện icon file
  storageClass: 'standard'|'ia'; archivedAt?;
  lastUsedAt; usageCount;      // sliding window — cron lifecycle đọc
  sourceKeys: string[];        // URL-hash alias (mirror hashForR2) — dedup trước download job url
  sourceUrl?;                  // link Drive gốc nếu ingest từ URL
  errorMessage?;
  uploadedBy?: { customerId, userEmail };  // seller đầu tiên
}
// Indexes: unique sha256; {status,lastUsedAt}; {status,archivedAt}; sourceKeys
```

### 3.3 Shared (`packages/shared/dtos/design-file.dto.ts`)

`DESIGN_FILE_STATUSES` + `DesignFileZod` + Presign/Confirm DTOs; helpers dùng chung FE/BE/worker: `designFileKey()`, `designCdnUrl()`, `extractDesignSha()`, `designVariantUrl()` (đổi biến thể ngay trên URL); contract job RabbitMQ `DESIGN_PROCESSING_QUEUE` + `DesignIngestJob` (`tmp-object` | `url`).

## 4. UI Components

- `FileUrlOrUploadInput.tsx` — dán URL HOẶC upload trực tiếp: nút UploadCloud → hash → presign → XHR PUT (progress bar) → confirm → poll; trạng thái hashing/uploading %/processing/done/doneInstant (dedup)/error. Dùng ở form `/customer/orders/new` + trang track/sửa đơn.
- `utils/driveThumb.ts` — `driveThumbUrl()`/`smallThumb()` nhận diện thêm URL CDN mới qua `designVariantUrl()` (original → thumb/preview) trước khi fallback Drive/R2 cũ → mọi chỗ render design thumbnail tự hỗ trợ, không sửa từng component.
- i18n `customerPortal.json` keys `fileInput.*` (vi + en).

## 5. Backend logic

- `DesignStorageService` — `presign()`/`confirm()`/`getBySha()`/`touchUsageForUrls()`/`enqueueUrlIngest()`/`runLifecycle()`; S3Client trỏ R2 endpoint, tái dùng getter `ApiConfigService.r2Config` (mở rộng thêm `maxUploadMb`/`originalTtlDays`/`iaDeleteMonths`). Publish qua `AmqpConnection` (AmqpModule global), routing key `${RABBITMQ_MAIN_EXCHANGE}.design.process`.
- Hook `customer-order.service.ts`: `placeOrder`/`importOrdersCsv`/`updateStagingOrder`/`updateOrder` → `touchUsageForUrls()` (fail êm, không chặn đặt đơn); `pushToProduction` → touch CDN + `enqueueUrlIngest` cho URL ngoài (§2.2).
- Worker (`apps/design-worker`): amqplib consumer prefetch 3, ghi Mongo trực tiếp qua Tailscale bằng schema `strict:false` tối thiểu (nguồn chân lý là entity bên api); Dockerfile multi-stage build từ root monorepo + `docker-compose.yml` + `.env.example` trong thư mục worker.

## 6. Performance notes

- API server không còn nhận body file: upload 100MB đi thẳng browser → R2 (trước đây thử xử lý in-process → nghẽn VPS, phải tắt module design-image).
- Dedup 2 tầng: sha256 nội dung (upload trùng = 0 byte transfer, 0 giây) + `sourceKeys` URL-hash (cùng link Drive không tải lại 100MB).
- Worker stream-hash (RAM ~vài MB/job bất kể file 300MB); resize sharp ~1–3s/file 100MB; 4 vCPU + prefetch 3 xử lý chục nghìn design/ngày.
- Chi phí đi ngang nhờ lifecycle: original chỉ sống trong cửa sổ trượt 60 ngày + IA 12 tháng; thumb+preview (~110KB/design) giữ vĩnh viễn ≈ vài trăm GB/năm.

## 7. Permissions

- 3 endpoint chính `@Auth([RoleType.Customer])` — nằm trong prefix `customer/` nên qua được `RolesGuard` `CUSTOMER_ALLOWED_PREFIXES`; cron endpoint `@Auth([], [], { public: true })`.
- Không dùng permission-catalog nội bộ (pattern Customer Portal).
- R2: 2 API token scope Object Read & Write riêng (API / worker) — thu hồi độc lập.
