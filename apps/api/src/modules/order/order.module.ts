import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FactoryModule } from '../factory/factory.module';
import { OrderLogModule } from '../order-log/order-log.module';
import { ProductConfigModule } from '../product-config/product-config.module';
import { RedisCacheModule } from '../redis-cache/redis-cache.module';
import { TelegramNotificationModule } from '../telegram-notification/telegram-notification.module';
import { WorkshopConfigModule } from '../workshop-config/workshop-config.module';
import { OrderController } from './order.controller';
import { OrderEntity, OrderSchema } from './order.entity';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]),
    ProductConfigModule,
    WorkshopConfigModule,
    OrderLogModule,
    RedisCacheModule,
    FactoryModule,
    TelegramNotificationModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
  exports: [OrderService],
})
export class OrderModule {}
