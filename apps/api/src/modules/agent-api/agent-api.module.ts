import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CollectionEntity, CollectionSchema } from '../collection/collection.entity';
import { CustomerEntity, CustomerSchema } from '../customer/customer.entity';
import {
  CustomerNotificationEntity,
  CustomerNotificationSchema,
} from '../customer-notification/customer-notification.entity';
import { FactoryEntity, FactorySchema } from '../factory/factory.entity';
import { MachineTypeEntity, MachineTypeSchema } from '../machine-type/machine-type.entity';
import { OrderEntity, OrderSchema } from '../order/order.entity';
import { OrderLogEntity, OrderLogSchema } from '../order-log/order-log.entity';
import { ProductCategoryEntity, ProductCategorySchema } from '../product-category/product-category.entity';
import { ProductConfigEntity, ProductConfigSchema } from '../product-config/product-config.entity';
import { PromotionEntity, PromotionSchema } from '../promotion/promotion.entity';
import { WorkshopConfigEntity, WorkshopConfigSchema } from '../workshop-config/workshop-config.entity';
import { AgentApiController } from './agent-api.controller';
import { AgentApiRepository } from './agent-api.repository';
import { AgentApiKeyGuard } from './agent-api-key.guard';
import { AgentApiLogEntity, AgentApiLogSchema } from './agent-audit.entity';
import { AgentAuditService } from './agent-audit.service';
import { AgentDocsService } from './agent-docs.service';
import { AgentQueryService } from './agent-query.service';
import { AgentReadService } from './agent-read.service';

/**
 * Bộ API nội bộ cho AI agent (`API-1`).
 *
 * Bind thẳng model của 11 bảng trong danh sách trắng thay vì import module của
 * chúng: module này CHỈ ĐỌC, không cần logic nghiệp vụ của bên kia, và bind
 * thẳng tránh cả vòng lặp phụ thuộc lẫn việc vô tình lôi hàm ghi vào phạm vi.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgentApiLogEntity.name, schema: AgentApiLogSchema },
      { name: OrderEntity.name, schema: OrderSchema },
      { name: OrderLogEntity.name, schema: OrderLogSchema },
      { name: CustomerEntity.name, schema: CustomerSchema },
      { name: ProductConfigEntity.name, schema: ProductConfigSchema },
      { name: ProductCategoryEntity.name, schema: ProductCategorySchema },
      { name: CollectionEntity.name, schema: CollectionSchema },
      { name: PromotionEntity.name, schema: PromotionSchema },
      { name: FactoryEntity.name, schema: FactorySchema },
      { name: MachineTypeEntity.name, schema: MachineTypeSchema },
      { name: WorkshopConfigEntity.name, schema: WorkshopConfigSchema },
      { name: CustomerNotificationEntity.name, schema: CustomerNotificationSchema },
    ]),
  ],
  controllers: [AgentApiController],
  providers: [
    AgentApiKeyGuard,
    AgentApiRepository,
    AgentAuditService,
    AgentDocsService,
    AgentQueryService,
    AgentReadService,
  ],
})
export class AgentApiModule {}
