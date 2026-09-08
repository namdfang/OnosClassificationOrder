'use client';

import { Suspense } from 'react';
import { HubCreateOrderView } from '@/components/hub/hub-create-order-view';

/** `/hub/orders/create` — ops lên đơn hộ seller (SellerPortal.md §9.5). */
export default function HubCreateOrderPage() {
  return (
    <Suspense fallback={null}>
      <HubCreateOrderView />
    </Suspense>
  );
}
