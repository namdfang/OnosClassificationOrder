import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, LayoutList } from 'lucide-react';
import type { DailyOverviewBacklogDesigner, DailyOverviewRow } from 'shared';
import { WorkshopConfigCategory } from 'shared';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Hint } from '@/components/common/Hint';
import { TooltipProvider } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { DesignerDrillPanel, type DrillTarget } from './DesignerDrillPanel';

type RangeDays = 7 | 14 | 30;
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface Data {
  days: string[];
  rows: DailyOverviewRow[];
  backlogByDesigner: DailyOverviewBacklogDesigner[];
  unassignedBacklog: number;
  columnTotals: {
    total: number;
    ok: number;
    unreviewed: number;
    error: number;
    errorUnassigned: number;
    toolError: number;
    toolErrorFixed: number;
    toolErrorUnassigned: number;
    assignedToolError: number;
    assignedWasOk: number;
    wasOkPushed: number;
    unassignedNeed: number;
    unassignedNeedTool: number;
    unassignedResolved: number;
    designDone: number;
    backlog: number;
  };
}

const EMPTY: Data = {
  days: [],
  rows: [],
  backlogByDesigner: [],
  unassignedBacklog: 0,
  columnTotals: {
    total: 0,
    ok: 0,
    unreviewed: 0,
    error: 0,
    errorUnassigned: 0,
    toolError: 0,
    toolErrorFixed: 0,
    toolErrorUnassigned: 0,
    assignedToolError: 0,
    assignedWasOk: 0,
    wasOkPushed: 0,
    unassignedNeed: 0,
    unassignedNeedTool: 0,
    unassignedResolved: 0,
    designDone: 0,
    backlog: 0,
  },
};

interface Props {
  /** Số ngày (7/14/30) — điều khiển từ switcher ở Bộ lọc chung. */
  days?: RangeDays;
  /** Khoảng tùy biến (YYYY-MM-DD) — nếu có cả 2 thì override `days`. */
  from?: string;
  to?: string;
  /** Bump để refetch khi tab bấm Refresh. */
  reloadToken?: number;
  /** Filter chung sản phẩm (`order.type`). */
  type?: string;
  /** Filter chung khách hàng (`order.userSku`). */
  customer?: string;
  /** Gọi sau khi gán/nhận đơn từ panel drill-down (bump matrixToken ở tab cha). */
  onAssigned?: () => void;
}

function fmtHead(day: string): { wd: string; dm: string } {
  const d = new Date(`${day}T12:00:00+07:00`);
  return {
    wd: WEEKDAYS[d.getDay()] ?? '',
    dm: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
  };
}

export function DesignerDailyOverview({ days: range = 7, from, to, reloadToken, type, customer, onAssigned }: Props) {
  const { t } = useTranslation('dashboard');
  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const seqRef = useRef(0);

  const resolve = useWorkshopConfigStore((s) => s.resolve);
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  useEffect(() => {
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.designer.dailyOverview({
          days: range,
          ...(from && to ? { from, to } : {}),
          ...(type ? { type } : {}),
          ...(customer ? { customer } : {}),
        });
        if (seq !== seqRef.current) return;
        const raw = (res.data?.data as Data) || EMPTY;
        // BE trả ngày mới→cũ. Đảo cả days + rows để hiển thị quá khứ→hiện tại.
        setData({
          ...raw,
          days: [...raw.days].reverse(),
          rows: [...raw.rows].reverse(),
        });
      } catch (err) {
        if (seq === seqRef.current) handleAxiosError(err);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, [range, from, to, reloadToken, type, customer]);

  const { days, rows, backlogByDesigner, unassignedBacklog, columnTotals } = data;
  const nDays = days.length || range;

  const noteName = (code: string) => resolve(WorkshopConfigCategory.ToolResultNote, code)?.name || code;

  const backlogGrand = useMemo(
    () => backlogByDesigner.reduce((s, d) => s + d.total, 0) + unassignedBacklog,
    [backlogByDesigner, unassignedBacklog],
  );

  // Drill-down: bấm 1 con số → panel danh sách đơn INLINE ngay dưới bảng
  // (gom nhóm theo sản phẩm, giống bảng "Cần gán designer") — không dùng dialog.
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  // Union mọi note lỗi trong khoảng (cho cột "Tổng" của dòng lỗi / tồn).
  const allErrorCodes = useMemo(
    () => [...new Set(rows.flatMap((r) => r.errorByNote.map((n) => n.code)))],
    [rows],
  );

  // Cộng dồn breakdown cả kỳ cho tooltip ô cột "Tổng" (lỗi hiện tại / lỗi soát).
  const sumByCode = (lists: { code: string; count: number }[][]) => {
    const m = new Map<string, number>();
    for (const list of lists) for (const n of list) m.set(n.code, (m.get(n.code) || 0) + n.count);
    return [...m.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
  };
  const allToolErrorBreakdown = useMemo(() => sumByCode(rows.map((r) => r.toolErrorByNote)), [rows]);

  const rangeFromTo = useMemo(
    () => (days.length ? { from: days[0], to: days[days.length - 1] } : { from, to }),
    [days, from, to],
  );

  // Base query dùng chung: date range (lọc theo inProductionAt) + type/customer +
  // sort=grouped để bảng gom nhóm giống OrderFactoryTab.
  const baseParams = (fromDay?: string, toDay?: string) => {
    const sp = new URLSearchParams();
    if (fromDay) sp.set('createdFrom', fromDay);
    if (toDay) sp.set('createdTo', toDay);
    if (type) sp.set('type', type);
    if (customer) sp.set('userSku', customer);
    sp.set('sort', 'grouped');
    return sp;
  };

  type Metric = 'total' | 'ok' | 'unreviewed' | 'toolError' | 'backlog';
  const METRIC_LABEL: Record<Metric, string> = {
    total: t('dailyOverview.metrics.total'),
    ok: t('dailyOverview.metrics.ok'),
    unreviewed: t('dailyOverview.metrics.unreviewed'),
    toolError: t('dailyOverview.metrics.toolError'),
    backlog: t('dailyOverview.metrics.backlog'),
  };
  const dayOrAll = (dayLabel?: string) => (dayLabel ? ` · ${dayLabel}` : ` · ${t('dailyOverview.dayLabelAll')}`);

  /** Mở modal cho 1 ô metric. `errorCodes` = danh sách note lỗi của phạm vi đó
   *  (1 ngày → row.errorByNote; cột Tổng → allErrorCodes). */
  const openMetric = (metric: Metric, fromDay: string, toDay: string, errorCodes: string[], dayLabel?: string) => {
    const sp = baseParams(fromDay, toDay);
    if (metric === 'ok') sp.set('toolResultNote', 'ok');
    else if (metric === 'unreviewed') sp.set('toolResultNote', '__none__');
    else if (metric === 'toolError') sp.set('toolCheckedError', '1');
    else if (metric === 'backlog') sp.set('designBacklog', '1');
    setDrill({
      title: (
        <>
          {METRIC_LABEL[metric]}
          {dayOrAll(dayLabel)}
        </>
      ),
      query: sp.toString(),
    });
  };

  /** Drill từng dòng tooltip hàng "Soát lỗi": 1 mã lỗi (theo mã MỚI NHẤT của
   *  đơn — khớp breakdown BE) / Chưa gán designer / Đã sửa xong. */
  const openToolErrorLine = (
    line: { type: 'note'; code: string } | { type: 'unassigned' } | { type: 'fixed' },
    fromDay: string,
    toDay: string,
    errorCodes: string[],
    dayLabel?: string,
  ) => {
    const sp = baseParams(fromDay, toDay);
    let label: string;
    if (line.type === 'note') {
      sp.set('toolErrorNote', line.code);
      label = noteName(line.code);
    } else if (line.type === 'unassigned') {
      sp.set('toolCheckedError', '1');
      sp.set('assignee', '__none__');
      sp.set('toolResultNote', errorCodes.join(','));
      label = t('dailyOverview.breakdown.unassignedDesigner');
    } else {
      sp.set('toolCheckedError', '1');
      sp.set('toolResultNote', 'ok');
      label = t('dailyOverview.breakdown.fixed');
    }
    setDrill({
      title: (
        <>
          {t('dailyOverview.metrics.toolError')} · {label}
          {dayOrAll(dayLabel)}
        </>
      ),
      query: sp.toString(),
    });
  };

  /** Drill hàng "OK/chưa soát → đẩy về" — chưa từng lỗi soát tool nhưng đã vào
   *  flow designer (designerStatus ∈ 4). */
  const openWasOk = (
    kind: 'all' | 'assigned' | 'unassigned',
    fromDay?: string,
    toDay?: string,
    dayLabel?: string,
  ) => {
    const sp = baseParams(fromDay, toDay);
    sp.set('toolCheckedError', '0');
    sp.set('designerStatus', 'assigned,in-progress,rework,done');
    if (kind === 'assigned') sp.set('assignee', '__any__');
    else if (kind === 'unassigned') sp.set('assignee', '__none__');
    setDrill({
      title: (
        <>
          {t('dailyOverview.metrics.wasOkPushed')}
          {kind === 'assigned'
            ? ` · ${t('dailyOverview.assignedSuffix')}`
            : kind === 'unassigned'
              ? ` · ${t('dailyOverview.unassignedSuffix')}`
              : ''}
          {dayOrAll(dayLabel)}
        </>
      ),
      query: sp.toString(),
    });
  };

  /** Drill hàng "Tổng lỗi" — toàn bộ pool cần designer (soát lỗi + đẩy về). */
  const openErrorPool = (fromDay?: string, toDay?: string, dayLabel?: string) => {
    const sp = baseParams(fromDay, toDay);
    sp.set('needDesigner', '1');
    setDrill({
      title: (
        <>
          {t('dailyOverview.metrics.totalErrorFull')}
          {dayOrAll(dayLabel)}
        </>
      ),
      query: sp.toString(),
    });
  };

  /** Drill hàng "Chưa gán designer" — pool cần designer, chưa gán & ĐANG lỗi
   *  (note ∈ errorCodes ≠ 'ok'); `resolved` = phần đã về 'ok' không cần designer. */
  const openUnassignedNeed = (
    kind: 'all' | 'tool' | 'wasOk' | 'resolved',
    fromDay: string | undefined,
    toDay: string | undefined,
    errorCodes: string[],
    dayLabel?: string,
  ) => {
    const sp = baseParams(fromDay, toDay);
    sp.set('assignee', '__none__');
    if (kind === 'resolved') {
      sp.set('needDesigner', '1');
      sp.set('toolResultNote', 'ok');
    } else {
      sp.set('toolResultNote', errorCodes.join(','));
      if (kind === 'tool') sp.set('toolCheckedError', '1');
      else if (kind === 'wasOk') {
        sp.set('toolCheckedError', '0');
        sp.set('designerStatus', 'assigned,in-progress,rework,done');
      } else sp.set('needDesigner', '1');
    }
    setDrill({
      title: (
        <>
          {t('dailyOverview.metrics.unassignedNeed')}
          {kind === 'tool'
            ? ` · ${t('dailyOverview.breakdown.fromToolCheck')}`
            : kind === 'wasOk'
              ? ` · ${t('dailyOverview.breakdown.wasOkPushedShort')}`
              : kind === 'resolved'
                ? ` · ${t('dailyOverview.breakdown.resolvedNoDesigner')}`
                : ''}
          {dayOrAll(dayLabel)}
        </>
      ),
      query: sp.toString(),
      // Đơn chưa ai ôm → bật chế độ chọn + cụm nút gán trong panel ('resolved'
      // = đã về 'ok' không cần designer nên không bật).
      selectable: kind !== 'resolved',
    });
  };

  /** Drill hàng "Đã gán designer" — mirror match ma trận team (assignee bất kỳ
   *  + designerStatus ∈ 4 trạng thái), tách nguồn qua toolCheckedError. */
  const DS4 = 'assigned,in-progress,rework,done';
  const openAssigned = (kind: 'all' | 'tool' | 'wasOk', fromDay?: string, toDay?: string, dayLabel?: string) => {
    const sp = baseParams(fromDay, toDay);
    sp.set('assignee', '__any__');
    sp.set('designerStatus', DS4);
    if (kind === 'tool') sp.set('toolCheckedError', '1');
    else if (kind === 'wasOk') sp.set('toolCheckedError', '0');
    setDrill({
      title: (
        <>
          {t('dailyOverview.metrics.assigned')}
          {kind === 'tool'
            ? ` · ${t('dailyOverview.breakdown.fromToolCheck')}`
            : kind === 'wasOk'
              ? ` · ${t('dailyOverview.breakdown.wasOkPushedShort')}`
              : ''}
          {dayOrAll(dayLabel)}
        </>
      ),
      query: sp.toString(),
    });
  };

  /** Drill hàng "Design đã xong" — assignee bất kỳ + designerStatus='done'. */
  const openDesignDone = (fromDay?: string, toDay?: string, dayLabel?: string) => {
    const sp = baseParams(fromDay, toDay);
    sp.set('assignee', '__any__');
    sp.set('designerStatus', 'done');
    setDrill({
      title: (
        <>
          {t('dailyOverview.metrics.designDone')}
          {dayOrAll(dayLabel)}
        </>
      ),
      query: sp.toString(),
    });
  };

  const openDesigner = (
    userId: string,
    fullName: string,
    statuses: string[],
    statusLabel: string,
  ) => {
    const sp = baseParams(rangeFromTo.from, rangeFromTo.to);
    sp.set('assignee', userId);
    sp.set('designerStatus', statuses.join(','));
    setDrill({
      title: (
        <>
          {fullName} · {statusLabel}
        </>
      ),
      query: sp.toString(),
    });
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-3 border-b border-border flex-wrap">
          <div className="flex items-center gap-2">
            <LayoutList size={16} className="text-indigo-600" />
            <span className="text-sm font-semibold">{t('dailyOverview.title', { count: nDays })}</span>
            <span className="hidden sm:inline text-[11px] text-muted-foreground">
              — {t('dailyOverview.subtitle')}
            </span>
          </div>
        </div>

        {!loading && days.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">{t('dailyOverview.noOrdersInRange')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-card text-left font-medium px-3 py-2 border-b border-border min-w-[150px]">
                    {t('dailyOverview.metricColumn')}
                  </th>
                  {days.map((d) => {
                    const { wd, dm } = fmtHead(d);
                    return (
                      <th
                        key={d}
                        className="bg-card font-medium px-1.5 py-1.5 border-b border-l border-border text-center min-w-[64px]"
                      >
                        <div className="text-[11px] text-muted-foreground leading-tight">{wd}</div>
                        <div className="leading-tight font-semibold">{dm}</div>
                      </th>
                    );
                  })}
                  <th className="bg-muted/30 font-semibold px-2 py-1.5 border-b border-l border-border text-center min-w-[64px]">
                    {t('dailyOverview.totalColumn')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 1. Tổng đơn */}
                <MetricRow
                  label={t('dailyOverview.metrics.total')}
                  values={rows.map((r) => r.total)}
                  total={columnTotals.total}
                  onCell={(i) => openMetric('total', days[i], days[i], [], fmtHead(days[i]).dm)}
                  onTotal={() => openMetric('total', rangeFromTo.from ?? '', rangeFromTo.to ?? '', [])}
                />
                {/* 1b. Tổng xong (Note Tool = ok) */}
                <MetricRow
                  label={t('dailyOverview.metrics.ok')}
                  hint={t('dailyOverview.metrics.okHint')}
                  values={rows.map((r) => r.ok)}
                  total={columnTotals.ok}
                  className="text-emerald-600 dark:text-emerald-400"
                  onCell={(i) => openMetric('ok', days[i], days[i], [], fmtHead(days[i]).dm)}
                  onTotal={() => openMetric('ok', rangeFromTo.from ?? '', rangeFromTo.to ?? '', [])}
                />
                {/* 2. Chưa soát */}
                <MetricRow
                  label={t('dailyOverview.metrics.unreviewed')}
                  hint={t('dailyOverview.metrics.unreviewedHint')}
                  values={rows.map((r) => r.unreviewed)}
                  total={columnTotals.unreviewed}
                  className="text-slate-600 dark:text-slate-300"
                  onCell={(i) => openMetric('unreviewed', days[i], days[i], [], fmtHead(days[i]).dm)}
                  onTotal={() => openMetric('unreviewed', rangeFromTo.from ?? '', rangeFromTo.to ?? '', [])}
                />
                {/* 2b. Soát lỗi — lịch sử toolCheckErrorNotes, tooltip breakdown theo mã. */}
                <tr className="group">
                  <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium text-orange-600 dark:text-orange-400">
                    <Hint content={t('dailyOverview.metrics.toolErrorHint')}>
                      <span className="cursor-help">{t('dailyOverview.metrics.toolError')}</span>
                    </Hint>
                  </td>
                  {rows.map((r, i) => {
                    const day = days[i];
                    const dm = fmtHead(day).dm;
                    const codes = r.errorByNote.map((n) => n.code);
                    return (
                      <td key={day} className="border-b border-l border-border/60 text-center px-1 py-1.5">
                        <BreakdownNumCell
                          value={r.toolError}
                          className="text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                          breakdown={r.toolErrorByNote.map((n) => ({
                            label: noteName(n.code),
                            count: n.count,
                            onClick: () => openToolErrorLine({ type: 'note', code: n.code }, day, day, codes, dm),
                          }))}
                          extra={[
                            {
                              label: t('dailyOverview.breakdown.assignedDesigner'),
                              count: r.assignedToolError,
                              onClick: () => openAssigned('tool', day, day, dm),
                            },
                            {
                              label: t('dailyOverview.breakdown.unassignedDesigner'),
                              count: r.toolErrorUnassigned,
                              onClick: () => openToolErrorLine({ type: 'unassigned' }, day, day, codes, dm),
                            },
                            {
                              label: t('dailyOverview.breakdown.fixed'),
                              count: r.toolErrorFixed,
                              onClick: () => openToolErrorLine({ type: 'fixed' }, day, day, codes, dm),
                            },
                          ]}
                          onClick={() => openMetric('toolError', day, day, [], dm)}
                        />
                      </td>
                    );
                  })}
                  <td className="bg-muted/30 border-b border-l border-border text-center px-2 py-1.5">
                    <BreakdownNumCell
                      value={columnTotals.toolError}
                      className="text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                      breakdown={allToolErrorBreakdown.map((n) => ({
                        label: noteName(n.code),
                        count: n.count,
                        onClick: () =>
                          openToolErrorLine(
                            { type: 'note', code: n.code },
                            rangeFromTo.from ?? '',
                            rangeFromTo.to ?? '',
                            allErrorCodes,
                          ),
                      }))}
                      extra={[
                        {
                          label: t('dailyOverview.breakdown.assignedDesigner'),
                          count: columnTotals.assignedToolError,
                          onClick: () => openAssigned('tool', rangeFromTo.from, rangeFromTo.to),
                        },
                        {
                          label: t('dailyOverview.breakdown.unassignedDesigner'),
                          count: columnTotals.toolErrorUnassigned,
                          onClick: () =>
                            openToolErrorLine(
                              { type: 'unassigned' },
                              rangeFromTo.from ?? '',
                              rangeFromTo.to ?? '',
                              allErrorCodes,
                            ),
                        },
                        {
                          label: t('dailyOverview.breakdown.fixed'),
                          count: columnTotals.toolErrorFixed,
                          onClick: () =>
                            openToolErrorLine({ type: 'fixed' }, rangeFromTo.from ?? '', rangeFromTo.to ?? '', []),
                        },
                      ]}
                      onClick={() => openMetric('toolError', rangeFromTo.from ?? '', rangeFromTo.to ?? '', [])}
                    />
                  </td>
                </tr>
                {/* 2c. OK/chưa soát → đẩy về — chưa từng lỗi soát tool nhưng đã
                    vào flow designer (lịch sử). Soát lỗi + hàng này = Chưa gán +
                    Đã gán. */}
                <tr className="group">
                  <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium text-purple-600 dark:text-purple-400">
                    <Hint content={t('dailyOverview.metrics.wasOkPushedHint')}>
                      <span className="cursor-help">{t('dailyOverview.metrics.wasOkPushed')}</span>
                    </Hint>
                  </td>
                  {rows.map((r, i) => {
                    const day = days[i];
                    const dm = fmtHead(day).dm;
                    return (
                      <td key={day} className="border-b border-l border-border/60 text-center px-1 py-1.5">
                        <BreakdownNumCell
                          value={r.wasOkPushed}
                          className="text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                          extra={[
                            {
                              label: t('dailyOverview.breakdown.assignedDesigner'),
                              count: r.assignedWasOk,
                              onClick: () => openWasOk('assigned', day, day, dm),
                            },
                            {
                              label: t('dailyOverview.breakdown.unassignedDesigner'),
                              count: Math.max(0, r.wasOkPushed - r.assignedWasOk),
                              onClick: () => openWasOk('unassigned', day, day, dm),
                            },
                          ]}
                          onClick={() => openWasOk('all', day, day, dm)}
                        />
                      </td>
                    );
                  })}
                  <td className="bg-muted/30 border-b border-l border-border text-center px-2 py-1.5">
                    <BreakdownNumCell
                      value={columnTotals.wasOkPushed}
                      className="text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                      extra={[
                        {
                          label: t('dailyOverview.breakdown.assignedDesigner'),
                          count: columnTotals.assignedWasOk,
                          onClick: () => openWasOk('assigned', rangeFromTo.from, rangeFromTo.to),
                        },
                        {
                          label: t('dailyOverview.breakdown.unassignedDesigner'),
                          count: Math.max(0, columnTotals.wasOkPushed - columnTotals.assignedWasOk),
                          onClick: () => openWasOk('unassigned', rangeFromTo.from, rangeFromTo.to),
                        },
                      ]}
                      onClick={() => openWasOk('all', rangeFromTo.from, rangeFromTo.to)}
                    />
                  </td>
                </tr>
                {/* 2d. Chưa gán designer — pool cần/qua designer trừ đã gán.
                    Bất biến: Soát lỗi + OK/chưa soát đẩy về = hàng này + Đã gán. */}
                <tr className="group">
                  <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium text-teal-600 dark:text-teal-400">
                    <Hint content={t('dailyOverview.metrics.unassignedNeedHint')}>
                      <span className="cursor-help">{t('dailyOverview.metrics.unassignedNeed')}</span>
                    </Hint>
                  </td>
                  {rows.map((r, i) => {
                    const day = days[i];
                    const dm = fmtHead(day).dm;
                    const codes = r.errorByNote.map((n) => n.code);
                    return (
                      <td key={day} className="border-b border-l border-border/60 text-center px-1 py-1.5">
                        <BreakdownNumCell
                          value={r.unassignedNeed}
                          className="text-teal-600 dark:text-teal-400 hover:bg-teal-500/10"
                          extra={[
                            {
                              label: t('dailyOverview.breakdown.fromToolCheck'),
                              count: r.unassignedNeedTool,
                              onClick: () => openUnassignedNeed('tool', day, day, codes, dm),
                            },
                            {
                              label: t('dailyOverview.metrics.wasOkPushed'),
                              count: Math.max(0, r.unassignedNeed - r.unassignedNeedTool),
                              onClick: () => openUnassignedNeed('wasOk', day, day, codes, dm),
                            },
                            {
                              label: t('dailyOverview.breakdown.resolvedNoDesigner'),
                              count: r.unassignedResolved,
                              onClick: () => openUnassignedNeed('resolved', day, day, codes, dm),
                            },
                          ]}
                          onClick={() => openUnassignedNeed('all', day, day, codes, dm)}
                        />
                      </td>
                    );
                  })}
                  <td className="bg-muted/30 border-b border-l border-border text-center px-2 py-1.5">
                    <BreakdownNumCell
                      value={columnTotals.unassignedNeed}
                      className="text-teal-600 dark:text-teal-400 hover:bg-teal-500/10"
                      extra={[
                        {
                          label: t('dailyOverview.breakdown.fromToolCheck'),
                          count: columnTotals.unassignedNeedTool,
                          onClick: () => openUnassignedNeed('tool', rangeFromTo.from, rangeFromTo.to, allErrorCodes),
                        },
                        {
                          label: t('dailyOverview.metrics.wasOkPushed'),
                          count: Math.max(0, columnTotals.unassignedNeed - columnTotals.unassignedNeedTool),
                          onClick: () => openUnassignedNeed('wasOk', rangeFromTo.from, rangeFromTo.to, allErrorCodes),
                        },
                        {
                          label: t('dailyOverview.breakdown.resolvedNoDesigner'),
                          count: columnTotals.unassignedResolved,
                          onClick: () =>
                            openUnassignedNeed('resolved', rangeFromTo.from, rangeFromTo.to, allErrorCodes),
                        },
                      ]}
                      onClick={() => openUnassignedNeed('all', rangeFromTo.from, rangeFromTo.to, allErrorCodes)}
                    />
                  </td>
                </tr>
                {/* 2e. Đã gán designer — KHỚP "Tổng / ngày" bảng "Tất cả designer
                    theo ngày" (= soát lỗi đã gán + ok/chưa soát đẩy về đã gán). */}
                <tr className="group">
                  <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium text-indigo-600 dark:text-indigo-400">
                    <Hint content={t('dailyOverview.metrics.assignedHint')}>
                      <span className="cursor-help">{t('dailyOverview.metrics.assigned')}</span>
                    </Hint>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {t('dailyOverview.metrics.assignedSubtitle')}
                    </div>
                  </td>
                  {rows.map((r, i) => {
                    const day = days[i];
                    const dm = fmtHead(day).dm;
                    return (
                      <td key={day} className="border-b border-l border-border/60 text-center px-1 py-1.5">
                        <BreakdownNumCell
                          value={r.assignedToolError + r.assignedWasOk}
                          className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                          breakdown={[
                            {
                              label: t('dailyOverview.breakdown.fromToolCheck'),
                              count: r.assignedToolError,
                              onClick: () => openAssigned('tool', day, day, dm),
                            },
                            {
                              label: t('dailyOverview.metrics.wasOkPushed'),
                              count: r.assignedWasOk,
                              onClick: () => openAssigned('wasOk', day, day, dm),
                            },
                          ]}
                          onClick={() => openAssigned('all', day, day, dm)}
                        />
                      </td>
                    );
                  })}
                  <td className="bg-muted/30 border-b border-l border-border text-center px-2 py-1.5">
                    <BreakdownNumCell
                      value={columnTotals.assignedToolError + columnTotals.assignedWasOk}
                      className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                      breakdown={[
                        {
                          label: t('dailyOverview.breakdown.fromToolCheck'),
                          count: columnTotals.assignedToolError,
                          onClick: () => openAssigned('tool', rangeFromTo.from, rangeFromTo.to),
                        },
                        {
                          label: t('dailyOverview.metrics.wasOkPushed'),
                          count: columnTotals.assignedWasOk,
                          onClick: () => openAssigned('wasOk', rangeFromTo.from, rangeFromTo.to),
                        },
                      ]}
                      onClick={() => openAssigned('all', rangeFromTo.from, rangeFromTo.to)}
                    />
                  </td>
                </tr>
                {/* 2f. Design đã xong — assignee + designerStatus='done' (⊂ Đã gán,
                    khớp cột "Đã xong" ma trận team). */}
                <MetricRow
                  label={t('dailyOverview.metrics.designDone')}
                  hint={t('dailyOverview.metrics.designDoneHint')}
                  values={rows.map((r) => r.designDone)}
                  total={columnTotals.designDone}
                  className="text-emerald-600 dark:text-emerald-400"
                  onCell={(i) => openDesignDone(days[i], days[i], fmtHead(days[i]).dm)}
                  onTotal={() => openDesignDone(rangeFromTo.from, rangeFromTo.to)}
                />
                {/* 3. Tổng lỗi = Soát lỗi + OK/chưa soát → đẩy về (2 nửa không giao
                    nhau của pool cần designer — lịch sử). */}
                <tr className="group">
                  <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium text-rose-600">
                    <Hint content={t('dailyOverview.metrics.totalErrorHint')}>
                      <span className="cursor-help">{t('dailyOverview.metrics.totalError')}</span>
                    </Hint>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {t('dailyOverview.metrics.totalErrorSubtitle')}
                    </div>
                  </td>
                  {rows.map((r, i) => {
                    const day = days[i];
                    const dm = fmtHead(day).dm;
                    return (
                      <td key={day} className="border-b border-l border-border/60 text-center px-1 py-1.5">
                        <BreakdownNumCell
                          value={r.toolError + r.wasOkPushed}
                          className="text-rose-600 hover:bg-rose-500/10"
                          extra={[
                            {
                              label: t('dailyOverview.metrics.toolError'),
                              count: r.toolError,
                              onClick: () => openMetric('toolError', day, day, [], dm),
                            },
                            {
                              label: t('dailyOverview.metrics.wasOkPushed'),
                              count: r.wasOkPushed,
                              onClick: () => openWasOk('all', day, day, dm),
                            },
                          ]}
                          onClick={() => openErrorPool(day, day, dm)}
                        />
                      </td>
                    );
                  })}
                  <td className="bg-muted/30 border-b border-l border-border text-center px-2 py-1.5">
                    <BreakdownNumCell
                      value={columnTotals.toolError + columnTotals.wasOkPushed}
                      className="text-rose-600 hover:bg-rose-500/10"
                      extra={[
                        {
                          label: t('dailyOverview.metrics.toolError'),
                          count: columnTotals.toolError,
                          onClick: () => openMetric('toolError', rangeFromTo.from ?? '', rangeFromTo.to ?? '', []),
                        },
                        {
                          label: t('dailyOverview.metrics.wasOkPushed'),
                          count: columnTotals.wasOkPushed,
                          onClick: () => openWasOk('all', rangeFromTo.from, rangeFromTo.to),
                        },
                      ]}
                      onClick={() => openErrorPool(rangeFromTo.from, rangeFromTo.to)}
                    />
                  </td>
                </tr>
                {/* 4. Tổng tồn (click để xổ) */}
                <tr className="group cursor-pointer" onClick={() => setExpanded((v) => !v)}>
                  <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium text-amber-600">
                    <span className="inline-flex items-center gap-1">
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {t('dailyOverview.metrics.backlog')}
                    </span>
                    <div className="text-[10px] text-muted-foreground font-normal pl-[18px]">
                      {t('dailyOverview.metrics.backlogSubtitle')}
                    </div>
                  </td>
                  {rows.map((r, i) => {
                    const codes = r.errorByNote.map((n) => n.code);
                    return (
                      <td
                        key={days[i]}
                        className={cn(
                          'border-b border-l border-border/60 text-center px-1 py-1.5',
                          r.backlog > 0 ? 'bg-amber-500/[0.07]' : '',
                        )}
                      >
                        {r.backlog === 0 ? (
                          <span className="text-muted-foreground/30">·</span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openMetric('backlog', days[i], days[i], codes, fmtHead(days[i]).dm);
                            }}
                            className="font-semibold text-amber-600 rounded px-1 -mx-1 hover:bg-amber-500/15 cursor-pointer"
                          >
                            {r.backlog}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="bg-muted/30 border-b border-l border-border text-center px-2 py-1.5">
                    {columnTotals.backlog ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openMetric('backlog', rangeFromTo.from ?? '', rangeFromTo.to ?? '', allErrorCodes);
                        }}
                        className="font-semibold text-amber-600 rounded px-1 -mx-1 hover:bg-amber-500/15 cursor-pointer"
                      >
                        {columnTotals.backlog}
                      </button>
                    ) : (
                      <span className="text-muted-foreground/40">·</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Bảng con: tồn theo designer */}
        {expanded && (
          <div className="border-t border-border bg-muted/10 p-3">
            <div className="mb-2 space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">
                {t('dailyOverview.backlogSection.summaryPrefix', { total: columnTotals.backlog })}{' '}
                {t('dailyOverview.metrics.unreviewed')}{' '}
                <span className="text-slate-600 dark:text-slate-300 font-semibold">{columnTotals.unreviewed}</span> +{' '}
                {t('dailyOverview.backlogSection.assignedPending')}{' '}
                <span className="text-indigo-600 font-semibold">
                  {columnTotals.assignedToolError + columnTotals.assignedWasOk - columnTotals.designDone}
                </span>{' '}
                + {t('dailyOverview.metrics.unassignedNeed')}{' '}
                <span className="text-teal-600 font-semibold">{columnTotals.unassignedNeed}</span>
                <span className="font-normal"> {t('dailyOverview.backlogSection.note')}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {t('dailyOverview.backlogSection.hint2', { total: backlogGrand })}
              </div>
            </div>
            {backlogByDesigner.length === 0 && unassignedBacklog === 0 ? (
              <p className="text-xs text-muted-foreground py-2">{t('dailyOverview.backlogSection.noBacklog')}</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="text-[11px] text-muted-foreground border-b border-border">
                      <th className="text-left font-medium px-3 py-1.5">{t('dailyOverview.backlogSection.designer')}</th>
                      <BLHead label={t('teamDailyMatrix.labels.assigned')} className="text-zinc-600 dark:text-zinc-300" />
                      <BLHead label={t('teamDailyMatrix.labels.inProgress')} className="text-indigo-600" />
                      <BLHead label={t('teamDailyMatrix.labels.rework')} className="text-amber-600" />
                      <th className="text-center font-semibold px-2 py-1.5">{t('dailyOverview.totalColumn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backlogByDesigner.map((d) => (
                      <tr key={d.userId} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-3 py-1.5">
                          <div className="font-medium truncate max-w-[220px]">{d.fullName}</div>
                          {d.email && <div className="text-[10px] text-muted-foreground">{d.email}</div>}
                        </td>
                        <BLCell
                          value={d.assigned}
                          className="text-zinc-700 dark:text-zinc-200"
                          onClick={() => openDesigner(d.userId, d.fullName, ['assigned'], t('teamDailyMatrix.labels.assigned'))}
                        />
                        <BLCell
                          value={d.inProgress}
                          className="text-indigo-600"
                          onClick={() =>
                            openDesigner(d.userId, d.fullName, ['in-progress'], t('teamDailyMatrix.labels.inProgress'))
                          }
                        />
                        <BLCell
                          value={d.rework}
                          className="text-amber-600"
                          onClick={() => openDesigner(d.userId, d.fullName, ['rework'], t('teamDailyMatrix.labels.rework'))}
                        />
                        <td className="text-center px-2 py-1.5">
                          <NumCell
                            value={d.total}
                            className="font-semibold"
                            onClick={() =>
                              openDesigner(
                                d.userId,
                                d.fullName,
                                ['assigned', 'in-progress', 'rework'],
                                t('dailyOverview.metrics.backlog'),
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {unassignedBacklog > 0 && (
                      <tr className="border-b border-border/50 bg-slate-500/[0.06]">
                        <td className="px-3 py-1.5 font-medium text-slate-600 dark:text-slate-300">
                          {t('dailyOverview.backlogSection.unassignedRow')}
                          <span className="text-[10px] text-muted-foreground font-normal">
                            {' '}
                            {t('dailyOverview.backlogSection.unassignedRowHint')}
                          </span>
                        </td>
                        <td className="text-center px-2 py-1.5 text-muted-foreground/40">·</td>
                        <td className="text-center px-2 py-1.5 text-muted-foreground/40">·</td>
                        <td className="text-center px-2 py-1.5 text-muted-foreground/40">·</td>
                        <td className="text-center px-2 py-1.5 font-semibold text-slate-600 dark:text-slate-300">
                          {unassignedBacklog}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel drill-down inline — sibling của card (TooltipProvider không render
          DOM) nên nằm GIỮA bảng tổng quan và bảng "Cần gán designer" (space-y). */}
      <DesignerDrillPanel target={drill} onClose={() => setDrill(null)} onMutated={onAssigned} />
    </TooltipProvider>
  );
}

interface BreakdownLine {
  label: string;
  count: number;
  /** Có onClick + count>0 → dòng tooltip bấm được, mở drill danh sách đơn. */
  onClick?: () => void;
}

/**
 * Con số + tooltip breakdown (hàng "Soát lỗi" / "Tổng lỗi"): `breakdown` = số
 * lượng theo từng mã lỗi (mỗi đơn 1 dòng — tổng breakdown = con số ngoài ô),
 * `extra` = các dòng tổng kết (Chưa gán designer, Đã sửa xong…). Bấm con số
 * HOẶC từng dòng tooltip → drill-down; stopPropagation để không toggle xổ nhóm
 * của hàng cha.
 */
function BreakdownNumCell({
  value,
  className,
  breakdown,
  extra,
  onClick,
}: {
  value: number;
  className?: string;
  breakdown?: BreakdownLine[];
  extra?: BreakdownLine[];
  onClick: () => void;
}) {
  if (value === 0) return <span className="text-muted-foreground/30">·</span>;
  const renderLine = (l: BreakdownLine, extraCls?: string) => {
    const inner = (
      <>
        <span>{l.label}</span>
        <span className="tabular-nums font-semibold">{l.count}</span>
      </>
    );
    if (!l.onClick || l.count === 0) {
      return (
        <div key={l.label} className={cn('flex justify-between gap-3 px-1', extraCls)}>
          {inner}
        </div>
      );
    }
    return (
      <button
        key={l.label}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          l.onClick?.();
        }}
        className={cn(
          'flex justify-between gap-3 w-full rounded px-1 hover:bg-primary/15 cursor-pointer text-left',
          extraCls,
        )}
      >
        {inner}
      </button>
    );
  };
  return (
    <Hint
      forceRich
      content={
        <div className="text-left space-y-0.5 -mx-1">
          {breakdown?.map((n) => renderLine(n))}
          {extra?.map((l, i) =>
            renderLine(l, i === 0 && breakdown?.length ? 'border-t border-border/50 pt-0.5' : undefined),
          )}
        </div>
      }
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={cn('font-semibold rounded px-1 -mx-1 cursor-pointer tabular-nums', className)}
      >
        {value}
      </button>
    </Hint>
  );
}

/** Con số bấm được — mở drill-down khi v>0 & có onClick, ngược lại chỉ hiển thị. */
function NumCell({ value, onClick, className }: { value: number; onClick?: () => void; className?: string }) {
  if (value === 0) return <span className="text-muted-foreground/30">·</span>;
  if (!onClick) return <span className={cn('font-semibold', className)}>{value}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'font-semibold rounded px-1 -mx-1 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer',
        className,
      )}
    >
      {value}
    </button>
  );
}

function MetricRow({
  label,
  hint,
  values,
  total,
  className,
  onCell,
  onTotal,
}: {
  label: string;
  hint?: string;
  values: number[];
  total: number;
  className?: string;
  onCell?: (i: number) => void;
  onTotal?: () => void;
}) {
  return (
    <tr className="group">
      <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 px-3 py-1.5 border-b border-border/60 font-medium">
        {hint ? (
          <Hint content={hint}>
            <span className="cursor-help">{label}</span>
          </Hint>
        ) : (
          label
        )}
      </td>
      {values.map((v, i) => (
        <td key={i} className={cn('border-b border-l border-border/60 text-center px-1 py-1.5', className)}>
          <NumCell value={v} onClick={onCell ? () => onCell(i) : undefined} />
        </td>
      ))}
      <td className={cn('bg-muted/30 border-b border-l border-border text-center px-2 py-1.5', className)}>
        <NumCell value={total} onClick={onTotal} className="font-semibold" />
      </td>
    </tr>
  );
}

function BLHead({ label, className }: { label: string; className?: string }) {
  return <th className={cn('text-center font-medium px-2 py-1.5', className)}>{label}</th>;
}

function BLCell({ value, className, onClick }: { value: number; className?: string; onClick?: () => void }) {
  return (
    <td className="text-center px-2 py-1.5">
      <NumCell value={value} className={className} onClick={onClick} />
    </td>
  );
}
