import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerEntity, CustomerSchema } from '../customer/customer.entity';
import { ZaloGroupController } from './zalo-group.controller';
import { ZaloGroupRepository } from './zalo-group.repository';
import { ZaloGroupService } from './zalo-group.service';
import { ZaloGroupLinkEntity, ZaloGroupLinkSchema } from './zalo-group-link.entity';

/**
 * Nối nhóm Zalo ↔ khách hàng.
 *
 * Chỉ bind model, KHÔNG import `CustomerModule` — module này chỉ cần đọc vài
 * trường của khách (`userSku`, `fullName`) chứ không dùng nghiệp vụ của nó, và
 * `CustomerModule` lại kéo theo cả cụm customer-portal. Bind thẳng model giữ
 * đồ thị phụ thuộc phẳng.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ZaloGroupLinkEntity.name, schema: ZaloGroupLinkSchema },
      { name: CustomerEntity.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [ZaloGroupController],
  providers: [ZaloGroupService, ZaloGroupRepository],
  exports: [ZaloGroupService, ZaloGroupRepository],
})
export class ZaloGroupModule {}
