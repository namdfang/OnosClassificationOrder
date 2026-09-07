'use client';

import { notFound, useParams } from 'next/navigation';
import { CreateOrderView } from '@/components/orders/create-order-view';
import { isProductLine } from '@/lib/product-lines';

/** Đặt đơn NGAY TRONG trang dịch vụ: catalog khoá theo dòng, xong quay về tab Chờ đẩy của dòng đó. */
export default function CreateInLinePage() {
  const { slug } = useParams<{ slug: string }>();
  if (!isProductLine(slug)) notFound();
  return <CreateOrderView line={slug} />;
}
