import React from 'react';
import { useTranslation } from 'react-i18next';
import { PauseCircle, Wrench } from 'lucide-react';
import { CustomerOrderStatus } from 'shared';

import { Badge } from '@/components/ui/badge';

const STATUS_BADGE_VARIANT: Record<CustomerOrderStatus, 'default' | 'secondary' | 'destructive' | 'success'> = {
  [CustomerOrderStatus.Pending]: 'secondary',
  [CustomerOrderStatus.Processing]: 'secondary',
  [CustomerOrderStatus.InProduction]: 'default',
  [CustomerOrderStatus.Fulfilled]: 'success',
  [CustomerOrderStatus.Completed]: 'success',
  [CustomerOrderStatus.Refunded]: 'destructive',
  [CustomerOrderStatus.Cancelled]: 'destructive',
};

export function CustomerOrderStatusBadge({ status }: { status: CustomerOrderStatus }) {
  const { t } = useTranslation('customerPortal');
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status]} className="text-[10px]">
      {t(`orders.status.${status}`)}
    </Badge>
  );
}

/** Chip thanh toán — gate OFF đợt này: pending = Chưa thanh toán, đã push = Miễn thu. */
export function CustomerOrderPaymentBadge({ status }: { status: CustomerOrderStatus }) {
  const { t } = useTranslation('customerPortal');
  if (status === CustomerOrderStatus.Cancelled || status === CustomerOrderStatus.Refunded) return null;
  const unpaid = status === CustomerOrderStatus.Pending;
  return (
    <Badge
      variant="outline"
      className={
        unpaid
          ? 'text-[10px] border-rose-400 text-rose-600 dark:text-rose-400'
          : 'text-[10px] border-emerald-400 text-emerald-600 dark:text-emerald-400'
      }
    >
      {unpaid ? t('orders.paymentUnpaid') : t('orders.paymentWaived')}
    </Badge>
  );
}

interface OverlayBadgesProps {
  held?: boolean;
  rework?: boolean;
  holdReason?: string;
}

/** Badge chồng Hold/Rework — cờ trực giao với trạng thái, không phải tab (plan §1.2). */
export function CustomerOrderOverlayBadges({ held, rework, holdReason }: OverlayBadgesProps) {
  const { t } = useTranslation('customerPortal');
  if (!held && !rework) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {held && (
        <Badge
          variant="outline"
          className="text-[10px] border-amber-400 text-amber-600 dark:text-amber-400 gap-0.5"
          title={holdReason}
        >
          <PauseCircle size={10} />
          {t('orders.badgeHold')}
        </Badge>
      )}
      {rework && (
        <Badge variant="outline" className="text-[10px] border-blue-400 text-blue-600 dark:text-blue-400 gap-0.5">
          <Wrench size={10} />
          {t('orders.badgeRework')}
        </Badge>
      )}
    </span>
  );
}
