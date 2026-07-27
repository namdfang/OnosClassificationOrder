import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FactoryModule } from '../factory/factory.module';
import { MachineTypeModule } from '../machine-type/machine-type.module';
import { OrderEntity, OrderSchema } from '../order/order.entity';
import { ProductCategoryModule } from '../product-category/product-category.module';
import { WorkshopConfigModule } from '../workshop-config/workshop-config.module';
import { ProductConfigController } from './product-config.controller';
import { ProductConfigEntity, ProductConfigSchema } from './product-config.entity';
import { ProductConfigRepository } from './product-config.repository';
import { ProductConfigService } from './product-config.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ProductConfigEntity.name, schema: ProductConfigSchema }]),
    // Chỉ cần model đơn (KHÔNG import OrderModule — tránh vòng lặp DI) cho
    // `getUnmatchedOrderTypes()`: quét type trên đơn chưa có config.
    MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]),
    FactoryModule,
    MachineTypeModule,
    ProductCategoryModule,
    WorkshopConfigModule,
  ],
  controllers: [ProductConfigController],
  providers: [ProductConfigService, ProductConfigRepository],
  exports: [ProductConfigService, ProductConfigRepository],
})
export class ProductConfigModule {}
