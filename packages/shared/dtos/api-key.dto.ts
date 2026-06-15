import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { ApiKeyEnv, ApiKeyStatus, ApiScope } from '../constants/api-key';
import { IDZod } from '../constants/common-zod';
import { ResZod } from '../types/Res';

const NAME_MAX = 100;

export const ApiKeyZod = z.object({
  _id: IDZod.optional(),
  userId: IDZod,
  publicKey: z.string(),
  secretLast4: z.string(),
  env: z.nativeEnum(ApiKeyEnv),
  name: z.string().max(NAME_MAX),
  scopes: z.array(z.nativeEnum(ApiScope)).default([]),
  status: z.nativeEnum(ApiKeyStatus),
  lastUsedAt: z.coerce.date().optional(),
  lastUsedIp: z.string().optional(),
  revokedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type ApiKey = z.infer<typeof ApiKeyZod>;

export const CreateApiKeyZod = z.object({
  name: z.string().min(1).max(NAME_MAX),
  env: z.nativeEnum(ApiKeyEnv),
  scopes: z.array(z.nativeEnum(ApiScope)).min(1),
  expiresAt: z.coerce.date().optional(),
});
export class CreateApiKeyDto extends createZodDto(extendApi(CreateApiKeyZod)) {}

export const CreateApiKeyResZod = ResZod.extend({
  data: ApiKeyZod.extend({
    publicKey: z.string(),
    secretKey: z.string(),
  }),
});
export class CreateApiKeyResDto extends createZodDto(extendApi(CreateApiKeyResZod)) {}

export const ListApiKeysResZod = ResZod.extend({
  data: ApiKeyZod.array(),
});
export class ListApiKeysResDto extends createZodDto(extendApi(ListApiKeysResZod)) {}

export const RevokeApiKeyResZod = ResZod.extend({
  data: z.object({ _id: IDZod, status: z.nativeEnum(ApiKeyStatus) }),
});
export class RevokeApiKeyResDto extends createZodDto(extendApi(RevokeApiKeyResZod)) {}

export const UpdateApiKeyZod = z
  .object({
    name: z.string().min(1).max(NAME_MAX).optional(),
    scopes: z.array(z.nativeEnum(ApiScope)).min(1).optional(),
  })
  .refine((d) => d.name !== undefined || d.scopes !== undefined, {
    message: 'At least one of name or scopes must be provided',
  });
export class UpdateApiKeyDto extends createZodDto(extendApi(UpdateApiKeyZod)) {}

export const UpdateApiKeyResZod = ResZod.extend({
  data: ApiKeyZod,
});
export class UpdateApiKeyResDto extends createZodDto(extendApi(UpdateApiKeyResZod)) {}

// ============ ADMIN ============

export const ListAllApiKeysQueryZod = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  env: z.nativeEnum(ApiKeyEnv).optional(),
  status: z.nativeEnum(ApiKeyStatus).optional(),
  search: z.string().optional(),
});
export class ListAllApiKeysQueryDto extends createZodDto(extendApi(ListAllApiKeysQueryZod)) {}

export const ApiKeyWithUserZod = ApiKeyZod.extend({
  user: z
    .object({
      _id: IDZod,
      email: z.string().optional(),
      fullName: z.string().optional(),
    })
    .optional(),
});
export type ApiKeyWithUser = z.infer<typeof ApiKeyWithUserZod>;

export const ListAllApiKeysResZod = ResZod.extend({
  data: z.object({
    items: ApiKeyWithUserZod.array(),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  }),
});
export class ListAllApiKeysResDto extends createZodDto(extendApi(ListAllApiKeysResZod)) {}
