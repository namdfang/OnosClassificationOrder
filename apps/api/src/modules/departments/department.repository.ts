import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { DepartmentDocument } from './department.entity';
import { DepartmentEntity } from './department.entity';

@Injectable()
export class DepartmentRepository extends DatabaseRepositoryAbstract<DepartmentEntity, DepartmentDocument> {
  constructor(
    @InjectModel(DepartmentEntity.name)
    private readonly departmentModel: Model<DepartmentEntity>,
  ) {
    super(departmentModel);
  }
}
