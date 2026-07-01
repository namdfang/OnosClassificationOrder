import React, { useState } from 'react';
import { Ban, MoreHorizontal, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermission } from '@/hooks/usePermission';
import { canCancelOrder, isCancelled } from '@/utils/orderActions';
import type { WorkshopOrderRow } from '@/components/orders/workshopTableConfig';
import { CancelOrderDialog } from './CancelOrderDialog';
import { EditOrderDesignDialog } from './EditOrderDesignDialog';

interface Props {
  order: WorkshopOrderRow;
  /** Order đã cập nhật từ BE → caller patch local (giữ trạng thái group đang mở). */
  onChanged: (updated: WorkshopOrderRow) => void;
}

/**
 * Menu "..." cuối mỗi hàng order — CHỈ Admin. 2 action: Đổi design · Hủy đơn.
 * Đơn đã hủy → disable cả 2 (đơn hủy read-only). Hủy → disable + tooltip lý do
 * khi `!canCancelOrder` (đã bắt đầu in / rework...).
 */
export function OrderRowActionsMenu({ order, onChanged }: Props) {
  const { isAdmin } = usePermission();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);

  if (!isAdmin) return null;

  const cancelled = isCancelled(order);
  const cancelCheck = canCancelOrder(order);
  const cancelDisabled = cancelled || !cancelCheck.ok;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Thao tác đơn"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem disabled={cancelled} onSelect={() => setDesignOpen(true)}>
            <Pencil size={14} className="mr-2" /> Đổi design
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={cancelDisabled}
            className="text-rose-600 focus:text-rose-600"
            title={cancelled ? 'Đơn đã hủy' : cancelCheck.reason}
            onSelect={() => setCancelOpen(true)}
          >
            <Ban size={14} className="mr-2" /> Hủy đơn
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CancelOrderDialog
        order={order}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onDone={onChanged}
      />
      <EditOrderDesignDialog
        order={order}
        open={designOpen}
        onOpenChange={setDesignOpen}
        onDone={onChanged}
      />
    </>
  );
}
