import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { PermissionDocument } from '@/modules/permission/permission.entity';
import { PermissionEntity } from '@/modules/permission/permission.entity';
@Injectable()
export class PermissionRepository extends DatabaseRepositoryAbstract<PermissionEntity, PermissionDocument> {
  constructor(
    @InjectModel(PermissionEntity.name)
    private readonly permissionModel: Model<PermissionEntity>,
  ) {
    super(permissionModel);
  }
}
