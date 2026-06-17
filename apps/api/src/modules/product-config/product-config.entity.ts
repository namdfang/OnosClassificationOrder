import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { ProductConfig } from 'shared';

import type { FactoryDocument } from '../factory/factory.entity';
import type { MachineTypeDocument } from '../machine-type/machine-type.entity';

@DatabaseEntity({ collection: 'productConfigs' })
export class ProductConfigEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true, index: true })
  fullName: string;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  shortName: string;

  @Prop({ trim: true })
  computerType?: string;

  @Prop({ required: true, ref: 'MachineTypeEntity', index: true })
  machineTypeId: string;

  @Prop({ required: true, ref: 'FactoryEntity', index: true })
  factoryId: string;

  /** workshop_config code (category=fabric_type). Default fabric for orders mapped to this product. */
  @Prop({ trim: true })
  fabricType?: string;

  /** workshop_config code (category=tool_result). Default tool status — copied to order.toolResult at import. */
  @Prop({ trim: true })
  toolResult?: string;
}

assertSameType<ProductConfig, ProductConfigEntity>();
assertSameType<ProductConfigEntity, ProductConfig>();

export const ProductConfigSchema = SchemaFactory.createForClass(ProductConfigEntity);

ProductConfigSchema.virtual('machineType', {
  ref: 'MachineTypeEntity',
  localField: 'machineTypeId',
  foreignField: '_id',
  justOne: true,
});

ProductConfigSchema.virtual('factory', {
  ref: 'FactoryEntity',
  localField: 'factoryId',
  foreignField: '_id',
  justOne: true,
});

export type ProductConfigDocument = HydratedDocument<ProductConfigEntity> & {
  machineType?: MachineTypeDocument;
  factory?: FactoryDocument;
};
