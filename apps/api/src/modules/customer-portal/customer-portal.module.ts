import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '@/modules/auth/auth.module';
import { CounterModule } from '@/modules/counter/counter.module';
import { CustomerModule } from '@/modules/customer/customer.module';
import { OrderEntity, OrderSchema } from '@/modules/order/order.entity';
import { OrderModule } from '@/modules/order/order.module';

import { CustomerAuthController } from './customer-auth.controller';
import { CustomerOrderController } from './customer-order.controller';
import { CustomerOrderService } from './customer-order.service';

@Module({
  imports: [
    // Bind Order model trực tiếp cho các query scoped-theo-khách (list/track)
    // — cùng pattern với CustomerModule, tránh phụ thuộc vòng không cần thiết.
    MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]),
    AuthModule,
    CustomerModule,
    OrderModule,
    CounterModule,
  ],
  controllers: [CustomerAuthController, CustomerOrderController],
  providers: [CustomerOrderService],
})
export class CustomerPortalModule {}
