import { Prop, raw, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { ProductConfig, ProductItemSpecific, ProductVariation } from 'shared';
import { Status } from 'shared';

import type { FactoryDocument } from '../factory/factory.entity';
import type { MachineTypeDocument } from '../machine-type/machine-type.entity';
import type { ProductCategoryDocument } from '../product-category/product-category.entity';

@DatabaseEntity({ collection: 'productConfigs' })
export class ProductConfigEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true, index: true })
  fullName: string;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  shortName: string;

  @Prop({ trim: true })
  machineNumber?: string;

  @Prop({ required: true, ref: 'MachineTypeEntity', index: true })
  machineTypeId: string;

  @Prop({ required: true, ref: 'FactoryEntity', index: true })
  factoryId: string;

  /** workshop_config code (category=fabric_type). Default fabric for orders mapped to this product. */
  @Prop({ trim: true })
  fabricType?: string;

  /** workshop_config code (category=tool_result). Default tool status — display/config only, KHÔNG còn copy vào order.toolResult lúc import (đơn mới luôn để trống để tool tự động soát). */
  @Prop({ trim: true })
  toolResult?: string;

  /** Ảnh/URL mockup sản phẩm — hiển thị cột đầu bảng config. */
  @Prop({ trim: true })
  mockup?: string;

  /** Cấp độ sản phẩm 1..10 (PRODUCT_LEVELS) — badge màu. */
  @Prop({ type: Number, min: 1, max: 10 })
  level?: number;

  /** Hướng dẫn / ghi chú sản phẩm (free-text). */
  @Prop({ trim: true })
  guide?: string;

  // ─── Thông tin chi tiết sản phẩm (catalog cho khách hàng) ───────

  /** ref ProductCategoryEntity — module riêng (KHÔNG dùng workshop_config). */
  @Prop({ ref: 'ProductCategoryEntity', index: true })
  productCategoryId?: string;

  /** workshop_config code (category=print_method). */
  @Prop({ trim: true })
  printMethod?: string;

  /** Vị trí in (free-text). */
  @Prop({ trim: true })
  printArea?: string;

  /** Ảnh/URL bảng size. */
  @Prop({ trim: true })
  sizeChartUrl?: string;

  /** Mô tả sản phẩm — hiển thị cho khách hàng ở Customer Portal. */
  @Prop({ trim: true })
  description?: string;

  /** Thông số kỹ thuật dạng key-value tự do (chất liệu, kiểu dáng...). */
  @Prop({
    type: [raw({ label: { type: String, required: true, trim: true }, value: { type: String, required: true, trim: true } })],
    default: undefined,
    _id: false,
  })
  itemSpecifics?: ProductItemSpecific[];

  /** Đóng gói mặc định (áp dụng khi biến thể không override). */
  @Prop({ type: Number, min: 0 })
  weight?: number;

  @Prop({ type: Number, min: 0 })
  width?: number;

  @Prop({ type: Number, min: 0 })
  height?: number;

  @Prop({ type: Number, min: 0 })
  length?: number;

  /** Danh sách biến thể (màu/size) — SKU riêng từng biến thể, unique toàn hệ thống. */
  @Prop({
    type: [
      raw({
        sku: { type: String, required: true, trim: true, uppercase: true },
        color: { type: String, trim: true },
        size: { type: String, trim: true },
        cost: { type: Number, min: 0 },
        nonShipCost: { type: Number, min: 0 },
        retailPrice: { type: Number, min: 0 },
        weight: { type: Number, min: 0 },
        width: { type: Number, min: 0 },
        height: { type: Number, min: 0 },
        length: { type: Number, min: 0 },
        status: { type: String, default: Status.Active },
      }),
    ],
    default: undefined,
    _id: false,
  })
  variations?: ProductVariation[];
}

assertSameType<ProductConfig, ProductConfigEntity>();
assertSameType<ProductConfigEntity, ProductConfig>();

export const ProductConfigSchema = SchemaFactory.createForClass(ProductConfigEntity);

// SKU biến thể unique toàn hệ thống (sparse — sản phẩm chưa có variations không bị chặn).
ProductConfigSchema.index({ 'variations.sku': 1 }, { unique: true, sparse: true });

ProductConfigSchema.virtual('machineType', {
  ref: 'MachineTypeEntity',
  localField: 'machineTypeId',
  foreignField: '_id',
  justOne: true,
});

ProductConfigSchema.virtual('factory', {
  ref: 'FactoryEntity',
  localField: 'factoryId',
  foreignField: '_id',
  justOne: true,
});

ProductConfigSchema.virtual('productCategory', {
  ref: 'ProductCategoryEntity',
  localField: 'productCategoryId',
  foreignField: '_id',
  justOne: true,
});

export type ProductConfigDocument = HydratedDocument<ProductConfigEntity> & {
  machineType?: MachineTypeDocument;
  factory?: FactoryDocument;
  productCategory?: ProductCategoryDocument;
};
