import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { Collection } from 'shared';

@DatabaseEntity({ collection: 'collections' })
export class CollectionEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, uppercase: true, unique: true, index: true })
  shortName: string;

  @Prop({ trim: true })
  image?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, default: 0 })
  sortOrder: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

assertSameType<Collection, CollectionEntity>();
assertSameType<CollectionEntity, Collection>();

export const CollectionSchema = SchemaFactory.createForClass(CollectionEntity);
export type CollectionDocument = HydratedDocument<CollectionEntity>;
