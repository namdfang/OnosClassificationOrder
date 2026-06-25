import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Clock, PlayCircle, RefreshCw, RotateCw, XOctagon } from 'lucide-react';
import { toast } from 'sonner';
import type {
  FulfillmentStageState,
  FulfillmentTaskTab,
  FulfillmentTransitionDto,
  ProductionOrder,
} from 'shared';
import {
  FULFILLMENT_STAGE_LABELS,
  FulfillmentStage,
  FulfillmentStageStatus,
  FulfillmentTransitionAction,
} from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { ReworkBackDialog } from './ReworkBackDialog';

type TabKey = FulfillmentTaskTab;

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'waiting', label: 'Đang chờ', icon: Clock },
  { key: 'in-progress', label: 'Đang làm', icon: PlayCircle },
  { key: 'rework', label: 'Làm lại', icon: RotateCw },
  { key: 'watching', label: 'Đợi quay lại', icon: ChevronRight },
];

type TabCounts = { waiting: number; inProgress: number; rework: number; watching: number };

export default function FulfillmentMyTasksPage() {
  const profile = useAuthStore((s) => s.profile);
  const myStage = profile?.fulfillmentStage as FulfillmentStage | undefined;

  const [tab, setTab] = useState<TabKey>('waiting');
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [counts, setCounts] = useState<TabCounts>({ waiting: 0, inProgress: 0, rework: 0, watching: 0 });
  const [loading, setLoading] = useState(false);
  const [reworkOrder, setReworkOrder] = useState<ProductionOrder | null>(null);

  const load = useCallback(async () => {
    if (!myStage) return;
    setLoading(true);
    try {
      const resp = await RepositoryRemote.fulfillment.myTasks({ tab, size: 100 });
      const body = resp.data;
      setOrders(body.data ?? []);
      setCounts(body.tabCounts ?? { waiting: 0, inProgress: 0, rework: 0, watching: 0 });
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  }, [tab, myStage]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAction = async (
    order: ProductionOrder,
    action: FulfillmentTransitionAction,
    body?: Pick<FulfillmentTransitionDto, 'target' | 'reason'>,
  ) => {
    if (!myStage) return;
    try {
      await RepositoryRemote.fulfillment.transition(order._id, {
        stage: myStage,
        action,
        ...body,
      } as FulfillmentTransitionDto);
      toast.success(actionToastLabel(action));
      void load();
    } catch (err) {
      handleAxiosError(err);
    }
  };

  if (!myStage) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Tài khoản chưa được gán <strong>Stage Fulfillment</strong>. Liên hệ Admin để gán.
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Task của tôi — {FULFILLMENT_STAGE_LABELS[myStage]}
          </h1>
          <p className="text-xs text-muted-foreground">
            Xưởng: {profile?.factoryId ?? '—'}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </Button>
      </header>

      <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              tab === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={13} /> {label}
            <Badge variant="secondary" className="ml-1">
              {countFor(counts, key)}
            </Badge>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-10">
          <Spinner size={20} className="text-primary" />
        </div>
      ) : orders.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Không có đơn nào.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {orders.map((o) => (
            <OrderCard
              key={o._id}
              order={o}
              tab={tab}
              myStage={myStage}
              onStart={() => handleAction(o, FulfillmentTransitionAction.Start)}
              onComplete={() => handleAction(o, FulfillmentTransitionAction.Complete)}
              onReportError={() => setReworkOrder(o)}
            />
          ))}
        </div>
      )}

      {reworkOrder && (
        <ReworkBackDialog
          order={reworkOrder}
          myStage={myStage}
          onClose={() => setReworkOrder(null)}
          onSubmit={async (target, reason) => {
            await handleAction(reworkOrder, FulfillmentTransitionAction.ReworkBack, {
              target,
              reason,
            });
            setReworkOrder(null);
          }}
        />
      )}
    </div>
  );
}

function countFor(c: TabCounts, key: TabKey): number {
  switch (key) {
    case 'waiting':
      return c.waiting;
    case 'in-progress':
      return c.inProgress;
    case 'rework':
      return c.rework;
    case 'watching':
      return c.watching;
  }
}

function actionToastLabel(action: FulfillmentTransitionAction): string {
  switch (action) {
    case FulfillmentTransitionAction.Start:
      return 'Đã bắt đầu';
    case FulfillmentTransitionAction.Complete:
      return 'Đã hoàn thành';
    case FulfillmentTransitionAction.ReworkBack:
      return 'Đã đẩy về xử lý';
  }
}

interface OrderCardProps {
  order: ProductionOrder;
  tab: TabKey;
  myStage: FulfillmentStage;
  onStart: () => void;
  onComplete: () => void;
  onReportError: () => void;
}

function OrderCard({ order, tab, myStage, onStart, onComplete, onReportError }: OrderCardProps) {
  const state = (order.fulfillmentStages?.[myStage] ?? null) as FulfillmentStageState | null;
  const status = state?.status ?? FulfillmentStageStatus.Waiting;
  const currentStage = order.currentFulfillmentStage as FulfillmentStage | undefined;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{order.productionId}</p>
          <p className="text-[11px] text-muted-foreground">
            {order.type ?? '—'} · {order.size ?? '—'} · qty {order.quantity}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {tab === 'watching' && (
        <p className="text-[11px] text-muted-foreground">
          Đang ở:{' '}
          <strong className="text-foreground">
            {order.designerStatus === 'rework'
              ? 'Designer (rework)'
              : currentStage
                ? FULFILLMENT_STAGE_LABELS[currentStage]
                : '—'}
          </strong>
        </p>
      )}

      {state?.reworkCount && state.reworkCount > 0 ? (
        <p className="text-[11px] text-amber-600">Đã rework {state.reworkCount} lần</p>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        {(status === FulfillmentStageStatus.Waiting || status === FulfillmentStageStatus.Rework) &&
          tab !== 'watching' && (
            <Button size="sm" onClick={onStart}>
              <PlayCircle size={14} /> Bắt đầu
            </Button>
          )}
        {status === FulfillmentStageStatus.InProgress && (
          <>
            <Button size="sm" onClick={onComplete}>
              <CheckCircle2 size={14} /> Hoàn thành
            </Button>
            <Button size="sm" variant="outline" onClick={onReportError}>
              <XOctagon size={14} /> Báo lỗi
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: FulfillmentStageStatus }) {
  const cfg = useMemo(() => {
    switch (status) {
      case FulfillmentStageStatus.Waiting:
        return { label: 'Chờ', variant: 'secondary' as const };
      case FulfillmentStageStatus.InProgress:
        return { label: 'Đang làm', variant: 'success' as const };
      case FulfillmentStageStatus.Done:
        return { label: 'Xong', variant: 'success' as const };
      case FulfillmentStageStatus.Rework:
        return { label: 'Làm lại', variant: 'warning' as const };
    }
  }, [status]);
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
