import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job, Queue } from 'bullmq';
import { Model } from 'mongoose';

import { OrderEntity } from '../order/order.entity';
import { DesignImageService } from './design-image.service';
import { R2DesignObjectRepository } from './r2-design-object.repository';

export const DESIGN_IMAGE_QUEUE = 'design-image';

export interface DesignImageJobData {
  sourceUrl: string;
  /** Order IDs đang đợi URL này — worker update tất cả 1 lần. */
  orderIds: string[];
  /** Field design key (front, back, sleeve, …). */
  designKey: string;
}

/**
 * Worker xử lý design image từ queue `design-image`.
 *
 * Concurrency lấy từ env `DESIGN_QUEUE_CONCURRENCY` (default 3) — đủ thông
 * lượng cho file 70 MB mà không OOM trên VPS 4 GB RAM (3 × ~150 MB sharp peak).
 */
@Processor(DESIGN_IMAGE_QUEUE, {
  concurrency: Number(process.env.DESIGN_QUEUE_CONCURRENCY ?? 3),
})
export class DesignImageProcessor extends WorkerHost {
  private readonly logger = new Logger(DesignImageProcessor.name);

  constructor(
    private readonly imageService: DesignImageService,
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    private readonly r2Repo: R2DesignObjectRepository,
    @InjectQueue(DESIGN_IMAGE_QUEUE) private readonly queue: Queue<DesignImageJobData>,
  ) {
    super();
    void this.queue; // injected for future programmatic ops (retry, drain)
  }

  async process(job: Job<DesignImageJobData>): Promise<{ hash: string; cached: boolean }> {
    const { sourceUrl, orderIds, designKey } = job.data;
    if (!sourceUrl || orderIds.length === 0) {
      this.logger.warn(`Skip empty job ${job.id}`);
      return { hash: '', cached: false };
    }

    try {
      const { previewUrl, hash, cached, sizeBytes } = await this.imageService.processOne(sourceUrl);

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
        `${cached ? 'CACHED' : 'NEW'} ${designKey} hash=${hash} orders=${orderIds.length} size=${sizeBytes}B`,
      );
      return { hash, cached };
    } catch (err) {
      // Mark từng order là failed — FE sẽ render fallback link gốc.
      await this.orderModel.updateMany(
        { _id: { $in: orderIds } },
        { $set: { [`designsStatus.${designKey}`]: 'failed' } },
      );
      this.logger.error(
        `FAIL ${designKey} url=${sourceUrl} orders=${orderIds.length}: ${(err as Error).message}`,
      );
      throw err; // BullMQ sẽ retry theo `attempts` + backoff config ở module.
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DesignImageJobData>, err: Error) {
    this.logger.warn(`Job ${job.id} attempt ${job.attemptsMade} failed: ${err.message}`);
  }
}
