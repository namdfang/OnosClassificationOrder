import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OrderEntity, OrderSchema } from '../order/order.entity';
import { SystemConfigModule } from '../system-config/system-config.module';
import { CustomerController } from './customer.controller';
import { CustomerEntity, CustomerSchema } from './customer.entity';
import { CustomerRepository } from './customer.repository';
import { CustomerService } from './customer.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomerEntity.name, schema: CustomerSchema }]),
    // Bind Order model trực tiếp (không import OrderModule) để tránh vòng lặp
    // phụ thuộc: OrderModule → CustomerAssignmentModule → CustomerModule.
    MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]),
    // Xóa mềm khách → tự gỡ khỏi 3 config blob (gán xưởng / ưu tiên / designer).
    SystemConfigModule,
  ],
  controllers: [CustomerController],
  providers: [CustomerService, CustomerRepository],
  exports: [CustomerService, CustomerRepository],
})
export class CustomerModule {}
