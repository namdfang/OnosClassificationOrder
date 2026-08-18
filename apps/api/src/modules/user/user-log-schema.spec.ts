import { OrderLogSchema } from '../order-log/order-log.entity';
import { UserLogSchema } from './user-log.entity';

/**
 * Chặn tái phát `AUTH-1-B1`.
 *
 * Bug gốc: `impersonatorId` được khai trong `UserLogZod` (shared DTO) và được
 * truyền đúng từ `actorFields()`, nhưng `UserLogEntity` **thiếu `@Prop`**. Mongoose
 * chạy strict mode nên field không có trong schema bị **âm thầm loại bỏ** lúc ghi —
 * không lỗi, không cảnh báo, chỉ là dữ liệu biến mất. Nửa đơn hàng (`orderLogs`)
 * làm đúng, nửa tài khoản (`userLogs`) mất dấu, nên AC-06 hỏng đúng một nửa.
 *
 * Vì sao typecheck KHÔNG bắt được: `assertSameType<UserLog, UserLogEntity>()` có
 * trong `user-log.entity.ts`, nhưng `impersonatorId` là **optional** — TypeScript
 * coi một type thiếu property optional vẫn assignable, nên khẳng định đó vẫn xanh
 * trong khi schema và DTO đã lệch. Test này kiểm ĐÚNG THỨ mà kiểu không kiểm được:
 * field có thật sự nằm trong schema Mongoose hay không.
 */
describe('AUTH-1 AC-06 — schema log phải THẬT SỰ có field truy vết mạo danh', () => {
  it('userLogs có path impersonatorId — thiếu là Mongoose nuốt mất field khi ghi', () => {
    expect(UserLogSchema.path('impersonatorId')).toBeDefined();
  });

  it('orderLogs có đủ impersonatorId + impersonatorName', () => {
    expect(OrderLogSchema.path('impersonatorId')).toBeDefined();
    expect(OrderLogSchema.path('impersonatorName')).toBeDefined();
  });

  it('các field vốn có vẫn còn nguyên — không vô tình xoá khi thêm field mới', () => {
    expect(UserLogSchema.path('actorId')).toBeDefined();
    expect(UserLogSchema.path('userId')).toBeDefined();
    expect(OrderLogSchema.path('userId')).toBeDefined();
  });
});
