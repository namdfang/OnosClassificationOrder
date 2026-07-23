import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { Promotion, PromotionDiscountType, PromotionScope } from 'shared';
import { PROMOTION_DISCOUNT_TYPES, PROMOTION_SCOPES, Status } from 'shared';

@DatabaseEntity({ collection: 'promotions' })
export class PromotionEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true, index: true })
  name: string;

  /** Mã coupon — hiện chỉ để tham khảo/hiển thị, chưa dùng để redeem ở checkout. */
  @Prop({ trim: true, uppercase: true })
  code?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: String, required: true, enum: PROMOTION_DISCOUNT_TYPES })
  discountType: PromotionDiscountType;

  @Prop({ type: Number, required: true, min: 0 })
  discountValue: number;

  @Prop({ type: String, required: true, enum: PROMOTION_SCOPES, default: 'all' })
  scope: PromotionScope;

  /** ref ProductCategoryEntity — khi scope='category'. */
  @Prop({ ref: 'ProductCategoryEntity' })
  scopeCategoryId?: string;

  /** ProductConfig ids — khi scope='product'. */
  @Prop({ type: [String], default: undefined })
  scopeProductConfigIds?: string[];

  /** Tier áp dụng (VIP 0..5) — rỗng/undefined = áp dụng mọi tier. */
  @Prop({ type: [Number], default: undefined })
  applicableTiers?: number[];

  @Prop({ type: Number, min: 1 })
  minQuantity?: number;

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ type: String, default: Status.Active, index: true })
  status: Status;
}

assertSameType<Promotion, PromotionEntity>();
assertSameType<PromotionEntity, Promotion>();

export const PromotionSchema = SchemaFactory.createForClass(PromotionEntity);

// Mã coupon (nếu có) unique toàn hệ thống — sparse vì phần lớn promotion không cần code.
PromotionSchema.index({ code: 1 }, { unique: true, sparse: true });

export type PromotionDocument = HydratedDocument<PromotionEntity>;
