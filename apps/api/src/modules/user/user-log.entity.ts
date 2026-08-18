import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import mongoose, { type HydratedDocument } from 'mongoose';
import { getObjectValues, type UserLog, UserLogType } from 'shared';

import type { UserDocument } from './user.entity';

@DatabaseEntity({ collection: 'userLogs' })
export class UserLogEntity extends DatabaseEntityAbstract {
  @Prop({
    ref: 'UserEntity',
  })
  actorId: string;

  /**
   * AUTH-1 AC-06 — SuperAdmin THẬT khi thay đổi phát sinh trong phiên mạo danh.
   * `actorId` vẫn là danh tính hiệu lực (người bị mạo danh); field này cho biết
   * ai thực sự ngồi gõ. Rỗng ở phiên thường.
   *
   * PHẢI có `@Prop` chứ không chỉ khai trong `UserLogZod`: Mongoose chạy strict
   * mode nên field không có trong schema bị **âm thầm loại bỏ** lúc ghi — không
   * lỗi, không cảnh báo, chỉ là dữ liệu biến mất. Đó chính là nguyên nhân bug
   * `AUTH-1-B1`.
   *
   * `assertSameType<UserLog, UserLogEntity>()` bên dưới KHÔNG bắt được ca này:
   * `impersonatorId` là optional, mà TypeScript coi một type thiếu property
   * optional vẫn assignable — nên typecheck xanh trong khi schema và DTO đã lệch.
   * Thêm field optional mới thì phải tự soát cả hai nơi.
   */
  @Prop({
    ref: 'UserEntity',
    index: true,
  })
  impersonatorId?: string;

  @Prop({
    ref: 'UserEntity',
  })
  userId: string;

  @Prop()
  field: string;

  @Prop({
    type: mongoose.Schema.Types.Mixed,
  })
  before?: unknown;

  @Prop({
    type: mongoose.Schema.Types.Mixed,
  })
  after?: unknown;

  @Prop({
    required: true,
    type: String,
    enum: getObjectValues(UserLogType),
  })
  type: UserLogType;
}

assertSameType<UserLog, UserLogEntity>();
assertSameType<UserLogEntity, UserLog>();

export const UserLogSchema = SchemaFactory.createForClass(UserLogEntity);

UserLogSchema.virtual('user', {
  ref: 'UserEntity',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

UserLogSchema.virtual('actor', {
  ref: 'UserEntity',
  localField: 'actorId',
  foreignField: '_id',
  justOne: true,
});
export type UserLogDocument = HydratedDocument<UserLogEntity> & {
  user?: UserDocument;
};
