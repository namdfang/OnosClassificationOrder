import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, MoreHorizontal, PauseCircle, Pencil, PlayCircle, RefreshCw, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import type { WorkshopOrderRow } from '@/components/orders/workshopTableConfig';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { handleAxiosError } from '@/utils';
import { canCancelOrder, canUserHold, isCancelled, isHeld } from '@/utils/orderActions';

import { usePermission } from '@/hooks/usePermission';

import { CancelOrderDialog } from './CancelOrderDialog';
import { EditOrderDesignDialog } from './EditOrderDesignDialog';
import { HoldOrderDialog } from './HoldOrderDialog';
import { VnpShipmentDialog } from './VnpShipmentDialog';

interface Props {
  order: WorkshopOrderRow;
  /** Order đã cập nhật từ BE → caller patch local (giữ trạng thái group đang mở). */
  onChanged: (updated: WorkshopOrderRow) => void;
}

/**
 * Menu "..." cuối mỗi hàng order. Admin: Đổi design · Hủy đơn. ORDER_WRITE_ROLES
 * (Admin/Manager/Support/Leader/Fulfillment): Giữ đơn · Mở giữ · Kiểm tra design
 * mới (ép tra OnosPod cho đơn NÀY, không cần đang giữ — dùng chung logic cron
 * `recover-held-from-onospod`, Orders.md §9c). Đơn đã hủy → disable design/hủy/
 * kiểm tra design. Đơn đang giữ → chỉ còn "Mở giữ" (mọi action khác khóa, TRỪ
 * "Kiểm tra design mới" — vẫn bấm được để tự mở giữ nếu design đã cập nhật).
 */
export function OrderRowActionsMenu({ order, onChanged }: Props) {
  const { t } = useTranslation('orders');
  const { isAdmin, roleName } = usePermission();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [vnpOpen, setVnpOpen] = useState(false);
  const [unholding, setUnholding] = useState(false);
  const [checkingDesign, setCheckingDesign] = useState(false);

  const canHold = canUserHold(roleName);
  if (!isAdmin && !canHold) return null;

  const cancelled = isCancelled(order);
  const held = isHeld(order);
  const cancelCheck = canCancelOrder(order, t);
  // Đơn ĐANG GIỮ vẫn hủy được — CỐ Ý không đưa `held` vào đây (ORD-2). Máy chủ
  // chưa bao giờ chặn hủy vì trạng thái giữ (`Orders.md` §9b liệt kê đúng các
  // nhánh bị chặn, cancel không nằm trong đó); disable ở giao diện là luật do
  // chính FE tự đặt ra, chặt hơn máy chủ mà không yêu cầu nào quy định.
  // Nghiệp vụ: đơn giữ thường đang chờ khách xác nhận, khách bảo hủy thì hủy
  // luôn — bắt bỏ giữ rồi mới hủy vừa thêm một thao tác, vừa mở ra khoảng thời
  // gian đơn có thể lọt lại vào luồng sản xuất.
  const cancelDisabled = cancelled || !cancelCheck.ok;

  const doUnhold = async () => {
    try {
      setUnholding(true);
      const res = await RepositoryRemote.order.unholdOrder(order._id);
      toast.success(t('rowActionsMenu.unheld'));
      onChanged((res.data?.data as WorkshopOrderRow) ?? order);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setUnholding(false);
    }
  };

  const doCheckDesign = async () => {
    try {
      setCheckingDesign(true);
      const res = await RepositoryRemote.order.checkDesignFromOnospod(order._id);
      const data = res.data?.data as { updated: boolean; reason?: string; order?: WorkshopOrderRow } | undefined;
      if (data?.updated) {
        toast.success(t('rowActionsMenu.checkDesignUpdated'));
        onChanged(data.order ?? order);
      } else {
        toast.info(data?.reason ?? t('rowActionsMenu.checkDesignUpdated'));
      }
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setCheckingDesign(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={t('rowActionsMenu.ariaLabel')}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {isAdmin && (
            <DropdownMenuItem disabled={cancelled || held} onSelect={() => setDesignOpen(true)}>
              <Pencil size={14} className="mr-2" /> {t('rowActionsMenu.changeDesign')}
            </DropdownMenuItem>
          )}
          {canHold && (
            <DropdownMenuItem
              disabled={cancelled || checkingDesign}
              title={cancelled ? t('rowActionsMenu.alreadyCancelled') : undefined}
              onSelect={(e) => {
                e.preventDefault();
                void doCheckDesign();
              }}
            >
              <RefreshCw size={14} className="mr-2" /> {t('rowActionsMenu.checkDesign')}
            </DropdownMenuItem>
          )}
          {canHold &&
            (held ? (
              <DropdownMenuItem
                disabled={unholding}
                className="text-emerald-600 focus:text-emerald-600"
                onSelect={(e) => {
                  e.preventDefault();
                  void doUnhold();
                }}
              >
                <PlayCircle size={14} className="mr-2" /> {t('rowActionsMenu.unhold')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={cancelled}
                className="text-amber-600 focus:text-amber-600"
                title={cancelled ? t('rowActionsMenu.alreadyCancelled') : undefined}
                onSelect={() => setHoldOpen(true)}
              >
                <PauseCircle size={14} className="mr-2" /> {t('rowActionsMenu.hold')}
              </DropdownMenuItem>
            ))}
          {isAdmin && (
            <DropdownMenuItem disabled={cancelled} onSelect={() => setVnpOpen(true)}>
              <Truck size={14} className="mr-2" /> {t('rowActionsMenu.vnpShipment')}
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem
              disabled={cancelDisabled}
              className="text-rose-600 focus:text-rose-600"
              title={cancelled ? t('rowActionsMenu.alreadyCancelled') : cancelCheck.reason}
              onSelect={() => setCancelOpen(true)}
            >
              <Ban size={14} className="mr-2" /> {t('rowActionsMenu.cancelOrder')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CancelOrderDialog order={order} open={cancelOpen} onOpenChange={setCancelOpen} onDone={onChanged} />
      <HoldOrderDialog order={order} open={holdOpen} onOpenChange={setHoldOpen} onDone={onChanged} />
      <EditOrderDesignDialog order={order} open={designOpen} onOpenChange={setDesignOpen} onDone={onChanged} />
      <VnpShipmentDialog order={order} open={vnpOpen} onOpenChange={setVnpOpen} onDone={onChanged} />
    </>
  );
}
