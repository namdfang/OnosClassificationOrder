import React from 'react';
import { useTranslation } from 'react-i18next';

import { usePageHeader } from '@/hooks/usePageHeader';
import { usePermission } from '@/hooks/usePermission';

import { OrderTableWorkshop } from '../OrderTableWorkshop';

export default function OrdersWorkshopPage() {
  const { t } = useTranslation('orders');
  const { canViewWorkshopTable } = usePermission();
  // Tiêu đề dời lên Header (07/09/2026) — nhường chiều cao cho phễu + bảng.
  usePageHeader(t('workshopPage.title'), t('workshopPage.subtitle'));

  if (!canViewWorkshopTable()) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        {t('workshopPage.noPermission')}
      </div>
    );
  }

  return (
    // Chiếm đủ chiều cao còn lại của <main> — bảng tự cuộn, chân bảng đứng yên (Orders.md §10.2c).
    <div className="flex min-h-0 flex-1 flex-col">
      <OrderTableWorkshop />
    </div>
  );
}
