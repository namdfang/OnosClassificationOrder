import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PromotionController } from './promotion.controller';
import { PromotionEntity, PromotionSchema } from './promotion.entity';
import { PromotionRepository } from './promotion.repository';
import { PromotionService } from './promotion.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: PromotionEntity.name, schema: PromotionSchema }])],
  controllers: [PromotionController],
  providers: [PromotionService, PromotionRepository],
  exports: [PromotionService, PromotionRepository],
})
export class PromotionModule {}
