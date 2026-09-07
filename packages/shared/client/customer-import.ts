import { z } from 'zod';

import { DesignFieldsZod } from './design-fields';
import { ProductionOrderShippingAddressZod, ProductionOrderTrackingZod } from './shipping';

// ---------------------------------------------------------------------------
// Ship method — giữ ĐỦ 4 giá trị hệ cũ (CustomerOrderIntake plan §13.2)
// ---------------------------------------------------------------------------

export const CUSTOMER_SHIP_METHODS = ['cod', 'express_us', 'economy_us', 'tiktok'] as const;
export type CustomerShipMethod = (typeof CUSTOMER_SHIP_METHODS)[number];
export const CustomerShipMethodZod = z.enum(CUSTOMER_SHIP_METHODS);
/** Khách bỏ trống → express_us (plan §12.4). */
export const DEFAULT_CUSTOMER_SHIP_METHOD: CustomerShipMethod = 'express_us';

/**
 * Parse giá trị cột `shipping` của template cũ — case-insensitive, alias
 * `SBTT` → `tiktok`; trống → default `express_us`; giá trị lạ → `undefined`
 * (caller báo lỗi dòng). Dùng CHUNG ở FE (parse file) và BE (validate lại).
 */
export function parseCustomerShipMethod(raw?: string | null): CustomerShipMethod | undefined {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return DEFAULT_CUSTOMER_SHIP_METHOD;
  if (v === 'sbtt') return 'tiktok';
  return (CUSTOMER_SHIP_METHODS as readonly string[]).includes(v) ? (v as CustomerShipMethod) : undefined;
}

// ---------------------------------------------------------------------------
// CSV import (template cũ — FE parse + group theo (order_id, identifier) rồi gửi lên)
// Schema ở đây là NGUỒN RULE DUY NHẤT: BE dùng qua `ImportCustomerOrdersDto`,
// `apps/web` + `apps/seller` validate từng đơn trước khi gửi.
// ---------------------------------------------------------------------------

/**
 * Địa chỉ import CSV — required theo đúng ghi chú template cũ: name, country,
 * address_1, city, state, postcode bắt buộc; telephone/email/company tùy chọn.
 */
export const CustomerImportShippingAddressZod = ProductionOrderShippingAddressZod.extend({
  firstName: z.string().min(1).max(200),
  address1: z.string().min(1).max(500),
  city: z.string().min(1).max(200),
  state: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
  postcode: z.string().min(1).max(50),
});
export type CustomerImportShippingAddress = z.infer<typeof CustomerImportShippingAddressZod>;

/** 1 dòng CSV = 1 item — SKU BẮT BUỘC match `variations[].sku` (plan §13.1). */
export const CustomerImportOrderItemZod = z.object({
  sku: z.string().min(1).max(200),
  merchantSku: z.string().max(200).optional(),
  quantity: z.coerce.number().int().positive().default(1),
  shipMethod: CustomerShipMethodZod.default(DEFAULT_CUSTOMER_SHIP_METHOD),
  activeService: z.boolean().optional(),
  mockupUrl: z.string().max(2000).optional(),
  designs: DesignFieldsZod.optional(),
  tracking: ProductionOrderTrackingZod.optional(),
  /** Giá trị thô từ file — CHỈ đối chiếu variation (lệch → warning FE), không phải nguồn chân lý. */
  rawItemName: z.string().max(300).optional(),
  rawColor: z.string().max(200).optional(),
  rawSize: z.string().max(200).optional(),
});
export type CustomerImportOrderItem = z.infer<typeof CustomerImportOrderItemZod>;

export const CustomerImportOrderZod = z.object({
  orderId: z.string().min(1).max(200),
  identifier: z.string().max(200).optional(),
  orderName: z.string().max(300).optional(),
  note: z.string().max(1000).optional(),
  shippingAddress: CustomerImportShippingAddressZod,
  items: CustomerImportOrderItemZod.array().min(1).max(100),
});
export type CustomerImportOrder = z.infer<typeof CustomerImportOrderZod>;
