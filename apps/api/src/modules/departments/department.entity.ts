import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { Department } from 'shared';
import { getObjectValues, Status } from 'shared';

@DatabaseEntity({ collection: 'departments' })
export class DepartmentEntity extends DatabaseEntityAbstract {
  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  name: string;

  @Prop({
    required: true,
    trim: true,
    unique: true,
  })
  code: string;

  @Prop()
  description?: string;

  @Prop({
    required: true,
    type: String,
    enum: getObjectValues(Status),
    default: Status.Active,
  })
  status: Status;
}

assertSameType<Department, DepartmentEntity>();
assertSameType<DepartmentEntity, Department>();

export const DepartmentSchema = SchemaFactory.createForClass(DepartmentEntity);
DepartmentSchema.index({ name: 1 }, { unique: true });

export type DepartmentDocument = HydratedDocument<DepartmentEntity>;
