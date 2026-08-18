import type { AgentTableSpec } from './field-policy';
import { freeText, numeric, plain, readOnly } from './field-policy';

/**
 * `productConfigs` — trả lời về sản phẩm, biến thể, cấu hình sản xuất.
 *
 * GIÁ: chỉ `variations[].retailPrice` được đọc. Sáu trường giá còn lại của
 * biến thể — `cost`, `nonShipCost`, `wholesalePrice`, `tiktokPrice`,
 * `expUsShipCost`, `tiktokShipCost` — đều **không có trong danh sách trắng**.
 * Hai trường đầu là giá vốn theo BR-4a §2; bốn trường sau SRS không nhắc tới
 * nhưng cùng bản chất rủi ro (giá nội bộ / biên lợi nhuận) và BA đã xác nhận
 * che ở bước `design_review`.
 *
 * `usImportTaxPerUnit` KHÔNG thuộc nhóm giá bị che: đó là thuế nhập khẩu US
 * công bố với khách ngay trên trang catalog (`customer-catalog.service.ts`),
 * nên agent CSKH thấy được là nhất quán với thứ khách đã thấy — xem `API-2`.
 *
 * `variations` là mảng subdoc nên được chiếu theo từng trường con
 * (`variations.sku`, ...) — mongo `$project` giữ nguyên hình mảng.
 */
export const productConfigsRegistry: AgentTableSpec = {
  key: 'productConfigs',
  description:
    'Cấu hình sản phẩm và biến thể. Trả lời sản phẩm có những biến thể nào, giá niêm yết bao nhiêu, ' +
    'in được ở những vị trí nào, thời gian sản xuất và giao dự kiến. KHÔNG chứa giá vốn.',
  entityName: 'ProductConfigEntity',
  defaultSort: '_id',
  fields: {
    _id: plain('objectId'),
    createdAt: plain('date'),
    fullName: plain('string', 'Tên đầy đủ sản phẩm — khớp orders.type'),
    shortName: plain('string'),
    sku: plain('string'),
    slug: plain('string'),
    status: plain('enum'),
    printMethod: plain('string'),
    printArea: plain('string', 'Danh sách mã vị trí in của sản phẩm'),
    printDocument: plain('string', 'URL tài liệu hướng dẫn design/template của sản phẩm'),
    printTemplate: plain('string', 'URL template thiết kế chung của sản phẩm'),
    productCategoryId: plain('objectId', 'Trỏ tới productCategories'),
    collectionIds: plain('objectId', 'Trỏ tới collections'),
    factoryId: plain('objectId'),
    machineTypeId: plain('objectId'),
    fabricType: plain('string'),
    maxProductionTime: numeric('Thời gian sản xuất tối đa cam kết (ngày)'),
    maxShippingTime: numeric('Thời gian giao tối đa cam kết (ngày)'),
    sizeChartUrl: plain('string'),
    usImportTaxPerUnit: numeric('Thuế nhập khẩu US trên mỗi đơn vị (USD) — con số CÔNG BỐ với khách ở Customer Portal Catalog, không phải giá vốn'),
    mockup: plain('string'),
    description: freeText('Mô tả sản phẩm'),
    shortDescription: freeText(),
    'variations.sku': plain('string', 'SKU biến thể, unique toàn hệ thống'),
    'variations.attributes': plain('string', 'Thuộc tính biến thể dạng nhãn - giá trị'),
    'variations.retailPrice': numeric('Giá niêm yết — trường giá DUY NHẤT được trả ra'),
    'variations.status': plain('enum'),

    // ── `API-17` mở đọc: mở ĐỌC không kéo theo mở LỌC (AC-05)
    'variations.weight': readOnly('number'),
    'variations.width': readOnly('number'),
    'variations.height': readOnly('number'),
    'variations.length': readOnly('number'),
    machineNumber: readOnly('string', 'Mã máy mặc định, tra nghĩa ở workshopConfigs'),
    toolResult: readOnly('string', 'Mã kết quả soát tool mặc định, tra nghĩa ở workshopConfigs'),
    images: readOnly('string', 'Danh sách ảnh sản phẩm'),
    level: readOnly('number', 'Mức độ khó của sản phẩm, dùng điều độ nội bộ'),
    guide: readOnly('string', 'Hướng dẫn sản xuất'),
    templateDescription: readOnly('string'),
    itemSpecifics: readOnly('object', 'Thông số kỹ thuật công bố của sản phẩm'),
    hideForSeller: readOnly('bool'),
    enableDesignCheck: readOnly('bool'),
    enableAffiliate: readOnly('bool'),
    weight: readOnly('number'),
    width: readOnly('number'),
    height: readOnly('number'),
    length: readOnly('number'),
    updatedAt: readOnly('date'),
    deletedAt: readOnly('date', 'Bản ghi bị xoá mềm. Mở ĐỌC KHÔNG đổi bộ lọc mặc định của truy vấn'),
  },
  deliberatelyExcluded: [
    // `API-17` — SÁU trong TÁM trường tiền BA chốt đích danh ở AC-02.
    // `tiktokShipCost` được BA bổ sung ở note #41: cùng khối khai báo và cùng
    // bản chất phí ship nội bộ với `nonShipCost`/`expUsShipCost`, mở lẻ một cái
    // là phơi đúng thứ vừa khoá. Agent chỉ đọc được GIÁ BÁN (`retailPrice`).
    'variations.cost',
    'variations.nonShipCost',
    'variations.wholesalePrice',
    'variations.tiktokPrice',
    'variations.expUsShipCost',
    'variations.tiktokShipCost',
  ],
};
