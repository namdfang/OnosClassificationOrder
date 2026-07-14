import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { DesignImageModule } from '../design-image/design-image.module';
import { FactoryModule } from '../factory/factory.module';
import { MachineTypeModule } from '../machine-type/machine-type.module';
import { OrderLogModule } from '../order-log/order-log.module';
import { ProductConfigModule } from '../product-config/product-config.module';
import { RedisCacheModule } from '../redis-cache/redis-cache.module';
import { RoleEntity, RoleSchema } from '../role/role.entity';
import { RoleRepository } from '../role/role.repository';
import { TelegramNotificationModule } from '../telegram-notification/telegram-notification.module';
import { UserEntity, UserSchema } from '../user/user.entity';
import { WorkshopConfigModule } from '../workshop-config/workshop-config.module';
import { DriveFileNameService } from './drive-file-name.service';
import { OnospodImportService } from './onospod-import.service';
import { OrderController } from './order.controller';
import { OrderEntity, OrderSchema } from './order.entity';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]),
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
    // RoleRepository không export từ RoleModule (chỉ export RoleService) nên
    // tự bind model + repo trong module này — dùng cho assertAssigneeUserValid.
    MongooseModule.forFeature([{ name: RoleEntity.name, schema: RoleSchema }]),
    ProductConfigModule,
    WorkshopConfigModule,
    OrderLogModule,
    RedisCacheModule,
    FactoryModule,
    MachineTypeModule,
    TelegramNotificationModule,
    DesignImageModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository, RoleRepository, DriveFileNameService, OnospodImportService],
  exports: [OrderService],
})
export class OrderModule {}
