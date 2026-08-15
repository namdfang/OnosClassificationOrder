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

  // AUTH-1 AC-14/BR-15 — AI đặt mật khẩu, tách khỏi việc CÓ mật khẩu hay không.
  //   thiếu field  → tài khoản có từ trước AUTH-1, coi như khách tự đặt
  //   'system'     → do BR-8 đặt khi bị mạo danh; register() vẫn cho chính chủ
  //                  claim đè lên, nếu không thì mạo danh một lần là khoá họ
  //                  vĩnh viễn khỏi luồng tự đăng ký
  //   'self'       → khách tự đặt, register() từ chối như cũ
  // TUYỆT ĐỐI KHÔNG trả field này ra API: 'system' chính là tín hiệu "tài khoản
  // đang dùng mật khẩu mặc định", lộ ra là API tự chỉ điểm tài khoản nào đang mở.
  // `toSafeCustomer()` xoá tường minh — xem customer.service.ts.
  @Prop({ required: false })
  passwordSource?: 'self' | 'system';

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
}

export const CustomerSchema = SchemaFactory.createForClass(CustomerEntity);
// Khóa nhận diện khách = cặp (userSku, userEmail) → chống trùng.
CustomerSchema.index({ userSku: 1, userEmail: 1 }, { unique: true });

export type CustomerDocument = HydratedDocument<CustomerEntity> & {
  /**
   * AUTH-1 — xem chú thích cùng tên ở `UserDocument`. Field ĐỘNG, không có
   * `@Prop`; `toSafeCustomer()` dùng `toObject()` nên `CustomerAuthController.me()`
   * phải ghép tường minh.
   */
  impersonatedBy?: { _id: string; fullName?: string; email?: string };
};
