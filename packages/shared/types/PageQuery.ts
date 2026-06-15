import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

export const PageQueryZod = z.object({
  page: z.coerce.number().transform(Number).default(1),
  limit: z.coerce.number().transform(Number).default(20),
  search: z.string().trim().optional(),
  sort: z.string().trim().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  // .transform((order) => {
  //   console.log('order', order);
  //   return order === 'asc' ? 1 : -1;
  // }
  // ),
});

export class PageQueryDto extends createZodDto(extendApi(PageQueryZod)) {}
