import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ProductCategoryController } from './product-category.controller';
import { ProductCategoryEntity, ProductCategorySchema } from './product-category.entity';
import { ProductCategoryRepository } from './product-category.repository';
import { ProductCategoryService } from './product-category.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: ProductCategoryEntity.name, schema: ProductCategorySchema }])],
  controllers: [ProductCategoryController],
  providers: [ProductCategoryService, ProductCategoryRepository],
  exports: [ProductCategoryService, ProductCategoryRepository],
})
export class ProductCategoryModule {}
