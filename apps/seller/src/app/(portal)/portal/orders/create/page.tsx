'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';

/** PR-C — trang này chuyển từ `apps/web` sang ở đợt sau (SellerPortal.md §2). */
export default function ComingSoonPage() {
  const { t } = useTranslation('seller');
  return (
    <EmptyState
      icon={<Construction size={28} />}
      title={t('comingSoon.title')}
      description={t('comingSoon.desc')}
      action={
        <Link href="/portal/orders" prefetch={false} className="text-accent text-sm hover:underline">
          {t('detail.back')}
        </Link>
      }
    />
  );
}
