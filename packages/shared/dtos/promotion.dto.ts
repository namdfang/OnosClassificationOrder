import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { NameZod } from '@shared/constants';
import { Status } from '@shared/enums';
import { BaseEntityZod, PageQueryZod, PageResZod, ResZod } from '@shared/types';
import { z } from 'zod';

import { IDZod } from '../constants/common-zod';
import { getObjectValues } from '../utils/getObjectValues';
import { CustomerTierZod } from './customer.dto';

/**
 * Chương trình giảm giá (Promotion) — áp dụng theo tier khách hàng (VIP 0..5,
 * xem `CustomerTierZod`). Đây là quản lý/tham khảo giá — CHƯA tích hợp vào
 * form đặt đơn Customer Portal (`PlaceCustomerOrderDto`), chỉ hiển thị giá
 * tham khảo ở trang Catalog (`GetCustomerCatalogResDto`).
 */
export const PROMOTION_DISCOUNT_TYPES = ['percentage', 'fixed'] as const;
export type PromotionDiscountType = (typeof PROMOTION_DISCOUNT_TYPES)[number];

export const PROMOTION_SCOPES = ['all', 'category', 'product'] as const;
export type PromotionScope = (typeof PROMOTION_SCOPES)[number];

export const PromotionZod = BaseEntityZod.extend({
  name: NameZod,
  /** Mã coupon — hiện chỉ để tham khảo/hiển thị, chưa dùng để redeem ở checkout. */
  code: z.string().trim().toUpperCase().max(60).optional(),
  description: z.string().trim().max(2000).optional(),
  discountType: z.enum(PROMOTION_DISCOUNT_TYPES),
  discountValue: z.coerce.number().min(0),
  scope: z.enum(PROMOTION_SCOPES).default('all'),
  /** ref ProductCategoryEntity — bắt buộc khi scope='category'. */
  scopeCategoryId: IDZod.optional(),
  /** ProductConfig ids — bắt buộc khi scope='product'. */
  scopeProductConfigIds: z.array(IDZod).max(200).optional(),
  /** Tier áp dụng (VIP 0..5) — rỗng/undefined = áp dụng cho MỌI tier (kể cả khách lẻ). */
  applicableTiers: z.array(CustomerTierZod).max(6).optional(),
  minQuantity: z.coerce.number().int().min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.enum(getObjectValues(Status)).default(Status.Active),
}).superRefine((val, ctx) => {
  if (val.discountType === 'percentage' && val.discountValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountValue'],
      message: 'Giảm giá theo % không được vượt quá 100',
    });
  }
  if (val.scope === 'category' && !val.scopeCategoryId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scopeCategoryId'],
      message: 'Chọn danh mục sản phẩm áp dụng',
    });
  }
  if (val.scope === 'product' && !val.scopeProductConfigIds?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scopeProductConfigIds'],
      message: 'Chọn ít nhất 1 sản phẩm áp dụng',
    });
  }
  if (val.startDate && val.endDate && val.startDate > val.endDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Ngày kết thúc phải sau ngày bắt đầu' });
  }
});
export type Promotion = z.infer<typeof PromotionZod>;

//
export const GetPromotionsZod = PageQueryZod.extend({
  status: z.enum(getObjectValues(Status)).optional(),
  scope: z.enum(PROMOTION_SCOPES).optional(),
  tier: CustomerTierZod.optional(),
});
export class GetPromotionsDto extends createZodDto(extendApi(GetPromotionsZod)) {}

export const GetPromotionsResZod = PageResZod.extend({ data: PromotionZod.array() });
export class GetPromotionsResDto extends createZodDto(extendApi(GetPromotionsResZod)) {}

//
const PromotionInputShape = {
  name: z.string().min(1).max(200),
  code: z.string().trim().toUpperCase().max(60).optional(),
  description: z.string().trim().max(2000).optional(),
  discountType: z.enum(PROMOTION_DISCOUNT_TYPES),
  discountValue: z.coerce.number().min(0),
  scope: z.enum(PROMOTION_SCOPES).default('all'),
  scopeCategoryId: IDZod.optional(),
  scopeProductConfigIds: z.array(IDZod).max(200).optional(),
  applicableTiers: z.array(CustomerTierZod).max(6).optional(),
  minQuantity: z.coerce.number().int().min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.enum(getObjectValues(Status)).optional(),
};

export const CreatePromotionZod = z.object(PromotionInputShape);
export class CreatePromotionDto extends createZodDto(extendApi(CreatePromotionZod)) {}

export const CreatePromotionResZod = ResZod.extend({ data: PromotionZod });
export class CreatePromotionResDto extends createZodDto(extendApi(CreatePromotionResZod)) {}

//
export const UpdatePromotionZod = z.object(PromotionInputShape).partial();
export class UpdatePromotionDto extends createZodDto(extendApi(UpdatePromotionZod)) {}

export const UpdatePromotionResZod = ResZod.extend({ data: PromotionZod });
export class UpdatePromotionResDto extends createZodDto(extendApi(UpdatePromotionResZod)) {}

//
export const DeletePromotionResZod = ResZod;
export class DeletePromotionResDto extends createZodDto(extendApi(DeletePromotionResZod)) {}

//
export const PromotionStatsResZod = ResZod.extend({
  data: z.object({
    total: z.number(),
    active: z.number(),
    expiringSoon: z.number(),
    byTier: z.record(z.string(), z.number()),
  }),
});
export class PromotionStatsResDto extends createZodDto(extendApi(PromotionStatsResZod)) {}
