import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { Notification } from 'shared';
import { NotificationType } from 'shared';

import type { UserDocument } from '../user/user.entity';

@DatabaseEntity({ collection: 'notifications' })
export class NotificationEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, type: Object })
  title: string;

  @Prop({
    required: false,
  })
  contentId?: string;

  @Prop({
    required: false,
  })
  description?: string;

  @Prop({
    type: String,
    enum: NotificationType,
    required: true,
  })
  type: NotificationType;

  @Prop({
    index: true,
    type: Boolean,
    default: false,
    required: false,
  })
  seen: boolean;

  @Prop({
    required: true,
    ref: 'UserEntity',
  })
  userId: string;
}

assertSameType<Notification, NotificationEntity>();
assertSameType<NotificationEntity, Notification>();

export const NotificationSchema = SchemaFactory.createForClass(NotificationEntity);
NotificationSchema.index({ userId: 1 });

NotificationSchema.virtual('user', {
  ref: 'UserEntity',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

export type NotificationDocument = HydratedDocument<NotificationEntity> & {
  user?: UserDocument;
  content?: { describe?: string };
};
