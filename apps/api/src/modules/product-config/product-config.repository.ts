import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { ProductConfigDocument } from './product-config.entity';
import { ProductConfigEntity } from './product-config.entity';

@Injectable()
export class ProductConfigRepository extends DatabaseRepositoryAbstract<ProductConfigEntity, ProductConfigDocument> {
  constructor(@InjectModel(ProductConfigEntity.name) private readonly productConfigModel: Model<ProductConfigEntity>) {
    super(productConfigModel);
  }
}
