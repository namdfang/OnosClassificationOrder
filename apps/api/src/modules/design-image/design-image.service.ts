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

import { R2DesignObjectRepository } from './r2-design-object.repository';

export interface ProcessOneResult {
  hash: string;
  previewUrl: string;
  thumbUrl: string;
  /** true → đã có sẵn trên R2 (HEAD hit), không re-encode/re-upload. */
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
  ) {}

  /** True khi env R2_* đã set đủ → pipeline active. False → caller fallback. */
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

  /**
   * Resolve 1 design URL → R2 preview/thumb URL. Idempotent.
   *
   * Edge cases:
   *   - URL đã trỏ về R2 của mình → trả nguyên, không touch R2 lẫn DB.
   *   - HEAD R2 hit → trả URL không re-process.
   *   - File > maxDownloadMb → throw → caller mark failed.
   */
  async processOne(sourceUrl: string): Promise<ProcessOneResult> {
    const c = this.cfg.r2Config;
    if (!c) throw new Error('R2 not configured');

    // Skip nếu user paste lại URL R2 cũ của mình.
    if (isOwnR2Url(sourceUrl, c.publicBase)) {
      const hash = sourceUrl.split('/').pop()?.replace('.webp', '') || hashForR2(sourceUrl);
      return {
        hash,
        previewUrl: sourceUrl.includes('/thumb/')
          ? sourceUrl.replace('/thumb/', '/preview/')
          : sourceUrl,
        thumbUrl: sourceUrl.includes('/preview/')
          ? sourceUrl.replace('/preview/', '/thumb/')
          : sourceUrl,
        cached: true,
        sizeBytes: 0,
      };
    }

    const hash = hashForR2(sourceUrl);
    const previewKey = r2KeyFor('preview', hash);
    const thumbKey = r2KeyFor('thumb', hash);
    const s3 = this.getS3();

    // 1. HEAD dedup — nếu đã có thì skip toàn bộ download/encode/upload.
    try {
      await s3.send(new HeadObjectCommand({ Bucket: c.bucket, Key: previewKey }));
      return {
        hash,
        previewUrl: buildR2Url(c.publicBase, 'preview', hash),
        thumbUrl: buildR2Url(c.publicBase, 'thumb', hash),
        cached: true,
        sizeBytes: 0,
      };
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      const name = (e as { name?: string })?.name;
      if (status !== 404 && name !== 'NotFound' && name !== 'NoSuchKey') {
        throw e;
      }
    }

    // 2. Download
    const buffer = await this.download(sourceUrl, c.maxDownloadMb);

    // 3. Compress 2 variants song song.
    const [previewBuf, thumbBuf] = await Promise.all([
      sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize(c.previewMaxDim, c.previewMaxDim, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: c.previewQuality })
        .toBuffer(),
      sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize(c.thumbDim, c.thumbDim, { fit: 'cover' })
        .webp({ quality: c.thumbQuality })
        .toBuffer(),
    ]);

    // 4. Upload R2 song song.
    await Promise.all([this.put(previewKey, previewBuf), this.put(thumbKey, thumbBuf)]);

    const sizeBytes = previewBuf.length + thumbBuf.length;
    await this.repo.upsertObject({
      hash,
      sourceUrl,
      previewKey,
      thumbKey,
      sizeBytes,
    });

    return {
      hash,
      previewUrl: buildR2Url(c.publicBase, 'preview', hash),
      thumbUrl: buildR2Url(c.publicBase, 'thumb', hash),
      cached: false,
      sizeBytes,
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
        `Drive trả HTML (file > 100 MB hoặc cần auth): ${url}. ` +
          `Phase tiếp theo sẽ retry qua Drive API + service account.`,
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
        // Hash trong key → object immutable → cache vô hạn ở browser + CDN edge.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  /** Phase 10 cleanup. */
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
