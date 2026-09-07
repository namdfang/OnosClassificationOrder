'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { OrderDetailView } from '@/components/orders/order-detail-view';
import { OrdersListView } from '@/components/orders/orders-list-view';
import { isProductLine } from '@/lib/product-lines';

/**
 * `/portal/orders/<slug>`: slug là DÒNG SẢN PHẨM (`3d|2d|wood|embroidery|led|canvas`) → trang
 * dịch vụ (danh sách đơn của dòng đó); còn lại là `productionId` → chi tiết đơn.
 * Không có trang "tất cả đơn" — seller vào đúng dịch vụ mình cần (SellerPortal.md §2.4).
 */
export default function OrdersSlugPage() {
  const { slug } = useParams<{ slug: string }>();
  if (isProductLine(slug)) {
    return (
      <Suspense fallback={null}>
        <OrdersListView lockedLine={slug} />
      </Suspense>
    );
  }
  return <OrderDetailView productionId={slug} />;
}
