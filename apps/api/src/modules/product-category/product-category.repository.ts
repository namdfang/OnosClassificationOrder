import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { ProductCategoryDocument } from './product-category.entity';
import { ProductCategoryEntity } from './product-category.entity';

@Injectable()
export class ProductCategoryRepository extends DatabaseRepositoryAbstract<ProductCategoryEntity, ProductCategoryDocument> {
  constructor(@InjectModel(ProductCategoryEntity.name) private readonly productCategoryModel: Model<ProductCategoryEntity>) {
    super(productCategoryModel);
  }
}
