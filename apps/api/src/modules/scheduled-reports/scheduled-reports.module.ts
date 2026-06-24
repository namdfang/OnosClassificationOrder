import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FactoryModule } from '../factory/factory.module';
import { OrderEntity, OrderSchema } from '../order/order.entity';
import { RoleEntity, RoleSchema } from '../role/role.entity';
import { RoleRepository } from '../role/role.repository';
import { TelegramNotificationModule } from '../telegram-notification/telegram-notification.module';
import { UserEntity, UserSchema } from '../user/user.entity';
import { WorkshopConfigModule } from '../workshop-config/workshop-config.module';
import { DesignerAggregator } from './aggregators/designer-aggregator';
import { ErrorAggregator } from './aggregators/error-aggregator';
import { FactoryAggregator } from './aggregators/factory-aggregator';
import { ScheduledReportsController } from './scheduled-reports.controller';
import { ScheduledReportsService } from './scheduled-reports.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]),
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: RoleEntity.name, schema: RoleSchema }]),
    FactoryModule,
    WorkshopConfigModule,
    TelegramNotificationModule,
  ],
  controllers: [ScheduledReportsController],
  providers: [
    ScheduledReportsService,
    DesignerAggregator,
    FactoryAggregator,
    ErrorAggregator,
    RoleRepository,
  ],
  exports: [ScheduledReportsService],
})
export class ScheduledReportsModule {}
