import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { DesignFileEntity, DesignFileSchema } from './design-file.entity';
import { DesignFileRepository } from './design-file.repository';
import { DesignStorageController } from './design-storage.controller';
import { DesignStorageService } from './design-storage.service';

/**
 * Design storage — R2 lưu trữ + design-worker (server riêng) xử lý. API chỉ
 * presign/metadata/enqueue. Xem `documents/Plans/DesignStorage-R2-ProcessingWorker.md`.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: DesignFileEntity.name, schema: DesignFileSchema }])],
  controllers: [DesignStorageController],
  providers: [DesignStorageService, DesignFileRepository],
  exports: [DesignStorageService],
})
export class DesignStorageModule {}
