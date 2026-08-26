import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OrderEntity, OrderSchema } from '../order/order.entity';
import { SystemConfigModule } from '../system-config/system-config.module';
import { ShipmentEntity, ShipmentSchema } from './shipment.entity';
import { ShippingPackageEntity, ShippingPackageSchema } from './shipping-package.entity';
import { ShippingVnpController } from './shipping-vnp.controller';
import { ShippingVnpService } from './shipping-vnp.service';
import { VnpEglobalClient } from './vnp-eglobal.client';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrderEntity.name, schema: OrderSchema },
      { name: ShippingPackageEntity.name, schema: ShippingPackageSchema },
      { name: ShipmentEntity.name, schema: ShipmentSchema },
    ]),
    SystemConfigModule,
  ],
  controllers: [ShippingVnpController],
  providers: [ShippingVnpService, VnpEglobalClient],
  exports: [ShippingVnpService],
})
export class ShippingVnpModule {}
