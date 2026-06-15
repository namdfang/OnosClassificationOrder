import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { BaseEntityZod, getObjectValues, ResImageZod, Status } from '..';

export const ResArtworkZod = ResImageZod;
export type ResArtwork = z.infer<typeof ResArtworkZod>;

//
export const GetArtworksZod = PageQueryZod.extend({
  email: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export class GetArtworksDto extends createZodDto(extendApi(GetArtworksZod)) {}
export const GetArtworksResZod = PageResZod.extend({
  data: ResArtworkZod.array(),
});
export class GetArtworksResDto extends createZodDto(extendApi(GetArtworksResZod)) {}

//
export const DeleteArtworkResZod = ResZod.extend({
  data: ResArtworkZod.nullable(),
});
export class DeleteArtworkResDto extends createZodDto(extendApi(DeleteArtworkResZod)) {}

const FolderZod = BaseEntityZod.extend({
  name: z.string().min(1, 'Name is required').max(255),
  userId: z.string().min(1, 'User ID is required'),
  status: z.enum(getObjectValues(Status)).default(Status.Inactive),
  parentFolderId: z.string().optional(),
  meta: z.record(z.string()).optional(),
  createdById: z.string().min(1, 'Created By ID is required'),
  updatedById: z.string().min(1, 'Updated By ID is required'),
  deleteById: z.string().optional(),
});
export type FolderArtwork = z.infer<typeof FolderZod>;
export const CreateFolderArtworkZod = FolderZod.pick({
  name: true,
  parentFolderId: true,
});
export class CreateFolderArtworkDto extends createZodDto(CreateFolderArtworkZod) {}

export const FolderResZod = FolderZod.pick({
  name: true,
  parentFolderId: true,
  _id: true,
});

export const ChangeParentFolderZod = z.object({
  folderId: z.string(),
  imageIds: z.array(z.string()),
});
export class ChangeParentFolderDto extends createZodDto(extendApi(ChangeParentFolderZod)) {}
