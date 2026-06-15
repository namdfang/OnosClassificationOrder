import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PermissionEntity, PermissionSchema } from '@/modules/permission/permission.entity';
import { UserEntity, UserSchema } from '@/modules/user/user.entity';

import { RoleController } from './role.controller';
import { RoleEntity, RoleSchema } from './role.entity';
import { RoleRepository } from './role.repository';
import { RoleService } from './role.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: RoleEntity.name,
        schema: RoleSchema,
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
  controllers: [RoleController],
  providers: [RoleService, RoleRepository],
  exports: [RoleService],
})
export class RoleModule {}
