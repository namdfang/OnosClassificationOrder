import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { Permission } from 'shared';
import { getObjectValues, PermissionAction, PermissionType, Status } from 'shared';

@DatabaseEntity({ collection: 'permissions' })
export class PermissionEntity extends DatabaseEntityAbstract {
  @Prop({
    required: true,
    unique: true,
    enum: PermissionType,
  })
  permissionId: string;

  @Prop()
  description?: string;

  @Prop({
    required: true,
    type: String,
    enum: PermissionAction,
    default: PermissionAction.View,
  })
  action: PermissionAction;

  @Prop({
    type: String,
    enum: getObjectValues(Status),
    default: Status.Active,
  })
  status: Status;
}

assertSameType<Permission, PermissionEntity>();
assertSameType<PermissionEntity, Permission>();

export type PermissionDocument = HydratedDocument<PermissionEntity>;

export const PermissionSchema = SchemaFactory.createForClass(PermissionEntity);
