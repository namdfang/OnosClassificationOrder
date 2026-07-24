import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { CollectionDocument } from './collection.entity';
import { CollectionEntity } from './collection.entity';

@Injectable()
export class CollectionRepository extends DatabaseRepositoryAbstract<CollectionEntity, CollectionDocument> {
  constructor(@InjectModel(CollectionEntity.name) private readonly collectionModel: Model<CollectionEntity>) {
    super(collectionModel);
  }
}
