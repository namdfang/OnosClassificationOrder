import type { AgentTableSpec } from './field-policy';
import { contactField, plain, readOnly } from './field-policy';

/**
 * `customers` — nhận diện khách đang nhắn và tra đơn theo khách.
 *
 * `API-17`: `userEmail` và `phone` **nay đọc được** (trước chỉ lọc được). Người
 * dùng chốt cho nhất quán với `API-11` — đã thôi che email/điện thoại trong văn
 * bản tự do thì giữ kín ở trường có cấu trúc chỉ là bảo vệ nửa vời. Mức lọc giữ
 * nguyên `eq`: lọc bằng giá trị đã biết, không dò dần từng ký tự (AC-05).
 *
 * Chỉ còn **hai** trường bị che, cả hai là bí mật xác thực (AC-03).
 * `passwordSource` bị che dù không phải hash: giá trị `'system'` là tín hiệu
 * "tài khoản đang dùng mật khẩu mặc định", trả ra là API tự chỉ điểm tài khoản
 * nào đang mở.
 */
export const customersRegistry: AgentTableSpec = {
  key: 'customers',
  description:
    'Tài khoản khách hàng. Dùng để biết đang nói chuyện với ai và tìm đơn theo khách. ' +
    'Trả về mã tài khoản, tên khách, email và điện thoại; KHÔNG trả bí mật xác thực.',
  entityName: 'CustomerEntity',
  defaultSort: '_id',
  fields: {
    _id: plain('objectId'),
    createdAt: plain('date'),
    userSku: plain('string', 'Mã tài khoản khách — khoá nối sang orders.userSku'),
    fullName: plain('string', 'Tên khách, dùng để xưng hô'),
    userEmail: contactField('Đọc được; LỌC bằng đúng giá trị, không dò dần'),
    phone: contactField('Đọc được; LỌC bằng đúng giá trị, không dò dần'),
    tier: plain('number', 'Hạng khách VIP 0..5; rỗng = khách lẻ'),
    status: plain('string'),
    source: plain('string'),

    // ── `API-17` mở đọc
    notificationsReadAt: readOnly('date', 'Lần cuối khách mở danh sách thông báo'),
    updatedAt: readOnly('date'),
    deletedAt: readOnly('date', 'Bản ghi bị xoá mềm. Mở ĐỌC KHÔNG đổi bộ lọc mặc định của truy vấn'),
  },
  deliberatelyExcluded: [
    // `API-17` — bí mật xác thực, thuộc BỐN trường kỹ thuật BA chốt ở AC-03
    'password',
    'passwordSource',
    // KHÔNG phải trường bị cấm: `impersonatedBy` là trường ĐỘNG, không có
    // khai báo trên schema nên KHÔNG tồn tại trong collection — không có gì để
    // phơi. Đưa vào `fields` thì bất biến I4 đỏ vì nó là trường ma.
    'impersonatedBy',
  ],
};
