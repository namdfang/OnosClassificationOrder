import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OrderEntity, OrderSchema } from '../order/order.entity';
import { UserEntity, UserSchema } from '../user/user.entity';
import { CeoDashboardController } from './ceo-dashboard.controller';
import { CeoDashboardService } from './ceo-dashboard.service';
import { CeoReportEntity, CeoReportSchema } from './ceo-report.entity';
import { CeoReportService } from './ceo-report.service';

/** CEO Dashboard — chỉ đọc `orders` (+ users/factories/customers qua connection). Xem CeoDashboard.md. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]),
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: CeoReportEntity.name, schema: CeoReportSchema }]),
  ],
  controllers: [CeoDashboardController],
  providers: [CeoDashboardService, CeoReportService],
  exports: [CeoDashboardService, CeoReportService],
})
export class CeoDashboardModule {}
