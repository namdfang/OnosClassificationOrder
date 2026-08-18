import type { AgentTableSpec } from './field-policy';
import { contactField, freeText, numeric, plain, readOnly } from './field-policy';

/**
 * `orders` — bảng chính để trả lời "đơn của tôi đang thế nào".
 *
 * `API-17` MỞ RỘNG BỀ MẶT: người dùng chốt agent đọc được **mọi trường nghiệp
 * vụ** của bảng này — địa chỉ giao, người được giao việc, nhật ký chuyển công
 * đoạn, email khách. Chỉ còn **hai trường tiền** bị che (`baseCost`,
 * `shipCost`), nằm trong danh sách tám trường tiền BA chốt đích danh ở AC-02.
 *
 * Hai điều KHÔNG đổi theo `API-17`, đừng nhầm:
 *  - **Mở đọc không kéo theo mở lọc** (AC-05). Trường vừa mở dùng `readOnly`;
 *    `userEmail` giữ đúng mức `eq` như trước.
 *  - **Không đụng bộ lọc mặc định của truy vấn.** `deletedAt` nay đọc được,
 *    nhưng điều đó không làm bản ghi xoá mềm hiện ra trong kết quả.
 */
export const ordersRegistry: AgentTableSpec = {
  key: 'orders',
  description:
    'Đơn sản xuất. Trả lời tình trạng đơn của khách: đơn đang ở công đoạn nào, xưởng nào, ' +
    'trạng thái thiết kế, đã xong chưa, có bị lỗi hay bị giữ không. Có địa chỉ giao, người xử lý ' +
    'và nhật ký chuyển công đoạn. KHÔNG chứa giá vốn hay phí ship nội bộ.',
  entityName: 'OrderEntity',
  defaultSort: '_id',
  fields: {
    _id: plain('objectId'),
    createdAt: plain('date', 'Thời điểm bản ghi đơn được tạo trong hệ thống'),
    updatedAt: plain('date'),

    productionId: plain('string', 'Mã đơn sản xuất khách dùng để tra cứu — khoá tra chính'),
    userSku: plain('string', 'Mã tài khoản khách. Dùng để tìm mọi đơn của một khách'),
    userEmail: contactField('Email khách — đọc được; LỌC bằng đúng giá trị, không dò dần'),

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

    // ── `API-17` mở đọc: người dùng chốt agent đọc được mọi trường nghiệp vụ,
    // trừ tiền và bí mật kỹ thuật. Mức lọc GIỮ NGUYÊN mức cũ (AC-05) — trước
    // đây chúng ngoài registry nên mức đó là "không lọc được".
    shippingAddress: readOnly('object', 'Khối địa chỉ giao — trả nguyên khối'),
    assignee: readOnly('string', 'Người được giao thiết kế'),
    assigneeNote: readOnly('string', 'Ghi chú khi giao việc, gõ tay'),
    designerRejections: readOnly('object', 'Lịch sử từ chối nhận việc thiết kế'),
    designerRejectedReason: readOnly('string', 'Lý do từ chối, gõ tay'),
    designerRejectedAt: readOnly('date'),
    fulfillmentStages: readOnly('object', 'Trạng thái chi tiết của từng công đoạn xưởng'),
    fulfillmentTimeline: readOnly('object', 'Nhật ký chuyển công đoạn của đơn'),
    mockupUrl: readOnly('string'),
    mockupOriginalUrl: readOnly('string'),
    cuttingFileUrl: readOnly('string'),
    cuttingFileName: readOnly('string'),
    tempFileUrl: readOnly('string'),
    designs: readOnly('object', 'Đường dẫn file thiết kế theo từng vị trí in'),
    designsOriginal: readOnly('object', 'Bản thiết kế gốc trước khi khách sửa'),
    designsStatus: readOnly('object', 'Tình trạng xử lý của từng file thiết kế'),
    weight: readOnly('number'),
    width: readOnly('number'),
    height: readOnly('number'),
    length: readOnly('number'),
    orderId: readOnly('string', 'Mã đơn ở hệ thống nguồn'),
    externalId: readOnly('string'),
    referent: readOnly('string'),
    fabricType: readOnly('string', 'Mã chất liệu, tra nghĩa ở workshopConfigs'),
    machineNumber: readOnly('string', 'Mã máy, tra nghĩa ở workshopConfigs'),
    designerWorkMs: readOnly('number', 'Thời gian thiết kế thực tế (mili giây)'),
    designReviewClaimedAt: readOnly('date'),
    deletedAt: readOnly('date', 'Bản ghi bị xoá mềm. Mở ĐỌC trường này KHÔNG đổi bộ lọc mặc định của truy vấn'),
  },
  deliberatelyExcluded: [
    // `API-17` — TÁM trường tiền, danh sách BA chốt đích danh ở AC-02. Đây là
    // giá vốn và phí nội bộ; agent chỉ đọc được GIÁ BÁN.
    'baseCost',
    'shipCost',
  ],
};
