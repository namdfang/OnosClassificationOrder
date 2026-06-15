import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { FactoryDocument } from './factory.entity';
import { FactoryEntity } from './factory.entity';

@Injectable()
export class FactoryRepository extends DatabaseRepositoryAbstract<FactoryEntity, FactoryDocument> {
  constructor(@InjectModel(FactoryEntity.name) private readonly factoryModel: Model<FactoryEntity>) {
    super(factoryModel);
  }
}
