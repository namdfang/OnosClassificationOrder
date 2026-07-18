import { z } from 'zod';

import { BaseEntityZod } from '..';

export const ContentZod = BaseEntityZod.extend({
  describe: z.string(),
});
export type Content = z.infer<typeof ContentZod>;
