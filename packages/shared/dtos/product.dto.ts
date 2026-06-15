import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import {
  IDZod,
  MAX_PRODUCT_OPTION_LENGTH,
  NAME_MIN_LENGTH,
  NameZod,
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  PRICE_MAX,
  PriceZod,
  refineDecimalPlaces,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from '@shared/constants';
import { ResImageZod } from './upload.dto';
import { CreateProductVariantZod, UpdateProductVariantZod } from './product-variant.dto';
import { Status, Tier } from '../enums';
import { BooleanZod, CategoryZod, getObjectValues, ID_LENGTH, UserZod } from '..';

const ArtworkRequirementsZod = z.object({
  dpi: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type ArtworkRequirements = z.infer<typeof ArtworkRequirementsZod>;

export const ProductAttributeZod = z.object({
  name: z.string(),
  values: z.string().array(),
});
export type ProductAttribute = z.infer<typeof ProductAttributeZod>;

const ProductProviderZod = z.object({
  providerId: IDZod,
  variantIds: z.array(IDZod),
  variantSummary: z.array(z.number()),
  variantCount: z.number(),
  status: z.string().optional(),
});
export type ProductProvider = z.infer<typeof ProductProviderZod>;

const CreateProductProviderZod = z.object({
  providerId: IDZod,
  variants: z.array(CreateProductVariantZod),
});
export type CreateProductProvider = z.infer<typeof CreateProductProviderZod>;

const UpdateProductProviderZod = z.object({
  providerId: IDZod,
  variants: z.array(UpdateProductVariantZod),
});
export type UpdateProductProvider = z.infer<typeof UpdateProductProviderZod>;

const TierDiscountsZod = z.array(
  z.object({
    name: z.nativeEnum(Tier),
    price: z.number().min(0).max(PRICE_MAX).superRefine(refineDecimalPlaces),
  }),
);
export type TierDiscounts = z.infer<typeof TierDiscountsZod>;

const ProductZod = BaseEntityZod.extend({
  title: z.string().min(TITLE_MIN_LENGTH).max(TITLE_MAX_LENGTH).trim(),
  code: z.string().min(NAME_MIN_LENGTH).max(ID_LENGTH).trim().toUpperCase(),
  // sku: z.string().min(NAME_MIN_LENGTH).max(CODE_LENGTH).trim().toUpperCase(),
  status: z.enum(getObjectValues(Status)).default(Status.Inactive),
  description: z.string(),
  categoryId: IDZod,
  minPrice: PriceZod,
  maxPrice: PriceZod,
  imageIds: z.array(IDZod),
  productionTimeStart: z.number(),
  productionTimeEnd: z.number(),
  shippingTimeStart: z.number(),
  shippingTimeEnd: z.number(),
  shippingFee: z.number().min(0).max(PRICE_MAX).superRefine(refineDecimalPlaces),
  extraItemFee: z.number().min(0).max(PRICE_MAX).superRefine(refineDecimalPlaces).optional(),
  additionalShippingFee: z.number().min(0).max(PRICE_MAX).superRefine(refineDecimalPlaces).optional(),
  localShippingFee: z.number().min(0).max(PRICE_MAX).superRefine(refineDecimalPlaces).optional(),
  labelFee: z.number().default(0.5),
  handlingFee: z.number().default(0),
  note: z.string().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH).optional(),
  optionNames: z.array(NameZod).max(MAX_PRODUCT_OPTION_LENGTH).default([]),
  // variantIds: z.array(IDZod).default([]).optional(),
  // variantCount: z.number().default(0),
  providers: z.array(ProductProviderZod),
  country: z.string(),
  brand: z.string().optional(), // Gildan
  brandSku: z.string().optional(), // 5000
  attributes: z.array(ProductAttributeZod).optional(),
  printOptions: z.string().array().optional(), // 1-side, 2-sides
  artworkRequirements: ArtworkRequirementsZod.optional(),
  tierDiscounts: TierDiscountsZod.optional(),
  hasTierPrices: z.boolean().default(false).optional(),
  createdById: IDZod,
  updatedById: IDZod,
  sellerId: IDZod.optional(),
  isHidden: z.boolean().optional(),
  images: z.array(ResImageZod).optional(),
  category: CategoryZod.optional(),
  seller: UserZod.optional(),
});
export type Product = z.infer<typeof ProductZod>;

//
export const ProductResZod = ProductZod.extend({
  images: z.array(ResImageZod).optional(),
  category: CategoryZod.optional(),
  updatedBy: UserZod.optional(),
  createdBy: UserZod.optional(),
});

//
export const GetProductsZod = PageQueryZod.extend({
  categoryId: IDZod.optional(),
  providerId: IDZod.optional(),
  isHidden: BooleanZod.optional(),
});
export class GetProductsDto extends createZodDto(extendApi(GetProductsZod)) {}
export const GetProductItemResZod = ProductZod.extend({
  summary: z.object({
    color: z.string().optional(),
    size: z.string().optional(),
    areas: z.string().optional(),
  }),
});
export const GetProductsResZod = PageResZod.extend({
  data: GetProductItemResZod.array(),
});
export class GetProductsResDto extends createZodDto(extendApi(GetProductsResZod)) {}

//
export const GetProductResZod = ResZod.extend({
  data: ProductResZod,
});
export class GetProductResDto extends createZodDto(extendApi(GetProductResZod)) {}

//
export const CreateProductZod = z.object({
  title: ProductZod.shape.title,
  // sku: ProductZod.shape.sku,
  code: ProductZod.shape.code,
  description: ProductZod.shape.description,
  categoryId: ProductZod.shape.categoryId,
  imageIds: ProductZod.shape.imageIds,
  productionTimeStart: ProductZod.shape.productionTimeStart,
  productionTimeEnd: ProductZod.shape.productionTimeEnd,
  shippingTimeStart: ProductZod.shape.shippingTimeStart,
  shippingTimeEnd: ProductZod.shape.shippingTimeEnd,
  shippingFee: ProductZod.shape.shippingFee,
  extraItemFee: ProductZod.shape.extraItemFee,
  labelFee: ProductZod.shape.labelFee,
  handlingFee: ProductZod.shape.handlingFee,
  note: ProductZod.shape.note,
  optionNames: ProductZod.shape.optionNames,
  // variantIds: ProductZod.shape.variantIds,
  providers: z.array(CreateProductProviderZod),
  country: ProductZod.shape.country,
  artworkRequirements: ProductZod.shape.artworkRequirements,
  attributes: ProductZod.shape.attributes,
  printOptions: ProductZod.shape.printOptions,
  sellerId: ProductZod.shape.sellerId,
});
export class CreateProductDto extends createZodDto(extendApi(CreateProductZod)) {}
export const CreateProductResZod = ResZod.extend({
  data: ProductResZod,
});
export class CreateProductResDto extends createZodDto(extendApi(CreateProductResZod)) {}

//
export const UpdateProductZod = CreateProductZod.extend({
  // variantIds: ProductZod.shape.variantIds,
  providers: z.array(UpdateProductProviderZod),
});
export class UpdateProductDto extends createZodDto(extendApi(UpdateProductZod)) {}
export const UpdateProductResZod = ResZod.extend({
  data: ProductResZod,
});
export class UpdateProductResDto extends createZodDto(extendApi(UpdateProductResZod)) {}

//
export const DeleteProductResZod = ResZod.extend({
  data: ProductResZod.nullable(),
});
export class DeleteProductResDto extends createZodDto(extendApi(DeleteProductResZod)) {}

export const GetProductStatisticZod = z.object({
  // storeId: IDZod.optional(),
});

export class GetProductStatisticDto extends createZodDto(extendApi(GetProductStatisticZod)) {}
export const GetProductStatisticResZod = ResZod;
export class GetProductStatisticResDto extends createZodDto(extendApi(GetProductStatisticResZod)) {}

export const FindVariantsByHashZod = z
  .object({
    providerCode: NameZod,
    productName: z.string(),
    // variantOptions: z.array(NameZod),
    hash: z.string(),
    combinedHash: z.string(),
  })
  .array();
export class FindVariantsByHashDto extends createZodDto(extendApi(FindVariantsByHashZod)) {}
