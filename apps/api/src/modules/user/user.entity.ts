import { Prop, raw, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { CallbackWithoutResultAndOptionalError, HydratedDocument } from 'mongoose';
import type { User } from 'shared';
import { CODE_LENGTH, Gender, getObjectValues, ID_LENGTH, PASSWORD_MIN_LENGTH, Status, TelegramConfig } from 'shared';

import type { CustomRoleDocument } from '../custom-role/custom-role.entity';
import type { DepartmentDocument } from '../departments/department.entity';
import type { PermissionDocument } from '../permission/permission.entity';
import type { RoleDocument } from '../role/role.entity';
import type { ImageDocument } from '../upload/image.entity';

@DatabaseEntity({ collection: 'users' })
export class UserEntity extends DatabaseEntityAbstract {
  @Prop({
    ref: 'ImageEntity',
  })
  avatarId?: string;

  @Prop({
    required: true,
  })
  fullName: string;

  @Prop({
    required: true,
    length: CODE_LENGTH,
  })
  userCode: string;

  @Prop({
    required: true,
    trim: true,
    unique: true,
    lowercase: true,
  })
  email: string;

  @Prop({
    default: '',
  })
  phone?: string;

  @Prop({
    required: true,
    default: 0,
  })
  balance: number;

  @Prop()
  debtLimit?: number;

  @Prop({
    required: true,
    default: 0,
  })
  totalTopup: number;

  @Prop({
    required: true,
    default: 0,
  })
  totalSpent: number;

  @Prop({
    required: true,
    trim: true,
    minlength: PASSWORD_MIN_LENGTH,
    select: false,
  })
  password: string;

  @Prop({
    required: true,
    type: String,
    enum: getObjectValues(Gender),
    default: Gender.Male,
  })
  gender: Gender;

  @Prop()
  birthday?: Date;

  @Prop()
  address?: string;

  @Prop({
    required: true,
    type: [
      {
        type: String,
        length: ID_LENGTH,
        ref: 'PermissionEntity',
      },
    ],
    default: [],
  })
  otherPermissionIds: string[];

  @Prop({
    required: true,
    type: String,
    enum: getObjectValues(Status),
    default: 1,
  })
  status: Status;

  @Prop({ required: true, type: String, length: ID_LENGTH, ref: 'RoleEntity' })
  roleId: string;

  @Prop({ type: String, length: ID_LENGTH, ref: 'CustomRoleEntity' })
  customRoleId?: string;

  @Prop()
  preset?: string;

  @Prop()
  twoFactorSecret?: string;

  @Prop()
  twoFactorEnabled?: boolean;

  @Prop({
    _id: false,
    type: raw({
      telegramChannelId: String,
      telegramBotToken: String,
      isNotificationEnabled: Boolean,
    }),
  })
  telegramConfig?: TelegramConfig;

  @Prop({
    ref: 'DepartmentEntity',
  })
  departmentId: string;

  @Prop()
  teleBotToken?: string;

  @Prop()
  teleChannelId?: string;

  @Prop()
  providerId?: string;

  @Prop({})
  refCode?: string;

  @Prop({
    type: String,
    ref: 'UserEntity',
  })
  referrerId?: string;

  @Prop({
    type: Number,
  })
  rateLimitBypass?: 2000;

  @Prop()
  forcePassChange?: boolean;

  @Prop({
    type: [String],
    default: [],
  })
  priceGroupIds?: string[];
}

assertSameType<User, UserEntity>();
assertSameType<UserEntity, User>();

export const UserSchema = SchemaFactory.createForClass(UserEntity);
UserSchema.virtual('role', {
  ref: 'RoleEntity',
  localField: 'roleId',
  foreignField: '_id',
  justOne: true,
});

UserSchema.virtual('customRole', {
  ref: 'CustomRoleEntity',
  localField: 'customRoleId',
  foreignField: '_id',
  justOne: true,
});

UserSchema.virtual('otherPermissions', {
  ref: 'RoleEntity',
  localField: 'otherPermissionIds',
  foreignField: '_id',
});

UserSchema.virtual('department', {
  ref: 'DepartmentEntity',
  localField: 'departmentId',
  foreignField: '_id',
  justOne: true,
});

UserSchema.virtual('avatar', {
  ref: 'ImageEntity',
  localField: 'avatarId',
  foreignField: '_id',
  justOne: true,
});

UserSchema.virtual('referrer', {
  ref: 'UserEntity',
  localField: 'referrerId',
  foreignField: '_id',
  justOne: true,
});

export type UserDocument = HydratedDocument<UserEntity> & {
  role?: RoleDocument;

  customRole?: CustomRoleDocument;

  otherPermissions?: PermissionDocument[];

  department?: DepartmentDocument;

  avatar?: ImageDocument;
};

UserSchema.pre('save', function (next: CallbackWithoutResultAndOptionalError) {
  // eslint-disable-next-line no-invalid-this
  this.email = this.email.toLowerCase();
  next();
});
