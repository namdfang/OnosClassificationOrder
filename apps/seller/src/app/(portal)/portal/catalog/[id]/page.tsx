'use client';

import { useParams } from 'next/navigation';
import { CatalogDetailView } from '@/components/catalog/catalog-detail-view';

/** `/portal/catalog/<productConfigId>` — chi tiết sản phẩm + bảng biến thể có SKU. */
export default function CatalogDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <CatalogDetailView id={id} />;
}
