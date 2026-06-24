import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';

import { OrderEntity } from '../order/order.entity';
import { DesignImageService } from './design-image.service';
import { R2DesignObjectRepository } from './r2-design-object.repository';

export const DESIGN_THUMB_QUEUE = 'design-image-thumb';
export const DESIGN_PREVIEW_QUEUE = 'design-image-preview';

// Backwards-compat export (DI dùng các string này ở các call site cũ).
export const DESIGN_IMAGE_QUEUE = DESIGN_THUMB_QUEUE;

export interface DesignImageJobData {
  sourceUrl: string;
  /** Order IDs đang đợi URL này — worker thumb update tất cả 1 lần. */
  orderIds: string[];
  /** Field design key (front, back, sleeve, …). */
  designKey: string;
}

/**
 * Worker thumb — chạy ưu tiên, concurrency cao.
 *
 * Trách nhiệm:
 *   1. Encode + upload thumb 300×300.
 *   2. Set `designs.{k}` = preview URL (theoretical) + `designsStatus.{k}='ready'`.
 *      → FE table thấy thumb ngay (smallThumb swap preview/ → thumb/ trong URL).
 *   3. Bump refCount cho r2DesignObjects.
 *
 * Buffer raw được DesignImageService cache xuống disk 7 ngày → worker preview
 * tận dụng không phải download lại.
 */
@Processor(DESIGN_THUMB_QUEUE, {
  concurrency: Number(process.env.DESIGN_THUMB_CONCURRENCY ?? process.env.DESIGN_QUEUE_CONCURRENCY ?? 3),
})
export class DesignThumbProcessor extends WorkerHost {
  private readonly logger = new Logger(DesignThumbProcessor.name);

  constructor(
    private readonly imageService: DesignImageService,
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    private readonly r2Repo: R2DesignObjectRepository,
  ) {
    super();
  }

  async process(job: Job<DesignImageJobData>): Promise<{ hash: string; cached: boolean }> {
    const { sourceUrl, orderIds, designKey } = job.data;
    if (!sourceUrl || orderIds.length === 0) {
      this.logger.warn(`Skip empty job ${job.id}`);
      return { hash: '', cached: false };
    }

    try {
      const result = await this.imageService.processThumb(sourceUrl);
      const { hash, cached, sizeBytes } = result;

      // designs.{k} lưu URL preview (chưa tồn tại trên R2 trước khi worker preview chạy,
      // nhưng FE smallThumb() swap thành /thumb/ → load OK).
      // publicBase từ result.url là /thumb/, đổi → /preview/.
      const previewUrl = result.url.includes('/thumb/')
        ? result.url.replace('/thumb/', '/preview/')
        : result.url;

      await this.orderModel.updateMany(
        { _id: { $in: orderIds } },
        {
          $set: {
            [`designs.${designKey}`]: previewUrl,
            [`designsStatus.${designKey}`]: 'ready',
          },
        },
      );
      await this.r2Repo.incrementRefCount(hash, orderIds.length);

      this.logger.log(
        `THUMB ${cached ? 'CACHED' : 'NEW'} ${designKey} hash=${hash} orders=${orderIds.length} size=${sizeBytes}B`,
      );
      return { hash, cached };
    } catch (err) {
      await this.orderModel.updateMany(
        { _id: { $in: orderIds } },
        { $set: { [`designsStatus.${designKey}`]: 'failed' } },
      );
      this.logger.error(
        `THUMB FAIL ${designKey} url=${sourceUrl} orders=${orderIds.length}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DesignImageJobData>, err: Error) {
    this.logger.warn(`Thumb job ${job.id} attempt ${job.attemptsMade} failed: ${err.message}`);
  }
}

/**
 * Worker preview — chạy lần lượt, concurrency 1 (default).
 *
 * Không cập nhật Mongo gì cả — `designs.{k}` đã trỏ về preview URL từ lúc thumb
 * worker xong, chỉ cần upload file lên R2 là CDN public URL hoạt động.
 *
 * Idempotent: HEAD R2 hit (do ensure-preview on-demand đã chạy) → skip.
 */
@Processor(DESIGN_PREVIEW_QUEUE, {
  concurrency: Number(process.env.DESIGN_PREVIEW_CONCURRENCY ?? 1),
})
export class DesignPreviewProcessor extends WorkerHost {
  private readonly logger = new Logger(DesignPreviewProcessor.name);

  constructor(private readonly imageService: DesignImageService) {
    super();
  }

  async process(job: Job<DesignImageJobData>): Promise<{ hash: string; cached: boolean }> {
    const { sourceUrl, designKey } = job.data;
    if (!sourceUrl) {
      this.logger.warn(`Skip empty preview job ${job.id}`);
      return { hash: '', cached: false };
    }

    try {
      const { hash, cached, sizeBytes } = await this.imageService.processPreview(sourceUrl);
      this.logger.log(
        `PREVIEW ${cached ? 'CACHED' : 'NEW'} ${designKey} hash=${hash} size=${sizeBytes}B`,
      );
      return { hash, cached };
    } catch (err) {
      this.logger.error(
        `PREVIEW FAIL ${designKey} url=${sourceUrl}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DesignImageJobData>, err: Error) {
    this.logger.warn(`Preview job ${job.id} attempt ${job.attemptsMade} failed: ${err.message}`);
  }
}
