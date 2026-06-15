import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { UniqueImageDocument } from './unique-image.entity';
import { UniqueImageEntity } from './unique-image.entity';
@Injectable()
export class UniqueImageRepository extends DatabaseRepositoryAbstract<UniqueImageEntity, UniqueImageDocument> {
  constructor(
    @InjectModel(UniqueImageEntity.name)
    private readonly imageModel: Model<UniqueImageEntity>,
  ) {
    super(imageModel);
  }
}
