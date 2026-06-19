import { Prop, raw, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { DesignFields } from 'shared';

import type { FactoryDocument } from '../factory/factory.entity';
import type { MachineTypeDocument } from '../machine-type/machine-type.entity';
import type { ProductConfigDocument } from '../product-config/product-config.entity';

@DatabaseEntity({ collection: 'orders' })
export class OrderEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, unique: true, index: true })
  productionId: string;

  @Prop()
  userSku?: string;

  @Prop()
  userEmail?: string;

  @Prop({ index: true })
  type?: string;

  @Prop()
  color?: string;

  @Prop()
  size?: string;

  @Prop()
  mockupUrl?: string;

  @Prop()
  mockupOriginalUrl?: string;

  @Prop()
  printMethod?: string;

  @Prop()
  weight?: number;

  @Prop()
  width?: number;

  @Prop()
  height?: number;

  @Prop()
  length?: number;

  @Prop({ default: 1 })
  quantity: number;

  @Prop()
  baseCost?: number;

  @Prop()
  shipCost?: number;

  @Prop({
    _id: false,
    type: raw({
      front: String,
      back: String,
      sleeve: String,
      hood: String,
      folder: String,
      placket: String,
      chestLeft: String,
      chestRight: String,
      left: String,
      right: String,
      sleeveLeft: String,
      sleeveRight: String,
      leftUpperSleeve: String,
      rightUpperSleeve: String,
      leftCuff: String,
      rightCuff: String,
      frontEmbroidery: String,
      backEmbroidery: String,
    }),
  })
  designs?: DesignFields;

  @Prop({
    _id: false,
    type: raw({
      front: String,
      back: String,
      sleeve: String,
      hood: String,
      folder: String,
      placket: String,
      chestLeft: String,
      chestRight: String,
      left: String,
      right: String,
      sleeveLeft: String,
      sleeveRight: String,
      leftUpperSleeve: String,
      rightUpperSleeve: String,
      leftCuff: String,
      rightCuff: String,
      frontEmbroidery: String,
      backEmbroidery: String,
    }),
  })
  designsOriginal?: DesignFields;

  @Prop()
  status?: string;

  @Prop({ index: true })
  orderId?: string;

  @Prop({ index: true })
  externalId?: string;

  @Prop()
  referent?: string;

  @Prop()
  orderAt?: Date;

  @Prop()
  inProductionAt?: Date;

  @Prop({ default: false, index: true })
  isMapped: boolean;

  @Prop({ ref: 'ProductConfigEntity', index: true })
  productConfigId?: string;

  @Prop({ ref: 'FactoryEntity', index: true })
  factoryId?: string;

  /**
   * Original factory at import time. `factoryId` mutates on transfer, this one
   * doesn't — drives the "transferred from ML to TN" classification in the
   * factory dashboard. Backfilled to equal `factoryId` for legacy rows.
   */
  @Prop({ ref: 'FactoryEntity', index: true })
  originalFactoryId?: string;

  @Prop({ ref: 'MachineTypeEntity', index: true })
  machineTypeId?: string;

  // ─── Workshop fields (Phase 2) ─────────────────────────────────
  // All values are workshop_config codes (string slugs). Editor cell maps
  // code → { name, color, icon } via the WorkshopConfig store on FE.

  @Prop({ index: true })
  printStatus?: string;

  @Prop()
  printStatusNote?: string;

  @Prop()
  toolResult?: string;

  @Prop({ index: true })
  toolResultNote?: string;

  @Prop()
  errorFile?: string;

  @Prop()
  errorFileNote?: string;

  @Prop({ index: true })
  assignee?: string;

  @Prop()
  assigneeNote?: string;

  /** workshop_config code (category=fabric_type). Auto-filled from product config at import. */
  @Prop({ index: true })
  fabricType?: string;

  /** workshop_config code (category=machine). Auto-filled from product config at import. */
  @Prop({ index: true })
  machineNumber?: string;

  // ─── Production error (Phase 8) ─────────────────────────────────
  // Xưởng báo lỗi đơn hàng (sai size, in lệch, máy hỏng...). Khi
  // `productionError` được set tức là đơn đang ở trạng thái lỗi xưởng;
  // dashboard + filter dùng `{ $exists: true, $ne: null, $ne: '' }`
  // để liệt kê.
  @Prop({ index: true })
  productionError?: string;

  @Prop()
  productionErrorNote?: string;

  // Derived: true when toolResultNote === 'ok' (Designer marks an order ready
  // for the Fulfillment role to pick up). Service recomputes this on every
  // toolResultNote update and on import.
  @Prop({ required: true, default: false, index: true })
  readyForFulfill: boolean;
}

export const OrderSchema = SchemaFactory.createForClass(OrderEntity);

OrderSchema.virtual('factory', {
  ref: 'FactoryEntity',
  localField: 'factoryId',
  foreignField: '_id',
  justOne: true,
});

OrderSchema.virtual('originalFactory', {
  ref: 'FactoryEntity',
  localField: 'originalFactoryId',
  foreignField: '_id',
  justOne: true,
});

OrderSchema.virtual('machineType', {
  ref: 'MachineTypeEntity',
  localField: 'machineTypeId',
  foreignField: '_id',
  justOne: true,
});

OrderSchema.virtual('productConfig', {
  ref: 'ProductConfigEntity',
  localField: 'productConfigId',
  foreignField: '_id',
  justOne: true,
});

export type OrderDocument = HydratedDocument<OrderEntity> & {
  factory?: FactoryDocument;
  machineType?: MachineTypeDocument;
  productConfig?: ProductConfigDocument;
};
