import { Module } from '@nestjs/common';

import { SystemConfigModule } from '../system-config/system-config.module';
import { CustomerModule } from '../customer/customer.module';
import { CustomerAssignmentController } from './customer-assignment.controller';
import { CustomerAssignmentService } from './customer-assignment.service';

@Module({
  imports: [SystemConfigModule, CustomerModule],
  controllers: [CustomerAssignmentController],
  providers: [CustomerAssignmentService],
  exports: [CustomerAssignmentService],
})
export class CustomerAssignmentModule {}
