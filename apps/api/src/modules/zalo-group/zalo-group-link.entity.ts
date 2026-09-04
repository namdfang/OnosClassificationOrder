import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { assertSameType, DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import type { ZaloGroupLink } from 'shared';
import { ZALO_GROUP_KINDS, ZaloGroupKind } from 'shared';

import type { CustomerDocument } from '../customer/customer.entity';
import type { UserDocument } from '../user/user.entity';

/**
 * Mối nối NHÓM Zalo ↔ khách hàng (seller).
 *
 * Zalo sống ở máy `onosceo` (engine + Postgres riêng); bảng này chỉ giữ phần
 * OnosFactory sở hữu: nhóm đó thuộc về ai, ai chịu trách nhiệm, có được đưa
 * vào phân tích không.
 */
@DatabaseEntity({ collection: 'zalo_group_links' })
export class ZaloGroupLinkEntity extends DatabaseEntityAbstract {
  /**
   * KHOÁ THẬT của nhóm bên engine Zalo.
   *
   * KHÔNG dùng id hội thoại làm khoá: engine lưu một bản ghi hội thoại cho MỖI
   * nick công ty có mặt trong nhóm, nên một nhóm hiện ra thành nhiều dòng — đo
   * trên `onosceo` 29/08: 157 dòng = 147 nhóm thật. Khoá theo hội thoại thì
   * người vận hành phải gắn cùng một nhóm nhiều lần, sót một lần là hụt dữ
   * liệu của nick đó.
   *
   * Unique đặt ở TẦNG DB chứ không chỉ trong service: hai người gắn hai khách
   * khác nhau cho cùng một nhóm là hỏng âm thầm, và số liệu doanh thu bị chia đôi.
   */
  @Prop({ required: true, unique: true, index: true, trim: true })
  groupGlobalId: string;

  /** Ảnh chụp tên nhóm lúc đồng bộ — để danh sách render không phải gọi sang engine. */
  @Prop({ trim: true })
  title?: string;

  @Prop({ type: String, required: true, default: ZaloGroupKind.Unreviewed, enum: ZALO_GROUP_KINDS, index: true })
  kind: ZaloGroupKind;

  /**
   * Khách sở hữu nhóm. Để RỖNG là hợp lệ và có nghĩa — nhóm vận hành/nội bộ đã
   * xét vẫn phải lưu được, nếu không danh sách chờ gắn không bao giờ cạn.
   */
  @Prop({ ref: 'CustomerEntity', index: true })
  customerId?: string;

  /**
   * Ảnh chụp `userSku` của khách lúc gắn. Đơn hàng nối với khách qua
   * `userSku`/`userEmail` chứ không qua `customerId`, nên thiếu trường này thì
   * mọi báo cáo nối nhóm ↔ đơn phải tra thêm một vòng sang `customers`.
   */
  @Prop({ trim: true, index: true })
  userSku?: string;

  /**
   * Người CHỊU TRÁCH NHIỆM chính — quyết định của quản lý.
   *
   * Tách hẳn khỏi `memberNicks`: nick nào đang ở trong nhóm là sự thật đọc từ
   * Zalo mà hệ thống không đổi được; còn ai chịu trách nhiệm thì không suy ra
   * được từ dữ liệu, phải có người chỉ định.
   */
  @Prop({ ref: 'UserEntity', index: true })
  ownerUserId?: string;

  /** Các id hội thoại engine gộp về nhóm này (mỗi nick một dòng). */
  @Prop({ type: [String], default: [] })
  conversationIds: string[];

  /** Nick công ty đang có mặt trong nhóm — đọc từ Zalo, chỉ để hiển thị. */
  @Prop({ type: [String], default: [] })
  memberNicks: string[];

  @Prop({ index: true })
  lastMessageAt?: Date;

  @Prop({ trim: true })
  note?: string;

  @Prop({ ref: 'UserEntity' })
  linkedByUserId?: string;

  @Prop()
  linkedAt?: Date;

  @Prop()
  syncedAt?: Date;
}

assertSameType<ZaloGroupLink, ZaloGroupLinkEntity>();
assertSameType<ZaloGroupLinkEntity, ZaloGroupLink>();

export const ZaloGroupLinkSchema = SchemaFactory.createForClass(ZaloGroupLinkEntity);

// Danh sách chờ gắn: lọc theo phân loại rồi xếp nhóm có tin mới nhất lên đầu.
ZaloGroupLinkSchema.index({ kind: 1, lastMessageAt: -1 });

ZaloGroupLinkSchema.virtual('customer', {
  ref: 'CustomerEntity',
  localField: 'customerId',
  foreignField: '_id',
  justOne: true,
});

ZaloGroupLinkSchema.virtual('owner', {
  ref: 'UserEntity',
  localField: 'ownerUserId',
  foreignField: '_id',
  justOne: true,
});

export type ZaloGroupLinkDocument = HydratedDocument<ZaloGroupLinkEntity> & {
  customer?: CustomerDocument;
  owner?: UserDocument;
};
