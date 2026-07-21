import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { BaseEntityZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { DESCRIPTION_MAX_LENGTH, DESCRIPTION_MIN_LENGTH, NAME_MIN_LENGTH, QUANTITY_MAX } from '../constants/common-length';
import { IDZod } from '../constants/common-zod';

export const StockLineItemZod = BaseEntityZod.extend({
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
  // total: z.number().min(0),
});
export type StockLineItem = z.infer<typeof StockLineItemZod>;

//
export const GetStockLineItemsResZod = PageResZod.extend({
  data: StockLineItemZod.array(),
});
export class GetStockLineItemsResDto extends createZodDto(extendApi(GetStockLineItemsResZod)) {}

//
export const CreateStockLineItemZod = z.object({
  externalLink: StockLineItemZod.shape.externalLink,
  imageLink: StockLineItemZod.shape.imageLink,
  quantity: StockLineItemZod.shape.quantity,
  sellerNote: StockLineItemZod.shape.sellerNote,
  sku: StockLineItemZod.shape.sku,
  title: StockLineItemZod.shape.title,
  color: StockLineItemZod.shape.color,
  size: StockLineItemZod.shape.size,
  variant: StockLineItemZod.shape.variant,
  weight: StockLineItemZod.shape.weight,
  dimensions: StockLineItemZod.shape.dimensions,
  productPrice: StockLineItemZod.shape.productPrice,
  baseCost: StockLineItemZod.shape.baseCost,
  shipFee: StockLineItemZod.shape.shipFee,
  localTracking: StockLineItemZod.shape.localTracking,
  cnyPrice: StockLineItemZod.shape.cnyPrice,
  // total: StockLineItemZod.shape.total,
});
export class CreateStockLineItemDto extends createZodDto(extendApi(CreateStockLineItemZod)) {}
export const CreateStockLineItemResZod = ResZod.extend({
  data: StockLineItemZod,
});
export class CreateStockLineItemResDto extends createZodDto(extendApi(CreateStockLineItemResZod)) {}

//
export const UpdateStockLineItemResZod = ResZod.extend({
  data: StockLineItemZod,
});
export class UpdateStockLineItemResDto extends createZodDto(extendApi(UpdateStockLineItemResZod)) {}
