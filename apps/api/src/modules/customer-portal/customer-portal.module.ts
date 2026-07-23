import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '@/modules/auth/auth.module';
import { CounterModule } from '@/modules/counter/counter.module';
import { CustomerModule } from '@/modules/customer/customer.module';
import { OrderEntity, OrderSchema } from '@/modules/order/order.entity';
import { OrderModule } from '@/modules/order/order.module';
import { ProductConfigEntity, ProductConfigSchema } from '@/modules/product-config/product-config.entity';
import { PromotionModule } from '@/modules/promotion/promotion.module';

import { CustomerAuthController } from './customer-auth.controller';
import { CustomerCatalogController } from './customer-catalog.controller';
import { CustomerCatalogService } from './customer-catalog.service';
import { CustomerOrderController } from './customer-order.controller';
import { CustomerOrderService } from './customer-order.service';

@Module({
  imports: [
    // Bind Order/ProductConfig model trực tiếp cho các query scoped-theo-khách
    // (list/track/catalog) — cùng pattern với CustomerModule, tránh phụ thuộc
    // vòng không cần thiết.
    MongooseModule.forFeature([
      { name: OrderEntity.name, schema: OrderSchema },
      { name: ProductConfigEntity.name, schema: ProductConfigSchema },
    ]),
    AuthModule,
    CustomerModule,
    OrderModule,
    CounterModule,
    PromotionModule,
  ],
  controllers: [CustomerAuthController, CustomerOrderController, CustomerCatalogController],
  providers: [CustomerOrderService, CustomerCatalogService],
})
export class CustomerPortalModule {}
