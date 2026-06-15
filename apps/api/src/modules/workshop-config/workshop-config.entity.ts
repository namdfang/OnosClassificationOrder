import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import { WORKSHOP_CONFIG_CATEGORIES, WorkshopConfigCategory } from 'shared';

@DatabaseEntity({ collection: 'workshopConfigs' })
export class WorkshopConfigEntity extends DatabaseEntityAbstract {
  @Prop({ type: String, required: true, enum: WORKSHOP_CONFIG_CATEGORIES, index: true })
  category: WorkshopConfigCategory;

  @Prop({ required: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  color?: string;

  @Prop({ trim: true })
  icon?: string;

  @Prop({ required: true, default: 0 })
  order: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const WorkshopConfigSchema = SchemaFactory.createForClass(WorkshopConfigEntity);
WorkshopConfigSchema.index({ category: 1, code: 1 }, { unique: true });

export type WorkshopConfigDocument = HydratedDocument<WorkshopConfigEntity>;
