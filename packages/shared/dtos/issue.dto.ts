import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { PRIORITY_MAX, PRIORITY_MIN } from '../constants/common-length';
import { CodeZod, IDZod } from '../constants/common-zod';
import { IssueSolution, IssueStatus, IssueType } from '../constants/issue';
import { OrderZod } from './order.dto';
import { PageQueryZod } from '../types/PageQuery';
import { PageResZod } from '../types/PageRes';
import { ResZod } from '../types/Res';

export const IssueZod = z.object({
  code: CodeZod,
  orderId: IDZod,
  orderCode: z.string().optional(),
  externalId: z.string().optional(),
  userId: IDZod,
  order: OrderZod.optional(),
  status: z.nativeEnum(IssueStatus).default(IssueStatus.Opening),
  type: z.nativeEnum(IssueType),
  solution: z.nativeEnum(IssueSolution).optional(),
  priority: z.number().min(PRIORITY_MIN).max(PRIORITY_MAX),
  effectedItem: z.string().optional(),
  supportNote: z.string().optional(),
  description: z.string(),
  link: z.string().optional(),
});

export type Issue = z.infer<typeof IssueZod>;

export const createIssueZod = z.object({
  orderId: IDZod,
  externalId: z.string().optional(),
  status: z.nativeEnum(IssueStatus).default(IssueStatus.Opening),
  type: z.nativeEnum(IssueType),
  description: z.string(),
});

export class CreateIssueDto extends createZodDto(extendApi(createIssueZod)) {}

export class CreateIssuesDto extends createZodDto(extendApi(createIssueZod.array())) {}
export const CreateIssueResZod = ResZod.extend({
  data: IssueZod.array(),
});
export class CreateIssueResDto extends createZodDto(extendApi(CreateIssueResZod)) {}

export const getIssuesZod = PageQueryZod.extend({
  status: z.nativeEnum(IssueStatus).optional(),
  type: z.nativeEnum(IssueType).optional(),
  code: z.string().optional(),
});
export class GetIssuesDto extends createZodDto(extendApi(getIssuesZod)) {}
export const IssueResZod = ResZod.extend({
  data: IssueZod.array(),
  total: z.number(),
});
export const getIssuesResZod = PageResZod.extend({
  data: IssueResZod,
});
export class GetIssuesResDto extends createZodDto(extendApi(getIssuesResZod)) {}

export const GetIssueResZod = ResZod.extend({
  data: IssueZod,
});
export class GetIssueResDto extends createZodDto(extendApi(GetIssueResZod)) {}

export const UpdateIssueZod = z.object({
  status: z.nativeEnum(IssueStatus).optional(),
  type: z.nativeEnum(IssueType).optional(),
  priority: z.number().min(PRIORITY_MIN).max(PRIORITY_MAX).optional(),
  supportNote: z.string().optional(),
  description: z.string().optional(),
  link: z.string().optional(),
});
export class UpdateIssueDto extends createZodDto(extendApi(UpdateIssueZod)) {}

export const UpdateIssueResZod = ResZod.extend({
  data: IssueZod,
});
export class UpdateIssueResDto extends createZodDto(extendApi(UpdateIssueResZod)) {}

export const GenerateIssue = z.object({
  externalIds: z.array(z.string()),
});

export class GenerateIssueDto extends createZodDto(extendApi(GenerateIssue)) {}

export const IssueOrderZod = z.object({
  _id: IDZod,
  externalId: IssueZod.shape.externalId,
});

export class IssueOrderDto extends createZodDto(extendApi(IssueOrderZod)) {}

export const GenerateIssueResZod = ResZod.extend({
  data: IssueOrderZod.array(),
});
export class GenerateIssueResDto extends createZodDto(extendApi(GenerateIssueResZod)) {}

export const CheckOrderResZod = ResZod.extend({
  orderId: z.string().optional(),
});

export class CheckOrderResDto extends createZodDto(extendApi(CheckOrderResZod)) {}

export const getIssueStatisticsZod = ResZod;

export class GetIssueStatisticsResDto extends createZodDto(extendApi(getIssueStatisticsZod)) {}
