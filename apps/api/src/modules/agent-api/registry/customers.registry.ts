import type { AgentTableSpec } from './field-policy';
import { contactFilterOnly, plain } from './field-policy';

/**
 * `customers` — nhận diện khách đang nhắn và tra đơn theo khách.
 *
 * `userSku` và `fullName` KHÔNG bị che: đó là nhãn định danh, agent cần để gọi
 * đúng tên khách (BR-4a §3). `userEmail` và `phone` là đường liên lạc — lọc
 * được bằng đúng giá trị, không đọc được (BR-5).
 *
 * `passwordSource` bị che dù không phải hash: giá trị `'system'` là tín hiệu
 * "tài khoản đang dùng mật khẩu mặc định", trả ra là API tự chỉ điểm tài khoản
 * nào đang mở (BR-4a §1). `impersonatedBy` mang danh tính nhân viên mạo danh
 * (BR-4a §4).
 */
export const customersRegistry: AgentTableSpec = {
  key: 'customers',
  description:
    'Tài khoản khách hàng. Dùng để biết đang nói chuyện với ai và tìm đơn theo khách. ' +
    'Trả về mã tài khoản và tên khách; KHÔNG trả email, điện thoại.',
  entityName: 'CustomerEntity',
  defaultSort: '_id',
  fields: {
    _id: plain('objectId'),
    createdAt: plain('date'),
    userSku: plain('string', 'Mã tài khoản khách — khoá nối sang orders.userSku'),
    fullName: plain('string', 'Tên khách, dùng để xưng hô'),
    userEmail: contactFilterOnly('LỌC được bằng đúng giá trị, KHÔNG đọc được (BR-5)'),
    phone: contactFilterOnly('LỌC được bằng đúng giá trị, KHÔNG đọc được (BR-5)'),
    tier: plain('number', 'Hạng khách VIP 0..5; rỗng = khách lẻ'),
    status: plain('string'),
    source: plain('string'),
  },
  deliberatelyExcluded: [
    // BR-4a §1 — bí mật xác thực
    'password',
    'passwordSource',
    // BR-4a §4 — dấu vết nhân viên mạo danh (gồm cả email nhân viên)
    'impersonatedBy',
    'notificationsReadAt',
    'updatedAt',
    'deletedAt',
  ],
};
