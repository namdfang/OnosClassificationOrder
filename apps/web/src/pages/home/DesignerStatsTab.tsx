import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, RefreshCw, Trophy, X } from 'lucide-react';
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  BreakdownFilterOption,
  DesignerLeaderboardRow,
  DesignerTimelineBucket,
  ErrorStats,
  PerformanceScoreRow,
} from 'shared';

import { RepositoryRemote } from '@/services';

import { DateRangePicker } from '@/components/common/DateRangePicker';
import { DateRangePresets } from '@/components/common/DateRangePresets';
import { SelectFilter } from '@/components/common/SelectFilter';
import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { handleAxiosError } from '@/utils';
import { DATE_PRESETS } from '@/utils/dateRangePresets';

import { DesignerAssignBacklog } from './DesignerAssignBacklog';
import { DesignerDailyOverview } from './DesignerDailyOverview';
import { DesignerPerformanceCard } from './DesignerPerformanceCard';
import { ProductTimePanel } from './ProductTimePanel';
// Khối "Cơ cấu trạng thái" TẠM ẨN (2026-07) — xem ghi chú "TẠM ẨN" tại vị trí render bên dưới.
// import { StatusBarCharts } from './StatusBarCharts';
import { TeamDailyMatrix } from './TeamDailyMatrix';
import { TopDesigners } from './TopDesigners';

type Period = 'today' | '7d' | '30d' | 'custom';

/**
 * Tạm TẮT 3 khối thống kê cũ (Leaderboard + Timeline per-designer + Lỗi xưởng
 * phân loại) + period switcher của chúng — KHÔNG gọi 3 API
 * `designer/performance` / `designer/timeline/:id` / `orders/error-stats`.
 * Bật lại: đổi flag về `true`.
 */
const SHOW_LEGACY_STATS = false;

const SOURCE_COLORS = {
  designer: '#7C3AED', // violet
  factory: '#0EA5E9', // sky
  unknown: '#94A3B8', // slate
};

function rangeFromPeriod(period: Period, customFrom?: string, customTo?: string): { from?: string; to?: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today);
  if (period === 'today') {
    return { from: end, to: end };
  }
  if (period === '7d') start.setDate(start.getDate() - 6);
  if (period === '30d') start.setDate(start.getDate() - 29);
  if (period === 'custom') return { from: customFrom, to: customTo };
  return { from: start.toISOString().slice(0, 10), to: end };
}

export default function DesignerStatsTab() {
  const { t } = useTranslation('dashboard');
  const [period, setPeriod] = useState<Period>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [leaderboard, setLeaderboard] = useState<DesignerLeaderboardRow[]>([]);
  const [errorStats, setErrorStats] = useState<ErrorStats | null>(null);
  const [timeline, setTimeline] = useState<DesignerTimelineBucket[]>([]);
  const [selectedUserId, setSelectedCode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  // Bump để TeamDailyMatrix refetch khi bấm Refresh (ma trận dùng range riêng).
  const [matrixToken, setMatrixToken] = useState(0);
  // Panel "Thời gian theo sản phẩm" — nút "Xem tất cả" (toàn team) hoặc nút
  // "Xem chi tiết" 1 designer trong widget TopDesigners. null = đóng.
  const [productTimesView, setProductTimesView] = useState<{ designerId?: string; designerName?: string } | null>(null);
  // Rows điểm hiệu suất (từ DesignerPerformanceCard) — TopDesigners dùng gắn badge hạng.
  const [scoreRows, setScoreRows] = useState<PerformanceScoreRow[]>([]);

  // Filter dùng chung cho biểu đồ cột + ma trận: sản phẩm (type) + khách (userSku).
  const [filterType, setFilterType] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  // Model từ/đến (thay nhóm nút 7/14/30 cũ) — mặc định 7 ngày gần nhất. Các bảng
  // con nhận `days` (7|14|30) + from/to; từ/đến luôn có mặt nên BE dùng from/to,
  // `days` chỉ là fallback hợp kiểu (truyền hằng 7).
  const last7 = DATE_PRESETS.find((p) => p.key === 'last-7d')!.range();
  const [dateFrom, setDateFrom] = useState(() => last7.from);
  const [dateTo, setDateTo] = useState(() => last7.to);
  const [products, setProducts] = useState<BreakdownFilterOption[]>([]);
  const [customers, setCustomers] = useState<BreakdownFilterOption[]>([]);

  // Option list 2 dropdown filter — refetch theo kỳ lọc để count/danh sách
  // khớp đúng khoảng thời gian đang chọn (BE scope inProductionAt [from,to]).
  useEffect(() => {
    (async () => {
      try {
        const res = await RepositoryRemote.designer.breakdownFilters({
          from: dateFrom || undefined,
          to: dateTo || undefined,
        });
        const data = res.data?.data as { products?: BreakdownFilterOption[]; customers?: BreakdownFilterOption[] };
        setProducts(data?.products || []);
        setCustomers(data?.customers || []);
        // Giá trị đang chọn không còn trong kỳ mới → tự bỏ để khỏi lọc "rỗng" ngầm.
        setFilterType((cur) => (cur && !(data?.products || []).some((o) => o.value === cur) ? '' : cur));
        setFilterCustomer((cur) => (cur && !(data?.customers || []).some((o) => o.value === cur) ? '' : cur));
      } catch (err) {
        handleAxiosError(err);
      }
    })();
  }, [dateFrom, dateTo]);

  const range = useMemo(() => rangeFromPeriod(period, customFrom, customTo), [period, customFrom, customTo]);

  const fetchAll = async () => {
    // Legacy stats tắt → chỉ bump token cho các bảng còn lại refetch.
    if (!SHOW_LEGACY_STATS) {
      setMatrixToken((t) => t + 1);
      return;
    }
    try {
      setLoading(true);
      const [perfRes, errRes] = await Promise.all([
        RepositoryRemote.designer.performance(range),
        RepositoryRemote.designer.errorStats(range),
      ]);
      const rows = (perfRes.data?.data || []) as DesignerLeaderboardRow[];
      setLeaderboard(rows);
      setErrorStats((errRes.data?.data || null) as ErrorStats | null);
      setMatrixToken((t) => t + 1);
      // Default select first designer with most completed
      if (rows.length > 0 && !selectedUserId) {
        setSelectedCode(rows[0].userId);
      }
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async (code: string) => {
    if (!SHOW_LEGACY_STATS || !code) return;
    try {
      const res = await RepositoryRemote.designer.timeline(code, range);
      setTimeline((res.data?.data || []) as DesignerTimelineBucket[]);
    } catch (err) {
      handleAxiosError(err);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [range.from, range.to]);

  useEffect(() => {
    if (selectedUserId) fetchTimeline(selectedUserId);
  }, [selectedUserId, range.from, range.to]);

  const pieData = useMemo(() => {
    if (!errorStats) return [];
    return [
      { name: t('designerStats.errorSource.designer'), value: errorStats.bySource.designer, key: 'designer' },
      { name: t('designerStats.errorSource.factory'), value: errorStats.bySource.factory, key: 'factory' },
      { name: t('designerStats.errorSource.unknown'), value: errorStats.bySource.unknown, key: 'unknown' },
    ].filter((d) => d.value > 0);
  }, [errorStats, t]);

  return (
    <div className="space-y-5">
      {/* Filter dùng chung (trái) + Top designer theo cùng filter (phải). */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        <div className="flex-1 min-w-0 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Filter size={15} className="text-indigo-600" />
            <span className="text-sm font-semibold">{t('designerStats.commonFilter')}</span>
            <span className="hidden md:inline text-[11px] text-muted-foreground">
              — {t('designerStats.appliesToTablesBelow')}
            </span>
            {(filterType || filterCustomer) && (
              <button
                type="button"
                onClick={() => {
                  setFilterType('');
                  setFilterCustomer('');
                }}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <X size={12} /> {t('designerStats.clearFilter')}
              </button>
            )}
          </div>
          {/* Thanh ngày — preset inline full-width */}
          <div className="mb-2">
            <DateRangePicker
              variant="inline"
              from={dateFrom}
              to={dateTo}
              onChange={(f, t2) => {
                setDateFrom(f);
                setDateTo(t2);
              }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SelectFilter
              label={t('designerStats.product')}
              value={filterType}
              onChange={setFilterType}
              options={products}
            />
            <SelectFilter
              label={t('designerStats.customer')}
              value={filterCustomer}
              onChange={setFilterCustomer}
              options={customers}
            />
          </div>
        </div>

        <div className="w-full lg:w-80 xl:w-96 shrink-0">
          <TopDesigners
            from={dateFrom || undefined}
            to={dateTo || undefined}
            type={filterType || undefined}
            customer={filterCustomer || undefined}
            reloadToken={matrixToken}
            viewAllOpen={!!productTimesView && !productTimesView.designerId}
            onViewAll={() => setProductTimesView((v) => (v && !v.designerId ? null : {}))}
            activeDesignerId={productTimesView?.designerId}
            onViewDesigner={(userId, fullName) =>
              setProductTimesView((v) =>
                v?.designerId === userId ? null : { designerId: userId, designerName: fullName },
              )
            }
            scoreRows={scoreRows}
          />
        </div>
      </div>

      {/* Panel thời gian TB nhận/làm theo sản phẩm — "Xem tất cả" / chi tiết 1 designer. */}
      {productTimesView && (
        <ProductTimePanel
          from={dateFrom || undefined}
          to={dateTo || undefined}
          type={filterType || undefined}
          customer={filterCustomer || undefined}
          reloadToken={matrixToken}
          designerId={productTimesView.designerId}
          designerName={productTimesView.designerName}
          onClose={() => setProductTimesView(null)}
        />
      )}

      {/* Bảng xếp hạng hiệu suất — điểm 0-100 + hạng S-D + level chính thức. */}
      <DesignerPerformanceCard
        from={dateFrom || undefined}
        to={dateTo || undefined}
        reloadToken={matrixToken}
        onLoaded={setScoreRows}
      />

      {/* Bảng "Cần gán designer" gom theo sản phẩm — dưới bảng tổng quan. */}
      <DesignerAssignBacklog
        days={7}
        from={dateFrom || undefined}
        to={dateTo || undefined}
        reloadToken={matrixToken}
        type={filterType || undefined}
        customer={filterCustomer || undefined}
        onAssigned={() => setMatrixToken((t) => t + 1)}
      />

      {/* Bảng tổng quan N ngày (tổng đơn / chưa soát / lỗi / tồn) — TRÊN CÙNG. */}
      <DesignerDailyOverview
        days={7}
        from={dateFrom || undefined}
        to={dateTo || undefined}
        reloadToken={matrixToken}
        type={filterType || undefined}
        customer={filterCustomer || undefined}
        onAssigned={() => setMatrixToken((t) => t + 1)}
      />

      {/* Ma trận toàn team × ngày (7/14/30 riêng) — snapshot đơn chưa xong. */}
      <TeamDailyMatrix
        reloadToken={matrixToken}
        type={filterType || undefined}
        customer={filterCustomer || undefined}
      />

      {/* Khối "Cơ cấu trạng thái" (biểu đồ cột theo designer/ngày) TẠM ẨN
        (2026-07, không cần nữa) — code `StatusBarCharts.tsx` + i18n giữ nguyên.
        Bật lại: bỏ comment import ở đầu file + khối dưới + bỏ comment endpoint
        `GET /designer/product-breakdown` trong `designer-stats.controller.ts`
        (API tooltip breakdown sản phẩm CHỈ khối này dùng nên đã comment theo).
      <StatusBarCharts
        type={filterType || undefined}
        customer={filterCustomer || undefined}
        filterDays={7}
        filterFrom={dateFrom || undefined}
        filterTo={dateTo || undefined}
      /> */}

      {/* Nút làm mới các bảng bên trên (period switcher tạm ẩn cùng 3 khối legacy). */}
      {!SHOW_LEGACY_STATS && (
        <div className="flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {t('designerStats.refresh')}
          </Button>
        </div>
      )}

      {/* Period switcher — chỉ phục vụ Leaderboard/Timeline/Error pie (đang tắt). */}
      {SHOW_LEGACY_STATS && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            {(['today', '7d', '30d', 'custom'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 ${
                  period === p
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {p === 'today'
                  ? t('designerStats.periodOptions.today')
                  : p === '7d'
                    ? t('designerStats.periodOptions.days7')
                    : p === '30d'
                      ? t('designerStats.periodOptions.days30')
                      : t('designerStats.periodOptions.custom')}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <DateRangePresets
                from={customFrom}
                to={customTo}
                variant="compact"
                onChange={(f, t2) => {
                  setCustomFrom(f);
                  setCustomTo(t2);
                }}
              />
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1"
              />
              <span className="text-muted-foreground">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1"
              />
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      )}

      {/* Leaderboard — tạm tắt (SHOW_LEGACY_STATS). */}
      {SHOW_LEGACY_STATS && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-amber-500" />
              <span className="text-sm font-semibold">{t('designerStats.leaderboard.title')}</span>
              <span className="text-xs text-muted-foreground">— {t('designerStats.leaderboard.sortedByDone')}</span>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>{t('designerStats.leaderboard.designer')}</TableHead>
                <TableHead className="w-30 text-center" title={t('designerStats.leaderboard.tooltips.assigned')}>
                  {t('designerStats.leaderboard.columns.assigned')}
                </TableHead>
                <TableHead className="w-30 text-center" title={t('designerStats.leaderboard.tooltips.inProgress')}>
                  {t('designerStats.leaderboard.columns.inProgress')}
                </TableHead>
                <TableHead className="w-30 text-center" title={t('designerStats.leaderboard.tooltips.done')}>
                  {t('designerStats.leaderboard.columns.done')}
                </TableHead>
                <TableHead className="w-30 text-center" title={t('designerStats.leaderboard.tooltips.fixed')}>
                  {t('designerStats.leaderboard.columns.fixed')}
                </TableHead>
                <TableHead className="w-30 text-center" title={t('designerStats.leaderboard.tooltips.rejectedNow')}>
                  {t('designerStats.leaderboard.columns.rejectedNow')}
                </TableHead>
                <TableHead className="w-30 text-center" title={t('designerStats.leaderboard.tooltips.reworkNow')}>
                  {t('designerStats.leaderboard.columns.reworkNow')}
                </TableHead>
                <TableHead className="w-30 text-center" title={t('designerStats.leaderboard.tooltips.totalRejected')}>
                  {t('designerStats.leaderboard.columns.totalRejected')}
                </TableHead>
                <TableHead className="w-30 text-center" title={t('designerStats.leaderboard.tooltips.totalRework')}>
                  {t('designerStats.leaderboard.columns.totalRework')}
                </TableHead>
                <TableHead className="w-30 text-center">{t('designerStats.leaderboard.columns.avgResponse')}</TableHead>
                <TableHead className="w-30 text-center">{t('designerStats.leaderboard.columns.avgWork')}</TableHead>
                <TableHead className="w-30 text-center">{t('designerStats.leaderboard.columns.errorRate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && leaderboard.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-8">
                    <Spinner size={20} className="text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && leaderboard.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-8 text-sm text-muted-foreground">
                    {t('designerStats.leaderboard.noActivity')}
                  </TableCell>
                </TableRow>
              )}
              {leaderboard.map((row, idx) => {
                const isSelected = row.userId === selectedUserId;
                return (
                  <TableRow
                    key={row.userId}
                    className={`cursor-pointer ${isSelected ? 'bg-muted/50' : ''}`}
                    onClick={() => setSelectedCode(row.userId)}
                  >
                    <TableCell className="text-center text-xs font-bold text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{row.fullName}</div>
                      {row.email && <div className="text-[10px] text-muted-foreground">{row.email}</div>}
                    </TableCell>
                    <TableCell className="text-center">{row.assignedCount}</TableCell>
                    <TableCell className="text-center text-indigo-600 dark:text-indigo-400">
                      {row.inProgressCount}
                    </TableCell>
                    <TableCell className="text-center font-semibold text-emerald-600 dark:text-emerald-400">
                      {Math.max(0, row.completedInPeriod - row.fixedInPeriod)}
                    </TableCell>
                    <TableCell className="text-center font-semibold text-teal-600 dark:text-teal-400">
                      {row.fixedInPeriod}
                    </TableCell>
                    <TableCell className="text-center text-rose-600 dark:text-rose-400">{row.rejectedCount}</TableCell>
                    <TableCell className="text-center text-amber-600 dark:text-amber-400">{row.reworkCount}</TableCell>
                    <TableCell className="text-center text-rose-700 dark:text-rose-300 font-semibold">
                      {row.totalRejected}
                    </TableCell>
                    <TableCell className="text-center text-amber-700 dark:text-amber-300 font-semibold">
                      {row.totalRework}
                    </TableCell>
                    <TableCell className="text-center text-xs">{row.avgResponseMin}&apos;</TableCell>
                    <TableCell className="text-center text-xs">{row.avgWorkMin}&apos;</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={row.errorRate === 0 ? 'outline' : row.errorRate < 0.2 ? 'secondary' : 'destructive'}
                        className="text-[10px]"
                      >
                        {Math.round(row.errorRate * 100)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Timeline per-designer + Lỗi xưởng phân loại — tạm tắt (SHOW_LEGACY_STATS). */}
      {SHOW_LEGACY_STATS && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Timeline */}
          <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold">{t('designerStats.timeline.title')}</h3>
                <p className="text-[11px] text-muted-foreground">{t('designerStats.timeline.subtitle')}</p>
              </div>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedCode(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                {leaderboard.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.fullName}
                  </option>
                ))}
              </select>
            </div>
            {timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-12">
                {t('designerStats.timeline.selectDesigner')}
              </p>
            ) : (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={timeline} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RechartsTooltip contentStyle={{ fontSize: 11, padding: 6 }} labelStyle={{ fontSize: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="assigned"
                      stroke="#71717A"
                      strokeWidth={2}
                      dot={false}
                      name={t('designerStats.timeline.series.assigned')}
                    />
                    <Line
                      type="monotone"
                      dataKey="started"
                      stroke="#6366F1"
                      strokeWidth={2}
                      dot={false}
                      name={t('designerStats.timeline.series.started')}
                    />
                    <Line
                      type="monotone"
                      dataKey="completed"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={false}
                      name={t('designerStats.timeline.series.completed')}
                    />
                    <Line
                      type="monotone"
                      dataKey="rework"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      dot={false}
                      name={t('designerStats.timeline.series.rework')}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Error stats pie */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">{t('designerStats.errorPie.title')}</h3>
            <p className="text-[11px] text-muted-foreground mb-2">
              {t('designerStats.errorPie.subtitle', { count: errorStats?.total || 0 })}
            </p>
            {pieData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">{t('designerStats.errorPie.noErrors')}</p>
            ) : (
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={70} label={{ fontSize: 10 }}>
                      {pieData.map((d) => (
                        <Cell key={d.key} fill={SOURCE_COLORS[d.key as keyof typeof SOURCE_COLORS]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ fontSize: 11, padding: 6 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {errorStats && errorStats.byCode.length > 0 && (
              <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                {errorStats.byCode.map((row) => (
                  <div key={row.code} className="flex items-center justify-between text-[11px] gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            row.errorSource === 'designer'
                              ? SOURCE_COLORS.designer
                              : row.errorSource === 'factory'
                                ? SOURCE_COLORS.factory
                                : SOURCE_COLORS.unknown,
                        }}
                      />
                      <span className="truncate">{row.label || row.code}</span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
