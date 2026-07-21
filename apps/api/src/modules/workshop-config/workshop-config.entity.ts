import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { FulfillmentStage, StageErrorReworkTarget, WorkshopConfigCategory } from 'shared';
import { FULFILLMENT_STAGES, WORKSHOP_CONFIG_CATEGORIES } from 'shared';

@DatabaseEntity({ collection: 'workshopConfigs' })
export class WorkshopConfigEntity extends DatabaseEntityAbstract {
  @Prop({ type: String, required: true, enum: WORKSHOP_CONFIG_CATEGORIES, index: true })
  category: WorkshopConfigCategory;

  @Prop({ required: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  color?: string;

  @Prop({ trim: true })
  icon?: string;

  @Prop({ required: true, default: 0 })
  order: number;

  @Prop({ required: true, default: true })
  isActive: boolean;

  /**
   * Chỉ dùng cho category=production_error.
   * - `'designer'`   → khi xưởng set lỗi này, đơn auto chuyển designerStatus='rework'.
   * - `'factory'`    → chỉ ghi nhận stats, không trigger rework.
   * - `'tool-check'` → đẩy về Support (soát tool), vd "Thiếu file để in".
   */
  @Prop({ type: String, enum: ['designer', 'factory', 'tool-check'] })
  errorSource?: 'designer' | 'factory' | 'tool-check';

  /**
   * Stage Error Catalog (chỉ category=production_error): công đoạn SỞ HỮU lỗi
   * (lỗi do công đoạn đó phát hiện, công nhân tự thêm qua trang danh mục lỗi
   * + QR). Rỗng = lỗi chung (hành vi cũ). Xem StageErrorCatalog.md.
   */
  @Prop({ type: String, enum: FULFILLMENT_STAGES })
  stage?: FulfillmentStage;

  /**
   * Đích đẩy về khi quét QR lỗi này: 'tool-check' | 'designer' | 1 stage TRƯỚC
   * `stage`. `errorSource` được service tự suy từ đây khi tạo/sửa.
   */
  @Prop({ type: String, enum: ['tool-check', 'designer', ...FULFILLMENT_STAGES] })
  reworkTarget?: StageErrorReworkTarget;
}

export const WorkshopConfigSchema = SchemaFactory.createForClass(WorkshopConfigEntity);
WorkshopConfigSchema.index({ category: 1, code: 1 }, { unique: true });

export type WorkshopConfigDocument = HydratedDocument<WorkshopConfigEntity>;
