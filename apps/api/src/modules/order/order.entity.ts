import { Prop, raw, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { DesignFields } from 'shared';
import { DESIGNER_STATUSES, DesignerStatus } from 'shared';

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

  /**
   * Trạng thái xử lý R2 cho từng vị trí design. Set khi import → worker cập
   * nhật. Value: `'pending' | 'ready' | 'failed'`. Không có status → coi như
   * legacy data (URL trong `designs.{k}` là URL gốc / Teehub cũ).
   */
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
  designsStatus?: Record<keyof DesignFields, 'pending' | 'ready' | 'failed' | undefined>;

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

  /**
   * Phân loại nguồn lỗi cho dashboard stats (Phase Fulfillment per-factory).
   * Auto-fill từ workshop_config.errorSource khi user set productionError;
   * cho phép override.
   */
  @Prop({ type: String, enum: ['designer', 'factory'], index: true })
  productionErrorSource?: 'designer' | 'factory';

  /** Đếm số lần xưởng đã set productionError. Display "Lỗi ×N" trên cell. */
  @Prop({ required: true, default: 0 })
  productionErrorCount: number;

  /**
   * Thời điểm đơn LẦN ĐẦU bị xưởng đánh productionError trong cycle hiện tại.
   * Set khi `productionError` chuyển từ null → value (và field chưa có giá trị).
   * Clear (= unset) khi đơn rời nhật ký bù lỗi: `toolResultNote === 'ok'`
   * hoặc `productionError` được clear. Dùng cho tab Nhật ký bù lỗi để sort
   * theo thời gian lỗi cũ nhất + tính mức độ khẩn (24h/48h/72h).
   */
  @Prop({ index: true })
  productionFirstErrorAt?: Date;

  // Derived: true when toolResultNote === 'ok' (Designer marks an order ready
  // for the Fulfillment role to pick up). Service recomputes this on every
  // toolResultNote update and on import.
  @Prop({ required: true, default: false, index: true })
  readyForFulfill: boolean;

  // ─── Designer task workflow (Phase 1 Designer-Task-Workflow) ─────
  /**
   * State machine — default 'unassigned'. Mọi transition đi qua endpoint
   * `POST /orders/:id/designer-transition` (state machine + auto side effects).
   * Reassign chỉ cho khi status ∈ {unassigned, assigned, rejected}.
   */
  @Prop({
    type: String,
    enum: DESIGNER_STATUSES,
    default: DesignerStatus.Unassigned,
    required: true,
    index: true,
  })
  designerStatus: DesignerStatus;

  @Prop() designerAssignedAt?: Date;
  /** Start time của cycle hiện tại — reset mỗi lần start/restart. */
  @Prop() designerStartedAt?: Date;
  /** Start time của lần đầu — set 1 lần (immutable). Dùng cho response time. */
  @Prop() designerFirstStartedAt?: Date;
  @Prop() designerCompletedAt?: Date;
  @Prop() designerRejectedAt?: Date;
  @Prop() designerReworkAt?: Date;

  @Prop({ trim: true })
  designerRejectedReason?: string;

  @Prop({ required: true, default: 0 })
  designerReworkCount: number;

  /** Cumulative work time (ms) — $inc khi complete. */
  @Prop({ required: true, default: 0 })
  designerWorkMs: number;
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
