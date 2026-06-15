import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { WorkshopConfigDocument } from './workshop-config.entity';
import { WorkshopConfigEntity } from './workshop-config.entity';

@Injectable()
export class WorkshopConfigRepository extends DatabaseRepositoryAbstract<
  WorkshopConfigEntity,
  WorkshopConfigDocument
> {
  constructor(
    @InjectModel(WorkshopConfigEntity.name)
    private readonly workshopConfigModel: Model<WorkshopConfigEntity>,
  ) {
    super(workshopConfigModel);
  }
}
