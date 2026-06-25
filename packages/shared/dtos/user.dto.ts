import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import {
  ADDRESS_MAX_LENGTH,
  ADDRESS_MIN_LENGTH,
  CodeZod,
  EMAIL_MAX_LENGTH,
  EMAIL_MIN_LENGTH,
  IDZod,
  NameZod,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PHONE_MAX_LENGTH,
  // PHONE_MIN_LENGTH,
} from '@shared/constants';
import { FulfillmentStage, Gender, Status } from '@shared/enums';
import { getObjectValues } from '..';

const TelegramConfigZod = z.object({
  telegramChannelId: z.string(),
  telegramBotToken: z.string(),
  isNotificationEnabled: z.boolean(),
});
export type TelegramConfig = z.infer<typeof TelegramConfigZod>;

//
export const UserZod = BaseEntityZod.extend({
  fullName: NameZod,
  userCode: CodeZod,
  email: z.string().email().toLowerCase().min(EMAIL_MIN_LENGTH).max(EMAIL_MAX_LENGTH).trim(),
  phone: z.string().min(0).max(PHONE_MAX_LENGTH).optional(),
  balance: z.number().default(0),
  debtLimit: z.coerce.number().min(-5000).max(0).optional(),
  totalTopup: z.number().default(0),
  totalSpent: z.number().default(0),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  gender: z.enum(getObjectValues(Gender)).default(Gender.Male),
  birthday: z.date().optional(),
  address: z.string().min(ADDRESS_MIN_LENGTH).max(ADDRESS_MAX_LENGTH).optional(),
  otherPermissionIds: z.array(IDZod).default([]),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
  roleId: IDZod,
  customRoleId: z.string().optional(),
  secret: z.string().optional(),
  twoFactorEnabled: z.boolean().optional(),
  telegramConfig: TelegramConfigZod.optional(),
  departmentId: IDZod,
  teleBotToken: z.string().optional(),
  teleChannelId: z.string().optional(),
  avatarId: z.string().optional(),

  // For provider only
  providerId: IDZod.optional(),
  refCode: z.string().optional(),
  referrerId: z.string().optional(),
  forcePassChange: z.coerce.boolean().optional(),

  // Pricing
  priceGroupIds: z.array(IDZod).optional(),

  /** Per-user Telegram chat ID — leader nhập hộ hoặc user tự cập nhật ở /account. */
  telegramChatId: z.string().optional(),
  /** Ngày vào làm — hiển thị ở /designer/team. Optional. */
  hireDate: z.date().optional(),
  /**
   * Required khi role=Fulfillment (BE enforce). User Fulfillment scope chỉ
   * thấy đơn ở factory này (current factoryId hoặc originalFactoryId).
   */
  factoryId: IDZod.optional(),
  /**
   * Required khi role=Fulfillment — 1 trong 5 stage (print/press/qc/sew/pack).
   * BE enforce unique constraint `(factoryId, fulfillmentStage)` — chỉ 1 user
   * Fulfillment per (xưởng, stage). User Fulfillment chỉ thấy đơn đang ở
   * `currentFulfillmentStage = fulfillmentStage` của mình.
   */
  fulfillmentStage: z.nativeEnum(FulfillmentStage).optional(),
});
export type User = z.infer<typeof UserZod>;

//
export const GetUsersZod = PageQueryZod.extend({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  providerId: IDZod.optional(),
});
export class GetUsersDto extends createZodDto(extendApi(GetUsersZod)) {}
export const GetUsersResZod = PageResZod.extend({
  data: UserZod.array(),
});
export class GetUsersResDto extends createZodDto(extendApi(GetUsersResZod)) {}

//
export const UpdateUserZod = z.object({
  fullName: UserZod.shape.fullName.optional(),
  email: UserZod.shape.email.optional(),
  phone: UserZod.shape.phone.optional(),
  roleId: UserZod.shape.roleId.optional(),
  customRoleId: UserZod.shape.customRoleId.optional(),
  otherPermissionIds: UserZod.shape.otherPermissionIds,
  gender: UserZod.shape.gender.optional(),
  address: UserZod.shape.address.optional(),
  departmentId: UserZod.shape.departmentId.optional(),
  status: UserZod.shape.status.optional(),
  teleBotToken: UserZod.shape.teleBotToken.optional(),
  teleChannelId: UserZod.shape.teleChannelId.optional(),
  providerId: UserZod.shape.providerId.optional(),
  avatarId: UserZod.shape.avatarId.optional(),
  priceGroupIds: UserZod.shape.priceGroupIds,
  telegramChatId: UserZod.shape.telegramChatId,
  hireDate: UserZod.shape.hireDate,
  factoryId: UserZod.shape.factoryId,
  fulfillmentStage: UserZod.shape.fulfillmentStage,
});
export class UpdateUserDto extends createZodDto(extendApi(UpdateUserZod)) {}
export const UpdateUserResZod = ResZod.extend({
  data: UserZod,
});
export class UpdateUserResDto extends createZodDto(extendApi(UserZod)) {}

//
export const SetDebtLimitZpd = z.object({
  userId: IDZod,
  debtLimit: z.coerce.number().min(-5000).max(0),
});
export class SetDebtLimitDto extends createZodDto(extendApi(SetDebtLimitZpd)) {}

//
export const CreateUserZod = z.object({
  fullName: UserZod.shape.fullName,
  email: UserZod.shape.email,
  phone: UserZod.shape.phone.optional(),
  roleId: UserZod.shape.roleId,
  customRoleId: UserZod.shape.customRoleId.optional(),
  otherPermissionIds: UserZod.shape.otherPermissionIds,
  gender: UserZod.shape.gender.optional(),
  address: UserZod.shape.address.optional(),
  departmentId: UserZod.shape.departmentId.optional(),
  providerId: UserZod.shape.providerId.optional(),
  password: UserZod.shape.password,
  telegramChatId: UserZod.shape.telegramChatId,
  hireDate: UserZod.shape.hireDate,
  factoryId: UserZod.shape.factoryId,
  fulfillmentStage: UserZod.shape.fulfillmentStage,
});
export type CreateUser = z.infer<typeof CreateUserZod>;
export class CreateUserDto extends createZodDto(extendApi(CreateUserZod)) {}

export const RegisterZod = z.object({
  email: UserZod.shape.email,
  fullName: UserZod.shape.fullName,
  password: UserZod.shape.password,
  passwordConfirm: UserZod.shape.password,
  refCode: z.string().optional(),
  recaptchaToken: z.string(),
});
export class RegisterDto extends createZodDto(extendApi(RegisterZod)) {}

export const CreateUserResZod = ResZod.extend({
  data: UserZod,
});
export class CreateUserResDto extends createZodDto(extendApi(CreateUserResZod)) {}

//
export const GetMeResZod = ResZod.extend({
  data: UserZod,
});
export class GetMeResDto extends createZodDto(extendApi(GetMeResZod)) {}

//
export const LoginZod = z.object({
  email: UserZod.shape.email,
  password: UserZod.shape.password,
  recaptchaToken: z.string(),
});
export class LoginDto extends createZodDto(extendApi(LoginZod)) {}
export const LoginResZod = z.object({
  userId: IDZod,
  accessToken: z.string(),
  user: UserZod,
  // refreshToken: z.string(),
});
export class LoginResDto extends createZodDto(extendApi(LoginResZod)) {}

// export const TokenPayloadZod = z.object({
//   expiresIn: z.number(),
//   accessToken: z.string(),
// });

export const TeleMessageZod = z.object({
  userId: z.string(),
  message: z.string(),
});
export class TeleMessageDto extends createZodDto(extendApi(TeleMessageZod)) {}

export const ResetPasswordZod = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});
export class ResetPasswordDto extends createZodDto(extendApi(ResetPasswordZod)) {}

export const ActivitiesZod = PageQueryZod.extend({
  email: z.string().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export class ActivitiesDto extends createZodDto(extendApi(ActivitiesZod)) {}

export const ChangePasswordZod = z
  .object({
    oldPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    newConfirmPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.newConfirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Confirm password not match',
        path: ['newConfirmPassword'],
      });
    }

    for (const [key, value] of Object.entries(data)) {
      if (!value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'All fields are required',
          path: [key],
        });
      }
    }
  });
export class ChangePasswordDto extends createZodDto(extendApi(ChangePasswordZod)) {}

//
export const GetReferrerUsersZod = PageQueryZod.extend({
  refUserId: IDZod.optional(),
  refUserEmail: z.string().email().optional(),
});
export class GetReferrerUsersDto extends createZodDto(extendApi(GetReferrerUsersZod)) {}
