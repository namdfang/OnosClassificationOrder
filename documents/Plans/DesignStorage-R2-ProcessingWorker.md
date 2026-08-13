# Kế hoạch: Design Storage — R2 lưu trữ + Worker xử lý ảnh riêng (Customer Portal)

> **Trạng thái:** ✅ **ĐÃ IMPLEMENT phần CODE (2026-08-11)** — shared DTOs + module `design-storage` + hooks customer-portal + `apps/design-worker` + FE upload. Doc chính thức: [`documents/FunctionDescription/DesignStorage.md`](../FunctionDescription/DesignStorage.md). Hạ tầng (Phần A: Cloudflare/R2/droplet/Tailscale) làm tay theo hướng dẫn — xong thì điền env + deploy worker.
> **Bài toán:** design khách 20–100MB+, hàng nghìn đơn/ngày (1–3 design/đơn). Server API hiện tại đã thử nhận file lớn và bị nghẽn → tách hẳn đường đi của file khỏi API.
> **Kiến trúc chốt:** **R2 = kho lưu trữ + CDN** (egress $0) · **Server DigitalOcean riêng = worker xử lý stateless** (download/hash/resize, không giữ dữ liệu) · **API hiện tại KHÔNG đụng byte nào của file** (chỉ presign + metadata + enqueue RabbitMQ).
> **Phạm vi đợt đầu:** CHỈ Customer Portal (form upload trực tiếp + đơn CSV giữ URL Drive, worker ingest lúc Push to production). Luồng nội bộ (Drive + `transform-drive-url`) giữ nguyên, migrate phase sau.

---

## 0. Quyết định đã chốt

| # | Quyết định | Giá trị |
| --- | --- | --- |
| 1 | Lưu trữ | Cloudflare R2, bucket riêng, custom domain CDN |
| 2 | Worker | DigitalOcean Droplet **Basic Premium AMD 4 vCPU / 8GB / 160GB NVMe** (~$56/th), region **SGP1**, Ubuntu 24.04 LTS. Nghẽn queue → resize gói lên 8 vCPU/16GB ($112) không đổi code |
| 3 | Phạm vi code | Customer Portal only (form + CSV/push) |
| 4 | Domain CDN | Domain sẵn có, CHƯA trên Cloudflare → phải chuyển nameserver về Cloudflare trước (R2 custom domain bắt buộc domain thuộc zone Cloudflare) |
| 5 | Vòng đời original | Sliding window `lastUsedAt`: không dùng **60 ngày → hạ Infrequent Access** ($10/TB) → nằm IA **12 tháng** không ai đụng → xóa thật. **Thumb 100×100 + preview 500×500 giữ VĨNH VIỄN** → đơn cũ 4–5 tháng mở lại luôn xem được ảnh |
| 6 | Dedup | Theo `sha256` nội dung file (KHÔNG theo Drive file ID) — cùng file → lưu 1 lần, upload lần 2 trả link ngay |
| 7 | Key/URL | DB chỉ lưu **key/sha256**, KHÔNG lưu URL tuyệt đối. URL ghép từ config `DESIGN_CDN_BASE_URL` |

Chi phí ước tính khi chạy ổn định (giữ ~8–12TB original trong cửa sổ trượt): R2 ~$100–180 + droplet ~$56 + Cloudflare $0 ≈ **$160–240/tháng**, đi ngang không phình theo năm.

---

## PHẦN A — HẠ TẦNG (làm tay từng bước, ~nửa ngày, phần lớn là chờ DNS)

### A1. Đưa domain về Cloudflare (điều kiện tiên quyết của R2 custom domain)

1. Tạo tài khoản Cloudflare (free plan đủ dùng) → **Add a domain** → nhập domain của bạn → chọn plan Free.
2. Cloudflare quét DNS record hiện tại → **kiểm tra lại từng record** (web, mail MX, các subdomain đang sống) trước khi bấm tiếp — thiếu record là chết dịch vụ đang chạy.
3. Cloudflare đưa 2 nameserver (dạng `xxx.ns.cloudflare.com`) → vào trang quản trị nơi mua domain → thay nameserver cũ bằng 2 NS này.
4. Chờ propagate (thường 1–4h, tối đa 24h) → Cloudflare báo "Active" qua email. Kiểm tra: `dig NS <domain>` ra NS Cloudflare.

### A2. Tạo bucket R2 + API token

1. Dashboard Cloudflare → **R2 Object Storage** → Enable (cần gắn thẻ; free tier 10GB, vượt mới tính tiền).
2. **Create bucket**: tên `onos-designs`, location **Asia-Pacific (APAC)**. KHÔNG bật public access mặc định.
3. **Manage R2 API Tokens** → Create API token:
   - Permissions: **Object Read & Write**, scope **chỉ bucket `onos-designs`**.
   - Lưu lại 3 giá trị (hiện đúng 1 lần): `Access Key ID`, `Secret Access Key`, và `Account ID` (góc endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).
4. Tạo **2 token riêng biệt** cùng scope: 1 cho API server (presign), 1 cho worker — thu hồi độc lập khi lộ.

### A3. Gắn custom domain CDN vào bucket

1. Bucket `onos-designs` → **Settings → Custom Domains → Connect Domain** → nhập `cdn.<domain-của-bạn>` → Cloudflare tự tạo DNS record + bật proxy.
2. Sau bước này object trong bucket đọc được qua `https://cdn.<domain>/<key>` — quyền đọc là **public qua custom domain**. Chấp nhận được vì key chứa sha256 (không đoán được); nếu sau này cần private thì thêm Cloudflare Worker ký URL (ghi nhận phase sau, KHÔNG làm đợt này).
3. Cache: object được upload với header `Cache-Control: public, max-age=31536000, immutable` (worker set lúc upload — key theo sha nên nội dung không bao giờ đổi). Không cần Page Rule gì thêm.

### A4. Thuê + cài droplet DigitalOcean

1. Create Droplet: Region **Singapore SGP1** · Image **Ubuntu 24.04 LTS x64** · Size **Basic → Premium AMD → 4 vCPU / 8GB / 160GB NVMe ($56/mo)** · Authentication: **SSH key** (tạo key nếu chưa có, KHÔNG dùng password) · Hostname `design-worker-01`.
   - Lưu ý transfer: gói này kèm ~5TB transfer/tháng. Worker **upload lên R2 tính là outbound** — volume ~4–5TB/tháng nằm sát trần; vượt tính $0.01/GB (~$10/TB), vẫn rẻ, chỉ cần biết trước.
2. DO **Cloud Firewall**: inbound chỉ mở **SSH (22) từ IP của bạn**; outbound mở hết. Worker KHÔNG cần bất kỳ port public nào (nó chỉ chủ động gọi ra R2/Drive/RabbitMQ/Mongo).
3. SSH vào, setup cơ bản một lần:

```bash
adduser deploy && usermod -aG sudo,docker deploy   # tạo user thường (docker group sau khi cài docker)
apt update && apt -y upgrade
# Docker + Compose
curl -fsSL https://get.docker.com | sh
# tự vá bảo mật
apt -y install unattended-upgrades fail2ban
dpkg-reconfigure -plow unattended-upgrades
# tắt SSH password login
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart ssh
```

### A5. Nối mạng riêng worker ↔ hạ tầng hiện tại (RabbitMQ + MongoDB)

Worker cần đọc queue RabbitMQ và ghi MongoDB của hệ thống. **KHÔNG mở 2 port này ra internet.** Chọn 1 trong 2:

- **Khuyên dùng — Tailscale** (miễn phí, 15 phút): cài `tailscale up` trên cả droplet lẫn server đang chạy Mongo/RabbitMQ → 2 máy thấy nhau qua IP `100.x.x.x` mã hóa WireGuard → connection string của worker trỏ IP Tailscale. Không đổi firewall, không lộ port.
- Phương án thay thế: firewall server hiện tại allowlist đúng IP tĩnh của droplet vào port 5672/27017 + bật auth/TLS. Được nhưng giòn hơn (đổi IP là đứt) và vẫn lộ port ra ngoài.

---

## PHẦN B — SCHEMA + SHARED (packages/shared)

### B1. Collection mới `design_files` (file VẬT LÝ, dedup toàn hệ thống)

```ts
DesignFileEntity {
  sha256: string;              // unique index — khóa dedup
  size: number; mime: string;
  width?: number; height?: number;
  status: 'processing' | 'ready' | 'archived' | 'deleted' | 'failed';
  errorMessage?: string;       // khi failed (retry được)
  storageClass: 'standard' | 'ia';
  archivedAt?: Date;           // set khi hạ IA — cron xóa đọc mốc này
  lastUsedAt: Date;            // sliding window — MỌI đơn mới tham chiếu là $set lại
  usageCount: number;
  uploadedBy?: { customerId, userEmail };   // seller upload đầu tiên (denorm pattern repo)
  fileName?: string;           // tên file thật khách đặt
  sourceUrl?: string;          // link Drive gốc nếu ingest từ URL (CSV)
  driveFileId?: string;
  createdAt; updatedAt;
}
// Indexes: unique {sha256}; {status, lastUsedAt} (cron GC); {status, archivedAt} (cron xóa)
```

Key trên R2 (URL ghép `${DESIGN_CDN_BASE_URL}/${key}`):

```
designs/<sha256>/original          (giữ nguyên format gốc — file in KHÔNG nén lossy)
designs/<sha256>/preview.webp      (500×500 fit-inside, q80, ~100KB)
designs/<sha256>/thumb.webp        (100×100 cover, ~10KB)
uploads/tmp/<uuid>                 (vùng chờ upload trực tiếp — worker dọn sau khi xử lý)
```

> Ghi chú thiết kế: đợt này CHỈ 1 collection. Bảng "thư viện design theo seller" (`designs` — nhiều seller cùng 1 file vật lý) để phase sau khi làm UI thư viện; `uploadedBy` + `usageCount` đủ cho nhu cầu "design này của ai, dùng bao nhiêu" trước mắt.

### B2. Shared DTOs — `packages/shared/dtos/design-file.dto.ts` (MỚI)

- `DesignFileStatusZod`, `DesignFileZod` (safe fields trả FE: sha256, status, fileName, size, width/height, keys).
- `PresignDesignUploadZod` `{ sha256, size, mime, fileName }` → res `{ mode: 'exists', file }` (dedup hit — khỏi upload) HOẶC `{ mode: 'upload', uploadUrl, tmpKey, file }`.
- `ConfirmDesignUploadZod` `{ tmpKey, sha256 }` → res `DesignFileZod` (status `processing`).
- `designCdnUrl(base, sha256, variant)` — helper thuần dùng chung FE/BE.
- Job payload types cho queue: `DesignIngestJob = { kind: 'tmp-object', tmpKey, sha256Claimed } | { kind: 'url', url, refId }` + `DESIGN_PROCESSING_QUEUE = 'design-processing'`.

---

## PHẦN C — BACKEND API (`apps/api/src/modules/design-storage/` — module mới đủ bộ)

### C1. Env + config (`api-config.service.ts` + `.env.development.example`)

```
R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET=onos-designs
DESIGN_CDN_BASE_URL=https://cdn.<domain>
DESIGN_ORIGINAL_TTL_DAYS=60        # sliding window trước khi hạ IA
DESIGN_IA_DELETE_MONTHS=12
```

Deps mới: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2 tương thích S3; endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`).

### C2. Endpoints (`design-storage.controller.ts`, `@Auth([RoleType.Customer])`)

| Method | Path | Việc |
| --- | --- | --- |
| POST | `/customer/designs/presign` | FE gửi `{sha256, size, mime, fileName}` (sha tính ở browser). BE tra `design_files` theo sha: **có + status ready/processing → trả `exists`** (upload 0 giây); chưa có → tạo record `processing` + presigned PUT `uploads/tmp/<uuid>` (TTL 1h, max size guard) |
| POST | `/customer/designs/confirm` | FE báo upload xong → BE HEAD verify object tồn tại + size khớp → publish job `{kind:'tmp-object'}` vào RabbitMQ → trả record `processing` |
| GET | `/customer/designs/:sha256` | Poll trạng thái (FE chờ `ready` để hiện thumb) |

Ghi chú: cap upload (đề xuất 300MB/file) validate ở presign; rate-limit theo customer qua `@Auth` options sẵn có.

### C3. Service — các hàm chính (`design-storage.service.ts`)

- `presign()/confirm()/getBySha()` như trên.
- `touchUsage(sha256[])` — `$set lastUsedAt + $inc usageCount`; **được gọi ở mọi điểm 1 đơn tham chiếu design** (xem C4). Design đang `archived` mà được touch → đổi class về standard (CopyObject đè chính nó với storage class standard — restore tức thời, IA vẫn đọc được ngay chỉ tốn phí retrieval $0.01/GB).
- `enqueueUrlIngest(url, refId)` — cho luồng CSV/push.
- **Cron GC** (pattern cron/public endpoint sẵn có của repo — `GET /designs/lifecycle/cron`):
  1. `status='ready' && lastUsedAt < now-60d` → CopyObject original sang class IA → `status='archived', storageClass='ia', archivedAt=now`. Thumb/preview KHÔNG đụng.
  2. `status='archived' && archivedAt < now-12mo` → DeleteObject original → `status='deleted'`. Record + thumb/preview giữ vĩnh viễn.
  3. Dọn `uploads/tmp/` quá 24h (job mồ côi) + record `processing` quá 24h → `failed`.

### C4. Điểm móc vào Customer Portal hiện có (`customer-order.service.ts`)

| Điểm | Việc |
| --- | --- |
| `placeOrder` (form) | FE giờ gửi design = **CDN URL/sha** (đã upload xong qua C2). BE nhận diện URL thuộc `DESIGN_CDN_BASE_URL` → `touchUsage(sha)` |
| `importOrdersCsv` | Cột `design_*` vẫn là URL Drive → **giữ nguyên URL trong staging** (đơn Pending chưa push = 0 đồng storage, đúng plan CustomerOrderIntake) |
| `pushToProduction` | Với mỗi design còn là URL ngoài (Drive) → `enqueueUrlIngest(url, {stagingId, itemIndex, field})`. Push KHÔNG chờ worker — đơn vào sản xuất ngay với URL Drive, worker xử lý xong sẽ **thay URL bằng CDN link ở CẢ staging item lẫn `OrderEntity.designs`** (qua update trực tiếp field designs — không đi qua updateField để khỏi nổ order-log rác; ghi 1 log action riêng nếu cần). Design đã là CDN URL → chỉ `touchUsage` |
| `updateOrder`/`updateStagingOrder` (khách sửa design) | Nhận cả 2 dạng: CDN URL (touch) hoặc URL ngoài (giữ nguyên, ingest lúc push như trên) |

> Nguyên tắc: **KHÔNG đụng luồng đơn nội bộ / `transform-drive-url` / Image module đợt này.** OrderEntity vẫn lưu string URL trong `designs` như hiện tại — chỉ khác giá trị dần chuyển sang CDN URL, nên toàn bộ FE nội bộ (workshop table, designer kanban…) hiển thị được ngay không sửa gì.

---

## PHẦN D — WORKER (`apps/design-worker/` — app MỚI trong monorepo)

### D1. Cấu trúc

- Package pnpm workspace mới `apps/design-worker`: NestJS standalone (không HTTP server) hoặc Node thuần + `amqplib`; deps: `sharp`, `@aws-sdk/client-s3`, `mongoose` (dùng chung entity qua import từ api? — KHÔNG: copy schema tối thiểu `design_files` vào worker hoặc đưa schema lên `packages/core` để 2 app dùng chung; chốt khi implement), types từ `packages/shared`.
- Consume queue `design-processing`, prefetch 2–4 (file lớn, đừng nuốt cả queue), **DLQ** `design-processing.dlq` sau 3 retry backoff.

### D2. Luồng xử lý 1 job

```
1. Nhận job → stream download về NVMe tmp:
     kind='tmp-object' → GET R2 uploads/tmp/<uuid>   (egress R2 = $0)
     kind='url'        → GET link Drive (uc?export=download, theo pattern hệ cũ)
2. Vừa stream vừa tính sha256 (crypto stream — không load cả file vào RAM)
3. Tra design_files theo sha thật:
     đã ready → dedup hit: chỉ update record refId/touchUsage, xóa tmp, DONE
4. sharp: đọc metadata (width/height/format)
     → preview.webp 500×500 fit-inside q80
     → thumb.webp   100×100 cover
     (file không phải ảnh raster — PSD/AI/PDF: phase 1 bỏ qua biến thể, đánh dấu
      hasPreview=false, FE hiện icon file; ghi nhận phase sau nếu cần render)
5. Upload 3 object lên designs/<sha>/… với Cache-Control immutable
6. Update design_files → ready (+size/width/height) ; job kind='url' → callback cập nhật
   staging item + OrderEntity.designs sang CDN URL (ghi Mongo trực tiếp qua Tailscale)
7. Xóa tmp local + DeleteObject uploads/tmp/<uuid>
```

Lỗi bước nào → nack + retry (3 lần) → DLQ + `design_files.status='failed'` + **notify Telegram** (tái dùng `packages/core` TelegramService — worker gửi qua bot sẵn có).

### D3. Deploy trên droplet

- `Dockerfile` cho worker (multi-stage, build từ root monorepo) + `docker-compose.yml` trên droplet: 1 service worker + restart always + healthcheck (kiểm tra connection RabbitMQ) + Tailscale chạy trên host.
- Deploy đợt đầu: `git clone` + `docker compose up -d --build` bằng tay; CI/CD để sau.
- Giám sát tối thiểu: cron trên droplet check queue depth qua RabbitMQ management API → quá ngưỡng (vd 500 job tồn) bắn Telegram; DO monitoring alert CPU/disk (bật trong dashboard, miễn phí).

---

## PHẦN E — FRONTEND PORTAL (`apps/web`)

1. **`FileUrlOrUploadInput.tsx` (component sẵn có) nâng cấp chế độ upload trực tiếp R2**: chọn file → tính sha256 bằng WebCrypto (stream/chunk, file 100MB ok) → `POST presign` → `exists` thì xong tức thì (hiện thumb luôn — trải nghiệm "upload 0 giây" khi trùng design) / `upload` thì PUT thẳng lên R2 kèm progress bar → `confirm` → poll `GET /designs/:sha` tới `ready` → hiện thumb. Vẫn giữ chế độ dán URL (Drive) như cũ.
2. Form `/customer/orders/new` + sửa đơn (drawer/staging): design field dùng component trên; value lưu = CDN original URL.
3. Hiển thị: mọi chỗ đang render design thumbnail trong portal (drawer `CustomerOrderDetailDrawer`, listing) ưu tiên `designCdnUrl(sha,'thumb'|'preview')` khi URL thuộc CDN, fallback `driveThumbUrl()` sẵn có cho URL Drive cũ — đơn cũ không vỡ ảnh.
4. i18n `customerPortal.json` (vi+en): keys upload progress/`processing`/`failed`/dedup-instant.

---

## PHẦN F — THỨ TỰ THỰC THI + VERIFY

1. **A1–A3** (Cloudflare + R2 + custom domain) — làm trước vì chờ DNS.
2. **A4–A5** (droplet + Tailscale) — song song với code.
3. **B** shared DTOs + entity → **C1–C3** module design-storage (presign/confirm/poll/cron) → test bằng curl/Postman upload 1 file thật 100MB.
4. **D** worker: chạy local trước (trỏ RabbitMQ/Mongo dev) → xử lý file test end-to-end (tmp-object + url-ingest) → deploy droplet.
5. **E** FE portal + **C4** móc placeOrder/push.
6. Verify checklist:
   - Upload file 100MB từ form → progress → thumb hiện ≤ ~30s; API server **không tăng RAM/CPU** trong lúc upload (điểm chết cũ).
   - Upload lại đúng file đó (khác tên) → `exists` tức thì, R2 không thêm object.
   - Import CSV có design Drive → Pending giữ URL Drive → Push → đơn vào sản xuất ngay → vài phút sau designs trên cả staging + OrderEntity đổi sang `cdn.<domain>` + thumb hiện trong drawer.
   - Giả lập lifecycle: set tay `lastUsedAt` lùi 61 ngày → chạy cron → original sang IA, preview/thumb vẫn đọc được; tạo đơn mới tham chiếu design archived → class về standard + `lastUsedAt` mới.
   - Kill worker giữa chừng 1 job → job quay lại queue, xử lý lại không tạo rác (idempotent theo sha).
   - `pnpm build-types` + lint cả 3 package.
7. Docs: tạo `documents/FunctionDescription/DesignStorage.md` (skill `write-feature-doc`) + thêm dòng mapping CLAUDE.md + update `CustomerPortal.md`/`CustomerOrderIntake.md` các mục design.

---

## PHẦN G — Phase sau (ghi nhận, KHÔNG làm đợt này)

- Luồng nội bộ + migrate design Drive cũ về R2 (job quét đơn N ngày).
- Bảng `designs` theo seller + UI "Thư viện design của tôi" (re-use design giữa các đơn không cần upload lại).
- Private CDN (Cloudflare Worker ký URL) nếu cần bảo vệ IP design.
- Preview cho PSD/AI/PDF.
- CI/CD deploy worker + autoscale (thêm droplet thứ 2 cùng consume queue là xong — kiến trúc đã stateless).
