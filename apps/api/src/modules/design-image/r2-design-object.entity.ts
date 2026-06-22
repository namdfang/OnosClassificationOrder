import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';

@DatabaseEntity({ collection: 'r2DesignObjects' })
export class R2DesignObjectEntity extends DatabaseEntityAbstract {
  /** Drive file ID (10-128 chars) hoặc sha256(url)[:24] cho non-Drive URL. */
  @Prop({ required: true, unique: true, index: true })
  hash: string;

  /** URL gốc đầu tiên dùng cho hash này (chỉ để debug — có thể nhiều URL khác cùng hash). */
  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ required: true })
  previewKey: string;

  @Prop({ required: true })
  thumbKey: string;

  /** Tổng bytes 2 variant đang lưu trên R2. Dùng cho monitor cost. */
  @Prop({ required: true, default: 0 })
  sizeBytes: number;

  /**
   * Số order đang reference object này. +1 khi import success, -1 khi
   * soft-delete order. `refCount=0 AND updatedAt < 30 ngày` → cron Phase 10
   * sẽ xoá khỏi R2.
   */
  @Prop({ required: true, default: 0, index: true })
  refCount: number;
}

export const R2DesignObjectSchema = SchemaFactory.createForClass(R2DesignObjectEntity);

export type R2DesignObjectDocument = HydratedDocument<R2DesignObjectEntity>;
