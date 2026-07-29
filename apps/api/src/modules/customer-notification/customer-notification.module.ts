import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerEntity, CustomerSchema } from '../customer/customer.entity';
import { CustomerNotificationController } from './customer-notification.controller';
import { CustomerNotificationEntity, CustomerNotificationSchema } from './customer-notification.entity';
import { CustomerNotificationRepository } from './customer-notification.repository';
import { CustomerNotificationService } from './customer-notification.service';
import { CustomerNotificationPortalController } from './customer-notification-portal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomerNotificationEntity.name, schema: CustomerNotificationSchema }]),
    // Bind Customer model trực tiếp (không import CustomerModule) để tránh vòng lặp phụ thuộc.
    MongooseModule.forFeature([{ name: CustomerEntity.name, schema: CustomerSchema }]),
  ],
  controllers: [CustomerNotificationController, CustomerNotificationPortalController],
  providers: [CustomerNotificationService, CustomerNotificationRepository],
  exports: [CustomerNotificationService],
})
export class CustomerNotificationModule {}
