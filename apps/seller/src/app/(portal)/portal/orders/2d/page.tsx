'use client';

import { Suspense } from 'react';
import { OrdersListView } from '@/components/orders/orders-list-view';

export default function PortalOrders2DPage() {
  return (
    <Suspense fallback={null}>
      <OrdersListView lockedLine="2d" />
    </Suspense>
  );
}
