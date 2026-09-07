'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import type { CustomerStagingOrder } from 'shared';
import { apiFetch } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';
import { productLineHref } from '@/lib/product-lines';

/**
 * KHÔNG có trang "tất cả đơn" (quyết định 07/09/2026). `/portal/orders` chỉ là bộ điều hướng:
 * có `?q=<mã>` (chuông thông báo) → tìm đơn rồi nhảy thẳng tới chi tiết / trang dịch vụ;
 * không có gì → về Dashboard.
 */
function Resolver() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get('q');
  useEffect(() => {
    let alive = true;
    (async () => {
      if (q) {
        try {
          const res = await apiFetch<ApiRes<CustomerStagingOrder[]>>(`/api/v1/customer/orders?page=1&limit=1&search=${encodeURIComponent(q)}`);
          const o = res.data?.[0];
          if (alive && o) {
            const pid = o.items?.[0]?.productionId;
            router.replace(pid ? `/portal/orders/${encodeURIComponent(pid)}` : o.productLines?.[0] ? `${productLineHref(o.productLines[0])}?q=${encodeURIComponent(q)}` : '/portal');
            return;
          }
        } catch {
          /* rơi xuống dashboard */
        }
      }
      if (alive) router.replace('/portal');
    })();
    return () => {
      alive = false;
    };
  }, [q, router]);
  return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function OrdersIndexPage() {
  return (
    <Suspense fallback={null}>
      <Resolver />
    </Suspense>
  );
}
