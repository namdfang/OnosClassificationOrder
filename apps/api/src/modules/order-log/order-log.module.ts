import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OrderLogEntity, OrderLogSchema } from './order-log.entity';
import { OrderLogRepository } from './order-log.repository';
import { OrderLogService } from './order-log.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: OrderLogEntity.name, schema: OrderLogSchema }])],
  providers: [OrderLogService, OrderLogRepository],
  exports: [OrderLogService, OrderLogRepository],
})
export class OrderLogModule {}
