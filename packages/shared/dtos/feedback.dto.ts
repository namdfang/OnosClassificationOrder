import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { IDZod } from '../constants/common-zod';
import { FeedbackStatus, FeedbackType } from '../constants/feedback';
import { PageQueryZod } from '../types/PageQuery';
import { ResZod } from '../types/Res';

const TITLE_MAX = 200;
const CONTENT_MAX = 5000;
const REPLY_MAX = 5000;

export const FeedbackImageZod = z.object({
  _id: IDZod.optional(),
  url: z.string(),
  previewUrl: z.string().optional(),
  thumbUrl: z.string().optional(),
});
export type FeedbackImage = z.infer<typeof FeedbackImageZod>;

export const FeedbackReplyZod = z.object({
  _id: IDZod.optional(),
  content: z.string().max(REPLY_MAX),
  imageIds: z.array(IDZod).default([]),
  images: z.array(FeedbackImageZod).optional(),
  repliedById: IDZod,
  repliedAt: z.coerce.date(),
  repliedByName: z.string().optional(),
  isAdminReply: z.boolean().optional(),
});
export type FeedbackReply = z.infer<typeof FeedbackReplyZod>;

export const FeedbackZod = z.object({
  _id: IDZod.optional(),
  userId: IDZod,
  userName: z.string().optional(),
  userEmail: z.string().optional(),
  isAnonymous: z.boolean().default(false),
  type: z.nativeEnum(FeedbackType),
  title: z.string().max(TITLE_MAX).optional(),
  content: z.string().min(1).max(CONTENT_MAX),
  imageIds: z.array(IDZod).default([]),
  images: z.array(FeedbackImageZod).optional(),
  status: z.nativeEnum(FeedbackStatus).default(FeedbackStatus.Open),
  replies: z.array(FeedbackReplyZod).default([]),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type Feedback = z.infer<typeof FeedbackZod>;

export const CreateFeedbackZod = z.object({
  type: z.nativeEnum(FeedbackType),
  title: z.string().max(TITLE_MAX).optional(),
  content: z.string().min(1).max(CONTENT_MAX),
  imageIds: z.array(IDZod).optional().default([]),
  isAnonymous: z.boolean().optional().default(false),
});
export class CreateFeedbackDto extends createZodDto(extendApi(CreateFeedbackZod)) {}

export const CreateFeedbackResZod = ResZod.extend({
  data: FeedbackZod,
});
export class CreateFeedbackResDto extends createZodDto(extendApi(CreateFeedbackResZod)) {}

export const GetFeedbacksZod = PageQueryZod.extend({
  type: z.nativeEnum(FeedbackType).optional(),
  status: z.nativeEnum(FeedbackStatus).optional(),
  scope: z.enum(['mine', 'all']).optional(),
});
export class GetFeedbacksDto extends createZodDto(extendApi(GetFeedbacksZod)) {}

export const GetFeedbacksResZod = ResZod.extend({
  data: FeedbackZod.array(),
  total: z.number(),
  unrepliedCount: z.number().optional(),
});
export class GetFeedbacksResDto extends createZodDto(extendApi(GetFeedbacksResZod)) {}

export const GetFeedbackResZod = ResZod.extend({
  data: FeedbackZod,
});
export class GetFeedbackResDto extends createZodDto(extendApi(GetFeedbackResZod)) {}

export const ReplyFeedbackZod = z.object({
  content: z.string().min(1).max(REPLY_MAX),
  imageIds: z.array(IDZod).optional().default([]),
});
export class ReplyFeedbackDto extends createZodDto(extendApi(ReplyFeedbackZod)) {}

export const UpdateFeedbackStatusZod = z.object({
  status: z.nativeEnum(FeedbackStatus),
});
export class UpdateFeedbackStatusDto extends createZodDto(extendApi(UpdateFeedbackStatusZod)) {}

export const UpdateFeedbackResZod = ResZod.extend({
  data: FeedbackZod,
});
export class UpdateFeedbackResDto extends createZodDto(extendApi(UpdateFeedbackResZod)) {}
