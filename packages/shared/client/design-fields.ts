import { z } from 'zod';

/**
 * Link thiết kế theo vị trí in — key khớp `printArea[].key` của sản phẩm.
 * Nằm ở `client/` (KHÔNG import NestJS) để app browser (`apps/seller`) dùng runtime
 * qua `shared/client`; `dtos/production-order.dto.ts` re-export để BE/`apps/web` không đổi.
 */
export const DesignFieldsZod = z.object({
  front: z.string().optional(),
  back: z.string().optional(),
  sleeve: z.string().optional(),
  hood: z.string().optional(),
  folder: z.string().optional(),
  placket: z.string().optional(),
  chestLeft: z.string().optional(),
  chestRight: z.string().optional(),
  left: z.string().optional(),
  right: z.string().optional(),
  sleeveLeft: z.string().optional(),
  sleeveRight: z.string().optional(),
  leftUpperSleeve: z.string().optional(),
  rightUpperSleeve: z.string().optional(),
  leftCuff: z.string().optional(),
  rightCuff: z.string().optional(),
  frontEmbroidery: z.string().optional(),
  backEmbroidery: z.string().optional(),
});
export type DesignFields = z.infer<typeof DesignFieldsZod>;
