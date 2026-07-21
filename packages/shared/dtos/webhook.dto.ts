import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { IDZod } from '../constants/common-zod';
import { Status } from '../enums/commons';
import { WebhookTopic } from '../enums/webhook';
import { BaseEntityZod } from '../types/BaseEntity';
import { PageQueryZod } from '../types/PageQuery';
import { PageResZod } from '../types/PageRes';
import { ResZod } from '../types/Res';

export const WebhookZod = BaseEntityZod.extend({
  name: z.string(),
  url: z.string(),
  topic: z.nativeEnum(WebhookTopic),
  status: z.nativeEnum(Status).default(Status.Active),
  userId: IDZod,
});
export type Webhook = z.infer<typeof WebhookZod>;

export const GetWebhooksZod = PageQueryZod.extend({
  name: WebhookZod.shape.name.optional(),
  status: WebhookZod.shape.status.optional(),
  topic: WebhookZod.shape.topic.optional(),
});
export class GetWebhooksDto extends createZodDto(extendApi(GetWebhooksZod)) {}

export const GetWebhooksResZod = PageResZod.extend({
  data: WebhookZod.array(),
});
export class GetWebhooksResDto extends createZodDto(extendApi(GetWebhooksResZod)) {}

export const GetWebhookResZod = ResZod.extend({
  data: WebhookZod,
});
export class GetWebhookResDto extends createZodDto(extendApi(GetWebhookResZod)) {}

export const CreateWebhookZod = z.object({
  name: z.string(),
  url: z.string(),
  topic: z.nativeEnum(WebhookTopic),
});
export class CreateWebhookDto extends createZodDto(extendApi(CreateWebhookZod)) {}

export const CreateWebhookResZod = ResZod.extend({
  data: WebhookZod,
});
export class CreateWebhookResDto extends createZodDto(extendApi(CreateWebhookResZod)) {}

export const UpdateWebhookZod = z.object({
  name: z.string().optional(),
  url: z.string().optional(),
  topic: z.nativeEnum(WebhookTopic).optional(),
  status: z.nativeEnum(Status).optional(),
});
export class UpdateWebhookDto extends createZodDto(extendApi(UpdateWebhookZod)) {}

export const UpdateWebhookResZod = ResZod.extend({
  data: WebhookZod,
});
export class UpdateWebhookResDto extends createZodDto(extendApi(UpdateWebhookResZod)) {}
