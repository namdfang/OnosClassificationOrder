import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';

/**
 * 1 kiện hàng vật lý — label luôn dán lên kiện nên shipment trỏ vào đây
 * (KHÔNG trỏ đơn khách: sau này gộp nhiều đơn cùng địa chỉ vào 1 kiện /
 * thùng master đi hub chỉ cần thêm phần tử `orderCodes` / set
 * `parentPackageId`, không đổi schema). Hiện tại pack tự sinh ngầm lúc
 * Admin mua label, 1 pack = 1 đơn khách (`orderId` seller).
 */
@DatabaseEntity({ collection: 'shipping_packages' })
export class ShippingPackageEntity extends DatabaseEntityAbstract {
  /** Mã kiện hiển thị `PK-XXXXXXXXXX`. */
  @Prop({ required: true, unique: true, trim: true })
  code: string;

  @Prop({ ref: 'FactoryEntity' })
  factoryId?: string;

  /** orderId seller trong kiện — hiện luôn ≤1 phần tử (đơn không có orderId → rỗng). */
  @Prop({ type: [String], default: [] })
  orderCodes: string[];

  /** OrderEntity._id các item trong kiện — dùng tra lịch sử theo đơn. */
  @Prop({ type: [String], default: [], index: true })
  productionOrderIds: string[];

  /** productionId hiển thị của các item (snapshot lúc tạo). */
  @Prop({ type: [String], default: [] })
  productionIds: string[];

  /** Kiện cha (thùng master gom nhiều kiện đi hub) — để dành, CHƯA dùng. */
  @Prop({ ref: 'ShippingPackageEntity' })
  parentPackageId?: string;
}

export const ShippingPackageSchema = SchemaFactory.createForClass(ShippingPackageEntity);
ShippingPackageSchema.index({ orderCodes: 1 });

export type ShippingPackageDocument = HydratedDocument<ShippingPackageEntity>;
