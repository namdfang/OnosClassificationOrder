import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { MachineTypeDocument } from './machine-type.entity';
import { MachineTypeEntity } from './machine-type.entity';

@Injectable()
export class MachineTypeRepository extends DatabaseRepositoryAbstract<MachineTypeEntity, MachineTypeDocument> {
  constructor(@InjectModel(MachineTypeEntity.name) private readonly machineTypeModel: Model<MachineTypeEntity>) {
    super(machineTypeModel);
  }
}
