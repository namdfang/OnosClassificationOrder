import { z } from 'zod';

import { FileType, getObjectValues, IDZod, ImageType, ResZod, Status, UserZod } from '..';
import { createZodDto } from '@anatine/zod-nestjs';

export const ResImageZod = z.object({
  _id: IDZod,
  fileName: z.string().optional(),
  url: z.string(),
  folderId: IDZod.optional(),
  previewUrl: z.string(),
  thumbUrl: z.string().optional(),
  status: z.enum(getObjectValues(Status)).default(Status.Active).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  user: UserZod.optional(),
});
export type ResImage = z.infer<typeof ResImageZod>;
export class ResImageDto extends createZodDto(ResImageZod) {}

//
export const ResFileZod = z.object({
  _id: IDZod,
  fileName: z.string().optional(),
  url: z.string(),
  thumbUrl: z.string().optional(),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
});
export class ResFileDto extends createZodDto(ResFileZod) {}

//
export const UploadImageZod = z.object({
  type: z.nativeEnum(ImageType),
});
export class UploadImageDto extends createZodDto(UploadImageZod) {}
export const UploadImageResZod = ResZod.extend({
  data: ResImageZod,
});
export class UploadImageResDto extends createZodDto(UploadImageResZod) {}

//
export const UploadFileZod = z.object({
  type: z.nativeEnum(FileType),
});
export class UploadFileDto extends createZodDto(UploadFileZod) {}
export const UploadFileResZod = ResZod.extend({
  data: ResFileZod,
});
export class UploadFileResDto extends createZodDto(UploadFileResZod) {}
