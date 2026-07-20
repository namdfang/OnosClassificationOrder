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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- config blob lưu tùy ý theo key
  value: any;

  @Prop()
  description?: string;
}

export const SystemConfigSchema = SchemaFactory.createForClass(SystemConfigEntity);
export type SystemConfigDocument = HydratedDocument<SystemConfigEntity>;
