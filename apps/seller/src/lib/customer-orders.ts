import type { CustomerStagingOrder } from 'shared';

/** Mirror `orderDisplayCode()` ở `apps/web/src/components/customer/CustomerOrderDetailDrawer.tsx`. */
export function orderDisplayCode(order: CustomerStagingOrder): string {
  return order.items[0]?.productionId || order.orderId || order.orderName || `#${order._id.slice(-6)}`;
}

/** Bọc phản hồi chuẩn `{ success, data, total? }` của NestJS. */
export interface ApiRes<T> {
  success: boolean;
  data: T;
  total?: number;
  message?: string;
}
