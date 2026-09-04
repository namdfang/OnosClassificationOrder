import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import { ZALO_IDENTITY_KINDS, ZaloIdentityKind } from 'shared';

/**
 * Ai là ai trong các nhóm Zalo.
 *
 * Khoá là `zaloUid`, KHÔNG phải tên hiển thị. Đo trên dữ liệu thật 30/08: cùng
 * uid `623149364320559023` từng mang hai tên ("Ceo Onos", "Onos Ai"), và tên
 * "Onos" thuộc hai uid khác nhau. Khoá theo tên là sai ngay từ ngày đầu, mà
 * sai kiểu đó rất khó phát hiện — nó chỉ lộ ra khi ai đó đổi nick.
 */
@DatabaseEntity({ collection: 'zalo_identities' })
export class ZaloIdentityEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, unique: true, index: true, trim: true })
  zaloUid: string;

  /** Ảnh chụp tên mới nhất — chỉ để người đọc nhận ra, không dùng để tra. */
  @Prop({ trim: true })
  displayName?: string;

  @Prop({ type: String, required: true, default: ZaloIdentityKind.Unknown, enum: ZALO_IDENTITY_KINDS, index: true })
  kind: ZaloIdentityKind;

  @Prop({ ref: 'UserEntity', index: true })
  userId?: string;

  @Prop({ ref: 'CustomerEntity', index: true })
  customerId?: string;

  /**
   * Bằng chứng cho người duyệt: người trực nhiều nhóm là nhân viên, khách chỉ
   * ở nhóm của mình. Lưu ngay cạnh bản ghi để người xét không phải tin mù.
   */
  @Prop({ default: 0, index: true })
  groupCount: number;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop({ type: String, enum: ZALO_IDENTITY_KINDS })
  suggestedKind?: ZaloIdentityKind;

  @Prop({ ref: 'UserEntity' })
  confirmedByUserId?: string;

  /** Có giá trị = người đã xác nhận; đồng bộ sau KHÔNG được ghi đè `kind` nữa. */
  @Prop({ index: true })
  confirmedAt?: Date;

  @Prop()
  syncedAt?: Date;
}

export const ZaloIdentitySchema = SchemaFactory.createForClass(ZaloIdentityEntity);

// Danh sách chờ xét: người xuất hiện nhiều nhóm nhất lên đầu — xét họ trước
// thì mỗi lượt xét gỡ được nhiều tin nhắn nhất.
ZaloIdentitySchema.index({ confirmedAt: 1, groupCount: -1 });

export type ZaloIdentityDocument = HydratedDocument<ZaloIdentityEntity>;
