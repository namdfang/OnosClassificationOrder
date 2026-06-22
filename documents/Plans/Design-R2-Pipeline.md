# Design Image Pipeline — Self-hosted Cloudflare R2

> **Mục tiêu:** Thay vì redirect URL Drive sang `cdn.teehub.io` (bên thứ 3, không control được), chủ động tải file design → nén nhẹ → upload lên **R2 riêng** → render từ CDN của mình.
>
> **Lý do chuyển:**
> - File design gốc 40-70 MB → render trực tiếp lag, tốn băng thông user.
> - Teehub có thể đổi pricing, downtime, hoặc rate-limit không báo trước.
> - Mình cần kiểm soát: nén bao nhiêu, cache bao lâu, xoá khi nào.
> - Giữ nguyên link gốc (Drive / `cdn.onospod.com` / khác) để user vẫn download được bản chất lượng.
>
> **Ràng buộc:**
> - R2 vừa lập, miễn phí 10 GB. Cần kế hoạch để **không** đẩy storage vượt mức nhanh.
> - File gốc có thể là Drive (`drive.google.com/file/d/...`) hoặc HTTP image (`cdn.onospod.com/...`, `cdn.podorder.io/...`).

---

## 1. Kiến trúc đề xuất

```
┌─ Import order ─────────────────────────────────────────────────┐
│  Row paste/Excel → BE parse → enqueue jobs cho 18 design URL  │
│  (response trả về ngay, KHÔNG chờ xử lý ảnh)                  │
└────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─ BullMQ queue `design-image` ──────────────────────────────────┐
│  Job: { sourceUrl, hash, orderIds[], designKey }              │
│  Concurrency: 2-4 (tránh OOM khi file 70 MB)                  │
└────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─ ImageProcessor worker ────────────────────────────────────────┐
│  1. HEAD r2://designs/preview/{hash}.webp                     │
│     - Exists → skip (idempotent, dedup theo hash)             │
│  2. Download source → buffer (cap 100 MB, stream)             │
│     - Drive → `drive.usercontent.google.com/download?id=…`    │
│     - HTTP → fetch trực tiếp                                  │
│  3. sharp() resize + webp encode:                             │
│     - thumb   : 300×300 cover   q=70 (~5 KB)                  │
│     - preview : 1000×1000 fit   q=80 (~50-150 KB)             │
│  4. PUT r2://designs/thumb/{hash}.webp                        │
│     PUT r2://designs/preview/{hash}.webp                      │
│  5. KHÔNG lưu original lên R2 (chỉ giữ URL gốc trong Mongo)   │
│  6. orderModel.updateMany cho mọi orderIds đợi job này         │
└────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─ Mongo `orders` collection ────────────────────────────────────┐
│  designs.front          = https://cdn.<your>/preview/{h}.webp │
│  designsOriginal.front  = <user paste URL>     ← KHÔNG đổi    │
└────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─ Browser ──────────────────────────────────────────────────────┐
│  <img src=preview-URL>                                        │
│  Service Worker stale-while-revalidate cache (image-cache-v4) │
└────────────────────────────────────────────────────────────────┘
```

**Tại sao đẩy job vào queue thay vì xử lý sync trong `importOrders`?**

- Import 100 đơn × 18 design = 1800 file → download/compress sync = vài chục phút, request HTTP timeout, FE hỏng UX.
- Async: import return 200 ngay (vài giây), FE hiển thị skeleton ảnh / fallback URL gốc, ảnh "pop in" dần khi worker xử lý xong.
- BullMQ đã có sẵn trong stack — chỉ cần thêm 1 queue mới.

---

## 2. Cấu trúc URL trên R2

```
Bucket: onosfactory-designs (vừa lập)
Custom domain (sẽ làm ở Phase 1.4): https://cdn.onosfactory.com
                                    hoặc dùng tạm R2.dev URL public

Structure:
  designs/preview/{hash}.webp       ~50-150 KB, dùng cho preview dialog + workshop table cell zoom
  designs/thumb/{hash}.webp         ~5 KB, dùng cho table thumbnail 36-48 px
  (KHÔNG có /origin/* — file gốc giữ ở Drive/CDN bên thứ 3)
```

**`hash` quy ước:**
- Drive URL → `hash = driveFileId` (vd `1QsLAK8gWZyxErZe-33OwIwDuMlAuUNqx`)
- Non-Drive URL → `hash = sha256(url).slice(0, 24)` (24 hex chars, đủ unique)

Lý do dùng hash thay cho random:
- **Idempotent**: re-import cùng URL → cùng hash → HEAD R2 thấy đã có → skip, không tốn job.
- **Dedup tự nhiên**: 2 đơn cùng design URL → cùng key R2 → 1 lần lưu.

---

## 3. Plan thực hiện — chia 10 phase

> Mỗi phase test xong rồi sang phase sau. Có rollback path cho từng phase.

### Phase 1 — Setup Cloudflare R2

#### 1.1 Tạo bucket

1. Vào https://dash.cloudflare.com → chọn account → sidebar **R2** → **Create bucket**.
2. **Bucket name:** `onosfactory-designs` (lowercase, gạch ngang).
3. **Location:** `Asia-Pacific (APAC)` — gần VPS Việt Nam nhất, giảm latency download/upload.
4. **Default storage class:** Standard (R2 không có tier khác).
5. Bấm **Create bucket**.

#### 1.2 Tạo API token

1. R2 sidebar → **Manage R2 API Tokens** → **Create API token**.
2. **Token name:** `onosfactory-api-rw`.
3. **Permission:** *Object Read & Write*.
4. **Specify bucket(s):** chọn `onosfactory-designs` (không grant toàn account).
5. **TTL:** Forever (hoặc 1 year nếu muốn rotate định kỳ).
6. **Client IP filtering:** nhập IP VPS để hạn chế.
7. **Create API Token** → trang kết quả hiển thị 1 LẦN duy nhất:
   - `Access Key ID`
   - `Secret Access Key`
   - `Endpoint`: `https://<account-id>.r2.cloudflarestorage.com`
   - Lưu cả 3 vào 1Password/Bitwarden ngay.

#### 1.3 Public access (read-only cho `<img src>`)

R2 có 2 cách expose public:

**A. R2.dev URL** (nhanh, free, không production-ready):
- Bucket → **Settings** → **R2.dev subdomain** → **Allow Access**.
- Cloudflare cấp URL dạng `https://pub-<random>.r2.dev`. KHÔNG dùng cho prod vì rate-limited.

**B. Custom domain** (recommend cho prod):
1. Cần 1 domain đã trỏ về Cloudflare (vd `onosfactory.com`).
2. Bucket → **Settings** → **Custom Domains** → **Connect Domain**.
3. Nhập subdomain `cdn.onosfactory.com`. Cloudflare tự tạo CNAME `cdn.onosfactory.com` → bucket.
4. Verify (mất 1-2 phút) → status `Connected`.
5. Test: `curl -I https://cdn.onosfactory.com/test.txt` → 404 (bucket trống, response domain OK).

Mình recommend làm **A** trước để test, sau khi pipeline ổn thì swap sang **B**.

#### 1.4 CORS config

Để FE (chạy ở `app.onosfactory.com`) fetch ảnh + SW cache được:

1. Bucket → **Settings** → **CORS Policy** → **Add CORS policy** → paste:

```json
[
  {
    "AllowedOrigins": [
      "https://app.onosfactory.com",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 86400
  }
]
```

2. Save. CORS chỉ cần cho fetch JS (kiểm tra response status); `<img>` không cần CORS.

#### 1.5 Lifecycle rule cơ bản (defense vs cost surge)

1. Bucket → **Settings** → **Object Lifecycle Rules** → **Add rule**:
   - **Name:** `abort-multipart-1day`
   - **Action:** *Abort incomplete multipart uploads after* `1 day`
   - Lý do: nếu worker crash giữa multipart upload → phần đã upload không xoá thì tốn tiền.
2. Add rule thứ 2 (optional, an toàn):
   - **Name:** `delete-orphan-tmp`
   - **Prefix:** `tmp/`
   - **Action:** *Delete object after* `7 days`
   - Dành cho nếu sau này cần upload tạm.

> R2 KHÔNG có rule "delete if not accessed in X days" như S3 Intelligent-Tiering. Muốn xoá orphan phải tự code (Phase 10).

---

### Phase 2 — Backend: env + package

#### 2.1 Cài deps

```bash
cd /Users/namdfang/Documents/Code/Onos/ToolClassification
pnpm --filter @app/api add sharp @aws-sdk/client-s3
```

- `sharp` — wrap libvips, fastest Node image lib. Pre-built binary cho linux-x64/arm64, không cần build.
- `@aws-sdk/client-s3` — R2 dùng S3-compatible API.

#### 2.2 Env vars

Thêm vào `apps/api/.env.development.example` (và sync sang VPS `.env.production`):

```
# ─── R2 (design image pipeline) ────────────────────────────────
R2_ACCOUNT_ID=<từ endpoint URL ở Phase 1.2>
R2_ACCESS_KEY_ID=<từ Phase 1.2>
R2_SECRET_ACCESS_KEY=<từ Phase 1.2>
R2_BUCKET=onosfactory-designs
R2_PUBLIC_BASE=https://cdn.onosfactory.com   # hoặc https://pub-<…>.r2.dev nếu chưa có custom domain
R2_MAX_DOWNLOAD_MB=120                        # cap để tránh OOM. file > số này → mark fail, không xử lý
R2_THUMB_QUALITY=70
R2_PREVIEW_QUALITY=80
R2_PREVIEW_MAX_DIM=1000
R2_THUMB_DIM=300
DESIGN_QUEUE_CONCURRENCY=3                    # số worker chạy song song
```

#### 2.3 Add R2 config vào `ApiConfigService`

`apps/api/src/shared/services/api-config.service.ts` — thêm getter:

```ts
get r2Config() {
  return {
    accountId: this.getString('R2_ACCOUNT_ID'),
    accessKeyId: this.getString('R2_ACCESS_KEY_ID'),
    secretAccessKey: this.getString('R2_SECRET_ACCESS_KEY'),
    bucket: this.getString('R2_BUCKET'),
    publicBase: this.getString('R2_PUBLIC_BASE'),
    maxDownloadMb: this.getNumber('R2_MAX_DOWNLOAD_MB') ?? 120,
    thumbQuality: this.getNumber('R2_THUMB_QUALITY') ?? 70,
    previewQuality: this.getNumber('R2_PREVIEW_QUALITY') ?? 80,
    previewMaxDim: this.getNumber('R2_PREVIEW_MAX_DIM') ?? 1000,
    thumbDim: this.getNumber('R2_THUMB_DIM') ?? 300,
  };
}
```

---

### Phase 3 — Schema changes

#### 3.1 Order entity — KHÔNG đổi structure, chỉ đổi NGỮ NGHĨA

`OrderEntity.designs.{front,back,...}` hiện đang là `string` (URL Teehub). Đổi semantics:

| Field cũ (Teehub era) | Field mới (R2 era) |
|---|---|
| `designs.front` = `https://cdn.teehub.io/gimage/preview/{id}.webp` | `designs.front` = `https://cdn.onosfactory.com/designs/preview/{hash}.webp` |
| `designsOriginal.front` = Drive URL | `designsOriginal.front` = URL gốc (Drive / cdn.onospod.com / …) **KHÔNG đổi** |

**Không cần migration field name.** Chỉ cần backfill data (Phase 9).

#### 3.2 Add field `designsStatus` (optional, recommend)

Để FE biết ảnh đang xử lý / đã xong / fail mà hiển thị placeholder phù hợp:

```ts
@Prop({
  _id: false,
  type: raw({
    front: { type: String, enum: ['pending', 'ready', 'failed'] },
    back:  { type: String, enum: ['pending', 'ready', 'failed'] },
    // ... 18 fields
  }),
})
designsStatus?: Record<DesignKey, 'pending' | 'ready' | 'failed'>;
```

Khi import:
- Set tất cả keys có URL → `'pending'`.
- Worker xử lý xong → set `'ready'` + update `designs.{key}`.
- Worker fail → set `'failed'`, `designs.{key}` giữ rỗng hoặc giữ URL gốc làm fallback.

#### 3.3 Add bảng dedup `r2_design_objects` (recommend)

Để track key nào đang được order nào reference, cho cleanup orphan sau này:

```ts
@DatabaseEntity({ collection: 'r2DesignObjects' })
export class R2DesignObjectEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, unique: true, index: true })
  hash: string;                  // driveId hoặc sha256(url)[:24]

  @Prop({ required: true })
  sourceUrl: string;             // URL gốc (1 trong N URL có thể trỏ về cùng hash)

  @Prop({ required: true })
  previewKey: string;            // designs/preview/{hash}.webp

  @Prop({ required: true })
  thumbKey: string;              // designs/thumb/{hash}.webp

  @Prop({ required: true })
  sizeBytes: number;             // tổng size 2 variant trên R2

  @Prop({ required: true, default: 0, index: true })
  refCount: number;              // số order đang reference

  @Prop()
  lastAccessedAt?: Date;         // optional, update khi FE fetch (Phase 10)
}
```

Lợi ích:
- Phase 10 (cleanup): scan `refCount=0 AND createdAt < 30 days ago` → drop R2 + delete row.
- Monitor dashboard: tổng size = `db.r2DesignObjects.aggregate([{ $group: { _id: null, sum: { $sum: '$sizeBytes' } } }])`.

---

### Phase 4 — URL helpers (replace `transform-drive-url.ts`)

Tạo file mới `apps/api/src/utils/design-url.ts`:

```ts
import { createHash } from 'crypto';

const DRIVE_PATTERNS = [
  /\/file\/d\/([A-Za-z0-9_-]{10,128})/,
  /[?&]id=([A-Za-z0-9_-]{10,128})/,
];

export function extractDriveId(url?: string): string | null {
  if (!url) return null;
  if (!url.includes('drive.google.com') && !url.includes('drive.usercontent.google.com')) {
    return null;
  }
  for (const re of DRIVE_PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Hash key cho R2:
 *   Drive URL → driveId thẳng (10-128 chars, an toàn cho R2 key)
 *   Non-Drive  → sha256(url).slice(0, 24)
 *
 * Idempotent: cùng input → cùng key → HEAD R2 skip dup.
 */
export function hashForR2(sourceUrl: string): string {
  const driveId = extractDriveId(sourceUrl);
  if (driveId) return driveId;
  return createHash('sha256').update(sourceUrl).digest('hex').slice(0, 24);
}

export function buildR2Url(publicBase: string, variant: 'preview' | 'thumb', hash: string): string {
  return `${publicBase}/designs/${variant}/${hash}.webp`;
}

/** Detect URL nào trỏ về R2 của mình → idempotent re-process. */
export function isOwnR2Url(url: string, publicBase: string): boolean {
  return url.startsWith(publicBase + '/designs/');
}

/**
 * Drive download URL — usercontent endpoint không cần auth cho file share public.
 * Chú ý: file > 100 MB Drive có thể trả HTML confirm page. Worker phải check
 * content-type response, nếu là text/html → throw → retry với confirm token.
 */
export function buildDriveDownloadUrl(id: string): string {
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&authuser=0`;
}
```

Xoá `transform-drive-url.ts` (hoặc giữ tạm cho backfill chuyển dữ liệu cũ — Phase 9).

---

### Phase 5 — Image Processor Service

Tạo module `apps/api/src/modules/design-image/`:

```
design-image/
├── design-image.module.ts
├── design-image.service.ts       ← Logic download + compress + upload
├── design-image.processor.ts     ← BullMQ worker
├── design-image.controller.ts    ← Endpoint backfill + monitoring
├── r2-design-object.entity.ts    ← Mongoose schema (Phase 3.3)
└── r2-design-object.repository.ts
```

#### 5.1 `design-image.service.ts` (skeleton)

```ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

@Injectable()
export class DesignImageService {
  private readonly s3: S3Client;
  constructor(private readonly cfg: ApiConfigService, private readonly repo: R2DesignObjectRepository) {
    const c = this.cfg.r2Config;
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
  }

  /**
   * Pipeline: download → 2 variants → upload R2. Idempotent.
   * Returns Mongo-ready URLs để service caller update orders.
   */
  async processOne(sourceUrl: string): Promise<{
    previewUrl: string;
    thumbUrl: string;
    hash: string;
    cached: boolean;
  }> {
    const c = this.cfg.r2Config;
    const hash = hashForR2(sourceUrl);
    const previewKey = `designs/preview/${hash}.webp`;
    const thumbKey = `designs/thumb/${hash}.webp`;

    // 1. HEAD R2 — dedup
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: c.bucket, Key: previewKey }));
      return {
        previewUrl: buildR2Url(c.publicBase, 'preview', hash),
        thumbUrl:   buildR2Url(c.publicBase, 'thumb',   hash),
        hash,
        cached: true,
      };
    } catch (e: any) {
      if (e?.name !== 'NotFound' && e?.$metadata?.httpStatusCode !== 404) throw e;
    }

    // 2. Download
    const buffer = await this.download(sourceUrl);

    // 3. Compress (2 variants in parallel)
    const [previewBuf, thumbBuf] = await Promise.all([
      sharp(buffer)
        .resize(c.previewMaxDim, c.previewMaxDim, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: c.previewQuality })
        .toBuffer(),
      sharp(buffer)
        .resize(c.thumbDim, c.thumbDim, { fit: 'cover' })
        .webp({ quality: c.thumbQuality })
        .toBuffer(),
    ]);

    // 4. Upload R2 (parallel)
    await Promise.all([
      this.put(previewKey, previewBuf),
      this.put(thumbKey, thumbBuf),
    ]);

    // 5. Track ở Mongo r2DesignObjects (refCount sẽ +1 ở caller)
    await this.repo.upsert({
      hash,
      sourceUrl,
      previewKey,
      thumbKey,
      sizeBytes: previewBuf.length + thumbBuf.length,
    });

    return {
      previewUrl: buildR2Url(c.publicBase, 'preview', hash),
      thumbUrl:   buildR2Url(c.publicBase, 'thumb',   hash),
      hash,
      cached: false,
    };
  }

  private async download(url: string): Promise<Buffer> {
    const c = this.cfg.r2Config;
    const driveId = extractDriveId(url);
    const downloadUrl = driveId ? buildDriveDownloadUrl(driveId) : url;

    const res = await fetch(downloadUrl, { redirect: 'follow' });
    if (!res.ok) throw new BadRequestException(`HTTP ${res.status} from ${downloadUrl}`);

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/html')) {
      // Drive trả confirm page → có thể parse token + retry. Hiện tại throw để fail-fast.
      throw new BadRequestException(`Drive trả HTML confirm page (file quá lớn hoặc cần auth): ${url}`);
    }

    // Streaming cap: đọc qua arrayBuffer nhưng check Content-Length header trước
    const cl = Number(res.headers.get('content-length') || 0);
    if (cl > 0 && cl > c.maxDownloadMb * 1024 * 1024) {
      throw new BadRequestException(`File ${(cl / 1024 / 1024).toFixed(1)} MB > giới hạn ${c.maxDownloadMb} MB`);
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength > c.maxDownloadMb * 1024 * 1024) {
      throw new BadRequestException(`Body ${(ab.byteLength / 1024 / 1024).toFixed(1)} MB > giới hạn ${c.maxDownloadMb} MB`);
    }
    return Buffer.from(ab);
  }

  private async put(key: string, body: Buffer): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.cfg.r2Config.bucket,
      Key: key,
      Body: body,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',  // hash trong key → safe để cache vô hạn
    }));
  }

  /** Dùng cho Phase 10 cleanup */
  async deleteByHash(hash: string): Promise<void> {
    const c = this.cfg.r2Config;
    await Promise.all([
      this.s3.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: `designs/preview/${hash}.webp` })),
      this.s3.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: `designs/thumb/${hash}.webp` })),
    ]);
    await this.repo.deleteByHash(hash);
  }
}
```

#### 5.2 `design-image.processor.ts` (BullMQ worker)

Theo pattern hiện có `apps/api/src/modules/queue/`:

```ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export const DESIGN_IMAGE_QUEUE = 'design-image';

export interface DesignImageJobData {
  sourceUrl: string;
  orderIds: string[];     // có thể nhiều order cùng URL
  designKey: string;      // 'front' | 'back' | ...
}

@Processor(DESIGN_IMAGE_QUEUE, { concurrency: Number(process.env.DESIGN_QUEUE_CONCURRENCY ?? 3) })
export class DesignImageProcessor extends WorkerHost {
  constructor(
    private readonly imageService: DesignImageService,
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    private readonly r2Repo: R2DesignObjectRepository,
  ) {
    super();
  }

  async process(job: Job<DesignImageJobData>): Promise<void> {
    const { sourceUrl, orderIds, designKey } = job.data;
    try {
      const { previewUrl, hash, cached } = await this.imageService.processOne(sourceUrl);

      // Update tất cả order đang đợi field này
      await this.orderModel.updateMany(
        { _id: { $in: orderIds } },
        {
          $set: {
            [`designs.${designKey}`]: previewUrl,
            [`designsStatus.${designKey}`]: 'ready',
          },
        },
      );

      // Bump refCount
      await this.r2Repo.incrementRefCount(hash, orderIds.length);

      // eslint-disable-next-line no-console
      console.log(`[design-image] ${cached ? 'CACHED' : 'OK'} ${designKey} → ${hash} (${orderIds.length} order)`);
    } catch (err) {
      await this.orderModel.updateMany(
        { _id: { $in: orderIds } },
        { $set: { [`designsStatus.${designKey}`]: 'failed' } },
      );
      throw err;  // BullMQ retry theo backoff
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    console.error(`[design-image] FAIL ${job.id} attempt ${job.attemptsMade}: ${err.message}`);
  }
}
```

#### 5.3 Module wiring

```ts
// design-image.module.ts
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: R2DesignObjectEntity.name, schema: R2DesignObjectSchema },
      { name: OrderEntity.name,          schema: OrderSchema },
    ]),
    BullModule.registerQueue({
      name: DESIGN_IMAGE_QUEUE,
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,   // giữ 1000 job hoàn thành để debug
        removeOnFail: 5000,
      },
    }),
  ],
  providers: [DesignImageService, DesignImageProcessor, R2DesignObjectRepository],
  controllers: [DesignImageController],
  exports: [DesignImageService],
})
export class DesignImageModule {}
```

---

### Phase 6 — Tích hợp vào `importOrders`

Sửa `order.service.ts → importOrders()`:

```ts
// Thêm vào constructor:
@InjectQueue(DESIGN_IMAGE_QUEUE) private readonly designQueue: Queue,
```

Trong loop import, gom map `sourceUrl → { orderIds, designKey }[]` để dedup job:

```ts
const designJobs = new Map<string, { orderIds: Set<string>; designKey: string }>();

for (const row of dto.rows) {
  // ... existing logic upsert order ...
  const orderId = String(upserted._id);

  // Replace processDesigns gọi cũ
  if (row.designs) {
    for (const [k, v] of Object.entries(row.designs)) {
      if (!v?.trim()) continue;
      const key = `${k}::${v.trim()}`;  // unique theo (designKey, sourceUrl)
      let entry = designJobs.get(key);
      if (!entry) {
        entry = { orderIds: new Set(), designKey: k };
        designJobs.set(key, entry);
      }
      entry.orderIds.add(orderId);

      // Save URL gốc + mark pending NGAY ở import (không đợi worker)
      await this.orderModel.updateOne(
        { _id: orderId },
        {
          $set: {
            [`designsOriginal.${k}`]: v.trim(),
            [`designsStatus.${k}`]: 'pending',
            // KHÔNG set designs.{k} ở đây — worker sẽ set khi xong
          },
        },
      );
    }
  }
}

// Bulk enqueue jobs (1 BullMQ addBulk call thay vì N call riêng)
const jobs = Array.from(designJobs.entries()).map(([key, entry]) => ({
  name: `design-${key}`,
  data: {
    sourceUrl: key.split('::').slice(1).join('::'),
    orderIds: Array.from(entry.orderIds),
    designKey: entry.designKey,
  },
}));
if (jobs.length > 0) {
  await this.designQueue.addBulk(jobs);
}
```

**Lưu ý migration `processDesigns`**:
- Xoá call `this.processDesigns(row.designs, row.productionId)` ở line 2150.
- Field `designs.{k}` ban đầu sẽ rỗng → FE phải handle `designsStatus.{k} === 'pending'` → show skeleton (Phase 8).

---

### Phase 7 — Tích hợp Workshop config / dedup edge cases

#### 7.1 Handle re-import (URL đã trỏ về R2)

Nếu user paste lại URL R2 cũ (vd copy từ tab orders sang Excel), import sẽ:
- `hashForR2(url)` trả về sha256(url) (vì không match Drive). Khác hash gốc của design.
- Sẽ tạo bản copy mới, lãng phí.

Fix trong `parseOrderRows` / hoặc trong import:
```ts
if (isOwnR2Url(rawUrl, publicBase)) {
  // URL đã là R2 → giữ luôn, không enqueue. Set designs.{k} = rawUrl, status = 'ready'.
}
```

#### 7.2 Handle URL identical giữa nhiều đơn

Map đã dedup theo `(designKey, sourceUrl)`. Worker chỉ chạy 1 lần / sourceUrl, update N order trong 1 `updateMany`.

#### 7.3 Handle URL fail

Khi worker fail (Drive private, file > 120 MB, …):
- `designsStatus.{k} = 'failed'`, `designs.{k}` rỗng.
- FE check status → show fallback "Mở link gốc" → link tới `designsOriginal.{k}`.
- Admin có thể trigger retry: endpoint `POST /v1/design-image/retry/:orderId/:key`.

---

### Phase 8 — Frontend

#### 8.1 Service Worker

`apps/web/public/sw.js`:
```js
const CACHE_NAME = 'image-cache-v4';   // bump version để clear cache cũ

const CACHEABLE_HOSTS = [
  'cdn.onosfactory.com',               // ← R2 custom domain
  'pub-<your>.r2.dev',                 // ← fallback nếu chưa custom domain
  // Giữ legacy để ảnh cũ vẫn cache:
  'cdn.teehub.io',
  'drive.google.com',
  'lh3.googleusercontent.com', 'lh4.googleusercontent.com',
  'lh5.googleusercontent.com', 'lh6.googleusercontent.com',
  'cdn.onospod.com',
  'cdn.podorder.io',
  'podorder.sgp1.digitaloceanspaces.com',
];
```

Bump `CACHE_NAME` từ `v3` → `v4` để force clear cache cũ chứa Teehub URL.

#### 8.2 Thumb helper

`workshopTableConfig.tsx` + `ListOrderTab.tsx`:

```ts
function smallThumb(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace('/designs/preview/', '/designs/thumb/');
}
```

#### 8.3 Pending / failed state UI

Trong `ImageThumbCell.tsx`:

```tsx
if (status === 'pending') return <Skeleton className="w-full h-full" />;
if (status === 'failed') {
  return (
    <Hint content="Ảnh xử lý thất bại — mở link gốc">
      <a href={originalUrl} target="_blank" rel="noreferrer" className="block w-full h-full bg-amber-50 grid place-items-center">
        <AlertTriangle size={14} className="text-amber-600" />
      </a>
    </Hint>
  );
}
return <img src={url} ... />;
```

#### 8.4 Polling lúc import

Sau khi user click Import, FE đã refetch list 1 lần. Designs có thể chưa ready.
- **Option A (đơn giản):** thêm nút "Tải lại" và để user F5.
- **Option B (nice):** poll list endpoint mỗi 5s trong 2 phút sau import nếu còn order `pending`. Stop khi tất cả ready.

---

### Phase 9 — Backfill data cũ

Endpoint `POST /v1/design-image/backfill`:

```ts
async backfill(): Promise<{ scanned: number; queued: number; skipped: number }> {
  const cursor = this.orderModel.find({
    'designsOriginal': { $exists: true, $ne: null },
  }).lean().cursor();

  let scanned = 0, queued = 0, skipped = 0;
  const designJobs = new Map<string, { orderIds: Set<string>; designKey: string }>();

  for await (const o of cursor) {
    scanned++;
    if (!o.designsOriginal) continue;
    for (const [k, v] of Object.entries(o.designsOriginal as Record<string, string>)) {
      if (!v?.trim()) { skipped++; continue; }
      const key = `${k}::${v.trim()}`;
      let entry = designJobs.get(key);
      if (!entry) { entry = { orderIds: new Set(), designKey: k }; designJobs.set(key, entry); }
      entry.orderIds.add(String(o._id));
    }
  }

  const jobs = Array.from(designJobs.entries()).map(([key, entry]) => ({
    name: `backfill-${key}`,
    data: {
      sourceUrl: key.split('::').slice(1).join('::'),
      orderIds: Array.from(entry.orderIds),
      designKey: entry.designKey,
    },
  }));
  if (jobs.length > 0) await this.designQueue.addBulk(jobs);
  queued = jobs.length;

  return { scanned, queued, skipped };
}
```

Quy trình:
1. Deploy code Phase 1-8 lên VPS.
2. `curl -X POST -H "Authorization: Bearer <token>" https://api.onosfactory.com/v1/design-image/backfill`
3. Monitor: `pm2 logs onosfactory-api` xem `[design-image] OK …` chạy ra.
4. Đợi queue clear: `bullmq` UI hoặc `redis-cli LLEN bull:design-image:wait`.

**Giả định**: order legacy đã có `designsOriginal.{k}` là URL Drive/CDN gốc (từ era Teehub). Nếu trống → skip.

Nếu không có `designsOriginal` (data quá cũ), dùng `transform-drive-url.ts → canonicalDriveUrl(designs.{k})` để khôi phục — chỉ work cho ảnh Drive (extract id từ Teehub URL).

---

### Phase 10 — Cleanup orphans + cost monitor

#### 10.1 Cron job xoá orphan

`apps/api/src/modules/cronjob/`:

```ts
// Chạy daily 03:00
@Cron('0 3 * * *')
async cleanupOrphanR2() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 ngày
  const orphans = await this.r2Repo.findAll({
    refCount: { $lte: 0 },
    updatedAt: { $lt: cutoff },
  }, { paging: { limit: 1000, skip: 0 } });

  for (const o of orphans) {
    await this.designImageService.deleteByHash(o.hash);
  }
  console.log(`[r2-cleanup] removed ${orphans.length} orphan objects`);
}
```

#### 10.2 Decrement refCount khi order soft-delete

Sửa `OrderService.deleteOrder()`:
```ts
if (order.designsOriginal) {
  for (const [k, url] of Object.entries(order.designsOriginal)) {
    if (!url) continue;
    const hash = hashForR2(url);
    await this.r2Repo.decrementRefCount(hash, 1);
  }
}
```

`refCount` về 0 không xoá ngay — đợi 30 ngày để có grace period nếu user undelete.

#### 10.3 Dashboard / monitor endpoint

`GET /v1/design-image/stats`:
```json
{
  "objectCount": 12345,
  "totalSizeBytes": 4567890123,
  "totalSizeGb": 4.25,
  "orphanCount": 12,
  "orphanSizeBytes": 4500000,
  "queueWaiting": 0,
  "queueActive": 2,
  "queueFailed": 3
}
```

Hiển thị ở trang admin để biết khi nào sắp 10 GB.

#### 10.4 Cost guardrail

Trong `DesignImageService.processOne`:
```ts
// Trước khi xử lý, check total size
const stats = await this.repo.getStats();
if (stats.totalSizeGb > 8.5) {  // cảnh báo trước khi tới 10 GB free tier
  await this.telegramService.alert(`R2 đã dùng ${stats.totalSizeGb} GB, sắp hết free tier`);
}
if (stats.totalSizeGb > 9.5) {
  throw new Error('R2 quota near limit, refusing new uploads');
}
```

---

## 4. Migration rollout — đề xuất 3-stage

### Stage A (1 ngày — chuẩn bị)
- Phase 1, 2: setup R2 + env
- Phase 3: schema (deploy nhưng chưa dùng)
- Phase 4, 5 code, viết test local nhưng KHÔNG enable

### Stage B (1 ngày — chuyển import mới)
- Phase 6: sửa `importOrders` enqueue queue
- Phase 7: edge cases
- Phase 8: FE (bump SW, pending UI)
- Deploy → test import 1-2 đơn → check R2 có file + đường dẫn đúng

### Stage C (1-3 ngày — backfill + cleanup)
- Phase 9: chạy backfill, monitor queue
- Phase 10: bật cron cleanup
- Sau khi backfill xong + verify ổn → cân nhắc xoá `transform-drive-url.ts` hoàn toàn (tuần sau)

---

## 5. Acceptance criteria

- [ ] Import 1 đơn có 5 design URL → BE return 200 trong < 3s.
- [ ] Sau 30s, BE queue xử lý xong → trong Mongo, `designs.{k}` = URL R2 (`https://cdn.onosfactory.com/designs/preview/...`).
- [ ] FE render thumbnail nhanh < 100ms (SW cache hit lần 2).
- [ ] Preview dialog mở < 200ms (file webp ~50 KB).
- [ ] Re-import cùng URL → log `[design-image] CACHED` → KHÔNG re-download, KHÔNG re-encode, KHÔNG re-upload.
- [ ] 2 đơn cùng URL design → 1 object trên R2, `refCount = 2`.
- [ ] File 70 MB Drive → download + nén thành ~150 KB webp → upload R2 < 60s.
- [ ] File 130 MB → BE log fail (vượt cap), `designsStatus.{k} = 'failed'`, FE hiển thị fallback link.
- [ ] Soft-delete order → `refCount--`. Sau 30 ngày `refCount = 0` → cron xoá khỏi R2.
- [ ] R2 size > 8.5 GB → Telegram alert. > 9.5 GB → BE từ chối job mới.

---

## 6. Cost estimate

| Item | Đơn giá | Ước tính cho ~10k orders |
|---|---|---|
| R2 storage | $0.015/GB/month | 18 design × 10k = 180k object, avg 100 KB = **18 GB → ~$0.27/month** (nếu vượt 10 GB free) |
| R2 Class A (PUT) | $4.50/M | 180k PUT × 2 variant = 360k → **~$1.6 one-time** |
| R2 Class B (GET) | $0.36/M (sau 10M free) | 10k order × 18 view/day × 30 = 5.4M view/month → vẫn free |
| Egress | FREE (R2's killer feature) | $0 |

**Tổng:** ~$2/month sau khi vượt free tier. So với teehub: free nhưng phụ thuộc dịch vụ ngoài.

---

## 7. Risks + fallbacks

| Risk | Mitigation |
|---|---|
| Drive trả HTML confirm page cho file > 100 MB | Worker throw → backfill manual qua Drive API + service account (giai đoạn sau) |
| sharp crash với file lạ (HEIC, AVIF) | Try-catch → mark `failed`, FE fallback link gốc |
| OOM khi 3 worker × 70 MB cùng lúc | Cap `DESIGN_QUEUE_CONCURRENCY=2` ở VPS RAM thấp. Sharp output stream thay vì buffer nếu cần |
| R2 endpoint timeout | AWS SDK retry built-in, không cần code thêm |
| Custom domain DNS chưa propagate khi go-live | Dùng tạm R2.dev URL, swap sau |
| Backfill chạy tốn quota Drive | Spread theo time: queue rate limit (`limiter: { max: 100, duration: 60000 }`) |
| User paste URL ảnh từ host lạ (vd Facebook CDN expire 24h) | Worker download lưu lại R2 → URL gốc expire không ảnh hưởng |

---

## 8. Open questions (chưa quyết)

1. **Custom domain ngay hay R2.dev tạm?** → Recommend R2.dev cho stage A-B, custom domain ở stage C.
2. **Có cần variant `origin` trên R2 không?** → Hiện tại KHÔNG, tiết kiệm 80% storage. Nếu user complain chất lượng, thêm sau, key `designs/origin/{hash}.{ext}`.
3. **Retention orphan: 30 hay 60 ngày?** → 30 đủ; có thể đổi sau qua env.
4. **Có cần track `lastAccessedAt`?** → Phase 10.5 advanced — cần Cloudflare Workers proxy fetch để biết. Để sau.
5. **Multipart upload cho file > 5 MB?** → AWS SDK auto multipart khi `Body` lớn. Hiện tại buffer trong RAM nên không cần.

---

## 9. File checklist

Code mới tạo:
- [ ] `apps/api/src/modules/design-image/design-image.module.ts`
- [ ] `apps/api/src/modules/design-image/design-image.service.ts`
- [ ] `apps/api/src/modules/design-image/design-image.processor.ts`
- [ ] `apps/api/src/modules/design-image/design-image.controller.ts`
- [ ] `apps/api/src/modules/design-image/r2-design-object.entity.ts`
- [ ] `apps/api/src/modules/design-image/r2-design-object.repository.ts`
- [ ] `apps/api/src/utils/design-url.ts`
- [ ] `packages/shared/dtos/design-image.dto.ts`

Code sửa:
- [ ] `apps/api/src/modules/order/order.service.ts` (remove processDesigns, enqueue queue)
- [ ] `apps/api/src/modules/order/order.module.ts` (import DesignImageModule)
- [ ] `apps/api/src/modules/order/order.entity.ts` (thêm `designsStatus`)
- [ ] `apps/api/src/shared/services/api-config.service.ts` (thêm `r2Config` getter)
- [ ] `apps/api/.env.development.example` (thêm `R2_*` vars)
- [ ] `apps/web/public/sw.js` (CACHE_NAME v4, whitelist mới)
- [ ] `apps/web/src/components/orders/cells/ImageThumbCell.tsx` (pending/failed UI)
- [ ] `apps/web/src/components/common/ImagePreviewDialog.tsx` (handle pending)

Code xoá (sau Stage C):
- [ ] `apps/api/src/utils/transform-drive-url.ts`
- [ ] Tất cả import `from 'transform-drive-url'`

---

**Step tiếp theo nếu approve plan:** Bắt đầu Stage A — Phase 1 (mình hướng dẫn từng bước trên Cloudflare dashboard, bạn click theo).

---

## Implementation status — Stage B (đã code, 2026-06-20)

Đã implement code Phase 2-8 (skip Phase 1 — chờ user setup Cloudflare). Khi user paste credential vào `.env` rồi restart API là pipeline tự active.

### Backend
- **`apps/api/src/utils/design-url.ts`** — hash helper, R2 URL builder, Drive download URL.
- **`apps/api/src/modules/design-image/`** (module mới):
  - `r2-design-object.entity.ts` — collection `r2DesignObjects` tracking hash/refCount/sizeBytes.
  - `r2-design-object.repository.ts` — `upsertObject`, `incrementRefCount`, `getTotalStats`.
  - `design-image.service.ts` — `processOne(sourceUrl)`: HEAD R2 dedup → fetch (cap `R2_MAX_DOWNLOAD_MB`) → sharp 2 variants → R2 PutObject 2 keys (cache-control `immutable`).
  - `design-image.processor.ts` — BullMQ worker `design-image` queue, concurrency từ env, attempts 4 + exponential backoff. Update `designs.{k}` + `designsStatus.{k}` cho mọi orderId chia sẻ URL.
  - `design-image.controller.ts` — `GET /v1/design-image/stats` (objectCount, totalSizeBytes, queue waiting/active/failed) + `POST /v1/design-image/drain-failed`.
  - `design-image.module.ts` — wire MongooseModule + BullModule (defaults: attempts 4, removeOnComplete 1k, removeOnFail 5k).
- **`apps/api/src/modules/order/order.entity.ts`** — thêm field `designsStatus` (raw object 18 keys).
- **`apps/api/src/modules/order/order.module.ts`** — import `DesignImageModule`.
- **`apps/api/src/modules/order/order.service.ts`**:
  - Inject `DesignImageService` + `@InjectQueue(DESIGN_IMAGE_QUEUE) Queue`.
  - `processDesigns` rewrite: nếu R2 active → trả `designJobs[]` + set `designsStatus.{k}='pending'`. Nếu R2 chưa active → fallback dùng transformDriveUrl cũ.
  - `importOrders`: gom `designJobMap` theo `(designKey, sourceUrl)` sau khi upsert có orderId; cuối loop `addBulk` (fire-and-forget).
- **`apps/api/src/shared/services/api-config.service.ts`** — `r2Config` getter **lenient**: thiếu env → trả `null`, app vẫn boot, service skip pipeline.
- **`apps/api/.env.development.example`** — block `R2_*` mới (11 vars).

### Shared
- **`packages/shared/dtos/production-order.dto.ts`** — `DesignStatusZod`, `DesignsStatusFieldsZod`. `ProductionOrderZod` thêm `designsStatus`.

### Frontend
- **`apps/web/public/sw.js`** — bump `CACHE_NAME` v3→v4 + whitelist thêm `cdn.onosfactory.com`, `r2.dev`, `drive.usercontent.google.com`.
- **`apps/web/src/components/orders/cells/ImageThumbCell.tsx`** — thêm prop `status`: pending → loader amber, failed + originalUrl → link warning rose. `smallThumb()` support 3 schema (R2 own / Teehub gimage / s800-s200).
- **`apps/web/src/components/orders/workshopTableConfig.tsx`** — `WorkshopOrderRow` thêm `designsStatus`.

### Tự động bật khi nào?

`DesignImageService.isEnabled()` check `r2Config !== null`. Pipeline active khi tất cả 5 env có giá trị non-empty:
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`.

Thiếu bất kỳ field nào → import fallback transform Teehub cũ, không enqueue job.

### Còn thiếu (defer sang Stage C)

- Backfill endpoint cho order cũ (Phase 9).
- Cron cleanup orphans + Telegram cost alert (Phase 10).
- Migrate mockup URL cũng đi qua R2 (hiện vẫn dùng `processImageUrl` Teehub).
- FE polling tự động khi import xong để hiển thị thumbnail "pop in".

### Manual test sau khi setup Cloudflare

```bash
# 1. Cloudflare R2 ready (Phase 1 user làm)
# 2. Paste credential vào VPS .env.production rồi pm2 reload
# 3. Test 1 đơn có 2-3 design URL Drive nhỏ + 1 URL onospod
curl -X POST https://api.onosfactory.com/v1/orders/import \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"productionId":"TEST-001","type":"...","designs":{"front":"https://drive.google.com/file/d/<id>/view"}}]}'

# 4. Check ngay:
curl -H "Authorization: Bearer <token>" https://api.onosfactory.com/v1/design-image/stats
# → queue.waiting > 0

# 5. Sau 10-30s:
mongosh ... --eval 'db.orders.findOne({productionId: "TEST-001"}, {designs: 1, designsStatus: 1, designsOriginal: 1})'
# → designs.front = "https://cdn.onosfactory.com/designs/preview/<hash>.webp"
# → designsStatus.front = "ready"
# → designsOriginal.front = URL Drive gốc

# 6. Test dedup: import đơn thứ 2 cùng URL front
# → BE log: [DesignImageService] CACHED front hash=<same>
# → R2 KHÔNG có PUT thứ 2
```
