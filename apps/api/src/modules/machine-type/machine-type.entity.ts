import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { MachineType } from 'shared';

@DatabaseEntity({ collection: 'machineTypes' })
export class MachineTypeEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, uppercase: true, unique: true, index: true })
  shortName: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

assertSameType<MachineType, MachineTypeEntity>();
assertSameType<MachineTypeEntity, MachineType>();

export const MachineTypeSchema = SchemaFactory.createForClass(MachineTypeEntity);
export type MachineTypeDocument = HydratedDocument<MachineTypeEntity>;
