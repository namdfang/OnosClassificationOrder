import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type {
  CustomerOrderPriceSnapshot,
  CustomerOrderSource,
  CustomerOrderTracking,
  CustomerShipMethod,
  DesignFields,
  ProductionOrderShippingAddress,
} from 'shared';
import { CUSTOMER_ORDER_SOURCES } from 'shared';

import type { CustomerDocument } from '@/modules/customer/customer.entity';

/**
 * 1 item trong staging đơn khách = 1 dòng CSV template cũ / 1 sản phẩm form.
 * Lưu dạng subdocument thô (`type: Object`) — cùng pattern `fulfillmentStages`
 * của OrderEntity. Push xong mỗi item link sang 1 `OrderEntity` qua
 * `productionId`.
 */
export interface CustomerOrderItem {
  /** SKU variation (CSV bắt buộc, form có thể trống — plan §13.1). */
  sku?: string;
  merchantSku?: string;
  /** Resolve từ SKU lúc import — nguồn chân lý cho type/size/color. */
  productConfigId?: string;
  type?: string;
  color?: string;
  size?: string;
  quantity: number;
  shipMethod?: CustomerShipMethod;
  activeService?: boolean;
  mockupUrl?: string;
  printMethod?: string;
  weight?: number;
  width?: number;
  height?: number;
  length?: number;
  designs?: DesignFields;
  /** Tracking/label khách tự cấp — lưu-hiển-thị, CHƯA nối sản xuất (plan §13.3). */
  tracking?: CustomerOrderTracking;
  /** Tính tham khảo lúc tạo, CHỐT LẠI + đóng băng lúc push. */
  priceSnapshot?: CustomerOrderPriceSnapshot;
  /**
   * Cấp NGAY lúc tạo/import (`XX-#####-#####`, unique cả `orders` lẫn staging)
   * — mã đi xuyên suốt portal → xưởng; push GIỮ NGUYÊN mã này làm
   * `OrderEntity.productionId`.
   */
  productionId?: string;
}

/**
 * Staging đơn khách hàng — 1 document = 1 ĐƠN (nhiều item + 1 địa chỉ chung).
 * Đơn Pending KHÔNG BAO GIỜ là `OrderEntity` → pipeline sản xuất + thống kê
 * nội bộ không thấy đơn này. Sau push, trạng thái derive at read-time từ
 * `OrderEntity` theo `items[].productionId` — KHÔNG dual-write.
 * Xem `documents/Plans/CustomerOrderIntake-CSV-API.md` §2.
 */
@DatabaseEntity({ collection: 'customer_orders' })
export class CustomerOrderEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, ref: 'CustomerEntity', index: true })
  customerId: string;

  // Denorm match keys từ customer — dùng backfill/đối chiếu, KHÔNG dùng auth.
  @Prop({ trim: true, default: '' })
  userSku: string;

  @Prop({ trim: true, default: '' })
  userEmail: string;

  /** Idempotency mức ĐƠN — `customerOrderKey(orderId, identifier)` (shared). */
  @Prop({ required: true, trim: true })
  orderKey: string;

  /** Giá trị khách điền — giữ nguyên văn để hiển thị listing. */
  @Prop({ trim: true })
  orderId?: string;

  @Prop({ trim: true })
  identifier?: string;

  @Prop({ trim: true })
  orderName?: string;

  @Prop({ type: String, enum: CUSTOMER_ORDER_SOURCES, default: 'form' })
  source: CustomerOrderSource;

  /**
   * CHỈ trạng thái TRƯỚC push (`pending`/`cancelled`) — sau push trạng thái
   * khách (processing/in-production/...) derive từ OrderEntity, không lưu ở đây.
   */
  @Prop({ type: String, enum: ['pending', 'cancelled'], default: 'pending', index: true })
  status: 'pending' | 'cancelled';

  /** 1 địa chỉ CHUNG cho cả đơn (đã gồm email/company của template cũ). */
  @Prop({ type: Object })
  shippingAddress?: ProductionOrderShippingAddress;

  @Prop({ type: [Object], default: [] })
  items: CustomerOrderItem[];

  @Prop({ trim: true })
  note?: string;

  /** Set lúc push nguyên đơn — backfill Luồng A set = createdAt đơn cũ. */
  @Prop({ type: Date, default: null, index: true })
  pushedAt?: Date | null;

  @Prop({ ref: 'CustomerPaymentEntity' })
  paymentId?: string;

  @Prop({ type: Date, default: null })
  cancelledAt?: Date | null;

  @Prop({ trim: true })
  cancelReason?: string;

  /** Đơn đã thanh toán bị hủy + đã hoàn tiền (tab Refunded) — phase này chưa có flow set. */
  @Prop({ type: Date, default: null })
  refundedAt?: Date | null;
}

export const CustomerOrderSchema = SchemaFactory.createForClass(CustomerOrderEntity);
// Idempotency: 1 khách không thể có 2 đơn cùng orderKey (import retry an toàn).
CustomerOrderSchema.index({ customerId: 1, orderKey: 1 }, { unique: true });
// Listing portal: lọc theo khách + trạng thái staging + mới nhất trước.
CustomerOrderSchema.index({ customerId: 1, status: 1, createdAt: -1 });
// Lookup ngược từ OrderEntity (derive trạng thái + backfill idempotent).
CustomerOrderSchema.index({ 'items.productionId': 1 });

CustomerOrderSchema.virtual('customer', {
  ref: 'CustomerEntity',
  localField: 'customerId',
  foreignField: '_id',
  justOne: true,
});

export type CustomerOrderDocument = HydratedDocument<CustomerOrderEntity> & { customer?: CustomerDocument };
