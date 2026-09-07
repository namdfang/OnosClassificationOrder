'use client';

import { Suspense } from 'react';
import { OperationsView } from '@/components/hub/operations-view';

/** Vận hành sản xuất — góc nhìn quản trị, chỉ đọc (SellerPortal.md §9.1). */
export default function HubOperationsPage() {
  return (
    <Suspense fallback={null}>
      <OperationsView />
    </Suspense>
  );
}
