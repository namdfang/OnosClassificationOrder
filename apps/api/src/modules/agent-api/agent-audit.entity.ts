import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';

/**
 * Nhật ký mọi lời gọi tới bộ API agent (`API-1`, BR-7, AC-14).
 *
 * Bảng này nằm NGOÀI `AGENT_TABLE_REGISTRY` nên agent không đọc được nhật ký
 * của chính nó — đúng ý đồ.
 *
 * `queryDigest` là bản DSL ĐÃ CHUẨN HOÁ sau khi kiểm, không phải payload thô,
 * và điều kiện lọc trên trường `read:false` đã bị thay giá trị bằng
 * `<redacted>`: email khách dùng làm điều kiện lọc là dữ liệu BR-4, ghi nguyên
 * vào đây là tự tạo ra một kho email thứ hai ngay trong hệ thống.
 */
@DatabaseEntity({ collection: 'agentApiLogs' })
export class AgentApiLogEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, index: true })
  at: Date;

  @Prop({ required: true, index: true })
  capability: string;

  @Prop({ index: true })
  table?: string;

  @Prop()
  docSlug?: string;

  @Prop({ type: Object })
  queryDigest?: unknown;

  @Prop({ default: 0 })
  returned: number;

  @Prop({ default: 0 })
  durationMs: number;

  @Prop({ required: true })
  outcome: string;

  @Prop()
  errorCode?: string;
}

export const AgentApiLogSchema = SchemaFactory.createForClass(AgentApiLogEntity);
AgentApiLogSchema.index({ at: -1 });

export type AgentApiLogDocument = HydratedDocument<AgentApiLogEntity>;
