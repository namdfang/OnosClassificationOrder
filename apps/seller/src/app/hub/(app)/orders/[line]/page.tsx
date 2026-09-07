'use client';

import { notFound, useParams } from 'next/navigation';
import { Suspense } from 'react';
import { HubOrdersView } from '@/components/hub/hub-orders-view';
import { isProductLine } from '@/lib/product-lines';

/** `/hub/orders/<line>` — đơn khách toàn hệ khoá theo 1 dịch vụ (sidebar Orders → 6 mục con). */
export default function HubOrdersLinePage() {
  const { line } = useParams<{ line: string }>();
  if (!isProductLine(line)) notFound();
  return (
    <Suspense fallback={null}>
      <HubOrdersView lockedLine={line} />
    </Suspense>
  );
}
