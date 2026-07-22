import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import {
  CodeZod,
  NAME_MAX_LENGTH,
  NameZod,
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  PRICE_MAX,
  refineDecimalPlaces,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from '@shared/constants';
import { IDZod, PriceZod } from '@shared/constants';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { Status } from '../enums/commons';
import { getObjectValues } from '../utils/getObjectValues';
import { ProductAttributeZod } from './product.dto';

const ProductVariantZod = BaseEntityZod.extend({
  productId: IDZod,
  providerId: IDZod,
  title: z.string().min(TITLE_MIN_LENGTH).max(TITLE_MAX_LENGTH).trim().optional(),
  code: CodeZod.trim().toUpperCase(),
  sku: z.string().min(0).max(NAME_MAX_LENGTH).trim().optional(),
  providerSku: NameZod.optional(),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
  description: z.string().optional(),
  quantity: z.number().nullable(),
  stockQuantity: z.coerce.number().min(0).max(99999).optional(),
  price: PriceZod,
  providerPrice: PriceZod.optional(),
  baseCost: PriceZod,
  shippingFee: z.number().min(0).max(PRICE_MAX).default(0).superRefine(refineDecimalPlaces),
  extraItemFee: z.number().min(0).max(PRICE_MAX).default(0).superRefine(refineDecimalPlaces).optional(),
  weight: z.number().min(0).optional(),
  options: z.array(z.string().min(1).max(NAME_MAX_LENGTH).trim()).min(1),
  note: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).optional(),
  attributes: z.array(ProductAttributeZod).optional(),
  createdById: IDZod,
  updatedById: IDZod,
});
export type ProductVariant = z.infer<typeof ProductVariantZod>;

//
export const ProductVariantResZod = ResZod.extend({
  data: ProductVariantZod,
});
export class ProductVariantResDto extends createZodDto(extendApi(ProductVariantResZod)) {}

//
export const GetProductVariantsZod = PageQueryZod;
export class GetProductVariantsDto extends createZodDto(extendApi(GetProductVariantsZod)) {}
export const GetProductVariantsResZod = PageResZod.extend({
  data: ProductVariantZod.array(),
});
export class GetProductVariantsResDto extends createZodDto(extendApi(GetProductVariantsResZod)) {}

//
export const CreateProductVariantZod = z.object({
  providerId: ProductVariantZod.shape.providerId,
  title: ProductVariantZod.shape.title,
  sku: ProductVariantZod.shape.sku.optional(),
  providerSku: ProductVariantZod.shape.providerSku.optional(),
  description: ProductVariantZod.shape.description,
  quantity: ProductVariantZod.shape.quantity,
  stockQuantity: ProductVariantZod.shape.stockQuantity,
  price: ProductVariantZod.shape.price,
  providerPrice: ProductVariantZod.shape.providerPrice,
  shippingFee: ProductVariantZod.shape.shippingFee,
  weight: ProductVariantZod.shape.weight,
  extraItemFee: ProductVariantZod.shape.extraItemFee,
  status: ProductVariantZod.shape.status,
  options: ProductVariantZod.shape.options,
  note: ProductVariantZod.shape.note,
  attributes: ProductVariantZod.shape.attributes,
});
export class CreateProductVariantDto extends createZodDto(extendApi(CreateProductVariantZod)) {}

//
export const UpdateProductVariantZod = CreateProductVariantZod.extend({
  id: IDZod.optional(),
  isUpdated: z.boolean().optional(),
  stockQuantity: ProductVariantZod.shape.stockQuantity,
});
export class UpdateProductVariantDto extends createZodDto(extendApi(UpdateProductVariantZod)) {}

//
// export const UpdateProductVariantZod = CreateProductVariantZod.partial();
// export class UpdateProductVariantDto extends createZodDto(extendApi(UpdateProductVariantZod)) {}
// export const UpdateProductVariantResZod = ResZod.extend({
//   data: ProductVariantZod,
// });
// export class UpdateProductVariantResDto extends createZodDto(extendApi(UpdateProductVariantResZod)) {}

//
export const DeleteProductVariantResZod = ResZod.extend({
  data: ProductVariantZod.nullable(),
});
export class DeleteProductVariantResDto extends createZodDto(extendApi(DeleteProductVariantResZod)) {}

//
export const GetProductVariantsByCodesZod = z.object({
  codes: z.array(CodeZod).min(1),
});
export class GetProductVariantsByCodesDto extends createZodDto(extendApi(GetProductVariantsByCodesZod)) {}
export const GetProductVariantsByCodesResZod = ResZod.extend({
  data: z.object({
    existing: ProductVariantZod.array(),
    nonExisting: z.array(CodeZod),
  }),
});
export class GetProductVariantsByCodesResDto extends createZodDto(extendApi(GetProductVariantsByCodesResZod)) {}

export const ProductVariantLogZod = BaseEntityZod.extend({
  productVariantId: IDZod,
  after: z.string(),
  before: z.string(),
  userId: IDZod,
  field: z.string(),
  type: z.string(),
  note: z.string(),
});
export type ProductVariantLog = z.infer<typeof ProductVariantLogZod>;

export const ProductVariantLogResZod = ResZod.extend({
  data: ProductVariantLogZod,
});
export class ProductVariantLogsResDto extends createZodDto(extendApi(ProductVariantLogResZod)) {}

export const ProductVariantLogTypeZod = z.enum(['Update', 'Refund', 'Charge']);
export type ProductVariantLogType = z.infer<typeof ProductVariantLogTypeZod>;
