import type { AgentTableSpec } from './field-policy';
import { freeText, numeric, plain } from './field-policy';

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
    productCategoryId: plain('objectId', 'Trỏ tới productCategories'),
    collectionIds: plain('objectId', 'Trỏ tới collections'),
    factoryId: plain('objectId'),
    machineTypeId: plain('objectId'),
    fabricType: plain('string'),
    maxProductionTime: numeric('Thời gian sản xuất tối đa cam kết (ngày)'),
    maxShippingTime: numeric('Thời gian giao tối đa cam kết (ngày)'),
    sizeChartUrl: plain('string'),
    mockup: plain('string'),
    description: freeText('Mô tả sản phẩm'),
    shortDescription: freeText(),
    'variations.sku': plain('string', 'SKU biến thể, unique toàn hệ thống'),
    'variations.attributes': plain('string', 'Thuộc tính biến thể dạng nhãn - giá trị'),
    'variations.retailPrice': numeric('Giá niêm yết — trường giá DUY NHẤT được trả ra'),
    'variations.status': plain('enum'),
  },
  deliberatelyExcluded: [
    // BR-4a §2 — giá vốn
    'variations.cost',
    'variations.nonShipCost',
    // BA xác nhận ở design_review — giá nội bộ, cùng bản chất rủi ro với giá vốn
    'variations.wholesalePrice',
    'variations.tiktokPrice',
    'variations.expUsShipCost',
    'variations.tiktokShipCost',
    // Không phục vụ việc trả lời khách
    'variations.weight',
    'variations.width',
    'variations.height',
    'variations.length',
    'machineNumber',
    'toolResult',
    'images',
    'level',
    'guide',
    'templateDescription',
    'itemSpecifics',
    'hideForSeller',
    'enableDesignCheck',
    'enableAffiliate',
    'weight',
    'width',
    'height',
    'length',
    'updatedAt',
    'deletedAt',
  ],
};
