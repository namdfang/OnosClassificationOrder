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

  /** Slug SEO/URL (parity hệ cũ) — chưa dùng để routing, chỉ lưu. */
  @Prop({ trim: true })
  slug?: string;

  /** Active = hiện catalog khách hàng, Inactive = ẩn catalog nhưng vẫn hiện quản trị, Hidden = ẩn cả 2 (KHÔNG xóa DB). */
  @Prop({ type: String, default: ProductConfigStatus.Active, enum: getObjectValues(ProductConfigStatus), index: true })
  status: ProductConfigStatus;

  @Prop({ trim: true })
  machineNumber?: string;

  /** Optional từ 2026-07 — sản phẩm tạo nhanh từ kanban Settings chưa có loại máy, bổ sung sau ở trang Products. */
  @Prop({ ref: 'MachineTypeEntity', index: true })
  machineTypeId?: string;

  /** Optional — sản phẩm có thể tạo mà chưa gán xưởng, bổ sung sau ở trang Products. */
  @Prop({ ref: 'FactoryEntity', index: true })
  factoryId?: string;

  /** workshop_config code (category=fabric_type). Default fabric for orders mapped to this product. */
  @Prop({ trim: true })
  fabricType?: string;

  /** workshop_config code (category=tool_result). Default tool status — display/config only, KHÔNG còn copy vào order.toolResult lúc import (đơn mới luôn để trống để tool tự động soát). */
  @Prop({ trim: true })
  toolResult?: string;

  /** Ảnh/URL mockup sản phẩm (ảnh CHÍNH — index 0 của gallery) — hiển thị cột đầu bảng config. */
  @Prop({ trim: true })
  mockup?: string;

  /** Gallery ảnh bổ sung (ngoài `mockup`) — URL hoặc ảnh upload local-disk. */
  @Prop({ type: [String], default: undefined })
  images?: string[];

  /** ref CollectionEntity — 1 sản phẩm thuộc nhiều collection. */
  @Prop({ type: [String], ref: 'CollectionEntity', index: true, default: undefined })
  collectionIds?: string[];

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

  /**
   * Danh sách vị trí in — object giàu MIRROR `print_areas[]` hệ cũ, `key` CỐ
   * ĐỊNH (xem `PRODUCT_PRINT_AREA_KEYS`) map 1-1 sang `order.designs`. Data
   * cũ dạng mảng string key được backfill thành `{key, isRequired: true}` ở
   * `ProductConfigService.onModuleInit`.
   */
  @Prop({
    type: [
      raw({
        key: { type: String, required: true, enum: PRODUCT_PRINT_AREA_KEYS },
        templateUrl: { type: String, trim: true },
        widthPx: { type: Number, min: 0 },
        heightPx: { type: Number, min: 0 },
        isRequired: { type: Boolean },
        additionPrice: { type: Number, min: 0 },
        isEmbroidery: { type: Boolean },
      }),
    ],
    default: undefined,
    _id: false,
  })
  printArea?: ProductPrintArea;

  /** URL trang tài liệu hướng dẫn design/template ("print_document" hệ cũ). */
  @Prop({ trim: true })
  printDocument?: string;

  /** URL template thiết kế CHUNG của sản phẩm ("print_template" hệ cũ) — template riêng từng vị trí xem `printArea[].templateUrl`. */
  @Prop({ trim: true })
  printTemplate?: string;

  /** Ảnh/URL bảng size. */
  @Prop({ trim: true })
  sizeChartUrl?: string;

  /** Mô tả sản phẩm (HTML) — hiển thị cho khách hàng ở Customer Portal ("Item description" hệ cũ). */
  @Prop({ trim: true })
  description?: string;

  /** Mô tả ngắn (HTML) — "Short description" hệ cũ. */
  @Prop({ trim: true })
  shortDescription?: string;

  /** Mô tả template/file in (HTML) — "Template description" hệ cũ. */
  @Prop({ trim: true })
  templateDescription?: string;

  /** "IMPORT US TAX: ${n}/unit" hệ cũ — crawl từ trang WP public (xem ProductConfigZod). */
  @Prop({ type: Number, min: 0 })
  usImportTaxPerUnit?: number;

  /** "Shipping time" hệ cũ — Max Production time (ngày). */
  @Prop({ type: Number, min: 0 })
  maxProductionTime?: number;

  /** "Shipping time" hệ cũ — Max shipping time (ngày). */
  @Prop({ type: Number, min: 0 })
  maxShippingTime?: number;

  /** "Hide product for seller" hệ cũ — mới lưu, CHƯA wire vào logic nào. */
  @Prop({ type: Boolean })
  hideForSeller?: boolean;

  /** "Enable design check" hệ cũ — mới lưu, CHƯA wire vào logic nào. */
  @Prop({ type: Boolean })
  enableDesignCheck?: boolean;

  /** "Enable affiliate commission" hệ cũ — mới lưu, CHƯA wire vào logic nào. */
  @Prop({ type: Boolean })
  enableAffiliate?: boolean;

  /** Thông số kỹ thuật dạng key-value tự do (chất liệu, kiểu dáng...). */
  @Prop({
    type: [
      raw({ label: { type: String, required: true, trim: true }, value: { type: String, required: true, trim: true } }),
    ],
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
          type: [
            raw({
              label: { type: String, required: true, trim: true },
              value: { type: String, required: true, trim: true },
            }),
          ],
          default: undefined,
        },
        cost: { type: Number, min: 0 },
        nonShipCost: { type: Number, min: 0 },
        retailPrice: { type: Number, min: 0 },
        wholesalePrice: { type: Number, min: 0 },
        tiktokPrice: { type: Number, min: 0 },
        expUsShipCost: { type: Number, min: 0 },
        tiktokShipCost: { type: Number, min: 0 },
        weight: { type: Number, min: 0 },
        width: { type: Number, min: 0 },
        height: { type: Number, min: 0 },
        length: { type: Number, min: 0 },
        packageGram: { type: Number, min: 0 },
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
