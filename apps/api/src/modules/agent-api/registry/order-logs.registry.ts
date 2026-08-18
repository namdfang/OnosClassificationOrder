import type { AgentTableSpec } from './field-policy';
import { plain, readOnly } from './field-policy';

/**
 * `orderLogs` — dòng thời gian đơn đã đi qua những chặng nào, lúc nào.
 *
 * `API-17` mở vế "AI xử lý": sáu trường danh tính (`userId`, `userName`,
 * `userEmail`, `roleCode`, `impersonatorId`, `impersonatorName`) **nay đọc
 * được** theo quyết định của người dùng. Chỉ còn `ip` và `userAgent` bị che —
 * chúng thuộc BỐN trường bí mật kỹ thuật BA chốt ở AC-03, và là dấu vết phiên
 * làm việc chứ không phải thông tin nghiệp vụ.
 *
 * `before`/`after` VẪN KHÔNG nằm trong `fields`, và đây là chủ ý BA duyệt lại
 * ở `API-17`: chúng kiểu `Object` tuỳ ý nên không che được theo tên trường. Mở
 * chúng thành trường đọc bình thường sẽ phơi giá trị cũ/mới của MỌI trường —
 * kể cả tám trường tiền vừa quyết định phải giấu, tức mở lại đúng thứ vừa khoá.
 * Chúng được ghép vào kết quả bởi `applyOrderLogValuePolicy()` (xem
 * `order-log-value-policy.ts`) sau khi qua danh sách trắng tên trường.
 */
export const orderLogsRegistry: AgentTableSpec = {
  key: 'orderLogs',
  description:
    'Nhật ký thao tác trên đơn — giải thích đơn đã đi qua những chặng nào, lúc nào, ai làm. ' +
    'Giá trị cũ/mới chỉ có với các trường nghiệp vụ nằm trong danh sách cho phép.',
  entityName: 'OrderLogEntity',
  defaultSort: '_id',
  fields: {
    _id: plain('objectId'),
    createdAt: plain('date', 'Thời điểm thao tác'),
    orderId: plain('objectId', 'Trỏ tới orders._id — nối với bảng orders để biết đơn nào'),
    action: plain('enum', 'Loại thao tác: import, update, hold, unhold, ...'),
    field: plain('string', 'Tên trường bị đổi trong thao tác này'),

    // ── `API-17` mở đọc: danh tính người thao tác
    userId: readOnly('string', 'Người thực hiện thao tác'),
    userName: readOnly('string', 'Tên người thực hiện'),
    userEmail: readOnly('string', 'Email người thực hiện'),
    roleCode: readOnly('string', 'Vai trò của người thực hiện'),
    impersonatorId: readOnly('string', 'Người đăng nhập thay, nếu có'),
    impersonatorName: readOnly('string', 'Tên người đăng nhập thay, nếu có'),
    updatedAt: readOnly('date'),
    deletedAt: readOnly('date', 'Bản ghi bị xoá mềm. Mở ĐỌC KHÔNG đổi bộ lọc mặc định của truy vấn'),
  },
  deliberatelyExcluded: [
    // `API-17` — hai trong BỐN trường bí mật kỹ thuật BA chốt ở AC-03
    'ip',
    'userAgent',
    // KHÔNG phải trường bị cấm: ghép lại có kiểm soát ở tầng service, xem doc
    // đầu file. Đây là ngoại lệ DUY NHẤT ngoài danh sách 12 trường bị chặn.
    'before',
    'after',
  ],
};
