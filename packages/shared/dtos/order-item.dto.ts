import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  getObjectValues,
  IDZod,
  LineItemStatus,
  NAME_MIN_LENGTH,
  NameZod,
  PrintArea,
  QUANTITY_MAX,
} from '..';

export const LineItemZod = BaseEntityZod.extend({
  orderId: IDZod,
  productId: IDZod,
  variantId: IDZod,
  providerCode: z.string().optional(),
  barcode: NameZod,
  printArea: z.enum(getObjectValues(PrintArea)).optional(),
  quantity: z.number().min(1).max(QUANTITY_MAX),
  status: z.nativeEnum(LineItemStatus).default(LineItemStatus.Created),
  frontArtworkId: IDZod.optional(),
  backArtworkId: IDZod.optional(),
  leftArtworkId: IDZod.optional(),
  rightArtworkId: IDZod.optional(),
  collarArtworkId: IDZod.optional(),
  mockupIds: IDZod.array().optional(),
  basePrice: z.number(),
  providerPrice: z.number().optional(),
  subTotal: z.number(),
  total: z.number(),
  shippingFee: z.number().optional(),
  extraItemFee: z.number().optional(),
  userId: IDZod,
  sellerNote: z.string().min(DESCRIPTION_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).optional(),
  systemNote: z.string().min(DESCRIPTION_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).optional(),
  // designerName: NameZod.optional(),
  externalLink: z.string().min(NAME_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).trim().optional(),
  labelLink: z.string().min(NAME_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).trim().optional(),
  productTitle: z.string(),
  productCode: z.string(),
  variantCode: z.string(),
  options: z.string().array(),
  optionNames: z.string().array(),
  variantLabel: z.string(),
  variantSku: z.string().optional(),
  extVariantSku: z.string().optional(),
  extProductSku: z.string().optional(),
  extProductTitle: z.string().optional(),

  // for provider
  providerOptionalSku: NameZod.optional(),

  // Partner API tagging
  partnerEnv: z.enum(['test', 'live']).optional(),
});
export type LineItem = z.infer<typeof LineItemZod>;

//
export const GetLineItemsZod = PageQueryZod.extend({
  status: LineItemZod.shape.status.optional(),
});
export class GetLineItemsDto extends createZodDto(extendApi(GetLineItemsZod)) {}
export const GetLineItemsResZod = PageResZod.extend({
  data: LineItemZod.array(),
});
export class GetLineItemsResDto extends createZodDto(extendApi(GetLineItemsResZod)) {}

//
export const CreateLineItemZod = z
  .object({
    productId: LineItemZod.shape.productId,
    variantId: LineItemZod.shape.variantId,
    mockupIds: IDZod.array().max(2).optional(),
    frontArtworkId: LineItemZod.shape.frontArtworkId,
    backArtworkId: LineItemZod.shape.backArtworkId,
    leftArtworkId: LineItemZod.shape.leftArtworkId,
    rightArtworkId: LineItemZod.shape.rightArtworkId,
    collarArtworkId: LineItemZod.shape.collarArtworkId,
    quantity: LineItemZod.shape.quantity,
    sellerNote: LineItemZod.shape.sellerNote.optional(),

    // for provider
    providerOptionalSku: LineItemZod.shape.providerOptionalSku,

    // for import
    index: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mockupIds && data.mockupIds.length > 2) {
      ctx.addIssue({
        code: 'custom',
        message: 'Maximum 2 mockups are allowed',
      });
    }

    if (!data.frontArtworkId && !data.backArtworkId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Either front or back artwork is required',
      });
    }
  });
export class CreateLineItemDto extends createZodDto(extendApi(CreateLineItemZod)) {}
export const CreateLineItemResZod = ResZod.extend({
  data: LineItemZod,
});
export class CreateLineItemResDto extends createZodDto(extendApi(CreateLineItemResZod)) {}

//
export const UpdateLineItemZod = z.object({
  status: LineItemZod.shape.status.optional(),
});
export class UpdateLineItemDto extends createZodDto(extendApi(UpdateLineItemZod)) {}
export const UpdateLineItemResZod = ResZod.extend({
  data: LineItemZod,
});
export class UpdateLineItemResDto extends createZodDto(extendApi(UpdateLineItemResZod)) {}
