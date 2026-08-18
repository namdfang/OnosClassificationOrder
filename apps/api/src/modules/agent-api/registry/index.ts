import {
  collectionsRegistry,
  customerNotificationsRegistry,
  factoriesRegistry,
  machineTypesRegistry,
  productCategoriesRegistry,
  promotionsRegistry,
  workshopConfigsRegistry,
} from './catalog.registry';
import { customersRegistry } from './customers.registry';
import type { AgentTableSpec } from './field-policy';
import { orderLogsRegistry } from './order-logs.registry';
import { ordersRegistry } from './orders.registry';
import { productConfigsRegistry } from './product-configs.registry';

/**
 * Nguồn sự thật DUY NHẤT về những gì bộ API agent đọc được (`API-1`, BR-2).
 *
 * Bảng không có khoá ở đây là **không tồn tại** đối với bộ API: không nhánh
 * code nào nhận tên collection từ bên gọi rồi truyền xuống mongoose — luôn
 * phải tra qua đây trước. Bảng mới thêm vào hệ thống mặc định KHÔNG đọc được
 * (AC-05), và bất biến I2 khoá cứng đúng 11 tên dưới đây trong unit test.
 */
export const AGENT_TABLE_REGISTRY: Record<string, AgentTableSpec> = {
  orders: ordersRegistry,
  orderLogs: orderLogsRegistry,
  customers: customersRegistry,
  productConfigs: productConfigsRegistry,
  productCategories: productCategoriesRegistry,
  collections: collectionsRegistry,
  promotions: promotionsRegistry,
  factories: factoriesRegistry,
  machineTypes: machineTypesRegistry,
  workshopConfigs: workshopConfigsRegistry,
  customer_notifications: customerNotificationsRegistry,
};

/** Đúng 11 tên bảng của BR-2 — bất biến I2 đối chiếu với hằng số này. */
export const AGENT_ALLOWED_TABLE_KEYS = Object.keys(AGENT_TABLE_REGISTRY);

/**
 * Lưới an toàn THỨ HAI (bất biến I3). Danh sách trắng ở trên vẫn là cơ chế
 * chính; danh sách đen này chỉ để bắt lỗi tay — ai đó vô tình thêm một trường
 * tên `password` hay `cost` vào registry thì unit test đỏ ngay.
 */
export const AGENT_DENY_FIELD_NAMES = [
  'password',
  'passwordSource',
  'cost',
  'nonShipCost',
  'wholesalePrice',
  'tiktokPrice',
  'expUsShipCost',
  'tiktokShipCost',
  'baseCost',
  'shipCost',
  'shippingAddress',
  'assignee',
  'userId',
  'userName',
  'roleCode',
  'impersonatorId',
  'impersonatorName',
  'impersonatedBy',
  'ip',
  'userAgent',
  'byUserId',
  'byUserName',
  'createdByUserId',
  'createdByName',
  'designerRejections',
  'fulfillmentTimeline',
  'fulfillmentStages',
];

export * from './field-policy';
