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

  // AUTH-1 — tài khoản BỊ mạo danh. `userId` là SuperAdmin đi mạo danh.
  @Prop({ required: false, index: true })
  targetUserId?: string;

  // Nguồn tài khoản bị mạo danh: bảng `users` hay `customers`.
  @Prop({ required: false })
  targetType?: 'user' | 'customer';

  // Mốc kết thúc phiên mạo danh (AC-05). `active=false` là cờ, đây là thời điểm.
  @Prop({ required: false, type: Date })
  endedAt?: Date;

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
