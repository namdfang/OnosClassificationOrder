import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseEntity, DatabaseEntityAbstract } from 'core';
import type { HydratedDocument } from 'mongoose';
import { Status } from 'shared';

@DatabaseEntity({ collection: 'customers' })
export class CustomerEntity extends DatabaseEntityAbstract {
  // Không required nữa — khách tự đăng ký qua Customer Portal có thể chưa có
  // lịch sử đơn hàng (chưa có sku) tại thời điểm tạo tài khoản.
  @Prop({ trim: true, default: '', index: true })
  userSku: string;

  @Prop({ trim: true, default: '' })
  userEmail: string;

  @Prop({ default: 'sync' })
  source: string;

  // Tier VIP 0..5; null = khách lẻ (chưa xếp hạng).
  @Prop({ type: Number, default: null })
  tier: number | null;
  // Rỗng '' = record tạo qua sync/thêm tay, CHƯA đăng ký → chưa đăng nhập được
  // cho tới khi khách tự đăng ký (claim) qua Customer Portal.
  @Prop({ default: '' })
  password: string;

  @Prop({ trim: true, default: '' })
  fullName: string;

  @Prop({ trim: true, default: '' })
  phone: string;

  @Prop({ default: Status.Active })
  status: string;

  // Mốc "đã đọc thông báo tới lúc này" — bump khi khách bấm "Đánh dấu đã đọc"
  // ở chuông thông báo Customer Portal. KHÔNG public qua `toSafeCustomer()`/
  // `CustomerZod` — chỉ đọc/ghi nội bộ trong `customer-notification` module.
  @Prop({ type: Date, default: null })
  notificationsReadAt: Date | null;

  // Xóa mềm dùng field `deletedAt` KẾ THỪA từ DatabaseEntityAbstract (core) —
  // khách đã xóa: ẩn khỏi mọi list/kanban, chặn đăng nhập, sync không hồi sinh
  // (unique index giữ record → upsert coi như existing). KHÔNG khai báo lại ở đây.
}

export const CustomerSchema = SchemaFactory.createForClass(CustomerEntity);
// Khóa nhận diện khách = cặp (userSku, userEmail) → chống trùng.
CustomerSchema.index({ userSku: 1, userEmail: 1 }, { unique: true });

export type CustomerDocument = HydratedDocument<CustomerEntity>;
