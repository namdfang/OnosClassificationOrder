import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerAssignmentModule } from '../customer-assignment/customer-assignment.module';
import { FactoryModule } from '../factory/factory.module';
import { OrderEntity, OrderSchema } from '../order/order.entity';
import { TelegramNotificationModule } from '../telegram-notification/telegram-notification.module';
import { UserEntity, UserSchema } from '../user/user.entity';
import { DailyOrdersAggregator } from './aggregators/daily-orders-aggregator';
import { ScheduledReportsController } from './scheduled-reports.controller';
import { ScheduledReportsService } from './scheduled-reports.service';
import { TelegramWebhookController } from './telegram-webhook.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]),
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
    CustomerAssignmentModule,
    FactoryModule,
    TelegramNotificationModule,
  ],
  controllers: [ScheduledReportsController, TelegramWebhookController],
  providers: [ScheduledReportsService, DailyOrdersAggregator],
  exports: [ScheduledReportsService],
})
export class ScheduledReportsModule {}
