import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { CustomerNotificationEvent, CustomerNotificationEventData } from 'shared';

import type { CustomerDocument } from '../customer/customer.entity';
import type { UserDocument } from '../user/user.entity';

/**
 * Thông báo Admin/nội bộ chủ động soạn gửi cho khách hàng (Customer Portal) —
 * xem `CustomerPortal.md §9`. `customerId=null` = broadcast tới TẤT CẢ khách.
 */
@DatabaseEntity({ collection: 'customer_notifications' })
export class CustomerNotificationEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ trim: true, maxlength: 2000 })
  body?: string;

  @Prop({ type: String, ref: 'CustomerEntity', default: null })
  customerId: string | null;

  /**
   * ORD-5 — thông báo HỆ THỐNG tự sinh theo trạng thái đơn: `event` +
   * `eventData` có giá trị, không có người gửi. FE render theo ngôn ngữ khách;
   * `title`/`body` chỉ là bản tiếng Việt dự phòng. Rỗng = admin soạn tay.
   */
  @Prop({ type: String, default: null, index: true })
  event: CustomerNotificationEvent | null;

  @Prop({ type: Object, default: null })
  eventData: CustomerNotificationEventData | null;

  /** Rỗng với thông báo hệ thống (ORD-5) — chỉ admin soạn tay mới có người gửi. */
  @Prop({ type: String, ref: 'UserEntity', default: null })
  createdByUserId?: string | null;

  @Prop({ trim: true, default: '' })
  createdByName?: string;
}

export const CustomerNotificationSchema = SchemaFactory.createForClass(CustomerNotificationEntity);
CustomerNotificationSchema.index({ customerId: 1, createdAt: -1 });

CustomerNotificationSchema.virtual('customer', {
  ref: 'CustomerEntity',
  localField: 'customerId',
  foreignField: '_id',
  justOne: true,
});
CustomerNotificationSchema.virtual('createdByUser', {
  ref: 'UserEntity',
  localField: 'createdByUserId',
  foreignField: '_id',
  justOne: true,
});

export type CustomerNotificationDocument = HydratedDocument<CustomerNotificationEntity> & {
  customer?: CustomerDocument;
  createdByUser?: UserDocument;
};
