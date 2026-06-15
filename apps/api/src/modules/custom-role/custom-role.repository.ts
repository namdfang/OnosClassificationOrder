import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { CustomRoleDocument } from './custom-role.entity';
import { CustomRoleEntity } from './custom-role.entity';

@Injectable()
export class CustomRoleRepository extends DatabaseRepositoryAbstract<CustomRoleEntity, CustomRoleDocument> {
  constructor(
    @InjectModel(CustomRoleEntity.name)
    private readonly customRoleModel: Model<CustomRoleEntity>,
  ) {
    super(customRoleModel);
  }
}
