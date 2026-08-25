import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerNotificationModule } from '../customer-notification/customer-notification.module';
import { CustomerOrderEntity, CustomerOrderSchema } from '../customer-portal/customer-order.entity';
import { CustomerWebhookModule } from '../customer-webhook/customer-webhook.module';
import { OrderEntity, OrderSchema } from '../order/order.entity';
import { CustomerOrderEventService } from './customer-order-event.service';

/**
 * Nguồn sự kiện DUY NHẤT hướng ra khách khi đơn đổi trạng thái — fan-out sang
 * webhook (ORD-4) + thông báo chuông portal (ORD-5).
 *
 * Chỉ bind model + import 2 module lá (webhook/notification đều không import
 * module nghiệp vụ nào), nên Order / Fulfillment / CustomerPortal cùng import
 * module này mà không tạo vòng DI.
 */
@Module({
  imports: [
    CustomerWebhookModule,
    CustomerNotificationModule,
    MongooseModule.forFeature([
      { name: CustomerOrderEntity.name, schema: CustomerOrderSchema },
      { name: OrderEntity.name, schema: OrderSchema },
    ]),
  ],
  providers: [CustomerOrderEventService],
  exports: [CustomerOrderEventService],
})
export class CustomerEventModule {}
