import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

import { ApiConfigService } from '@/shared/services';
import {
  buildDriveDownloadUrl,
  buildR2Url,
  extractDriveId,
  hashForR2,
  isOwnR2Url,
  r2KeyFor,
} from '@/utils/design-url';

import { DesignBufferCache } from './buffer-cache.service';
import { R2DesignObjectRepository } from './r2-design-object.repository';

export interface ProcessResult {
  hash: string;
  url: string;
  cached: boolean;
  sizeBytes: number;
}

@Injectable()
export class DesignImageService {
  private readonly logger = new Logger(DesignImageService.name);
  private s3: S3Client | null = null;

  constructor(
    private readonly cfg: ApiConfigService,
    private readonly repo: R2DesignObjectRepository,
    private readonly bufferCache: DesignBufferCache,
  ) {}

  isEnabled(): boolean {
    return this.cfg.r2Config !== null;
  }

  private getS3(): S3Client {
    if (this.s3) return this.s3;
    const c = this.cfg.r2Config;
    if (!c) throw new Error('R2 not configured — check R2_* env vars');
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
    return this.s3;
  }

  private async headExists(key: string): Promise<boolean> {
    const c = this.cfg.r2Config!;
    try {
      await this.getS3().send(new HeadObjectCommand({ Bucket: c.bucket, Key: key }));
      return true;
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      const name = (e as { name?: string })?.name;
      if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') return false;
      throw e;
    }
  }

  /**
   * Lấy buffer raw cho 1 sourceUrl. Ưu tiên disk cache, fallback download.
   * Sau khi download lưu vào cache 7 ngày để worker preview tận dụng.
   */
  private async getBuffer(sourceUrl: string, hash: string): Promise<Buffer> {
    const cached = await this.bufferCache.get(hash);
    if (cached) {
      this.logger.debug(`Buffer cache HIT for ${hash}`);
      return cached;
    }
    const c = this.cfg.r2Config!;
    const buf = await this.download(sourceUrl, c.maxDownloadMb);
    void this.bufferCache.put(hash, buf);
    return buf;
  }

  /**
   * Tier 1 — encode thumb 300×300 + upload. Nhanh, set `ready` cho FE thấy thumb.
   * Idempotent: HEAD R2 hit → skip toàn bộ.
   */
  async processThumb(sourceUrl: string): Promise<ProcessResult> {
    const c = this.cfg.r2Config;
    if (!c) throw new Error('R2 not configured');

    if (isOwnR2Url(sourceUrl, c.publicBase)) {
      const hash = sourceUrl.split('/').pop()?.replace('.webp', '') || hashForR2(sourceUrl);
      return {
        hash,
        url: sourceUrl.includes('/preview/')
          ? sourceUrl.replace('/preview/', '/thumb/')
          : sourceUrl,
        cached: true,
        sizeBytes: 0,
      };
    }

    const hash = hashForR2(sourceUrl);
    const thumbKey = r2KeyFor('thumb', hash);

    if (await this.headExists(thumbKey)) {
      return {
        hash,
        url: buildR2Url(c.publicBase, 'thumb', hash),
        cached: true,
        sizeBytes: 0,
      };
    }

    const buffer = await this.getBuffer(sourceUrl, hash);
    const thumbBuf = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(c.thumbDim, c.thumbDim, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: c.thumbQuality })
      .toBuffer();

    await this.put(thumbKey, thumbBuf);
    await this.repo.upsertObject({
      hash,
      sourceUrl,
      previewKey: r2KeyFor('preview', hash),
      thumbKey,
      sizeBytes: thumbBuf.length,
    });

    return {
      hash,
      url: buildR2Url(c.publicBase, 'thumb', hash),
      cached: false,
      sizeBytes: thumbBuf.length,
    };
  }

  /**
   * Tier 2 — encode preview 1000×1000 + upload. Chạy background hoặc on-demand.
   * Idempotent: HEAD R2 hit → skip.
   */
  async processPreview(sourceUrl: string): Promise<ProcessResult> {
    const c = this.cfg.r2Config;
    if (!c) throw new Error('R2 not configured');

    if (isOwnR2Url(sourceUrl, c.publicBase)) {
      const hash = sourceUrl.split('/').pop()?.replace('.webp', '') || hashForR2(sourceUrl);
      return {
        hash,
        url: sourceUrl.includes('/thumb/')
          ? sourceUrl.replace('/thumb/', '/preview/')
          : sourceUrl,
        cached: true,
        sizeBytes: 0,
      };
    }

    const hash = hashForR2(sourceUrl);
    const previewKey = r2KeyFor('preview', hash);

    if (await this.headExists(previewKey)) {
      return {
        hash,
        url: buildR2Url(c.publicBase, 'preview', hash),
        cached: true,
        sizeBytes: 0,
      };
    }

    const buffer = await this.getBuffer(sourceUrl, hash);
    const previewBuf = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(c.previewMaxDim, c.previewMaxDim, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: c.previewQuality })
      .toBuffer();

    await this.put(previewKey, previewBuf);

    // Increment size lên r2DesignObjects (chỉ thumb gọi upsertObject; preview cộng dồn size).
    await this.repo.incrementSizeBytes(hash, previewBuf.length);

    return {
      hash,
      url: buildR2Url(c.publicBase, 'preview', hash),
      cached: false,
      sizeBytes: previewBuf.length,
    };
  }

  private async download(url: string, capMb: number): Promise<Buffer> {
    const driveId = extractDriveId(url);
    const downloadUrl = driveId ? buildDriveDownloadUrl(driveId) : url;

    const res = await fetch(downloadUrl, { redirect: 'follow' });
    if (!res.ok) {
      throw new BadRequestException(`HTTP ${res.status} fetching design from ${downloadUrl}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/html')) {
      throw new BadRequestException(
        `Drive trả HTML (file > 100 MB hoặc cần auth): ${url}.`,
      );
    }
    const cl = Number(res.headers.get('content-length') || 0);
    if (cl > 0 && cl > capMb * 1024 * 1024) {
      throw new BadRequestException(
        `File ${(cl / 1024 / 1024).toFixed(1)} MB > giới hạn ${capMb} MB`,
      );
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > capMb * 1024 * 1024) {
      throw new BadRequestException(
        `Body ${(ab.byteLength / 1024 / 1024).toFixed(1)} MB > giới hạn ${capMb} MB`,
      );
    }
    return Buffer.from(ab);
  }

  private async put(key: string, body: Buffer): Promise<void> {
    const c = this.cfg.r2Config!;
    await this.getS3().send(
      new PutObjectCommand({
        Bucket: c.bucket,
        Key: key,
        Body: body,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  async deleteByHash(hash: string): Promise<void> {
    const c = this.cfg.r2Config;
    if (!c) return;
    const s3 = this.getS3();
    await Promise.all([
      s3.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: r2KeyFor('preview', hash) })),
      s3.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: r2KeyFor('thumb', hash) })),
    ]);
    this.logger.log(`Deleted R2 objects for hash ${hash}`);
  }
}
