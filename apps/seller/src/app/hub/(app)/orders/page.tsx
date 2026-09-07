'use client';

import { Suspense } from 'react';
import { HubOrdersView } from '@/components/hub/hub-orders-view';

/** Đơn khách của MỌI seller — trang OMS riêng cho khu quản trị (SellerPortal.md §9). */
export default function HubOrdersPage() {
  return (
    <Suspense fallback={null}>
      <HubOrdersView />
    </Suspense>
  );
}
