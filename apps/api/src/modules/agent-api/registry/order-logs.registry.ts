import type { AgentTableSpec } from './field-policy';
import { plain } from './field-policy';

/**
 * `orderLogs` — dòng thời gian đơn đã đi qua những chặng nào, lúc nào.
 *
 * Vế "AI xử lý" bị **cắt khỏi phạm vi** (BR-4a §4): tám trường danh tính
 * (`userId`, `userName`, `userEmail`, `roleCode`, `impersonatorId`,
 * `impersonatorName`, `ip`, `userAgent`) không có trong danh sách trắng.
 * Khách không bao giờ được biết tên nhân viên nào chạm vào đơn của họ, càng
 * không được biết địa chỉ mạng hay dấu vết phiên mạo danh của quản trị.
 *
 * `before`/`after` KHÔNG nằm trong `fields`: chúng kiểu `Object` tuỳ ý nên
 * không che được theo tên trường. Chúng được ghép lại vào kết quả bởi
 * `applyOrderLogValuePolicy()` (xem `order-log-value-policy.ts`, AC-17) sau khi
 * đã đi qua danh sách trắng 17 tên trường mà BA chốt ở BR-4a §5a.
 */
export const orderLogsRegistry: AgentTableSpec = {
  key: 'orderLogs',
  description:
    'Nhật ký thao tác trên đơn — giải thích đơn đã đi qua những chặng nào, lúc nào. ' +
    'KHÔNG kèm danh tính người thực hiện. Giá trị cũ/mới chỉ có với các trường tình trạng ' +
    'sản xuất nằm trong danh sách cho phép.',
  entityName: 'OrderLogEntity',
  defaultSort: '_id',
  fields: {
    _id: plain('objectId'),
    createdAt: plain('date', 'Thời điểm thao tác'),
    orderId: plain('objectId', 'Trỏ tới orders._id — nối với bảng orders để biết đơn nào'),
    action: plain('enum', 'Loại thao tác: import, update, hold, unhold, ...'),
    field: plain('string', 'Tên trường bị đổi trong thao tác này'),
  },
  deliberatelyExcluded: [
    // BR-4a §4 — danh tính người thực hiện thao tác
    'userId',
    'userName',
    'userEmail',
    'roleCode',
    'impersonatorId',
    'impersonatorName',
    'ip',
    'userAgent',
    // Ghép lại có kiểm soát ở tầng service, không đi qua registry — xem AC-17
    'before',
    'after',
    'updatedAt',
    'deletedAt',
  ],
};
