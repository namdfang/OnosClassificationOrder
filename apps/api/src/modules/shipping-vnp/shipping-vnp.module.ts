import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OrderEntity, OrderSchema } from '../order/order.entity';
import { SystemConfigModule } from '../system-config/system-config.module';
import { ShippingVnpController } from './shipping-vnp.controller';
import { ShippingVnpService } from './shipping-vnp.service';
import { VnpEglobalClient } from './vnp-eglobal.client';

@Module({
  imports: [MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]), SystemConfigModule],
  controllers: [ShippingVnpController],
  providers: [ShippingVnpService, VnpEglobalClient],
  exports: [ShippingVnpService],
})
export class ShippingVnpModule {}
