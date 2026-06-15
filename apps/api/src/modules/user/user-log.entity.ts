import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import mongoose, { type HydratedDocument } from 'mongoose';
import { getObjectValues, type UserLog, UserLogType } from 'shared';

import type { UserDocument } from './user.entity';

@DatabaseEntity({ collection: 'userLogs' })
export class UserLogEntity extends DatabaseEntityAbstract {
  @Prop({
    ref: 'UserEntity',
  })
  actorId: string;

  @Prop({
    ref: 'UserEntity',
  })
  userId: string;

  @Prop()
  field: string;

  @Prop({
    type: mongoose.Schema.Types.Mixed,
  })
  before?: unknown;

  @Prop({
    type: mongoose.Schema.Types.Mixed,
  })
  after?: unknown;

  @Prop({
    required: true,
    type: String,
    enum: getObjectValues(UserLogType),
  })
  type: UserLogType;
}

assertSameType<UserLog, UserLogEntity>();
assertSameType<UserLogEntity, UserLog>();

export const UserLogSchema = SchemaFactory.createForClass(UserLogEntity);

UserLogSchema.virtual('user', {
  ref: 'UserEntity',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

UserLogSchema.virtual('actor', {
  ref: 'UserEntity',
  localField: 'actorId',
  foreignField: '_id',
  justOne: true,
});
export type UserLogDocument = HydratedDocument<UserLogEntity> & {
  user?: UserDocument;
};
