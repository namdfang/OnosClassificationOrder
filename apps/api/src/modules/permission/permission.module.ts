import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RoleEntity, RoleSchema } from '../role/role.entity';
import { PermissionController } from './permission.controller';
import { PermissionEntity, PermissionSchema } from './permission.entity';
import { PermissionRepository } from './permission.repository';
import { PermissionService } from './permission.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PermissionEntity.name,
        schema: PermissionSchema,
      },
    ]),
    MongooseModule.forFeature([
      {
        name: RoleEntity.name,
        schema: RoleSchema,
      },
    ]),
  ],
  controllers: [PermissionController],
  providers: [PermissionService, PermissionRepository],
  exports: [PermissionService],
})
export class PermissionModule {}
