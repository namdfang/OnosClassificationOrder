import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
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
  RefIDZod,
} from '@shared/constants';
import { DesignerRank, FulfillmentStage, Gender, Status } from '@shared/enums';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { getObjectValues } from '../utils/getObjectValues';

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
  roleId: RefIDZod,
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
  /**
   * Level CHÍNH THỨC của designer (S cao nhất → D) — admin set (có gợi ý từ
   * điểm hiệu suất rolling 60 ngày, endpoint `PATCH /designer/level/:userId`).
   * Về sau dùng để gán task khó/dễ theo `productConfig.level`.
   */
  designerLevel: z.nativeEnum(DesignerRank).optional(),
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
/**
 * AUTH-1 — danh tính SuperAdmin THẬT khi phiên hiện tại là phiên mạo danh.
 * Rỗng ở phiên thường. Là nguồn dữ liệu DUY NHẤT cho dải cảnh báo "đang mạo
 * danh ai" (BR-7), nên CẢ HAI endpoint `me` (`/auth/me` nhân viên và
 * `/customer/auth/me` khách) đều phải trả field này với cùng hình dạng.
 */
export const ImpersonatedByZod = z.object({
  _id: z.string(),
  fullName: z.string().optional(),
  email: z.string().optional(),
});
export type ImpersonatedBy = z.infer<typeof ImpersonatedByZod>;

export const GetMeResZod = ResZod.extend({
  data: UserZod.extend({ impersonatedBy: ImpersonatedByZod.optional() }),
});
export class GetMeResDto extends createZodDto(extendApi(GetMeResZod)) {}

// ─── AUTH-1: mạo danh tài khoản khác ────────────────────────────────
/**
 * `POST /v1/auth/impersonate`. Chỉ SuperAdmin (BR-1) — kiểm tra TƯỜNG MINH
 * trong service chứ không chỉ bằng `@Auth`, vì AC-02 đòi lần thử trái phép
 * cũng phải được ghi vết mà guard thì ném trước khi vào controller.
 */
export const StartImpersonationZod = z.object({
  targetType: z.enum(['user', 'customer']),
  targetId: IDZod,
});
export class StartImpersonationDto extends createZodDto(extendApi(StartImpersonationZod)) {}

export const ImpersonationTokenZod = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  /** Ai đang bị mạo danh — FE dùng `targetType` để điều hướng đúng khu vực (BR-5). */
  impersonating: z
    .object({
      _id: z.string(),
      fullName: z.string().optional(),
      email: z.string().optional(),
      targetType: z.enum(['user', 'customer']),
    })
    .optional(),
});
export const StartImpersonationResZod = ResZod.extend({ data: ImpersonationTokenZod });
export class StartImpersonationResDto extends createZodDto(extendApi(StartImpersonationResZod)) {}

export const StopImpersonationResZod = ResZod.extend({
  data: z.object({ accessToken: z.string(), expiresIn: z.number() }),
});
export class StopImpersonationResDto extends createZodDto(extendApi(StopImpersonationResZod)) {}

/**
 * Mã lỗi trả về khi phiên mạo danh hết hạn / đã kết thúc — KHÔNG dùng 401 trơn.
 *
 * BẮT BUỘC: `apps/web/src/apis/index.tsx` bắt 401 rồi gọi `authStore.clearToken()`,
 * mà hàm đó `resetSession()` + `sessionPersist.clearAll()` + chuyển hẳn sang trang
 * đăng nhập. Không có mã riêng thì hết hạn phiên mạo danh sẽ XOÁ SẠCH phiên thật
 * của SuperAdmin — trượt AC-09, vi phạm BR-14 ngay trên chính người đi mạo danh.
 */
export const IMPERSONATION_EXPIRED_CODE = 'error.impersonationExpired';

//
export const LoginZod = z.object({
  email: UserZod.shape.email,
  password: UserZod.shape.password,
  recaptchaToken: z.string(),
  /** Ghi nhớ đăng nhập — token TTL dài hơn + FE persist qua localStorage thay vì sessionStorage. */
  rememberMe: z.boolean().optional(),
});
export class LoginDto extends createZodDto(extendApi(LoginZod)) {}
export const LoginResZod = z.object({
  userId: IDZod,
  accessToken: z.string(),
  /** TTL thật của accessToken (giây) — FE dùng để tính tokenExpiredAt, không hardcode. */
  expiresIn: z.number(),
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
