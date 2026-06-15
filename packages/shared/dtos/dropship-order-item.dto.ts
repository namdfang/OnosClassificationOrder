import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { BaseEntityZod, PageResZod, ResZod } from '@shared/types';
import { DESCRIPTION_MAX_LENGTH, DESCRIPTION_MIN_LENGTH, NAME_MIN_LENGTH, IDZod, QUANTITY_MAX } from '..';

export const DropShipLineItemZod = BaseEntityZod.extend({
  orderId: IDZod,
  quantity: z.number().min(1).max(QUANTITY_MAX),
  userId: IDZod,
  externalLink: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
  imageLink: z.string().min(NAME_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).trim(),
  sellerNote: z.string().min(DESCRIPTION_MIN_LENGTH).max(DESCRIPTION_MAX_LENGTH).trim().optional(),
  sku: z.string().min(1).max(DESCRIPTION_MAX_LENGTH).trim().optional(),
  title: z.string().trim().min(1).max(DESCRIPTION_MAX_LENGTH).optional(),
  color: z.string().min(1).max(DESCRIPTION_MAX_LENGTH).trim(),
  size: z.string().min(1).max(DESCRIPTION_MAX_LENGTH).trim(),
  variant: z.string().min(1).max(DESCRIPTION_MAX_LENGTH).trim(),
  weight: z.number().min(0),
  dimensions: z.string().min(1).max(DESCRIPTION_MAX_LENGTH).trim().optional(),
  productPrice: z.number().min(0),
  baseCost: z.number().min(0),
  shipFee: z.number().min(0),
  localTracking: z.string().optional(),
  cnyPrice: z.number().optional(),
  purchaseOrderIds: z.array(z.string()).optional(),
  purchaseAccount: z.string().optional(),
  // total: z.number().min(0),
});
export type DropShipLineItem = z.infer<typeof DropShipLineItemZod>;

//
export const GetDropShipLineItemsResZod = PageResZod.extend({
  data: DropShipLineItemZod.array(),
});
export class GetDropShipLineItemsResDto extends createZodDto(extendApi(GetDropShipLineItemsResZod)) {}

//
export const CreateDropShipLineItemZod = z.object({
  externalLink: DropShipLineItemZod.shape.externalLink,
  imageLink: DropShipLineItemZod.shape.imageLink,
  quantity: DropShipLineItemZod.shape.quantity,
  sellerNote: DropShipLineItemZod.shape.sellerNote,
  sku: DropShipLineItemZod.shape.sku,
  title: DropShipLineItemZod.shape.title,
  color: DropShipLineItemZod.shape.color,
  size: DropShipLineItemZod.shape.size,
  variant: DropShipLineItemZod.shape.variant,
  weight: DropShipLineItemZod.shape.weight,
  dimensions: DropShipLineItemZod.shape.dimensions,
  productPrice: DropShipLineItemZod.shape.productPrice,
  baseCost: DropShipLineItemZod.shape.baseCost,
  shipFee: DropShipLineItemZod.shape.shipFee,
  localTracking: DropShipLineItemZod.shape.localTracking,
  cnyPrice: DropShipLineItemZod.shape.cnyPrice,
  purchaseOrderIds: DropShipLineItemZod.shape.purchaseOrderIds,
  purchaseAccount: DropShipLineItemZod.shape.purchaseAccount,
  // total: DropShipLineItemZod.shape.total,
});
export class CreateDropShipLineItemDto extends createZodDto(extendApi(CreateDropShipLineItemZod)) {}
export const CreateDropShipLineItemResZod = ResZod.extend({
  data: DropShipLineItemZod,
});
export class CreateDropShipLineItemResDto extends createZodDto(extendApi(CreateDropShipLineItemResZod)) {}

//
export const UpdateDropShipLineItemResZod = ResZod.extend({
  data: DropShipLineItemZod,
});
export class UpdateDropShipLineItemResDto extends createZodDto(extendApi(UpdateDropShipLineItemResZod)) {}
