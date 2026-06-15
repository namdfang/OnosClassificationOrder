import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { Action } from 'shared';
import { ActionType, getObjectValues } from 'shared';

@DatabaseEntity({ collection: 'actions' })
export class ActionEntity extends DatabaseEntityAbstract {
  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  ip: string;

  @Prop({
    required: true,
  })
  userAgent: string;

  @Prop({
    required: false,
  })
  sessionId?: string;

  @Prop({
    required: false,
  })
  country?: string;

  @Prop({
    required: false,
  })
  region?: string;

  @Prop({
    required: false,
  })
  active?: boolean;

  @Prop({
    type: String,
    enum: getObjectValues(ActionType),
    required: true,
  })
  type: ActionType;

  @Prop({
    required: true,
    ref: 'UserEntity',
  })
  userId: string;
}

assertSameType<Action, ActionEntity>();
assertSameType<ActionEntity, Action>();

export const ActionSchema = SchemaFactory.createForClass(ActionEntity);
ActionSchema.index({ ip: 1 });

ActionSchema.virtual('user', {
  ref: 'UserEntity',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

export type ActionDocument = HydratedDocument<ActionEntity>;
