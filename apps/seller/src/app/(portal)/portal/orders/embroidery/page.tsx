'use client';

import { Suspense } from 'react';
import { OrdersListView } from '@/components/orders/orders-list-view';

export default function PortalOrdersEmbroideryPage() {
  return (
    <Suspense fallback={null}>
      <OrdersListView lockedLine="embroidery" />
    </Suspense>
  );
}
