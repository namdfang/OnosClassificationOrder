import { createHash } from 'crypto';
import { createWriteStream, mkdirSync } from 'fs';
import { rm } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import sharp from 'sharp';
import type { DesignIngestJob, DesignIngestTmpObjectJob, DesignIngestUrlJob } from 'shared';
import { designCdnUrl, designFileKey } from 'shared';

import { config } from './config';
import { CustomerOrderModel, DesignFileModel, OrderModel } from './db';
import { deleteObject, getObjectStream, putObjectBuffer, putObjectFromFile } from './r2';

mkdirSync(config.tmpDir, { recursive: true });

// ---------------------------------------------------------------------------
// URL helpers — MIRROR `apps/api/src/utils/design-url.ts` (hashForR2): alias
// dedup TRƯỚC download cho job kind='url'. Đổi 1 nơi phải đổi nơi kia.
// ---------------------------------------------------------------------------
const DRIVE_FILE_PATTERN = /\/file\/d\/([A-Za-z0-9_-]{10,128})/;
const DRIVE_ID_QUERY_PATTERN = /[?&]id=([A-Za-z0-9_-]{10,128})/;

function extractDriveId(url: string): string | null {
  if (!url.includes('drive.google.com') && !url.includes('drive.usercontent.google.com')) return null;
  const m = url.match(DRIVE_FILE_PATTERN) ?? url.match(DRIVE_ID_QUERY_PATTERN);
  return m ? m[1] : null;
}

function sourceKeyForUrl(url: string): string {
  const driveId = extractDriveId(url);
  if (driveId) return driveId;
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function buildDriveDownloadUrl(driveId: string): string {
  return `https://drive.usercontent.google.com/download?id=${driveId}&export=download&authuser=0`;
}

// ---------------------------------------------------------------------------

interface DownloadedFile {
  path: string;
  sha256: string;
  size: number;
  contentType: string;
}

/** Stream nguồn → file tạm trên NVMe, vừa ghi vừa tính sha256 (không giữ cả file trong RAM). */
async function streamToTmpFile(source: Readable, tag: string): Promise<{ path: string; sha256: string; size: number }> {
  const path = join(config.tmpDir, `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const hash = createHash('sha256');
  let size = 0;
  const cap = config.maxDownloadMb * 1024 * 1024;
  source.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    size += chunk.length;
    if (size > cap) source.destroy(new Error(`File vượt giới hạn ${config.maxDownloadMb} MB`));
  });
  await pipeline(source, createWriteStream(path));
  return { path, sha256: hash.digest('hex'), size };
}

async function downloadFromR2Tmp(tmpKey: string): Promise<DownloadedFile> {
  const { body, contentType } = await getObjectStream(tmpKey);
  const f = await streamToTmpFile(body, 'tmpobj');
  return { ...f, contentType: contentType || 'application/octet-stream' };
}

async function downloadFromUrl(url: string): Promise<DownloadedFile> {
  const driveId = extractDriveId(url);
  const downloadUrl = driveId ? buildDriveDownloadUrl(driveId) : url;
  const res = await fetch(downloadUrl, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} khi tải ${downloadUrl}`);
  const ct = res.headers.get('content-type') || 'application/octet-stream';
  if (ct.includes('text/html')) {
    throw new Error(`Drive trả HTML (file quá lớn cần confirm hoặc chưa share public): ${url}`);
  }
  const f = await streamToTmpFile(Readable.fromWeb(res.body as never), 'url');
  return { ...f, contentType: ct.split(';')[0] };
}

/**
 * Sinh thumb 100×100 + preview 500×500 (fit inside, webp) + upload 3 biến thể.
 * File không phải ảnh raster (PSD/AI/PDF…) → chỉ upload original, hasPreview=false.
 */
async function uploadVariants(
  file: DownloadedFile,
): Promise<{ hasPreview: boolean; width?: number; height?: number }> {
  const sha = file.sha256;
  await putObjectFromFile(designFileKey(sha, 'original'), file.path, file.contentType);

  try {
    const image = sharp(file.path, { failOn: 'none', limitInputPixels: 1_000_000_000 });
    const meta = await image.metadata();
    if (!meta.width || !meta.height) throw new Error('không đọc được kích thước ảnh');

    const preview = await image
      .clone()
      .rotate()
      .resize(config.previewDim, config.previewDim, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: config.previewQuality })
      .toBuffer();
    const thumb = await image
      .clone()
      .rotate()
      .resize(config.thumbDim, config.thumbDim, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: config.thumbQuality })
      .toBuffer();

    await putObjectBuffer(designFileKey(sha, 'preview'), preview, 'image/webp');
    await putObjectBuffer(designFileKey(sha, 'thumb'), thumb, 'image/webp');
    return { hasPreview: true, width: meta.width, height: meta.height };
  } catch (err) {
    console.warn(`[processor] ${sha} không sinh được preview (file không phải raster?): ${(err as Error).message}`);
    return { hasPreview: false };
  }
}

/** Ingest file đã tải về → design_files `ready` (idempotent theo sha thật). */
async function ingestFile(
  file: DownloadedFile,
  extra: { fileName?: string; sourceUrl?: string; sourceKey?: string; customerId?: string; userEmail?: string },
): Promise<string> {
  const sha = file.sha256;
  const existing = await DesignFileModel.findOne({ sha256: sha }).lean<{ status?: string } | null>();

  if (!existing || existing.status !== 'ready') {
    const variants = await uploadVariants(file);
    await DesignFileModel.updateOne(
      { sha256: sha },
      {
        $set: {
          status: 'ready',
          size: file.size,
          mime: file.contentType,
          hasPreview: variants.hasPreview,
          storageClass: 'standard',
          errorMessage: null,
          ...(variants.width ? { width: variants.width, height: variants.height } : {}),
          ...(extra.fileName ? { fileName: extra.fileName } : {}),
          ...(extra.sourceUrl ? { sourceUrl: extra.sourceUrl } : {}),
        },
        $setOnInsert: {
          lastUsedAt: new Date(),
          usageCount: 0,
          uploadedBy: { customerId: extra.customerId, userEmail: extra.userEmail },
        },
        ...(extra.sourceKey ? { $addToSet: { sourceKeys: extra.sourceKey } } : {}),
      },
      { upsert: true },
    );
  } else if (extra.sourceKey) {
    await DesignFileModel.updateOne({ sha256: sha }, { $addToSet: { sourceKeys: extra.sourceKey } });
  }
  return sha;
}

async function touchUsage(sha256: string): Promise<void> {
  await DesignFileModel.updateOne({ sha256 }, { $set: { lastUsedAt: new Date() }, $inc: { usageCount: 1 } });
}

/** Thay URL design ở OrderEntity + staging item sau khi ingest xong (job kind='url'). */
async function replaceOrderDesignUrl(job: DesignIngestUrlJob, sha256: string): Promise<void> {
  const cdnOriginal = designCdnUrl(config.r2.publicBase, sha256, 'original');

  // Label vận chuyển: CHỈ thay ở staging (OrderEntity chưa có field tracking — Phase 2).
  if (job.target === 'tracking-label') {
    if (job.stagingId) {
      await CustomerOrderModel.updateOne(
        { _id: job.stagingId, 'items.productionId': job.productionId },
        { $set: { 'items.$.tracking.labelUrl': cdnOriginal } },
      );
    }
    return;
  }

  await OrderModel.updateOne(
    { productionId: job.productionId },
    {
      $set: {
        [`designs.${job.designKey}`]: cdnOriginal,
        // designsOriginal GIỮ URL nguồn (Drive) làm provenance — không đè.
        [`designsStatus.${job.designKey}`]: 'ready',
      },
    },
  );
  if (job.stagingId) {
    await CustomerOrderModel.updateOne(
      { _id: job.stagingId, 'items.productionId': job.productionId },
      { $set: { [`items.$.designs.${job.designKey}`]: cdnOriginal } },
    );
  }
}

async function processTmpObject(job: DesignIngestTmpObjectJob): Promise<void> {
  const file = await downloadFromR2Tmp(job.tmpKey);
  try {
    if (file.sha256 !== job.sha256) {
      // FE claim sha sai (hiếm — bug hash client) → sha THẬT là nguồn chân lý,
      // record claim đánh failed để FE poll thấy lỗi thay vì treo processing.
      console.warn(`[processor] sha mismatch: claimed=${job.sha256} actual=${file.sha256}`);
      await DesignFileModel.updateOne(
        { sha256: job.sha256, status: 'processing' },
        { $set: { status: 'failed', errorMessage: 'sha256 client tính không khớp nội dung file' } },
      );
    }
    await ingestFile(file, { fileName: job.fileName, customerId: job.customerId, userEmail: job.userEmail });
  } finally {
    await rm(file.path, { force: true });
    await deleteObject(job.tmpKey);
  }
}

async function processUrl(job: DesignIngestUrlJob): Promise<void> {
  const sourceKey = sourceKeyForUrl(job.url);

  // Dedup TRƯỚC download: link này đã từng ingest → khỏi tải lại 100MB.
  const known = await DesignFileModel.findOne({ sourceKeys: sourceKey, status: 'ready' }).lean<{
    sha256: string;
  } | null>();
  if (known) {
    await replaceOrderDesignUrl(job, known.sha256);
    await touchUsage(known.sha256);
    return;
  }

  const file = await downloadFromUrl(job.url);
  try {
    const sha = await ingestFile(file, {
      sourceUrl: job.url,
      sourceKey,
      customerId: job.customerId,
      userEmail: job.userEmail,
    });
    await replaceOrderDesignUrl(job, sha);
    await touchUsage(sha);
  } finally {
    await rm(file.path, { force: true });
  }
}

export async function processJob(job: DesignIngestJob): Promise<void> {
  const started = Date.now();
  if (job.kind === 'tmp-object') {
    await processTmpObject(job);
  } else {
    await processUrl(job);
  }
  console.log(`[processor] DONE ${job.kind} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

/** Đánh dấu failed sau khi hết retry — cho FE/poll thấy lỗi + record retry được. */
export async function markJobFailed(job: DesignIngestJob, message: string): Promise<void> {
  if (job.kind === 'tmp-object') {
    await DesignFileModel.updateOne(
      { sha256: job.sha256, status: 'processing' },
      { $set: { status: 'failed', errorMessage: message } },
    ).catch(() => undefined);
    await deleteObject(job.tmpKey);
  }
}
