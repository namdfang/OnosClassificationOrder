import { z } from 'zod';

/** Địa chỉ ship — mirror field `shipping` của OnosPod (order API). Nest-free, xem `client/design-fields.ts`. */
export const ProductionOrderShippingAddressZod = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
});
export type ProductionOrderShippingAddress = z.infer<typeof ProductionOrderShippingAddressZod>;

/**
 * Vận đơn KHÁCH TỰ CẤP — shape DÙNG CHUNG cho staging đơn khách (`CustomerOrderTrackingZod`
 * là alias) lẫn `OrderEntity.tracking`, để CSV khách / CSV admin / Public Order API không trôi lệch.
 */
export const ProductionOrderTrackingZod = z.object({
  number: z.string().max(200).optional(),
  carrier: z.string().max(100).optional(),
  url: z.string().max(2000).optional(),
  labelUrl: z.string().max(2000).optional(),
});
export type ProductionOrderTracking = z.infer<typeof ProductionOrderTrackingZod>;

/** Có ít nhất 1 giá trị thật — dùng để KHÔNG ghi đè tracking cũ bằng object rỗng. */
export function hasProductionOrderTracking(tracking?: ProductionOrderTracking | null): boolean {
  if (!tracking) return false;
  return [tracking.number, tracking.carrier, tracking.url, tracking.labelUrl].some((v) => !!v?.trim());
}

/** Bỏ field rỗng + trim — chuẩn hoá trước khi ghi DB/so sánh. */
export function normalizeProductionOrderTracking(tracking?: ProductionOrderTracking | null): ProductionOrderTracking | undefined {
  if (!tracking) return undefined;
  const out: ProductionOrderTracking = {};
  if (tracking.number?.trim()) out.number = tracking.number.trim();
  if (tracking.carrier?.trim()) out.carrier = tracking.carrier.trim();
  if (tracking.url?.trim()) out.url = tracking.url.trim();
  if (tracking.labelUrl?.trim()) out.labelUrl = tracking.labelUrl.trim();
  return Object.keys(out).length > 0 ? out : undefined;
}
