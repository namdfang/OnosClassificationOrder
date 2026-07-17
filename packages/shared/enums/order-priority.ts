/**
 * 3 mức ưu tiên đơn hàng. Giá trị số càng cao = càng ưu tiên — dùng trực tiếp
 * làm sort key (`{ priority: -1 }`) ở mọi danh sách đơn.
 */
export enum OrderPriority {
  Low = 1,
  Normal = 2,
  High = 3,
}

export const ORDER_PRIORITIES: OrderPriority[] = [
  OrderPriority.Low,
  OrderPriority.Normal,
  OrderPriority.High,
];

export const ORDER_PRIORITY_LABELS: Record<OrderPriority, string> = {
  [OrderPriority.Low]: 'Ưu tiên',
  [OrderPriority.Normal]: 'Ưu tiên cao',
  [OrderPriority.High]: 'Ưu tiên nhất',
};
