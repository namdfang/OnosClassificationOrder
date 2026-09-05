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

  /** Số dư ví NGAY SAU khi mua label này — đối soát chi phí với biến động ví. */
  @Prop()
  balanceAfter?: string;

  /**
   * Chủ thể nhóm mua (ShippingLabelPatterns.md §2) — orderId seller, fallback
   * `order:<OrderEntity._id>` khi đơn không có orderId. Unique partial index
   * `unique_vnp_group_active`: 1 nhóm chỉ có 1 record ĐANG MỞ — 2 click cách
   * nhau vài trăm ms thì click sau thua ở tầng DB, không phải ở guard đọc-ghi.
   * Chỉ record VNP hệ thống mua mới set (label khách tự cấp nằm ngoài).
   */
  @Prop()
  groupKey?: string;

  /**
   * Khoá idempotency do BÊN GỌI cấp (§2 — `requestId` trong CreateVnpShipmentDto).
   * Unique partial index `unique_vnp_purchase_key`: gọi lại cùng khoá → trả
   * nhãn lượt trước thay vì mua nhãn thứ hai. Record `failed`/`cancelled`
   * thoát index → khoá tái dùng được cho lượt retry/mua lại hợp lệ.
   */
  @Prop()
  purchaseKey?: string;

  @Prop({ type: String, enum: VNP_SHIPMENT_RECORD_STATUSES, default: 'created', index: true })
  status: VnpShipmentRecordStatus;

  /** Lý do khi `status='failed'` — nhánh lỗi createShipment / cron đối soát ghi. */
  @Prop()
  failReason?: string;

  /**
   * Mốc gọi lệnh hủy (chuyển sang `cancelling`) — cron dọn record kẹt
   * `cancelling` lọc theo tuổi mốc này (createdAt là lúc MUA, không dùng được).
   */
  @Prop({ type: Date })
  cancelRequestedAt?: Date;

  @Prop({ type: Date })
  cancelledAt?: Date;

  /** Text trạng thái THÔ của hãng (≡ carrierStatus — ShippingLabelPatterns.md §3). */
  @Prop()
  lastTrackingStatus?: string;

  /** Lần sync tracking gần nhất (≡ carrierSyncedAt §3). */
  @Prop({ type: Date })
  lastTrackingAt?: Date;

  /**
   * Lần ĐẦU hãng báo label đã vào mạng lưới — CHỐT AN TOÀN của luồng hủy
   * (§3/§4): có scannedAt thì từ chối hủy. Set đúng 1 lần, KHÔNG BAO GIỜ clear
   * (kể cả khi text trạng thái sau đó đổi/mất).
   */
  @Prop({ type: Date })
  scannedAt?: Date;

  /** Ghi chú/lý do từ hãng (vd nghi địa chỉ người nhận sai) — ops đọc để cứu đơn. */
  @Prop()
  carrierNote?: string;

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
// Đường quét của 2 cron (ShippingLabelPatterns.md §3 — index theo đường cron,
// mỗi cron ghi chú tại đây): pollTrackingCron lọc {provider, status ∈
// created/in_transit, createdAt ≥ -30d}; reconcilePurchasing lọc {provider,
// status='purchasing', createdAt < -15m} — cùng ăn index này.
ShipmentSchema.index({ provider: 1, status: 1, createdAt: 1 });
// Chống mua trùng bằng RÀNG BUỘC DUY NHẤT, không bằng đọc-rồi-ghi (§2).
// Partial theo status ĐANG MỞ: hủy/failed xong record thoát index → mua lại
// hợp lệ. `groupKey $exists` loại record cũ + label khách tự cấp (không set).
ShipmentSchema.index(
  { provider: 1, groupKey: 1 },
  {
    name: 'unique_vnp_group_active',
    unique: true,
    partialFilterExpression: {
      groupKey: { $exists: true },
      status: { $in: ['purchasing', 'created', 'in_transit', 'delivered', 'cancelling'] },
    },
  },
);
ShipmentSchema.index(
  { provider: 1, purchaseKey: 1 },
  {
    name: 'unique_vnp_purchase_key',
    unique: true,
    partialFilterExpression: {
      purchaseKey: { $exists: true },
      status: { $in: ['purchasing', 'created', 'in_transit', 'delivered', 'cancelling'] },
    },
  },
);

ShipmentSchema.virtual('package', {
  ref: 'ShippingPackageEntity',
  localField: 'packageId',
  foreignField: '_id',
  justOne: true,
});

export type ShipmentDocument = HydratedDocument<ShipmentEntity> & { package?: ShippingPackageDocument };
