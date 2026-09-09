import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerOrderEntity, CustomerOrderSchema } from '@/modules/customer-portal/customer-order.entity';
import { CustomerWalletModule } from '@/modules/customer-wallet/customer-wallet.module';
import { OrderEntity, OrderSchema } from '@/modules/order/order.entity';
import { ShipmentEntity, ShipmentSchema } from '@/modules/shipping-vnp/shipment.entity';
import { ShippingVnpModule } from '@/modules/shipping-vnp/shipping-vnp.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';

import { SellerShippingController } from './seller-shipping.controller';
import { SellerShippingService } from './seller-shipping.service';
import { SellerShippingAdminController } from './seller-shipping-admin.controller';

/**
 * Seller tự mua label VNP (plan `SellerWallet-LabelPurchase.md`) — ghép
 * ví seller (`CustomerWalletModule`) với luồng mua VNP sẵn có
 * (`ShippingVnpModule`). Chỉ bind model (không import CustomerPortalModule/
 * OrderModule) — tránh kéo cả cây phụ thuộc.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomerOrderEntity.name, schema: CustomerOrderSchema },
      { name: OrderEntity.name, schema: OrderSchema },
      { name: ShipmentEntity.name, schema: ShipmentSchema },
    ]),
    CustomerWalletModule,
    ShippingVnpModule,
    SystemConfigModule,
  ],
  controllers: [SellerShippingController, SellerShippingAdminController],
  providers: [SellerShippingService],
})
export class SellerShippingModule {}
