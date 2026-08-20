import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerEntity, CustomerSchema } from '../customer/customer.entity';
import { CustomerWebhookController } from './customer-webhook.controller';
import {
  CustomerWebhookDeliveryEntity,
  CustomerWebhookDeliverySchema,
  CustomerWebhookEntity,
  CustomerWebhookSchema,
} from './customer-webhook.entity';
import { CustomerWebhookService } from './customer-webhook.service';

/**
 * Module ĐỘC LẬP (chỉ bind model, không import module nghiệp vụ) — Order /
 * Fulfillment / CustomerPortal cùng import để emit sự kiện mà không tạo vòng
 * DI (customer-portal → order → customer-webhook là 1 chiều).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomerWebhookEntity.name, schema: CustomerWebhookSchema },
      { name: CustomerWebhookDeliveryEntity.name, schema: CustomerWebhookDeliverySchema },
      { name: CustomerEntity.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [CustomerWebhookController],
  providers: [CustomerWebhookService],
  exports: [CustomerWebhookService],
})
export class CustomerWebhookModule {}
