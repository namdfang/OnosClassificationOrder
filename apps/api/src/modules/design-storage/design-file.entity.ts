import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { DesignFileStatus } from 'shared';
import { DESIGN_FILE_STATUSES } from 'shared';

/**
 * File design VẬT LÝ trên R2 — 1 record = 1 nội dung file duy nhất (dedup theo
 * sha256 NỘI DUNG, không phải URL/Drive ID). Biến thể trên R2 theo key layout
 * `designFileKey()` (shared/dtos/design-file.dto.ts). Vòng đời original theo
 * sliding window `lastUsedAt` — xem `DesignStorageService.runLifecycle()`.
 *
 * KHÁC `r2DesignObjects` (module design-image cũ — thumb/preview theo URL-hash,
 * xử lý in-process đã tắt vì nghẽn VPS): collection này là nguồn chân lý cho
 * pipeline worker riêng, có original + lifecycle.
 */
@DatabaseEntity({ collection: 'design_files' })
export class DesignFileEntity extends DatabaseEntityAbstract {
  /** sha256 hex nội dung file — khóa dedup toàn hệ thống. */
  @Prop({ required: true, unique: true, index: true })
  sha256: string;

  // Union type — Mongoose không tự suy được, PHẢI khai type tường minh
  // (CannotDetermineTypeError lúc boot nếu thiếu).
  @Prop({ type: String, required: true, default: 'processing', index: true, enum: DESIGN_FILE_STATUSES })
  status: DesignFileStatus;

  /** Tên file thật khách đặt (chỉ hiển thị). */
  @Prop({ trim: true })
  fileName?: string;

  /** Bytes file original. */
  @Prop({ required: true, default: 0 })
  size: number;

  @Prop({ trim: true })
  mime?: string;

  @Prop()
  width?: number;

  @Prop()
  height?: number;

  /** false = không phải ảnh raster (PSD/AI/PDF…) — không có thumb/preview. */
  @Prop({ required: true, default: false })
  hasPreview: boolean;

  /** Storage class của original trên R2. */
  @Prop({ type: String, required: true, default: 'standard', enum: ['standard', 'ia'] })
  storageClass: 'standard' | 'ia';

  /** Set khi hạ IA — cron xóa thật đọc mốc này. */
  @Prop()
  archivedAt?: Date;

  /** Sliding window — MỌI đơn mới tham chiếu design là $set lại (touchUsage). */
  @Prop({ required: true, default: Date.now })
  lastUsedAt: Date;

  @Prop({ required: true, default: 0 })
  usageCount: number;

  /**
   * Alias URL-hash (`hashForR2()` — Drive ID hoặc sha256(url)[:24]) của các
   * source URL đã ingest về file này — dedup TRƯỚC khi download cho job
   * kind='url' (cùng link Drive lần 2 → khỏi tải lại 100MB).
   */
  @Prop({ type: [String], index: true, default: [] })
  sourceKeys: string[];

  /** URL nguồn đầu tiên (debug/provenance) — nếu ingest từ URL ngoài. */
  @Prop()
  sourceUrl?: string;

  @Prop()
  errorMessage?: string;

  /** Seller upload/ingest đầu tiên (denorm — thống kê "design của ai"). */
  @Prop({ type: Object })
  uploadedBy?: { customerId?: string; userEmail?: string };
}

export const DesignFileSchema = SchemaFactory.createForClass(DesignFileEntity);
// Cron archive (ready + lâu không dùng) và cron xóa (archived + quá hạn IA).
DesignFileSchema.index({ status: 1, lastUsedAt: 1 });
DesignFileSchema.index({ status: 1, archivedAt: 1 });

export type DesignFileDocument = HydratedDocument<DesignFileEntity>;
