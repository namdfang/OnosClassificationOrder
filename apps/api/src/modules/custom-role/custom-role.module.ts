import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PermissionEntity, PermissionSchema } from '@/modules/permission/permission.entity';
import { UserEntity, UserSchema } from '@/modules/user/user.entity';

import { CustomRoleController } from './custom-role.controller';
import { CustomRoleEntity, CustomRoleSchema } from './custom-role.entity';
import { CustomRoleRepository } from './custom-role.repository';
import { CustomRoleService } from './custom-role.service';

@Global()
@Module({
  imports: [
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
        name: UserEntity.name,
        schema: UserSchema,
      },
    ]),
  ],
  controllers: [CustomRoleController],
  providers: [CustomRoleService, CustomRoleRepository],
  exports: [CustomRoleService, CustomRoleRepository],
})
export class CustomRoleModule {}
