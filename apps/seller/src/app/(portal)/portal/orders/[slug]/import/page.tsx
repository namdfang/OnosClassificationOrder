'use client';

import { notFound, useParams } from 'next/navigation';
import { ImportOrdersView } from '@/components/orders/import-orders-view';
import { isProductLine } from '@/lib/product-lines';

/** Import CSV mở từ trang dịch vụ — file vẫn nhận mọi SKU, xong quay về dòng đang đứng. */
export default function ImportInLinePage() {
  const { slug } = useParams<{ slug: string }>();
  if (!isProductLine(slug)) notFound();
  return <ImportOrdersView line={slug} />;
}
