import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { ProductionOrderLogAction } from 'shared';
import { ORDER_LOG_ACTIONS } from 'shared';

import type { OrderDocument } from '../order/order.entity';

@DatabaseEntity({ collection: 'orderLogs' })
export class OrderLogEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, ref: 'OrderEntity', index: true })
  orderId: string;

  @Prop({ index: true })
  userId?: string;

  @Prop()
  userName?: string;

  @Prop()
  userEmail?: string;

  @Prop({ index: true })
  roleCode?: string;

  @Prop({ type: String, required: true, enum: ORDER_LOG_ACTIONS, index: true })
  action: ProductionOrderLogAction;

  @Prop({ index: true })
  field?: string;

  @Prop({ type: Object })
  before?: unknown;

  @Prop({ type: Object })
  after?: unknown;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;
}

export const OrderLogSchema = SchemaFactory.createForClass(OrderLogEntity);
OrderLogSchema.index({ orderId: 1, createdAt: -1 });

OrderLogSchema.virtual('order', {
  ref: 'OrderEntity',
  localField: 'orderId',
  foreignField: '_id',
  justOne: true,
});

export type OrderLogDocument = HydratedDocument<OrderLogEntity> & {
  order?: OrderDocument;
};
