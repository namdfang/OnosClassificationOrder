import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';

/**
 * Nhận định của hệ thống cho một kỳ CEO Dashboard (`ceo_reports`). Mỗi lần sinh là
 * MỘT bản ghi mới (giữ lịch sử); bản hiển thị = bản mới nhất theo `periodKey`.
 */
@DatabaseEntity({ collection: 'ceo_reports' })
export class CeoReportEntity extends DatabaseEntityAbstract {
  /** `${from}_${to}` */
  @Prop({ required: true, index: true })
  periodKey: string;

  @Prop({ required: true }) from: string;
  @Prop({ required: true }) to: string;
  @Prop({ required: true }) kind: string;

  @Prop({ required: true }) tomTat: string;
  @Prop({ type: [String], default: [] }) ketLuan: string[];
  @Prop({ type: [String], default: [] }) viecCanLam: string[];
  @Prop({ type: [String], default: [] }) ruiRo: string[];
  @Prop({ type: [String], default: [] }) diemSang: string[];

  @Prop({ type: Object, required: true }) soLieu: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) findings: unknown[];

  @Prop({ required: true }) model: string;
  @Prop({ required: true, index: true }) generatedAt: Date;
  @Prop({ required: true }) trigger: string;
}

export const CeoReportSchema = SchemaFactory.createForClass(CeoReportEntity);
CeoReportSchema.index({ periodKey: 1, generatedAt: -1 });
export type CeoReportDocument = HydratedDocument<CeoReportEntity>;
