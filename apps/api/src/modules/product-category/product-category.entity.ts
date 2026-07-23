import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { ProductCategory } from 'shared';

@DatabaseEntity({ collection: 'productCategories' })
export class ProductCategoryEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, uppercase: true, unique: true, index: true })
  shortName: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

assertSameType<ProductCategory, ProductCategoryEntity>();
assertSameType<ProductCategoryEntity, ProductCategory>();

export const ProductCategorySchema = SchemaFactory.createForClass(ProductCategoryEntity);
export type ProductCategoryDocument = HydratedDocument<ProductCategoryEntity>;
