import { Prop, raw, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { ProductConfig, ProductItemSpecific, ProductPrintArea, ProductVariation } from 'shared';
import { getObjectValues, PRODUCT_PRINT_AREA_KEYS, ProductConfigStatus, Status } from 'shared';

import type { FactoryDocument } from '../factory/factory.entity';
import type { MachineTypeDocument } from '../machine-type/machine-type.entity';
import type { ProductCategoryDocument } from '../product-category/product-category.entity';

@DatabaseEntity({ collection: 'productConfigs' })
export class ProductConfigEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true, index: true })
  fullName: string;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  shortName: string;

  /** Mã SKU riêng của sản phẩm (KHÔNG phải SKU biến thể trong `variations[]`). */
  @Prop({ trim: true, uppercase: true })
  sku?: string;

  /** Active = hiện catalog khách hàng, Inactive = ẩn catalog nhưng vẫn hiện quản trị, Hidden = ẩn cả 2 (KHÔNG xóa DB). */
  @Prop({ type: String, default: ProductConfigStatus.Active, enum: getObjectValues(ProductConfigStatus), index: true })
  status: ProductConfigStatus;

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

  /** Danh sách vị trí in — mảng key CỐ ĐỊNH (xem `PRODUCT_PRINT_AREA_KEYS`), map 1-1 sang `order.designs`, KHÔNG còn free-text. */
  @Prop({ type: [String], enum: PRODUCT_PRINT_AREA_KEYS, default: undefined })
  printArea?: ProductPrintArea;

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

  /** Danh sách biến thể (VD: màu/size, tự đặt tên) — SKU riêng từng biến thể, unique toàn hệ thống. */
  @Prop({
    type: [
      raw({
        sku: { type: String, required: true, trim: true, uppercase: true },
        attributes: {
          type: [raw({ label: { type: String, required: true, trim: true }, value: { type: String, required: true, trim: true } })],
          default: undefined,
        },
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

// SKU sản phẩm (khác SKU biến thể) unique toàn hệ thống (sparse — sản phẩm chưa có sku không bị chặn).
ProductConfigSchema.index({ sku: 1 }, { unique: true, sparse: true });

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
