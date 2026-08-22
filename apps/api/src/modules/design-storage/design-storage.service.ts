import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  ConfirmDesignUploadDto,
  DesignFile,
  DesignIngestJob,
  DesignUploadConfig,
  PresignDesignUploadDto,
} from 'shared';
import {
  DESIGN_PROCESSING_QUEUE,
  DESIGN_UPLOAD_ALLOWED_EXTENSIONS,
  DESIGN_UPLOAD_ALLOWED_MIME_TYPES,
  designFileKey,
  extractDesignSha,
} from 'shared';

import type { CustomerDocument } from '@/modules/customer/customer.entity';
import { ApiConfigService } from '@/shared/services';

import type { DesignFileDocument } from './design-file.entity';
import { DesignFileRepository } from './design-file.repository';

const TMP_PREFIX = 'uploads/tmp/';
const PRESIGN_TTL_SECONDS = 3600;
/** Record kẹt `processing` quá lâu (worker chết/mất job) → đánh `failed` cho retry. */
const STALE_PROCESSING_HOURS = 24;
const LIFECYCLE_BATCH = 200;

/**
 * Design storage — API chỉ làm việc NHẸ: cấp presigned URL (file đi thẳng
 * browser → R2, KHÔNG xuyên qua API), ghi metadata `design_files`, đẩy job
 * RabbitMQ cho design-worker (server riêng) xử lý hash/resize. Xem plan
 * `documents/Plans/DesignStorage-R2-ProcessingWorker.md`.
 */
@Injectable()
export class DesignStorageService {
  private readonly logger = new Logger(DesignStorageService.name);
  private s3: S3Client | null = null;

  constructor(
    private readonly cfg: ApiConfigService,
    private readonly repo: DesignFileRepository,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  isEnabled(): boolean {
    return this.cfg.r2Config !== null;
  }

  /**
   * Giới hạn + định dạng cho ô tải file ở FE. CHỈ đọc cấu hình, không đụng
   * luồng presign/confirm — hai lớp chặn kích thước ở đó giữ nguyên. Có mặt để
   * FE khỏi chép cứng con số (ORD-17).
   */
  getUploadConfig(): DesignUploadConfig {
    // KHÔNG ném lỗi khi thiếu R2: FE vẫn cần giới hạn để chặn file quá lớn
    // trước khi băm, và cần biết upload đang tắt để bảo khách dán URL.
    return {
      uploadEnabled: this.isEnabled(),
      maxUploadMb: this.cfg.designUploadMaxMb,
      allowedMimeTypes: [...DESIGN_UPLOAD_ALLOWED_MIME_TYPES],
      allowedExtensions: [...DESIGN_UPLOAD_ALLOWED_EXTENSIONS],
    };
  }

  private getS3(): S3Client {
    if (this.s3) return this.s3;
    const c = this.cfg.r2Config;
    if (!c) throw new BadRequestException('Kho design chưa được cấu hình (R2_* env)');
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
    return this.s3;
  }

  private toSafe(doc: DesignFileDocument | Record<string, unknown>): DesignFile {
    const d = (typeof (doc as DesignFileDocument).toObject === 'function'
      ? (doc as DesignFileDocument).toObject()
      : doc) as Record<string, unknown>;
    return {
      _id: String(d._id),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      sha256: d.sha256,
      status: d.status,
      fileName: d.fileName,
      size: d.size ?? 0,
      mime: d.mime,
      width: d.width,
      height: d.height,
      hasPreview: d.hasPreview ?? false,
      lastUsedAt: d.lastUsedAt,
      usageCount: d.usageCount ?? 0,
      errorMessage: d.errorMessage,
    } as DesignFile;
  }

  /**
   * FE tính sha256 client-side rồi gọi presign. Dedup hit (record đã
   * ready/processing/archived) → `exists`, khách "upload" 0 giây. Còn lại →
   * presigned PUT vào vùng tạm `uploads/tmp/<uuid>`.
   */
  async presign(customer: CustomerDocument, dto: PresignDesignUploadDto) {
    const c = this.cfg.r2Config;
    if (!c) throw new BadRequestException('Kho design chưa được cấu hình — liên hệ hỗ trợ.');
    if (dto.size > c.maxUploadMb * 1024 * 1024) {
      throw new BadRequestException(`File ${(dto.size / 1024 / 1024).toFixed(1)} MB vượt giới hạn ${c.maxUploadMb} MB`);
    }

    const existing = await this.repo.findOne<DesignFileDocument>({ sha256: dto.sha256 });
    if (existing && ['ready', 'processing', 'archived'].includes(existing.status)) {
      if (existing.status === 'archived') void this.restoreFromArchive([existing.sha256]);
      return { mode: 'exists' as const, file: this.toSafe(existing), publicBase: c.publicBase };
    }

    // failed/deleted/chưa có → nhận upload lại. Upsert giữ nguyên unique sha256.
    // Gọi model TRỰC TIẾP: repo.findOneAndUpdate của core KHÔNG hỗ trợ upsert
    // (hardcode {new:true} + tự chèn filter deletedAt → trả null khi chưa có doc).
    const model = await this.repo.model();
    const doc = await model
      .findOneAndUpdate(
        { sha256: dto.sha256 },
        {
          $set: { status: 'processing', errorMessage: null },
          $setOnInsert: {
            sha256: dto.sha256,
            fileName: dto.fileName,
            mime: dto.mime,
            size: dto.size,
            hasPreview: false,
            storageClass: 'standard',
            lastUsedAt: new Date(),
            usageCount: 0,
            sourceKeys: [],
            uploadedBy: { customerId: String(customer._id), userEmail: customer.userEmail },
          },
        },
        { upsert: true, new: true },
      )
      .lean();
    if (!doc) throw new BadRequestException('Không tạo được record design — thử lại.');

    const tmpKey = `${TMP_PREFIX}${randomUUID()}`;
    const uploadUrl = await getSignedUrl(
      this.getS3(),
      new PutObjectCommand({ Bucket: c.bucket, Key: tmpKey, ContentType: dto.mime }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
    return {
      mode: 'upload' as const,
      file: this.toSafe(doc as unknown as DesignFileDocument),
      publicBase: c.publicBase,
      uploadUrl,
      tmpKey,
    };
  }

  /** FE báo upload xong → verify object tồn tại + đẩy job cho worker. */
  async confirm(customer: CustomerDocument, dto: ConfirmDesignUploadDto): Promise<DesignFile> {
    const c = this.cfg.r2Config;
    if (!c) throw new BadRequestException('Kho design chưa được cấu hình.');
    if (!dto.tmpKey.startsWith(TMP_PREFIX)) throw new BadRequestException('tmpKey không hợp lệ');

    let size = 0;
    try {
      const head = await this.getS3().send(new HeadObjectCommand({ Bucket: c.bucket, Key: dto.tmpKey }));
      size = head.ContentLength ?? 0;
    } catch {
      throw new BadRequestException('Không tìm thấy file đã upload — thử upload lại.');
    }
    if (size <= 0) throw new BadRequestException('File upload rỗng — thử lại.');
    if (size > c.maxUploadMb * 1024 * 1024) {
      void this.getS3().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: dto.tmpKey }));
      throw new BadRequestException(`File vượt giới hạn ${c.maxUploadMb} MB`);
    }

    const doc = await this.repo.findOneAndUpdate<DesignFileDocument>(
      { sha256: dto.sha256 },
      { $set: { size, ...(dto.fileName ? { fileName: dto.fileName } : {}) } },
      { new: true } as never,
    );
    if (!doc) throw new NotFoundException('Chưa có record presign cho sha này — gọi presign trước.');

    // Đã ready (upload trùng chạy song song) → khỏi enqueue, dọn tmp.
    if (doc.status === 'ready') {
      void this.getS3().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: dto.tmpKey }));
      return this.toSafe(doc);
    }

    await this.publishJob({
      kind: 'tmp-object',
      tmpKey: dto.tmpKey,
      sha256: dto.sha256,
      fileName: dto.fileName ?? doc.fileName,
      customerId: String(customer._id),
      userEmail: customer.userEmail,
    });
    return this.toSafe(doc);
  }

  async getBySha(sha256: string): Promise<DesignFile> {
    const doc = await this.repo.findOne<DesignFileDocument>({ sha256 });
    if (!doc) throw new NotFoundException('Design không tồn tại');
    return this.toSafe(doc);
  }

  /**
   * Đơn mới tham chiếu design CDN → reset sliding window `lastUsedAt` + đếm
   * usage. Design đang `archived` được kéo về standard (restore tức thời — IA
   * vẫn đọc được ngay, chỉ đổi class để tối ưu phí retrieval).
   * Nhận list URL bất kỳ — tự lọc URL thuộc CDN mình, còn lại bỏ qua êm.
   */
  async touchUsageForUrls(urls: Array<string | undefined | null>): Promise<void> {
    const shas = [...new Set(urls.map((u) => extractDesignSha(u)).filter((s): s is string => !!s))];
    if (shas.length === 0) return;
    try {
      await this.repo.updateManyRaw(
        { sha256: { $in: shas } },
        { $set: { lastUsedAt: new Date() }, $inc: { usageCount: 1 } },
      );
      const archived = await this.repo.findAll<DesignFileDocument>({ sha256: { $in: shas }, status: 'archived' });
      if (archived.length > 0) void this.restoreFromArchive(archived.map((d) => d.sha256));
    } catch (err) {
      // Touch usage là side-effect thống kê — không được làm fail luồng đặt đơn.
      this.logger.warn(`touchUsageForUrls failed: ${(err as Error).message}`);
    }
  }

  /** Đẩy job ingest-from-URL (Drive…) cho worker — gọi lúc Push to production. */
  async enqueueUrlIngest(job: DesignIngestJob): Promise<void> {
    if (!this.isEnabled()) return; // chưa cấu hình R2 → giữ nguyên URL gốc, không enqueue
    await this.publishJob(job);
  }

  private async publishJob(job: DesignIngestJob): Promise<void> {
    const ex = this.cfg.rabbitmq.mainExchange;
    try {
      await this.amqpConnection.publish(ex, `${ex}.${DESIGN_PROCESSING_QUEUE}`, job, { persistent: true });
    } catch (err) {
      this.logger.error(`Publish design job failed (${job.kind}): ${(err as Error).message}`);
      throw new BadRequestException('Không đẩy được job xử lý design — thử lại sau.');
    }
  }

  /** CopyObject đè chính nó với class standard — "restore" từ IA, không tải data qua API. */
  private async restoreFromArchive(shas: string[]): Promise<void> {
    const c = this.cfg.r2Config;
    if (!c) return;
    for (const sha of shas) {
      try {
        const key = designFileKey(sha, 'original');
        await this.getS3().send(
          new CopyObjectCommand({
            Bucket: c.bucket,
            CopySource: `${c.bucket}/${encodeURIComponent(key).replaceAll('%2F', '/')}`,
            Key: key,
            StorageClass: 'STANDARD',
            MetadataDirective: 'COPY',
          }),
        );
        await this.repo.updateManyRaw(
          { sha256: sha },
          { $set: { status: 'ready', storageClass: 'standard' }, $unset: { archivedAt: 1 } },
        );
        this.logger.log(`Restored design ${sha} from IA`);
      } catch (err) {
        this.logger.warn(`Restore ${sha} from IA failed: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Cron vòng đời (gọi qua endpoint public /lifecycle/cron — pattern cron sẵn
   * có của repo):
   *   1. ready + lastUsedAt quá `originalTtlDays` → hạ original xuống IA.
   *   2. archived + archivedAt quá `iaDeleteMonths` tháng → xóa original thật
   *      (record + thumb/preview GIỮ VĨNH VIỄN — đơn cũ luôn xem được ảnh).
   *   3. processing kẹt quá 24h → failed (worker chết giữa chừng, cho retry).
   */
  async runLifecycle(): Promise<{ archived: number; deleted: number; failedStale: number }> {
    const c = this.cfg.r2Config;
    if (!c) return { archived: 0, deleted: 0, failedStale: 0 };
    const now = Date.now();
    let archived = 0;
    let deleted = 0;

    const toArchive = await this.repo.findAll<DesignFileDocument>(
      { status: 'ready', lastUsedAt: { $lt: new Date(now - c.originalTtlDays * 86_400_000) } },
      { paging: { limit: LIFECYCLE_BATCH, skip: 0 } } as never,
    );
    for (const doc of toArchive) {
      try {
        const key = designFileKey(doc.sha256, 'original');
        await this.getS3().send(
          new CopyObjectCommand({
            Bucket: c.bucket,
            CopySource: `${c.bucket}/${key}`,
            Key: key,
            StorageClass: 'STANDARD_IA',
            MetadataDirective: 'COPY',
          }),
        );
        await this.repo.updateManyRaw(
          { _id: doc._id },
          { $set: { status: 'archived', storageClass: 'ia', archivedAt: new Date() } },
        );
        archived++;
      } catch (err) {
        this.logger.warn(`Archive ${doc.sha256} failed: ${(err as Error).message}`);
      }
    }

    const toDelete = await this.repo.findAll<DesignFileDocument>(
      { status: 'archived', archivedAt: { $lt: new Date(now - c.iaDeleteMonths * 30 * 86_400_000) } },
      { paging: { limit: LIFECYCLE_BATCH, skip: 0 } } as never,
    );
    for (const doc of toDelete) {
      try {
        await this.getS3().send(
          new DeleteObjectCommand({ Bucket: c.bucket, Key: designFileKey(doc.sha256, 'original') }),
        );
        await this.repo.updateManyRaw({ _id: doc._id }, { $set: { status: 'deleted' }, $unset: { archivedAt: 1 } });
        deleted++;
      } catch (err) {
        this.logger.warn(`Delete original ${doc.sha256} failed: ${(err as Error).message}`);
      }
    }

    const stale = await this.repo.updateManyRaw(
      { status: 'processing', updatedAt: { $lt: new Date(now - STALE_PROCESSING_HOURS * 3_600_000) } },
      { $set: { status: 'failed', errorMessage: 'Kẹt processing quá 24h (worker không phản hồi)' } },
    );
    const failedStale = (stale as unknown as { modifiedCount?: number })?.modifiedCount ?? 0;

    this.logger.log(`Lifecycle: archived=${archived} deleted=${deleted} failedStale=${failedStale}`);
    return { archived, deleted, failedStale };
  }
}
