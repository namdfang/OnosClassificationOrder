import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import { getObjectValues, type MailTemplate, MailType } from 'shared';

@DatabaseEntity({ collection: 'mailTemplates' })
export class MailTemplateEntity extends DatabaseEntityAbstract {
  @Prop({})
  body: string;

  @Prop({
    required: true,
    type: String,
    enum: getObjectValues(MailType),
  })
  name: MailType;

  @Prop({
    type: [String],
    default: [],
  })
  variables: string[];
}

assertSameType<MailTemplate, MailTemplateEntity>();
assertSameType<MailTemplateEntity, MailTemplate>();

export const MailTemplateSchema = SchemaFactory.createForClass(MailTemplateEntity);
MailTemplateSchema.index({ name: 1, path: 1 }, { unique: true });

export type MailTemplateDocument = HydratedDocument<MailTemplateEntity>;
