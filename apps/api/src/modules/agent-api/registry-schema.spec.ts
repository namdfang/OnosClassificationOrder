import type { Schema } from 'mongoose';

import { CollectionSchema } from '../collection/collection.entity';
import { CustomerSchema } from '../customer/customer.entity';
import { CustomerNotificationSchema } from '../customer-notification/customer-notification.entity';
import { FactorySchema } from '../factory/factory.entity';
import { MachineTypeSchema } from '../machine-type/machine-type.entity';
import { OrderSchema } from '../order/order.entity';
import { OrderLogSchema } from '../order-log/order-log.entity';
import { ProductCategorySchema } from '../product-category/product-category.entity';
import { ProductConfigSchema } from '../product-config/product-config.entity';
import { PromotionSchema } from '../promotion/promotion.entity';
import { WorkshopConfigSchema } from '../workshop-config/workshop-config.entity';
import { AGENT_TABLE_REGISTRY } from './registry';

/**
 * Bất biến I4 của bộ API agent (`API-1`, thiết kế §7.4) — **bất biến mạnh nhất**.
 *
 * Mọi đường dẫn có thật trên schema phải hoặc nằm trong danh sách trắng, hoặc
 * nằm trong `deliberatelyExcluded`. Nghĩa là: thêm một field mới vào
 * `OrderEntity` mà không quyết định gì về nó thì test này ĐỎ.
 *
 * Đây là cơ chế duy nhất ngăn kiểu rò "field mới lọt vào theo mặc định" khi hệ
 * thống tiến hoá — đúng loại lỗi mà một bộ test chạy qua API không bao giờ bắt
 * được, vì lúc viết test thì field đó còn chưa tồn tại.
 */
const SCHEMAS: Record<string, Schema> = {
  orders: OrderSchema,
  orderLogs: OrderLogSchema,
  customers: CustomerSchema,
  productConfigs: ProductConfigSchema,
  productCategories: ProductCategorySchema,
  collections: CollectionSchema,
  promotions: PromotionSchema,
  factories: FactorySchema,
  machineTypes: MachineTypeSchema,
  workshopConfigs: WorkshopConfigSchema,
  customer_notifications: CustomerNotificationSchema,
};

/** Gốc của một đường dẫn: `variations.retailPrice` → `variations`. */
const root = (p: string): string => p.split('.')[0];

describe('I4 — registry phải phủ hết đường dẫn thật của schema', () => {
  it.each(Object.keys(SCHEMAS))('%s: không field nào của schema bị bỏ quên', (table) => {
    const spec = AGENT_TABLE_REGISTRY[table];
    const schema = SCHEMAS[table];

    const decided = new Set<string>([
      ...Object.keys(spec.fields).map(root),
      ...spec.deliberatelyExcluded.map(root),
    ]);

    const forgotten = Object.keys(schema.paths)
      .filter((p) => p !== '__v')
      .map(root)
      .filter((p) => !decided.has(p));

    // Thông điệp cố ý liệt kê tên field: người làm task sau đọc là biết ngay
    // phải quyết định gì, thay vì phải đi dò xem test đỏ vì cái gì.
    expect({ table, forgotten: [...new Set(forgotten)] }).toEqual({ table, forgotten: [] });
  });

  it.each(Object.keys(SCHEMAS))('%s: mọi field trong registry đều CÓ THẬT trên schema', (table) => {
    const spec = AGENT_TABLE_REGISTRY[table];
    const schema = SCHEMAS[table];
    const real = new Set(Object.keys(schema.paths).map(root));

    const ghosts = Object.keys(spec.fields)
      .map(root)
      .filter((p) => !real.has(p));

    // Bắt lỗi gõ sai tên trường: field ma không bao giờ trả về dữ liệu, và
    // trông y hệt "dữ liệu rỗng" khi nhìn từ phía agent.
    expect({ table, ghosts: [...new Set(ghosts)] }).toEqual({ table, ghosts: [] });
  });
});
