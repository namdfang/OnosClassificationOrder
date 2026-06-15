import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';

@DatabaseEntity({ collection: 'counters' })
export class CounterEntity extends DatabaseEntityAbstract {
  @Prop({
    required: true,
  })
  key: string;

  @Prop({
    required: true,
  })
  type: string;

  @Prop({
    required: true,
  })
  seq: number;
}

export const CounterSchema = SchemaFactory.createForClass(CounterEntity);
CounterSchema.index({ key: 1, type: 1 });

export type CounterDocument = HydratedDocument<CounterEntity>;
