import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import { HydratedDocument } from 'mongoose';

@DatabaseEntity({ collection: 'system_configs' })
export class SystemConfigEntity extends DatabaseEntityAbstract {
  @Prop({
    required: true,
    unique: true,
    trim: true,
  })
  key: string;

  @Prop({
    required: true,
    type: Object,
  })
  value: any;

  @Prop()
  description?: string;
}

export const SystemConfigSchema = SchemaFactory.createForClass(SystemConfigEntity);
export type SystemConfigDocument = HydratedDocument<SystemConfigEntity>;
