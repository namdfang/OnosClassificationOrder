import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { WorkshopConfigController } from './workshop-config.controller';
import { WorkshopConfigEntity, WorkshopConfigSchema } from './workshop-config.entity';
import { WorkshopConfigRepository } from './workshop-config.repository';
import { WorkshopConfigService } from './workshop-config.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WorkshopConfigEntity.name, schema: WorkshopConfigSchema }]),
  ],
  controllers: [WorkshopConfigController],
  providers: [WorkshopConfigService, WorkshopConfigRepository],
  exports: [WorkshopConfigService, WorkshopConfigRepository],
})
export class WorkshopConfigModule {}
