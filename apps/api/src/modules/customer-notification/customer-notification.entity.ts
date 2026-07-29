import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';

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

  @Prop({ required: true, ref: 'UserEntity' })
  createdByUserId: string;

  @Prop({ required: true, trim: true })
  createdByName: string;
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
