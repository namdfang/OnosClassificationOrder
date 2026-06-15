import { createZodDto } from "@anatine/zod-nestjs";
import { extendApi } from "@anatine/zod-openapi";
import { z } from "zod";

export const IDsZod = z.object({
    ids: z.array(z.string()),
  });
  export class IDsDto extends createZodDto(extendApi(IDsZod)) {}