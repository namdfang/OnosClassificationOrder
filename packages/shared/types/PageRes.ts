import { z } from 'zod';

export const PageResZod = z.object({
  success: z.boolean().default(true).optional(),
  total: z.coerce.number().optional(),
  data: z.any().optional(),
});
