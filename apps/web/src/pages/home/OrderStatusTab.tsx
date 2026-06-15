import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Printer,
  Sparkles,
  TrendingUp,
  Truck,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OrderStatusOverview } from 'shared';

import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import { usePermission } from '@/hooks/usePermission';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { cn } from '@/utils/cn';

import { KpiCard } from './status/KpiCard';
import { BreakdownCard } from './status/BreakdownCard';
import { FilterChipBar } from './status/FilterChipBar';
import { OrdersMiniTable } from './status/OrdersMiniTable';
import { useStatusFilter } from './status/useStatusFilter';

type KpiKey =
  | 'total'
  | 'today'
  | 'pendingToolOk'
  | 'ready'
  | 'done'
  | 'errors'
  | 'designerQueue'
  | 'designerDone'
  | 'fulfillReady';

const ICONS: Record<KpiKey, LucideIcon> = {
  total: ClipboardList,
  today: CalendarDays,
  pendingToolOk: Wrench,
  ready: Truck,
  done: Printer,
  errors: AlertTriangle,
  designerQueue: Sparkles,
  designerDone: CheckCircle2,
  fulfillReady: TrendingUp,
};

export default function OrderStatusTab() {
  const { roleName, isAdmin, has, canViewField } = usePermission();
  const { filter, queryString, isActive, toggle, setScalar, clearAll } = useStatusFilter();

  const [overview, setOverview] = useState<OrderStatusOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const res = await RepositoryRemote.order.getStatusOverview(queryString);
      setOverview((res.data?.data || null) as OrderStatusOverview | null);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  // ─── KPI cards per role ───────────────────────────────────────
  const kpis = useMemo(() => {
    const t = overview?.totals;
    if (!t) return [];

    if (roleName === 'Designer') {
      return [
        { key: 'designerQueue' as KpiKey, label: 'Cần check', value: t.pendingToolOk, hint: 'Đơn chưa Ok', accent: 'warning' as const, icon: ICONS.designerQueue },
        { key: 'designerDone' as KpiKey, label: 'Ok hôm nay', value: t.today - t.pendingToolOk > 0 ? t.today - t.pendingToolOk : 0, hint: 'Đã đánh dấu Ok', accent: 'success' as const, icon: ICONS.designerDone },
        { key: 'errors' as KpiKey, label: 'Đơn lỗi', value: t.errors, hint: 'Cần xử lý', accent: 'danger' as const, icon: ICONS.errors },
        { key: 'total' as KpiKey, label: 'Tổng (range)', value: t.total, accent: 'default' as const, icon: ICONS.total },
      ];
    }

    if (roleName === 'Fulfillment') {
      return [
        { key: 'fulfillReady' as KpiKey, label: 'Sẵn sàng in', value: t.readyForFulfill, hint: 'readyForFulfill=true', accent: 'primary' as const, icon: ICONS.fulfillReady },
        { key: 'done' as KpiKey, label: 'Đã in xong', value: t.done, hint: 'In trên máy 1..94', accent: 'success' as const, icon: ICONS.done },
        { key: 'today' as KpiKey, label: 'Đơn hôm nay', value: t.today, accent: 'default' as const, icon: ICONS.today },
        { key: 'total' as KpiKey, label: 'Tổng (range)', value: t.total, accent: 'default' as const, icon: ICONS.total },
      ];
    }

    // Admin / Manager / Support
    return [
      { key: 'total' as KpiKey, label: 'Tổng đơn', value: t.total, accent: 'default' as const, icon: ICONS.total },
      { key: 'today' as KpiKey, label: 'Hôm nay', value: t.today, accent: 'primary' as const, icon: ICONS.today },
      { key: 'pendingToolOk' as KpiKey, label: 'Chờ Ok Tool', value: t.pendingToolOk, hint: 'Designer chưa check', accent: 'warning' as const, icon: ICONS.pendingToolOk },
      { key: 'ready' as KpiKey, label: 'Sẵn sàng in', value: t.readyForFulfill, accent: 'primary' as const, icon: ICONS.ready },
      { key: 'done' as KpiKey, label: 'Đã in xong', value: t.done, accent: 'success' as const, icon: ICONS.done },
      { key: 'errors' as KpiKey, label: 'Lỗi cần xử lý', value: t.errors, accent: 'danger' as const, icon: ICONS.errors },
    ];
  }, [overview, roleName]);

  // ─── Per-machine mini KPI for Fulfillment ─────────────────────
  const showMachineKpis = roleName === 'Fulfillment' && (overview?.totals.byMachine?.length || 0) > 0;

  // ─── Which breakdown cards to show (per-role + permission) ────
  const showPrintStatus = canViewField('printStatus');
  const showPrintNote = canViewField('printStatusNote');
  const showToolResult = canViewField('toolResult');
  const showToolNote = canViewField('toolResultNote');
  const showErrorFile = canViewField('errorFile');
  const showAssignee = canViewField('assignee');
  const showAssigneeNote = canViewField('assigneeNote');

  const isRefetching = loading && !!overview;

  return (
    <div className="space-y-4 relative">
      {/* Indeterminate top progress bar */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-0.5 overflow-hidden rounded-full bg-primary/10 pointer-events-none transition-opacity duration-200',
          loading ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="h-full w-1/4 bg-primary rounded-full animate-indeterminate-bar" />
      </div>

      {/* KPI Row */}
      <div
        className={cn(
          'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 transition-opacity duration-300',
          isRefetching && 'opacity-60',
        )}
      >
        {kpis.length > 0
          ? kpis.map((k) => (
              <KpiCard
                key={k.key}
                label={k.label}
                value={k.value}
                hint={k.hint}
                accent={k.accent}
                icon={k.icon}
                loading={loading && !overview}
              />
            ))
          : [0, 1, 2, 3, 4, 5].map((i) => (
              // Placeholder skeletons while overview loads (or when fetch
              // failed and overview is null) — prevents the page from
              // appearing blank.
              <KpiCard
                key={`__skeleton-${i}`}
                label={loading ? 'Đang tải...' : 'Chưa có dữ liệu'}
                value={0}
                accent="default"
                loading={loading}
              />
            ))}
      </div>

      {/* Per-machine mini cards for Fulfill */}
      {showMachineKpis && overview?.totals.byMachine && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {overview.totals.byMachine.map((m) => (
            <KpiCard
              key={m.machineCode}
              label={m.machineName}
              value={m.printed}
              // hint={`${m.machineName}`}
              accent="success"
            />
          ))}
        </div>
      )}

      {/* Filter chip bar */}
      <FilterChipBar
        filter={filter}
        isActive={isActive}
        onToggle={toggle}
        onScalar={(k, v) => setScalar(k, v)}
        onClearAll={clearAll}
      />

      {/* Breakdown grid */}
      {overview && (
        <div
          className={cn(
            'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 transition-opacity duration-300',
            isRefetching && 'opacity-60',
          )}
        >
          {showPrintStatus && overview.breakdown.printStatus.length > 0 && (
            <BreakdownCard
              title="Trạng thái in"
              items={overview.breakdown.printStatus}
              selectedCodes={filter.printStatus}
              onToggle={(c) => toggle('printStatus', c)}
              mode="color"
            />
          )}
          {showPrintNote && overview.breakdown.printStatusNote.length > 0 && (
            <BreakdownCard
              title="Note Trạng thái in"
              items={overview.breakdown.printStatusNote}
              selectedCodes={filter.printStatusNote}
              onToggle={(c) => toggle('printStatusNote', c)}
              mode="icon"
            />
          )}
          {showToolResult && overview.breakdown.toolResult.length > 0 && (
            <BreakdownCard
              title="Kết quả Tool"
              items={overview.breakdown.toolResult}
              selectedCodes={filter.toolResult}
              onToggle={(c) => toggle('toolResult', c)}
              mode="icon"
            />
          )}
          {showToolNote && overview.breakdown.toolResultNote.length > 0 && (
            <BreakdownCard
              title="Note kết quả Tool"
              items={overview.breakdown.toolResultNote}
              selectedCodes={filter.toolResultNote}
              onToggle={(c) => toggle('toolResultNote', c)}
              mode="color"
            />
          )}
          {showErrorFile && overview.breakdown.errorFile.length > 0 && (
            <BreakdownCard
              title="File sửa lỗi"
              items={overview.breakdown.errorFile}
              selectedCodes={filter.errorFile}
              onToggle={(c) => toggle('errorFile', c)}
              mode="icon"
            />
          )}
          {showAssignee && overview.breakdown.assignee.length > 0 && (
            <BreakdownCard
              title="Người thực hiện"
              items={overview.breakdown.assignee}
              selectedCodes={filter.assignee}
              onToggle={(c) => toggle('assignee', c)}
              mode="icon"
            />
          )}
          {showAssigneeNote && overview.breakdown.assigneeNote.length > 0 && (
            <BreakdownCard
              title="Note người thực hiện"
              items={overview.breakdown.assigneeNote}
              selectedCodes={filter.assigneeNote}
              onToggle={(c) => toggle('assigneeNote', c)}
              mode="icon"
            />
          )}

          {/* Factory / MachineType — admin-level breakdowns */}
          {(isAdmin || has('order.view_admin_table')) && overview.breakdown.factory.length > 0 && (
            <BreakdownCard
              title="Nhà máy"
              items={overview.breakdown.factory.map((f) => ({
                code: f.factoryId,
                name: f.name,
                count: f.count,
              }))}
              selectedCodes={filter.factoryId ? [filter.factoryId] : []}
              onToggle={(c) => setScalar('factoryId', filter.factoryId === c ? undefined : c)}
              mode="icon"
            />
          )}
          {(isAdmin || has('order.view_admin_table')) && overview.breakdown.machineType.length > 0 && (
            <BreakdownCard
              title="Loại máy"
              items={overview.breakdown.machineType.map((m) => ({
                code: m.machineTypeId,
                name: m.name,
                count: m.count,
              }))}
              selectedCodes={filter.machineTypeId ? [filter.machineTypeId] : []}
              onToggle={(c) => setScalar('machineTypeId', filter.machineTypeId === c ? undefined : c)}
              mode="icon"
            />
          )}
        </div>
      )}

      {/* Orders list */}
      <OrdersMiniTable queryString={queryString} />
    </div>
  );
}
