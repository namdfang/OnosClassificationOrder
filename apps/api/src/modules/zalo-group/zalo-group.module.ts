import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerEntity, CustomerSchema } from '../customer/customer.entity';
import { ZaloGroupController } from './zalo-group.controller';
import { ZaloGroupRepository } from './zalo-group.repository';
import { ZaloGroupService } from './zalo-group.service';
import { ZaloGroupLinkEntity, ZaloGroupLinkSchema } from './zalo-group-link.entity';
import { ZaloGroupSummaryEntity, ZaloGroupSummarySchema } from './zalo-group-summary.entity';
import { ZaloSummaryService } from './zalo-summary.service';

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
      { name: ZaloGroupSummaryEntity.name, schema: ZaloGroupSummarySchema },
      { name: CustomerEntity.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [ZaloGroupController],
  providers: [ZaloGroupService, ZaloGroupRepository, ZaloSummaryService],
  exports: [ZaloGroupService, ZaloGroupRepository, ZaloSummaryService],
})
export class ZaloGroupModule {}
