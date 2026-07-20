import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OrderEntity, OrderSchema } from '../order/order.entity';
import { DesignBufferCache } from './buffer-cache.service';
import { DesignImageController } from './design-image.controller';
import { DESIGN_PREVIEW_QUEUE, DESIGN_THUMB_QUEUE } from './design-image.processor';
import { DesignImageService } from './design-image.service';
import { R2DesignObjectEntity, R2DesignObjectSchema } from './r2-design-object.entity';
import { R2DesignObjectRepository } from './r2-design-object.repository';

const QUEUE_DEFAULTS = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 1000, age: 7 * 24 * 60 * 60 },
  removeOnFail: { count: 5000, age: 30 * 24 * 60 * 60 },
};

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: R2DesignObjectEntity.name, schema: R2DesignObjectSchema },
      { name: OrderEntity.name, schema: OrderSchema },
    ]),
    BullModule.registerQueue(
      { name: DESIGN_THUMB_QUEUE, defaultJobOptions: QUEUE_DEFAULTS },
      { name: DESIGN_PREVIEW_QUEUE, defaultJobOptions: QUEUE_DEFAULTS },
    ),
  ],
  providers: [
    DesignBufferCache,
    DesignImageService,
    // [QUEUE-disabled] tạm tắt 2 worker R2 vì sập VPS — restore = uncomment.
    // DesignThumbProcessor,
    // DesignPreviewProcessor,
    R2DesignObjectRepository,
  ],
  controllers: [DesignImageController],
  exports: [DesignImageService, BullModule],
})
export class DesignImageModule {}
