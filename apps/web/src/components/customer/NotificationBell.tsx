import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import { Bell } from 'lucide-react';
import type { CustomerNotification } from 'shared';

import { PATHS } from '@/constants/paths';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

const POLL_MS = 60_000;

/**
 * Thông báo HỆ THỐNG (ORD-5) — dựng chữ từ `event`/`eventData` theo ngôn ngữ
 * đang chọn, KHÔNG dùng `title` đã lưu (đó chỉ là bản tiếng Việt dự phòng của
 * BE). Lý do giữ đơn đã được BE quy về nhóm an toàn (`holdKind`), FE chỉ tra
 * chuỗi tương ứng.
 */
function systemNotificationText(
  n: CustomerNotification,
  t: TFunction,
): { title: string; body?: string } {
  const orderCode = n.eventData?.orderCode ?? '';
  switch (n.event) {
    case 'order.pushed':
      return { title: t('bell.events.pushed', { orderCode }), body: t('bell.events.pushedBody') };
    case 'order.production_completed':
      return { title: t('bell.events.completed', { orderCode }), body: t('bell.events.completedBody') };
    case 'order.held':
      return {
        title: t('bell.events.held', { orderCode }),
        body: t(`bell.events.holdReason.${n.eventData?.holdKind ?? 'other'}`),
      };
    case 'order.unheld':
      return { title: t('bell.events.unheld', { orderCode }) };
    case 'order.item_cancelled':
      return {
        title: t('bell.events.itemCancelled', { productionId: n.eventData?.productionId ?? '' }),
        body: orderCode ? t('bell.events.itemCancelledBody', { orderCode }) : undefined,
      };
    default:
      // Sự kiện BE mới hơn FE → hiện bản dự phòng thay vì để trống.
      return { title: n.title, body: n.body };
  }
}

/** Chuông thông báo Customer Portal — badge số chưa đọc + panel list, "Đánh dấu đã đọc" bump 1 mốc thời gian (KHÔNG track từng cái). Xem `CustomerPortal.md §9`. */
export function NotificationBell() {
  const { t } = useTranslation('customerNotifications');
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await RepositoryRemote.customerNotificationPortal.listNotifications(1, 20);
      setItems(res.data?.data || []);
      setUnreadCount(res.data?.unreadCount || 0);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_MS);
    return () => clearInterval(interval);
     
  }, []);

  /** Bấm thông báo hệ thống → mở listing lọc đúng đơn (search theo mã hiển thị). */
  const openOrder = (orderCode?: string) => {
    if (!orderCode) return;
    setOpen(false);
    navigate(`${PATHS.CUSTOMER_ORDERS}?search=${encodeURIComponent(orderCode)}`);
  };

  const handleMarkRead = async () => {
    try {
      setMarking(true);
      await RepositoryRemote.customerNotificationPortal.markNotificationsRead();
      setUnreadCount(0);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setMarking(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) fetchData();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('bell.title')}
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold">{t('bell.title')}</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkRead}
              disabled={marking}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {t('bell.markAllRead')}
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spinner size={16} />
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">{t('bell.empty')}</p>
          ) : (
            items.map((n) => {
              // Thông báo HỆ THỐNG (ORD-5) render theo ngôn ngữ đang chọn từ
              // `event`/`eventData`; thông báo admin soạn tay giữ nguyên văn.
              const text = n.event ? systemNotificationText(n, t) : { title: n.title, body: n.body };
              const orderCode = n.eventData?.orderCode;
              const clickable = !!n.event && !!orderCode;
              return (
                <div
                  key={String(n._id)}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => openOrder(orderCode) : undefined}
                  onKeyDown={clickable ? (e) => e.key === 'Enter' && openOrder(orderCode) : undefined}
                  className={cn(
                    'px-3 py-2.5 border-b border-border last:border-0',
                    clickable && 'cursor-pointer hover:bg-accent/50 transition-colors',
                  )}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!n.customerId && !n.event && (
                      <Badge variant="outline" className="text-[9px]">
                        {t('bell.broadcastLabel')}
                      </Badge>
                    )}
                    <p className="text-xs font-medium text-foreground">{text.title}</p>
                  </div>
                  {text.body && <p className="text-xs text-muted-foreground mt-0.5">{text.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {n.createdAt ? dayjs(n.createdAt).format('DD/MM/YYYY HH:mm') : ''}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
