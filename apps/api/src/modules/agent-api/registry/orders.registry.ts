import type { AgentTableSpec } from './field-policy';
import { contactFilterOnly, freeText, numeric, plain } from './field-policy';

/**
 * `orders` — bảng chính để trả lời "đơn của tôi đang thế nào".
 *
 * ĐÂY LÀ BẢNG NHẠY CẢM NHẤT của bộ API. Ba nhóm bị che tuyệt đối, xem
 * `.devtasks/design/API-1.md` §7.2:
 *  - `shippingAddress` — che TOÀN KHỐI, kể cả `country`/`state` (BR-4a §3).
 *  - `baseCost`/`shipCost` — BA chốt che ở bước `design_review`.
 *  - Danh tính người thao tác: `assignee` (= `user._id` của designer),
 *    `designerRejections[]`, `fulfillmentTimeline[]`, `fulfillmentStages.*`
 *    (BR-4a §4, vế "mọi nơi khác có dấu vết người thao tác").
 *
 * Hệ quả nghiệp vụ BA đã chấp nhận có ý thức: agent KHÔNG nói được tiền của
 * đơn, KHÔNG nói được ai đang làm đơn, KHÔNG nói được đơn giao đi đâu. Ba loại
 * câu hỏi đó chuyển cho người thật.
 */
export const ordersRegistry: AgentTableSpec = {
  key: 'orders',
  description:
    'Đơn sản xuất. Trả lời tình trạng đơn của khách: đơn đang ở công đoạn nào, xưởng nào, ' +
    'trạng thái thiết kế, đã xong chưa, có bị lỗi hay bị giữ không. KHÔNG chứa địa chỉ giao, ' +
    'tiền, hay tên người xử lý.',
  entityName: 'OrderEntity',
  defaultSort: '_id',
  fields: {
    _id: plain('objectId'),
    createdAt: plain('date', 'Thời điểm bản ghi đơn được tạo trong hệ thống'),
    updatedAt: plain('date'),

    productionId: plain('string', 'Mã đơn sản xuất khách dùng để tra cứu — khoá tra chính'),
    userSku: plain('string', 'Mã tài khoản khách. Dùng để tìm mọi đơn của một khách'),
    userEmail: contactFilterOnly('Email khách — LỌC được bằng đúng giá trị, KHÔNG đọc được (BR-5)'),

    type: plain('string', 'Tên loại sản phẩm, khớp productConfigs.fullName'),
    color: plain('string'),
    size: plain('string'),
    printMethod: plain('string'),
    quantity: numeric('Số lượng của đơn'),

    status: plain('string', 'Trạng thái đơn lấy từ hệ thống nguồn'),
    cancelledAt: plain('date', 'Khác rỗng = đơn ĐÃ HỦY, bị loại khỏi mọi công đoạn và thống kê'),
    cancelReason: freeText('Lý do hủy, người vận hành gõ tay'),
    heldAt: plain('date', 'Khác rỗng = đơn đang bị GIỮ, không chạy tiếp công đoạn nào'),
    holdReason: freeText('Lý do giữ đơn, người vận hành gõ tay'),

    orderAt: plain('date'),
    inProductionAt: plain('date', 'Ngày đơn vào sản xuất — trục thời gian của hầu hết thống kê'),
    isMapped: plain('bool'),
    productConfigId: plain('objectId', 'Trỏ tới productConfigs'),
    factoryId: plain('objectId', 'Xưởng đang sản xuất. RỖNG = đơn CHƯA GÁN XƯỞNG, bị loại mặc định'),
    originalFactoryId: plain('objectId'),
    machineTypeId: plain('objectId'),
    priority: plain('enum', 'Mức ưu tiên của đơn'),

    printStatus: plain('string'),
    printStatusNote: freeText(),
    toolResult: plain('string', 'Mã kết quả soát tool, tra nghĩa ở workshopConfigs'),
    toolResultNote: freeText('Ghi chú soát tool, người vận hành gõ tay'),
    toolCheckErrorNotes: freeText('Danh sách ghi chú lỗi lúc soát tool'),
    toolCheckedAt: plain('date'),
    errorFile: plain('string', 'Mã loại lỗi file, tra nghĩa ở workshopConfigs'),
    errorFileNote: freeText(),

    productionError: plain('string', 'Mã lỗi sản xuất, tra nghĩa ở workshopConfigs'),
    productionErrorNote: freeText(),
    productionErrorSource: plain('enum', 'Nguồn lỗi: designer | factory | tool-check'),
    productionErrorCount: numeric(),
    productionFirstErrorAt: plain('date'),
    errorResolvedAt: plain('date'),

    readyForFulfill: plain('bool'),
    designerStatus: plain('enum', 'Trạng thái thiết kế: unassigned/assigned/in-progress/done/rework'),
    designerReworkCount: numeric(),
    // Mốc thời gian của khâu thiết kế: nói được đơn nằm chờ bao lâu, KHÔNG nói
    // ai làm — mọi trường danh tính vẫn nằm ngoài danh sách trắng (BR-4a §4).
    designerAssignedAt: plain('date'),
    designerStartedAt: plain('date'),
    designerFirstStartedAt: plain('date'),
    designerCompletedAt: plain('date'),
    designerReworkAt: plain('date'),
    currentFulfillmentStage: plain(
      'enum',
      'Công đoạn xưởng hiện tại: print, press, qc-post-press, sew-in, sew-out, pack. Rỗng = chưa vào xưởng HOẶC đã đóng hàng xong',
    ),
    fulfillmentCompletedAt: plain('date', 'Khác rỗng = đơn đã xong công đoạn Đóng hàng'),
  },
  deliberatelyExcluded: [
    // BR-4a §3 — che toàn khối địa chỉ giao, không giữ lại phần nào
    'shippingAddress',
    // BA chốt ở design_review — không xác định được là giá bán hay giá vốn
    'baseCost',
    'shipCost',
    // BR-4a §4 — danh tính người thao tác
    'assignee',
    'assigneeNote',
    'designerRejections',
    'designerRejectedReason',
    // Đi liền `designerRejectedReason` trong cùng bản ghi từ chối — đọc lên là
    // ghép lại được "ai từ chối, vì lý do gì".
    'designerRejectedAt',
    'fulfillmentStages',
    'fulfillmentTimeline',
    // Không mang giá trị cho việc trả lời khách, hoặc là dữ liệu kỹ thuật nội bộ
    'mockupUrl',
    'mockupOriginalUrl',
    'cuttingFileUrl',
    'cuttingFileName',
    'tempFileUrl',
    'designs',
    'designsOriginal',
    'designsStatus',
    'weight',
    'width',
    'height',
    'length',
    'orderId',
    'externalId',
    'referent',
    'fabricType',
    'machineNumber',
    'designerWorkMs',
    'designReviewClaimedAt',
    'deletedAt',
  ],
};
