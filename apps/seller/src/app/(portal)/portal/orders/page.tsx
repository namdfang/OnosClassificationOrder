'use client';

import { Suspense } from 'react';
import { OrdersListView } from '@/components/orders/orders-list-view';

export default function PortalOrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersListView />
    </Suspense>
  );
}
