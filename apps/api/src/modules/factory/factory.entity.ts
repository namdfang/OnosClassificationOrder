import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { Factory } from 'shared';

@DatabaseEntity({ collection: 'factories' })
export class FactoryEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, uppercase: true, unique: true, index: true })
  shortName: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

assertSameType<Factory, FactoryEntity>();
assertSameType<FactoryEntity, Factory>();

export const FactorySchema = SchemaFactory.createForClass(FactoryEntity);
export type FactoryDocument = HydratedDocument<FactoryEntity>;
