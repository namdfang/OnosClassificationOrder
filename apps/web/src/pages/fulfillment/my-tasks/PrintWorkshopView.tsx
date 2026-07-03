import React, { useState } from 'react';
import { CheckCircle2, PlayCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FulfillmentTransitionDto, ProductionOrder } from 'shared';
import { FulfillmentStage, FulfillmentStageStatus, FulfillmentTransitionAction } from 'shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { WorkshopOrderRow } from '@/components/orders/workshopTableConfig';
import { OrderRowActionsMenu } from '@/components/orders/OrderRowActionsMenu';
import { RepositoryRemote } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { handleAxiosError } from '@/utils';

import { FulfillmentDailyOverview } from './FulfillmentDailyOverview';
import { PrintOrderTable } from './PrintOrderTable';
import { ReworkBackDialog } from './ReworkBackDialog';

type BulkAction = 'start' | 'complete';

const printStatusOf = (row: WorkshopOrderRow): string | undefined =>
  row.fulfillmentStages?.print?.status;

/**
 * Trang "Task của tôi" cho user In (Fulfillment stage=print). Bảng phẳng
 * `PrintOrderTable` + cột action đẩy In→Ép + bulk chuyển trạng thái (Bắt đầu /
 * Hoàn thành) với popup xác nhận khi chọn lẫn trạng thái.
 * Xem documents/Plans/PrintStage-AdminTableView.md.
 */
export default function PrintWorkshopView() {
  const profile = useAuthStore((s) => s.profile);
  const myFactoryId = profile?.factoryId;
  const [reloadToken, setReloadToken] = useState(0);
  const [reworkOrder, setReworkOrder] = useState<WorkshopOrderRow | null>(null);
  // Ngày đang lọc từ bảng "Tổng quan theo ngày". Bảng In phân trang server →
  // narrow qua date (dayOverride) thay vì lọc client-side.
  const [dayFilter, setDayFilter] = useState('');
  const toggleDay = (day: string) => setDayFilter((cur) => (cur === day ? '' : day));
  // Popup xác nhận bulk khi chọn lẫn trạng thái.
  const [confirm, setConfirm] = useState<{
    action: BulkAction;
    rows: WorkshopOrderRow[];
    skipped: number;
    clear: () => void;
  } | null>(null);

  const refresh = () => setReloadToken((t) => t + 1);

  // Đơn In thao tác được — 2 điều kiện: (1) `toolResultNote='ok'` (thay cho
  // check `currentFulfillmentStage='print'` cũ) + (2) thuộc xưởng user. Điều
  // kiện (3) status stage print được check riêng ở nút bên dưới. BE self-heal
  // đưa `currentFulfillmentStage` về 'print' khi start nếu bị lệch.
  const canPrint = (row: WorkshopOrderRow) =>
    row.toolResultNote === 'ok' &&
    !!myFactoryId &&
    String(row.factoryId ?? '') === String(myFactoryId);

  // Tick được: đơn In thao tác được + status print ∈ {waiting, rework, in-progress}.
  const isRowSelectable = (row: WorkshopOrderRow) => {
    if (!canPrint(row)) return false;
    const s = printStatusOf(row);
    return (
      s === FulfillmentStageStatus.Waiting ||
      s === FulfillmentStageStatus.Rework ||
      s === FulfillmentStageStatus.InProgress
    );
  };

  const doTransition = async (
    orderId: string,
    action: FulfillmentTransitionAction,
    body?: Pick<FulfillmentTransitionDto, 'target' | 'reason'>,
  ) => {
    try {
      await RepositoryRemote.fulfillment.transition(orderId, {
        stage: FulfillmentStage.Print,
        action,
        ...body,
      } as FulfillmentTransitionDto);
      toast.success('Đã cập nhật');
      refresh();
    } catch (err) {
      handleAxiosError(err);
      refresh();
    }
  };

  // Bulk: loop transition song song, gộp kết quả → 1 toast.
  const runBulk = async (rows: WorkshopOrderRow[], action: BulkAction, clear: () => void) => {
    const txAction =
      action === 'start' ? FulfillmentTransitionAction.Start : FulfillmentTransitionAction.Complete;
    const verb = action === 'start' ? 'bắt đầu' : 'hoàn thành';
    const results = await Promise.allSettled(
      rows.map((r) =>
        RepositoryRemote.fulfillment.transition(r._id, {
          stage: FulfillmentStage.Print,
          action: txAction,
        } as FulfillmentTransitionDto),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    if (fail === 0) toast.success(`Đã ${verb} ${ok} đơn`);
    else toast.warning(`Đã ${verb} ${ok}/${results.length} đơn (${fail} lỗi)`);
    clear();
    refresh();
  };

  // Click 1 nút bulk: nếu chọn lẫn trạng thái (có đơn ở trạng thái khác) →
  // popup xác nhận; ngược lại chạy thẳng.
  const onBulkClick = (
    action: BulkAction,
    eligible: WorkshopOrderRow[],
    others: number,
    clear: () => void,
  ) => {
    if (others > 0) setConfirm({ action, rows: eligible, skipped: others, clear });
    else void runBulk(eligible, action, clear);
  };

  const renderRowAction = (row: WorkshopOrderRow) => {
    const status = printStatusOf(row);
    const ok = canPrint(row);
    let stageButtons: React.ReactNode = null;
    if (ok && (status === FulfillmentStageStatus.Waiting || status === FulfillmentStageStatus.Rework)) {
      stageButtons = (
        <>
          <Button
            size="sm"
            className="whitespace-nowrap"
            onClick={() => void doTransition(row._id, FulfillmentTransitionAction.Start)}
          >
            Bắt đầu
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="whitespace-nowrap"
            onClick={() => setReworkOrder(row)}
          >
            Báo lỗi
          </Button>
        </>
      );
    } else if (ok && status === FulfillmentStageStatus.InProgress) {
      stageButtons = (
        <>
          <Button
            size="sm"
            className="whitespace-nowrap"
            onClick={() => void doTransition(row._id, FulfillmentTransitionAction.Complete)}
          >
            Hoàn thành
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="whitespace-nowrap"
            onClick={() => setReworkOrder(row)}
          >
            Báo lỗi
          </Button>
        </>
      );
    }
    return (
      <div className="flex items-center gap-1">
        {stageButtons}
        <OrderRowActionsMenu order={row} onChanged={refresh} />
      </div>
    );
  };

  const renderBulkBar = (selectedRows: WorkshopOrderRow[], clear: () => void) => {
    const startable = selectedRows.filter((r) => {
      const s = printStatusOf(r);
      return s === FulfillmentStageStatus.Waiting || s === FulfillmentStageStatus.Rework;
    });
    const completable = selectedRows.filter(
      (r) => printStatusOf(r) === FulfillmentStageStatus.InProgress,
    );
    return (
      <div className="sticky bottom-3 z-30 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card shadow-lg px-4 py-2 flex-wrap">
          <CheckCircle2 size={14} className="text-primary" />
          <span className="text-sm">
            Đã chọn <span className="font-semibold">{selectedRows.length}</span>
          </span>
          {startable.length > 0 && (
            <Button
              size="sm"
              onClick={() => onBulkClick('start', startable, completable.length, clear)}
            >
              <PlayCircle size={14} /> Bắt đầu ({startable.length})
            </Button>
          )}
          {completable.length > 0 && (
            <Button
              size="sm"
              onClick={() => onBulkClick('complete', completable, startable.length, clear)}
            >
              <CheckCircle2 size={14} /> Hoàn thành ({completable.length})
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={clear}>
            <X size={13} />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <FulfillmentDailyOverview
          stage={FulfillmentStage.Print}
          reloadToken={reloadToken}
          dayFilter={dayFilter}
          onPickDay={toggleDay}
        />
        <PrintOrderTable
          extraRowAction={renderRowAction}
          extraActionLabel="Thao tác In"
          reloadToken={reloadToken}
          isRowSelectable={isRowSelectable}
          renderBulkBar={renderBulkBar}
          dayOverride={dayFilter || null}
        />
      </div>

      {reworkOrder && (
        <ReworkBackDialog
          order={reworkOrder as unknown as ProductionOrder}
          myStage={FulfillmentStage.Print}
          onClose={() => setReworkOrder(null)}
          onSubmit={async (target, reason) => {
            await doTransition(reworkOrder._id, FulfillmentTransitionAction.ReworkBack, {
              target,
              reason,
            });
            setReworkOrder(null);
          }}
        />
      )}

      {/* Popup xác nhận khi chọn lẫn trạng thái */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận chuyển trạng thái</DialogTitle>
            <DialogDescription>
              Các đơn đang chọn có trạng thái khác nhau. Chỉ{' '}
              <strong>{confirm?.rows.length}</strong> đơn hợp lệ sẽ được{' '}
              <strong>{confirm?.action === 'start' ? 'Bắt đầu' : 'Hoàn thành'}</strong>
              {confirm && confirm.skipped > 0 ? ` (${confirm.skipped} đơn trạng thái khác bị bỏ qua)` : ''}.
              Tiếp tục?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Huỷ
            </Button>
            <Button
              onClick={() => {
                if (confirm) void runBulk(confirm.rows, confirm.action, confirm.clear);
                setConfirm(null);
              }}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
