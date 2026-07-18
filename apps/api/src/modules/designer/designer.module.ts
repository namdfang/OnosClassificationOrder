import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OrderEntity, OrderSchema } from '../order/order.entity';
import { OrderLogEntity, OrderLogSchema } from '../order-log/order-log.entity';
import { OrderLogModule } from '../order-log/order-log.module';
import { ProductConfigEntity, ProductConfigSchema } from '../product-config/product-config.entity';
import { RoleEntity, RoleSchema } from '../role/role.entity';
import { RoleRepository } from '../role/role.repository';
import { UserEntity, UserSchema } from '../user/user.entity';
import { WorkshopConfigEntity, WorkshopConfigSchema } from '../workshop-config/workshop-config.entity';
import { DesignerMigrationController } from './designer-migration.controller';
import { DesignerMigrationService } from './designer-migration.service';
import { DesignerStatsController } from './designer-stats.controller';
import { DesignerStatsService } from './designer-stats.service';
import { DesignerTaskController } from './designer-task.controller';
import { DesignerTaskService } from './designer-task.service';
import { DesignerTeamController } from './designer-team.controller';
import { DesignerTeamService } from './designer-team.service';

/**
 * Designer Task Workflow module.
 *
 * Phase 1: migration endpoint (promote 1 user Designer cũ → Leader).
 * Phase 2: team CRUD (`DesignerTeamController` + service).
 * Phase 3: task transition state machine (`DesignerTaskController`).
 * Phase 4+: my-tasks kanban, stats.
 */
@Module({
  imports: [
    OrderLogModule,
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: OrderEntity.name, schema: OrderSchema }]),
    MongooseModule.forFeature([{ name: WorkshopConfigEntity.name, schema: WorkshopConfigSchema }]),
    // RoleRepository không export từ RoleModule (chỉ export RoleService) nên
    // tự bind model + repo trong module này. Vì RoleSchema đã được Mongoose
    // đăng ký từ RoleModule (@Global), forFeature ở đây không xung đột.
    MongooseModule.forFeature([{ name: RoleEntity.name, schema: RoleSchema }]),
    MongooseModule.forFeature([{ name: OrderLogEntity.name, schema: OrderLogSchema }]),
    MongooseModule.forFeature([{ name: ProductConfigEntity.name, schema: ProductConfigSchema }]),
  ],
  controllers: [DesignerMigrationController, DesignerTeamController, DesignerTaskController, DesignerStatsController],
  providers: [DesignerMigrationService, DesignerTeamService, DesignerTaskService, DesignerStatsService, RoleRepository],
  exports: [DesignerMigrationService, DesignerTeamService, DesignerTaskService, DesignerStatsService],
})
export class DesignerModule {}
