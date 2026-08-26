import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { VnpShipmentRecordStatus } from 'shared';
import { VNP_SHIPMENT_RECORD_STATUSES } from 'shared';

import type { ShippingPackageDocument } from './shipping-package.entity';

/**
 * 1 lần mua label = 1 record MỚI, không bao giờ ghi đè — hủy chỉ set
 * `status='cancelled'` + `cancelledAt`, mua lại tạo record mới → lịch sử
 * vận đơn tự có. Nguồn sự thật về label/tracking; `order.vnpShipment` trên
 * orders chỉ là snapshot mỏng sync từ record active để render list.
 */
@DatabaseEntity({ collection: 'shipments' })
export class ShipmentEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, ref: 'ShippingPackageEntity', index: true })
  packageId: string;

  /** Nhà cung cấp label — 'vnp-eglobal'; sau này thêm khi tự đi ship. */
  @Prop({ required: true, default: 'vnp-eglobal' })
  provider: string;

  /** ID shipment bên VNP (uuid). */
  @Prop({ index: true })
  vnpShipmentId?: string;

  @Prop({ index: true })
  trackingCode?: string;

  @Prop()
  labelUrl?: string;

  /**
   * Hãng vận chuyển do KHÁCH khai (USPS/UPS/…) — chỉ có ở record provider
   * `customer`; label VNP hệ thống mua thì hãng nằm trong `service`.
   */
  @Prop()
  carrier?: string;

  /** Link tra cứu khách gửi kèm (provider `customer`). */
  @Prop()
  trackingUrl?: string;

  @Prop()
  service?: string;

  @Prop()
  shippingType?: string;

  @Prop()
  fromAddressId?: string;

  @Prop()
  toAddressId?: string;

  /** shipping_cost VNP trả lúc tạo (string nguyên văn — spec không khai đơn vị). */
  @Prop()
  shippingCost?: string;

  @Prop({ type: String, enum: VNP_SHIPMENT_RECORD_STATUSES, default: 'created', index: true })
  status: VnpShipmentRecordStatus;

  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop()
  lastTrackingStatus?: string;

  @Prop({ type: Date })
  lastTrackingAt?: Date;

  /** Lịch sử poll trạng thái — để dành cho cron tracking, hiện ghi lúc bấm tay. */
  @Prop({ type: [Object], default: [] })
  trackingEvents: { status?: string; at: Date }[];

  @Prop({ ref: 'UserEntity' })
  createdByUserId?: string;

  @Prop()
  createdByUserName?: string;
}

export const ShipmentSchema = SchemaFactory.createForClass(ShipmentEntity);
ShipmentSchema.index({ createdAt: -1 });

ShipmentSchema.virtual('package', {
  ref: 'ShippingPackageEntity',
  localField: 'packageId',
  foreignField: '_id',
  justOne: true,
});

export type ShipmentDocument = HydratedDocument<ShipmentEntity> & { package?: ShippingPackageDocument };
