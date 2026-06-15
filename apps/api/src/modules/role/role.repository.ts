import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { RoleDocument } from '../role/role.entity';
import { RoleEntity } from '../role/role.entity';
@Injectable()
export class RoleRepository extends DatabaseRepositoryAbstract<RoleEntity, RoleDocument> {
  constructor(
    @InjectModel(RoleEntity.name)
    private readonly roleModel: Model<RoleEntity>,
  ) {
    super(roleModel);
  }
}
