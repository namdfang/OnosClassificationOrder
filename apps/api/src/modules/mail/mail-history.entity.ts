import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { MailHistory } from 'shared';
import { getObjectValues, MailStatus, MailType } from 'shared';

@DatabaseEntity({ collection: 'mailHistory' })
export class MailHistoryEntity extends DatabaseEntityAbstract {
  @Prop({
    required: true,
    type: String,
  })
  email: string;

  @Prop({
    required: true,
    type: String,
    enum: getObjectValues(MailType),
  })
  topic: MailType;

  @Prop({
    type: String,
  })
  subject?: string;

  @Prop({
    required: true,
    type: String,
  })
  body: string;

  @Prop({
    required: true,
    type: String,
    enum: getObjectValues(MailStatus),
  })
  status: MailStatus;

  @Prop({
    type: Date,
  })
  scheduledTime?: Date;
}

assertSameType<MailHistory, MailHistoryEntity>();
assertSameType<MailHistoryEntity, MailHistory>();

export const MailHistorySchema = SchemaFactory.createForClass(MailHistoryEntity);

export type MailHistoryDocument = HydratedDocument<MailHistoryEntity>;
