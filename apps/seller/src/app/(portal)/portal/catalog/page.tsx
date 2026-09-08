'use client';

import { Suspense } from 'react';
import { CatalogView } from '@/components/catalog/catalog-view';

/** `/portal/catalog` — duyệt toàn bộ danh mục + tra SKU (SellerPortal.md §2.10). */
export default function CatalogPage() {
  return (
    <Suspense fallback={null}>
      <CatalogView />
    </Suspense>
  );
}
