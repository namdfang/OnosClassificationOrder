import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { CustomerPaymentMethod, CustomerPaymentStatus } from 'shared';
import { CUSTOMER_PAYMENT_METHODS, CUSTOMER_PAYMENT_STATUSES } from 'shared';

import type { CustomerDocument } from '@/modules/customer/customer.entity';

/** 1 lần hoàn tiền (phase 1: Admin đánh dấu đã hoàn; phase 2: cộng lại ví). */
export interface CustomerPaymentRefund {
  amount: number;
  at: Date;
  /** user._id Admin thao tác. */
  by?: string;
  note?: string;
}

/**
 * Ledger thanh toán Customer Portal — ghi NGAY TỪ PHASE 1: mỗi lần push 1
 * record, gate OFF thì `status='waived'` + amount (giá chốt) để đối soát
 * doanh thu; Phase 2 topup/ví chỉ thêm nguồn tiền (`method='wallet'`), không
 * đổi flow. Xem `documents/Plans/CustomerOrderIntake-CSV-API.md` §3.
 */
@DatabaseEntity({ collection: 'customer_payments' })
export class CustomerPaymentEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, ref: 'CustomerEntity', index: true })
  customerId: string;

  /** `customer_orders._id` các staging order thuộc lần push này. */
  @Prop({ type: [String], default: [] })
  orderIds: string[];

  /** Tổng tiền chốt (USD) của cả lần push. */
  @Prop({ required: true })
  amount: number;

  @Prop({ type: String, enum: CUSTOMER_PAYMENT_STATUSES, default: 'awaiting', index: true })
  status: CustomerPaymentStatus;

  @Prop({ type: String, enum: CUSTOMER_PAYMENT_METHODS, default: 'manual' })
  method: CustomerPaymentMethod;

  /** user._id Admin xác nhận đã nhận tiền (gate ON, phase 1). */
  @Prop({ ref: 'UserEntity' })
  confirmedBy?: string;

  @Prop({ type: Date })
  confirmedAt?: Date;

  @Prop({ type: [Object], default: [] })
  refunds: CustomerPaymentRefund[];
}

export const CustomerPaymentSchema = SchemaFactory.createForClass(CustomerPaymentEntity);
CustomerPaymentSchema.index({ customerId: 1, createdAt: -1 });

CustomerPaymentSchema.virtual('customer', {
  ref: 'CustomerEntity',
  localField: 'customerId',
  foreignField: '_id',
  justOne: true,
});

export type CustomerPaymentDocument = HydratedDocument<CustomerPaymentEntity> & { customer?: CustomerDocument };
