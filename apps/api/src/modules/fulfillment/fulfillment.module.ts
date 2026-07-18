import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OrderEntity, OrderSchema } from '../order/order.entity';
import { OrderLogModule } from '../order-log/order-log.module';
import { UserEntity, UserSchema } from '../user/user.entity';
import { FulfillmentTaskController } from './fulfillment-task.controller';
import { FulfillmentTaskService } from './fulfillment-task.service';

/**
 * Fulfillment 5-stage workflow module.
 *
 * Phase 2: transition state machine + my-tasks (4 tab).
 * Phase 5: team admin (queue overview + worker mgmt).
 * Phase 6: stats (throughput + cycle time).
 */
@Module({
  imports: [
    OrderLogModule,
    MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]),
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
  ],
  controllers: [FulfillmentTaskController],
  providers: [FulfillmentTaskService],
  exports: [FulfillmentTaskService],
})
export class FulfillmentModule {}
