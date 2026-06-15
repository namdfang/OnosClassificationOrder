import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CounterEntity, CounterSchema } from '@/modules/counter/counter.entity';
import { CounterModule } from '@/modules/counter/counter.module';
import { PermissionEntity, PermissionSchema } from '@/modules/permission/permission.entity';
import { RoleEntity, RoleSchema } from '@/modules/role/role.entity';

import { ActionEntity, ActionSchema } from '../actions/action.entity';
import { ActionRepository } from '../actions/action.repository';
import { CustomRoleEntity, CustomRoleSchema } from '../custom-role/custom-role.entity';
import { CustomRoleRepository } from '../custom-role/custom-role.repository';
import { DepartmentEntity, DepartmentSchema } from '../departments/department.entity';
import { DepartmentRepository } from '../departments/department.repository';
import { NotificationEntity, NotificationSchema } from '../notifications/notification.entity';
import { NotificationRepository } from '../notifications/notification.repository';
import { NotificationService } from '../notifications/notification.service';
import { RoleRepository } from '../role/role.repository';
import { NotificationConsumer } from './notification.consumer';
import { UserController } from './user.controller';
import { UserEntity, UserSchema } from './user.entity';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserLogEntity, UserLogSchema } from './user-log.entity';
import { UserLogRepository } from './user-log.repository';

@Module({
  imports: [
    CounterModule,
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: CounterEntity.name, schema: CounterSchema }]),
    MongooseModule.forFeature([
      {
        name: RoleEntity.name,
        schema: RoleSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: CustomRoleEntity.name,
        schema: CustomRoleSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: PermissionEntity.name,
        schema: PermissionSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: NotificationEntity.name,
        schema: NotificationSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: ActionEntity.name,
        schema: ActionSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: DepartmentEntity.name,
        schema: DepartmentSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: UserLogEntity.name,
        schema: UserLogSchema,
      },
    ]),
  ],
  controllers: [UserController],
  exports: [UserService, UserRepository],
  providers: [
    UserService,
    UserRepository,
    RoleRepository,
    CustomRoleRepository,
    NotificationConsumer,
    NotificationRepository,
    NotificationService,
    ActionRepository,
    DepartmentRepository,
    UserLogRepository,
  ],
})
export class UserModule {}
