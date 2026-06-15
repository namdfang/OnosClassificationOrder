import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import { getObjectValues, Status } from 'shared';
@DatabaseEntity({ collection: 'cronjobs' })
export class CronjobEntity extends DatabaseEntityAbstract {
  @Prop({
    required: true,
  })
  name: string;

  @Prop({
    required: true,
    unique: true,
  })
  code: string;

  @Prop()
  description?: string;

  @Prop({
    required: true,
  })
  duration: string;

  @Prop({
    required: true,
    type: String,
    enum: getObjectValues(Status),
    default: Status.Inactive,
  })
  status: Status;
}

export const CronjobSchema = SchemaFactory.createForClass(CronjobEntity);

export type CronjobDocument = HydratedDocument<CronjobEntity>;
