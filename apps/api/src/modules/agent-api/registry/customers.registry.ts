import type { AgentTableSpec } from './field-policy';
import { plain } from './field-policy';

/**
 * `customers` — nhận diện khách đang nhắn và tra đơn theo khách.
 *
 * `API-17` mở đọc `userEmail`/`phone`; `API-19` mở nốt mức lọc — nay dò được
 * theo `$startsWith`, sắp xếp và nhóm được như mọi trường khác. Người dùng đã
 * cân nhắc và chốt: cái giá là agent có thể quét ngược từ một mảnh liên hệ ra
 * khách nào, và đó là điều họ muốn có.
 *
 * Chỉ còn **hai** trường bị che, cả hai là bí mật xác thực.
 * `passwordSource` bị che dù không phải hash: giá trị `'system'` là tín hiệu
 * "tài khoản đang dùng mật khẩu mặc định", trả ra là API tự chỉ điểm tài khoản
 * nào đang mở.
 */
export const customersRegistry: AgentTableSpec = {
  key: 'customers',
  description:
    'Tài khoản khách hàng. Dùng để biết đang nói chuyện với ai và tìm đơn theo khách. ' +
    'Trả về mã tài khoản, tên khách, email và điện thoại; KHÔNG trả mật khẩu.',
  entityName: 'CustomerEntity',
  defaultSort: '_id',
  fields: {
    _id: plain('objectId'),
    createdAt: plain('date'),
    userSku: plain('string', 'Mã tài khoản khách — khoá nối sang orders.userSku'),
    fullName: plain('string', 'Tên khách, dùng để xưng hô'),
    userEmail: plain('string', 'Email khách — đọc/lọc/nhóm được đầy đủ'),
    phone: plain('string', 'Điện thoại khách — đọc/lọc/nhóm được đầy đủ'),
    tier: plain('number', 'Hạng khách VIP 0..5; rỗng = khách lẻ'),
    status: plain('string'),
    source: plain('string'),

    // ── `API-17` mở đọc
    notificationsReadAt: plain('date', 'Lần cuối khách mở danh sách thông báo'),
    updatedAt: plain('date'),
    deletedAt: plain('date', 'Bản ghi bị xoá mềm. Mở ĐỌC KHÔNG đổi bộ lọc mặc định của truy vấn'),
  },
  deliberatelyExcluded: [
    // Hai trong BỐN tên bị chặn còn lại sau `API-19` — bí mật xác thực
    'password',
    'passwordSource',
    // `apiKeys[]` (ORD-4) — mỗi phần tử chứa `hash` (sha256 của API key khách
    // dùng gọi Public Order API). Cùng loại với `password`: lộ hash là cho
    // phép dò ngược/đối chiếu offline, nên loại trừ CẢ mảng thay vì phơi các
    // trường vô hại (label/prefix/lastUsedAt) rồi để `hash` lọt theo.
    'apiKeys',
    // KHÔNG phải trường bị cấm: `impersonatedBy` là trường ĐỘNG, không có
    // khai báo trên schema nên KHÔNG tồn tại trong collection — không có gì để
    // phơi. Đưa vào `fields` thì bất biến I4 đỏ vì nó là trường ma.
    'impersonatedBy',
  ],
};
