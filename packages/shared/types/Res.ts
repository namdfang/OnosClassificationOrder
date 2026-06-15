import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

export const ResZod = z.object({
  success: z.boolean().default(true).optional(),
  data: z.any().default(null).optional(),
  message: z.string().default('Success').optional(),
});

export class ResDto extends createZodDto(extendApi(ResZod)) {}
