import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { PromotionDocument } from './promotion.entity';
import { PromotionEntity } from './promotion.entity';

@Injectable()
export class PromotionRepository extends DatabaseRepositoryAbstract<PromotionEntity, PromotionDocument> {
  constructor(@InjectModel(PromotionEntity.name) private readonly promotionModel: Model<PromotionEntity>) {
    super(promotionModel);
  }
}
