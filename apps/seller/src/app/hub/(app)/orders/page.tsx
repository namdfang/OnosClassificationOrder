'use client';

import { Suspense } from 'react';
import { OrdersListView } from '@/components/orders/orders-list-view';

/** Đơn khách của MỌI seller — chỉ đọc (SellerPortal.md §9). */
export default function HubOrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersListView adminMode />
    </Suspense>
  );
}
