import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import {
  CodeZod,
  DEFAULT_CURRENCY,
  EMAIL_MAX_LENGTH,
  IDZod,
  MAX_TOPUP_AMOUNT,
  MIN_TOPUP_AMOUNT,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  refineDecimalPlaces,
  TopupType,
  TransactionMethod,
  TransactionStatus,
  TransactionType,
} from '..';

export const TransactionZod = BaseEntityZod.extend({
  code: CodeZod.toUpperCase(),
  sellerNote: z.string().min(0).max(NOTE_MAX_LENGTH).optional(),
  systemNote: z.string().min(0).max(NOTE_MAX_LENGTH).optional(),
  // rejectReason: z.string().min(0).max(NOTE_MAX_LENGTH).optional(),
  externalId: z.string().max(NAME_MAX_LENGTH).optional(),
  amount: z.coerce.number().min(MIN_TOPUP_AMOUNT).max(MAX_TOPUP_AMOUNT).superRefine(refineDecimalPlaces),
  balanceBefore: z.number().nullable(),
  balanceAfter: z.number().nullable(),
  imageId: IDZod.optional(),
  referenceIds: z.array(IDZod).optional(),
  storeCode: CodeZod.optional(),
  status: z.nativeEnum(TransactionStatus).default(TransactionStatus.Pending),
  type: z.nativeEnum(TransactionType),
  topupType: z.nativeEnum(TopupType).optional(),
  method: z.nativeEnum(TransactionMethod),
  currency: z.string().default(DEFAULT_CURRENCY).optional(),
  userId: IDZod,
  processById: IDZod.nullable(),
});
export type Transaction = z.infer<typeof TransactionZod>;

//
export const GetTransactionsZod = PageQueryZod.extend({
  status: TransactionZod.shape.status.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  email: z.string().email().optional(),
  types: TransactionZod.shape.type.array().optional().or(TransactionZod.shape.type.optional()),
  topupType: TransactionZod.shape.topupType.optional(),
  method: TransactionZod.shape.method.optional(),
  externalId: z.string().optional(),
});
export class GetTransactionsDto extends createZodDto(extendApi(GetTransactionsZod)) {}
export const GetTransactionsResZod = PageResZod.extend({
  data: TransactionZod.array(),
});
export class GetTransactionsResDto extends createZodDto(extendApi(GetTransactionsResZod)) {}

//
export const GetTransactionResZod = ResZod.extend({
  data: TransactionZod,
});
export class GetTransactionResDto extends createZodDto(extendApi(GetTransactionResZod)) {}

//
export const CreateTopupRequestZod = z
  .object({
    sellerNote: TransactionZod.shape.sellerNote,
    externalId: z.string().max(NAME_MAX_LENGTH).optional(),
    amount: TransactionZod.shape.amount,
    topupType: z.nativeEnum(TopupType),
    imageId: IDZod,
  })
  .superRefine((data, ctx) => {
    if (data.topupType !== TopupType.BankTransfer && !data.externalId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Transaction ID is required when topup type is not BankTransfer',
        path: ['externalId'],
      });
    }
  });
export class CreateTopupRequestDto extends createZodDto(extendApi(CreateTopupRequestZod)) {}
export const CreateTopupRequestResZod = ResZod.extend({
  data: TransactionZod,
});
export class CreateTopupRequestResDto extends createZodDto(extendApi(CreateTopupRequestResZod)) {}

//
export const ProcessTopupRequestZod = z.object({
  transactionId: IDZod,
  systemNote: TransactionZod.shape.systemNote,
});
export class ProcessTopupRequestDto extends createZodDto(extendApi(ProcessTopupRequestZod)) {}
export const ProcessTopupRequestResZod = ResZod.extend({
  data: TransactionZod,
});
export class ProcessTopupRequestResDto extends createZodDto(extendApi(ProcessTopupRequestResZod)) {}

//
export const CreateCreditTopupZod = z.object({
  systemNote: TransactionZod.shape.systemNote,
  amount: TransactionZod.shape.amount,
  userEmail: z.string().email().max(EMAIL_MAX_LENGTH),
  sellerNote: TransactionZod.shape.sellerNote,
  externalId: z.string().optional(),
});
export type CreateCreditTopup = z.infer<typeof CreateCreditTopupZod>;
export class CreateCreditTopupDto extends createZodDto(extendApi(CreateCreditTopupZod)) {}
export const CreateCreditTopupResZod = ResZod.extend({
  data: TransactionZod,
});
export class CreateCreditTopupResDto extends createZodDto(extendApi(CreateCreditTopupResZod)) {}

//
export const RejectTopupRequestZod = z.object({
  transactionId: IDZod,
  systemNote: TransactionZod.shape.systemNote,
});
export class RejectTopupRequestDto extends createZodDto(extendApi(RejectTopupRequestZod)) {}
export const RejectTopupRequestResZod = ResZod.extend({
  data: TransactionZod,
});
export class RejectTopupRequestResDto extends createZodDto(extendApi(RejectTopupRequestResZod)) {}

//
export const UpdateTransactionZod = z.object({
  status: TransactionZod.shape.status.optional(),
});
export class UpdateTransactionDto extends createZodDto(extendApi(UpdateTransactionZod)) {}
export const UpdateTransactionResZod = ResZod.extend({
  data: TransactionZod,
});
export class UpdateTransactionResDto extends createZodDto(extendApi(UpdateTransactionResZod)) {}

const getTransactionStatisticsZod = z.object({
  status: TransactionZod.shape.status.optional(),
  // storeCode: z.string().optional(),
});
export class GetTransactionStatisticsDto extends createZodDto(extendApi(getTransactionStatisticsZod)) {}
export const GetTransactionStatisticsResZod = ResZod;
export class GetTransactionStatisticsResDto extends createZodDto(extendApi(GetTransactionStatisticsResZod)) {}

export const CreatePaymentLinkZod = z.object({
  amount: TransactionZod.shape.amount,
});
export class CreatePaymentLinkDto extends createZodDto(extendApi(CreatePaymentLinkZod)) {}
