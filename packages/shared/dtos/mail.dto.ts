import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';
import { getObjectValues, MailStatus, MailType, PageQueryZod, PageResZod, VNDateZod } from '..';

export const DataMailZod = z.object({
  template: z.string(),
  dataTemplate: z.any(),
  to: z.string(),
  subject: z.string(),
  text: z.string(),
});
export class DataMailDto extends createZodDto(extendApi(DataMailZod)) {}

export const CreateEmailServerZod = z.object({
  to: z.string(),
  subject: z.string(),
  text: z.string(),
});
export class CreateEmailServerDto extends createZodDto(extendApi(CreateEmailServerZod)) {}

export const SendMailPaymentZod = z.object({
  name: z.string(),
  email: z.string(),
  title: z.string(),
  subject: z.string(),
  amount: z.string(),
  balance: z.string(),
});
export class SendMailPaymentDto extends createZodDto(extendApi(SendMailPaymentZod)) {}

export const MailTemplateZod = z.object({
  name: z.nativeEnum(MailType),
  body: z.string(),
  variables: z.array(z.string()),
});
export type MailTemplate = z.infer<typeof MailTemplateZod>;

export const MailHistoryZod = z.object({
  email: z.string(),
  body: z.string(),
  topic: z.nativeEnum(MailType),
  status: z.nativeEnum(MailStatus),
  subject: z.string().optional(),
  scheduledTime: z.string().optional(),
});
export type MailHistory = z.infer<typeof MailHistoryZod>;

export const GetMailTemplatesResZod = PageResZod.extend({
  data: MailTemplateZod.array(),
});
export class GetMailTemplatesResDto extends createZodDto(extendApi(GetMailTemplatesResZod)) {}

export const GetMailHistoryZod = PageQueryZod.extend({
  email: z.string().optional(),
  status: z.nativeEnum(MailStatus).optional(),
  topic: z.nativeEnum(MailType).optional(),
  subject: z.string().optional(),
});
export class GetMailHistoryDto extends createZodDto(extendApi(GetMailHistoryZod)) {}

export const GetMailHistoryResZod = PageResZod.extend({
  data: MailHistoryZod.array(),
});
export class GetMailHistoryResDto extends createZodDto(extendApi(GetMailHistoryResZod)) {}

export const CreateMailTemplateZod = z.object({
  name: MailTemplateZod.shape.name,
  body: MailTemplateZod.shape.body,
  variables: MailTemplateZod.shape.variables,
});
export class CreateMailTemplateDto extends createZodDto(extendApi(CreateMailTemplateZod)) {}

export const UpdateMailTemplateZod = z.object({
  name: MailTemplateZod.shape.name.optional(),
  body: MailTemplateZod.shape.body.optional(),
  variables: MailTemplateZod.shape.variables.optional(),
});
export class UpdateMailTemplateDto extends createZodDto(extendApi(UpdateMailTemplateZod)) {}

export const SendMailZod = z.object({
  email: z.string(),
  name: z.string(),
  subject: z.string(),
  body: z.string(),
});
export class SendMailDto extends createZodDto(extendApi(SendMailZod)) {}

export const ScheduleMailZod = z.object({
  type: z.enum(getObjectValues(MailType)).optional(),
  scheduleTime: z.string(),
  scheduleDate: VNDateZod,
  variables: SendMailZod
});
export class ScheduleMailDto extends createZodDto(extendApi(ScheduleMailZod)) {}

export const MailIdsZod = z.object({
  ids: z.array(z.string()),
});
export class MailIdsDto extends createZodDto(extendApi(MailIdsZod)) {}