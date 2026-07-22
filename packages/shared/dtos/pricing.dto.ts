import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { IDZod, NameZod, PriceZod } from '@shared/constants';
import { Status } from '@shared/enums';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { getObjectValues } from '../utils/getObjectValues';

// ─── Price Group ───

export const PriceGroupZod = BaseEntityZod.extend({
  name: NameZod,
  code: z.string().trim().toUpperCase(),
  description: z.string().trim().optional(),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
});
export type PriceGroup = z.infer<typeof PriceGroupZod>;

export const CreatePriceGroupZod = z.object({
  name: PriceGroupZod.shape.name,
  code: PriceGroupZod.shape.code,
  description: PriceGroupZod.shape.description,
});
export class CreatePriceGroupDto extends createZodDto(extendApi(CreatePriceGroupZod)) {}

export const CreatePriceGroupResZod = ResZod.extend({
  data: PriceGroupZod,
});
export class CreatePriceGroupResDto extends createZodDto(extendApi(CreatePriceGroupResZod)) {}

export const UpdatePriceGroupZod = CreatePriceGroupZod.partial();
export class UpdatePriceGroupDto extends createZodDto(extendApi(UpdatePriceGroupZod)) {}

export const UpdatePriceGroupResZod = ResZod.extend({
  data: PriceGroupZod,
});
export class UpdatePriceGroupResDto extends createZodDto(extendApi(UpdatePriceGroupResZod)) {}

export const GetPriceGroupsZod = PageQueryZod;
export class GetPriceGroupsDto extends createZodDto(extendApi(GetPriceGroupsZod)) {}

export const GetPriceGroupsResZod = PageResZod.extend({
  data: PriceGroupZod.array(),
});
export class GetPriceGroupsResDto extends createZodDto(extendApi(GetPriceGroupsResZod)) {}

export const DeletePriceGroupResZod = ResZod.extend({
  data: PriceGroupZod.nullable(),
});
export class DeletePriceGroupResDto extends createZodDto(extendApi(DeletePriceGroupResZod)) {}

// ─── Price Group Item ───

export const PriceGroupItemZod = BaseEntityZod.extend({
  priceGroupId: IDZod,
  variantId: IDZod,
  productId: IDZod,
  providerId: IDZod.optional(),
  price: PriceZod,
  shippingFee: PriceZod.optional(),
  extraItemFee: PriceZod.optional(),
});
export type PriceGroupItem = z.infer<typeof PriceGroupItemZod>;

export const UpsertPriceGroupItemZod = z.object({
  variantId: IDZod,
  productId: IDZod,
  providerId: IDZod.optional(),
  price: PriceZod,
  shippingFee: PriceZod.optional(),
  extraItemFee: PriceZod.optional(),
});
export type UpsertPriceGroupItem = z.infer<typeof UpsertPriceGroupItemZod>;

export const BulkUpsertPriceGroupItemsZod = z.object({
  items: UpsertPriceGroupItemZod.array().min(1).max(500),
});
export class BulkUpsertPriceGroupItemsDto extends createZodDto(extendApi(BulkUpsertPriceGroupItemsZod)) {}

export const GetPriceGroupItemsZod = PageQueryZod.extend({
  productId: IDZod.optional(),
});
export class GetPriceGroupItemsDto extends createZodDto(extendApi(GetPriceGroupItemsZod)) {}

export const GetPriceGroupItemsResZod = PageResZod.extend({
  data: PriceGroupItemZod.array(),
});
export class GetPriceGroupItemsResDto extends createZodDto(extendApi(GetPriceGroupItemsResZod)) {}

// ─── Customer Price Override ───

export const CustomerPriceZod = BaseEntityZod.extend({
  userId: IDZod,
  variantId: IDZod,
  productId: IDZod,
  providerId: IDZod.optional(),
  price: PriceZod,
  shippingFee: PriceZod.optional(),
  extraItemFee: PriceZod.optional(),
  note: z.string().trim().optional(),
});
export type CustomerPrice = z.infer<typeof CustomerPriceZod>;

export const UpsertCustomerPriceZod = z.object({
  userId: IDZod,
  variantId: IDZod,
  productId: IDZod,
  providerId: IDZod.optional(),
  price: PriceZod,
  shippingFee: PriceZod.optional(),
  extraItemFee: PriceZod.optional(),
  note: z.string().trim().optional(),
});
export class UpsertCustomerPriceDto extends createZodDto(extendApi(UpsertCustomerPriceZod)) {}

export const BulkUpsertCustomerPricesZod = z.object({
  items: UpsertCustomerPriceZod.array().min(1).max(500),
});
export class BulkUpsertCustomerPricesDto extends createZodDto(extendApi(BulkUpsertCustomerPricesZod)) {}

export const GetCustomerPricesZod = PageQueryZod.extend({
  userId: IDZod.optional(),
  productId: IDZod.optional(),
});
export class GetCustomerPricesDto extends createZodDto(extendApi(GetCustomerPricesZod)) {}

export const GetCustomerPricesResZod = PageResZod.extend({
  data: CustomerPriceZod.array(),
});
export class GetCustomerPricesResDto extends createZodDto(extendApi(GetCustomerPricesResZod)) {}

export const DeleteCustomerPriceResZod = ResZod.extend({
  data: CustomerPriceZod.nullable(),
});
export class DeleteCustomerPriceResDto extends createZodDto(extendApi(DeleteCustomerPriceResZod)) {}

export const BulkDeleteCustomerPricesZod = z.object({
  ids: z.array(IDZod).min(1).max(500),
});
export class BulkDeleteCustomerPricesDto extends createZodDto(extendApi(BulkDeleteCustomerPricesZod)) {}

export const BulkDeleteCustomerPricesResZod = ResZod.extend({
  data: z.object({ count: z.number() }),
});
export class BulkDeleteCustomerPricesResDto extends createZodDto(extendApi(BulkDeleteCustomerPricesResZod)) {}

// ─── User-Group Assignment ───

export const AssignUserGroupsZod = z.object({
  groupIds: z.array(IDZod),
});
export class AssignUserGroupsDto extends createZodDto(extendApi(AssignUserGroupsZod)) {}

// ─── Price Resolution ───

export const ResolvePricesZod = z.object({
  variantIds: z.array(IDZod).min(1).max(100),
});
export class ResolvePricesDto extends createZodDto(extendApi(ResolvePricesZod)) {}

export const ResolvedPriceZod = z.object({
  variantId: IDZod,
  price: PriceZod,
  shippingFee: PriceZod.optional(),
  extraItemFee: PriceZod.optional(),
  source: z.enum(['customer_override', 'price_group', 'default']),
});
export type ResolvedPrice = z.infer<typeof ResolvedPriceZod>;

export const ResolvePricesResZod = ResZod.extend({
  data: ResolvedPriceZod.array(),
});
export class ResolvePricesResDto extends createZodDto(extendApi(ResolvePricesResZod)) {}
