'use client';

import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Bell } from 'lucide-react';
import useSWR from 'swr';
import type { CustomerNotification } from 'shared';
import { apiFetch } from '@/hooks/use-api';

interface NotiRes {
  data: CustomerNotification[];
  unreadCount: number;
}

/** Mirror `systemNotificationText()` ở `apps/web/src/components/customer/NotificationBell.tsx` (ORD-5). */
function systemNotificationText(n: CustomerNotification, t: TFunction): { title: string; body?: string } {
  const orderCode = n.eventData?.orderCode ?? '';
  switch (n.event) {
    case 'order.pushed':
      return { title: t('bell.events.pushed', { orderCode }), body: t('bell.events.pushedBody') };
    case 'order.production_completed':
      return { title: t('bell.events.completed', { orderCode }), body: t('bell.events.completedBody') };
    case 'order.held':
      return { title: t('bell.events.held', { orderCode }), body: t(`bell.events.holdReason.${n.eventData?.holdKind ?? 'other'}`) };
    case 'order.unheld':
      return { title: t('bell.events.unheld', { orderCode }) };
    case 'order.item_cancelled':
      return {
        title: t('bell.events.itemCancelled', { productionId: n.eventData?.productionId ?? '' }),
        body: orderCode ? t('bell.events.itemCancelledBody', { orderCode }) : undefined,
      };
    default:
      return { title: n.title, body: n.body };
  }
}

export function NotificationsBell() {
  const { t } = useTranslation('customerNotifications');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, isLoading, mutate } = useSWR<NotiRes>('/api/v1/customer/notifications?page=1&limit=20', (url: string) => apiFetch<NotiRes>(url), {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
  const items = data?.data ?? [];
  const unread = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const markRead = async () => {
    setMarking(true);
    try {
      await apiFetch('/api/v1/customer/notifications/read', { method: 'POST', body: '{}' });
      await mutate();
    } finally {
      setMarking(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) void mutate(); }}
        className="relative p-1 rounded text-text-muted hover:text-text-primary hover:bg-card-hover"
        aria-label={t('bell.title')}
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-error text-[9px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-80 z-[70] bg-card border border-border1 rounded-xl shadow-elevated overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border1">
            <span className="text-xs font-bold text-text-primary">{t('bell.title')}</span>
            {unread > 0 && (
              <button type="button" onClick={markRead} disabled={marking} className="text-[11px] text-accent hover:underline disabled:opacity-50">{t('bell.markAllRead')}</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {isLoading && items.length === 0 ? (
              <div className="flex justify-center py-6"><div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : items.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-6">{t('bell.empty')}</p>
            ) : (
              items.map((n) => {
                const text = n.event ? systemNotificationText(n, t) : { title: n.title, body: n.body };
                const orderCode = n.eventData?.orderCode;
                const clickable = !!n.event && !!orderCode;
                return (
                  <div
                    key={String(n._id)}
                    role={clickable ? 'button' : undefined}
                    onClick={clickable ? () => { setOpen(false); router.push(`/portal/orders?q=${encodeURIComponent(orderCode!)}`); } : undefined}
                    className={`px-3 py-2.5 border-b border-border2 last:border-0 ${clickable ? 'cursor-pointer hover:bg-card-hover' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {!n.customerId && !n.event && <span className="text-[9px] px-1 rounded border border-border1 text-text-muted">{t('bell.broadcastLabel')}</span>}
                      <p className="text-xs font-medium text-text-primary">{text.title}</p>
                    </div>
                    {text.body && <p className="text-[11px] text-text-secondary mt-0.5">{text.body}</p>}
                    <p className="text-[10px] text-text-muted mt-1">{n.createdAt ? dayjs(n.createdAt).format('DD/MM/YYYY HH:mm') : ''}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
