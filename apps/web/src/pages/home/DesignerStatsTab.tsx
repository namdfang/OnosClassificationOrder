import React, { useEffect, useMemo, useState } from 'react';
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
import { Filter, RefreshCw, Trophy, X } from 'lucide-react';
import type {
  BreakdownFilterOption,
  DesignerLeaderboardRow,
  DesignerTimelineBucket,
  ErrorStats,
} from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Spinner } from '@/components/common/Spinner';
import { SelectFilter } from '@/components/common/SelectFilter';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { DateRangePresets } from '@/components/common/DateRangePresets';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';

import { DesignerAssignBacklog } from './DesignerAssignBacklog';
import { DesignerDailyOverview } from './DesignerDailyOverview';
import { StatusBarCharts } from './StatusBarCharts';
import { TeamDailyMatrix } from './TeamDailyMatrix';

type Period = 'today' | '7d' | '30d' | 'custom';

const SOURCE_COLORS = {
  designer: '#7C3AED', // violet
  factory: '#0EA5E9',  // sky
  unknown: '#94A3B8',  // slate
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

  // Filter dùng chung cho biểu đồ cột + ma trận: sản phẩm (type) + khách (userSku).
  const [filterType, setFilterType] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  // Switcher 7/14/30 (top) điều khiển bảng Tổng quan + Cần gán designer.
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(7);
  // Khoảng ngày tùy biến — khi set (cả 2) sẽ override 7/14/30.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const customRange = !!(dateFrom && dateTo);
  const pickPreset = (d: 7 | 14 | 30) => {
    setRangeDays(d);
    setDateFrom('');
    setDateTo('');
  };
  const [products, setProducts] = useState<BreakdownFilterOption[]>([]);
  const [customers, setCustomers] = useState<BreakdownFilterOption[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await RepositoryRemote.designer.breakdownFilters();
        const data = res.data?.data as { products?: BreakdownFilterOption[]; customers?: BreakdownFilterOption[] };
        setProducts(data?.products || []);
        setCustomers(data?.customers || []);
      } catch (err) {
        handleAxiosError(err);
      }
    })();
  }, []);

  const range = useMemo(
    () => rangeFromPeriod(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const fetchAll = async () => {
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
    if (!code) return;
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
      { name: 'Lỗi designer', value: errorStats.bySource.designer, key: 'designer' },
      { name: 'Lỗi xưởng', value: errorStats.bySource.factory, key: 'factory' },
      { name: 'Không xác định', value: errorStats.bySource.unknown, key: 'unknown' },
    ].filter((d) => d.value > 0);
  }, [errorStats]);

  return (
    <div className="space-y-5">
      {/* Filter dùng chung: lọc biểu đồ cột + ma trận theo sản phẩm / khách hàng. */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={15} className="text-indigo-600" />
          <span className="text-sm font-semibold">Bộ lọc chung</span>
          <span className="hidden md:inline text-[11px] text-muted-foreground">
            — áp cho các bảng bên dưới
          </span>
          {/* Switcher 7/14/30 + khoảng ngày tùy biến — điều khiển Tổng quan + Cần gán. */}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickPreset(d)}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    !customRange && rangeDays === d
                      ? 'bg-indigo-600 text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {d} ngày
                </button>
              ))}
            </div>
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              placeholder="Khoảng ngày"
              onChange={(f, t) => {
                setDateFrom(f);
                setDateTo(t);
              }}
            />
          </div>
          {(filterType || filterCustomer) && (
            <button
              type="button"
              onClick={() => {
                setFilterType('');
                setFilterCustomer('');
              }}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X size={12} /> Xóa lọc
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <SelectFilter label="Sản phẩm" value={filterType} onChange={setFilterType} options={products} />
          <SelectFilter label="Khách hàng" value={filterCustomer} onChange={setFilterCustomer} options={customers} />
        </div>
      </div>

      {/* Bảng tổng quan N ngày (tổng đơn / chưa soát / lỗi / tồn) — TRÊN CÙNG. */}
      <DesignerDailyOverview
        days={rangeDays}
        from={dateFrom || undefined}
        to={dateTo || undefined}
        reloadToken={matrixToken}
        type={filterType || undefined}
        customer={filterCustomer || undefined}
      />

      {/* Bảng "Cần gán designer" gom theo sản phẩm — dưới bảng tổng quan. */}
      <DesignerAssignBacklog
        days={rangeDays}
        from={dateFrom || undefined}
        to={dateTo || undefined}
        reloadToken={matrixToken}
        type={filterType || undefined}
        customer={filterCustomer || undefined}
        onAssigned={() => setMatrixToken((t) => t + 1)}
      />

      {/* Biểu đồ cột: toggle "Theo designer (100%)" / "Theo ngày (số lượng)". */}
      <StatusBarCharts
        type={filterType || undefined}
        customer={filterCustomer || undefined}
        filterDays={rangeDays}
        filterFrom={dateFrom || undefined}
        filterTo={dateTo || undefined}
      />

      {/* Ma trận toàn team × ngày (7/14/30 riêng) — snapshot đơn chưa xong. */}
      <TeamDailyMatrix
        reloadToken={matrixToken}
        type={filterType || undefined}
        customer={filterCustomer || undefined}
      />

      {/* Period switcher */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
          {(['today', '7d', '30d', 'custom'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 ${period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
            >
              {p === 'today' ? 'Hôm nay' : p === '7d' ? '7 ngày' : p === '30d' ? '30 ngày' : 'Tùy chỉnh'}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <DateRangePresets
              from={customFrom}
              to={customTo}
              variant="compact"
              onChange={(f, t) => {
                setCustomFrom(f);
                setCustomTo(t);
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

      {/* Leaderboard */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-amber-500" />
            <span className="text-sm font-semibold">Leaderboard</span>
            <span className="text-xs text-muted-foreground">— sort theo Đã xong trong period</span>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>Designer</TableHead>
              <TableHead className="w-30 text-center" title="Đang chờ làm — snapshot hiện tại">Cần làm</TableHead>
              <TableHead className="w-30 text-center" title="Đang xử lý — snapshot hiện tại">Đang làm</TableHead>
              <TableHead className="w-30 text-center" title="Đã hoàn thành trong period">Đã xong</TableHead>
              <TableHead className="w-30 text-center" title="Đang ở trạng thái không làm được — snapshot">KLĐ (hiện)</TableHead>
              <TableHead className="w-30 text-center" title="Đang ở trạng thái rework — snapshot">L.lại (hiện)</TableHead>
              <TableHead className="w-30 text-center" title="Tổng số lần đã báo không làm được trong period (kể cả đã giao lại sau đó)">Tổng KLĐ</TableHead>
              <TableHead className="w-30 text-center" title="Tổng số lần đã chuyển sang rework trong period (kể cả đã restart xong)">Tổng l.lại</TableHead>
              <TableHead className="w-30 text-center">Avg phản hồi</TableHead>
              <TableHead className="w-30 text-center">Avg làm</TableHead>
              <TableHead className="w-30 text-center">Tỉ lệ lỗi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && leaderboard.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!loading && leaderboard.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-sm text-muted-foreground">
                  Chưa có designer nào hoạt động trong period này.
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
                  <TableCell className="text-center text-xs font-bold text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{row.fullName}</div>
                    {row.email && <div className="text-[10px] text-muted-foreground">{row.email}</div>}
                  </TableCell>
                  <TableCell className="text-center">{row.assignedCount}</TableCell>
                  <TableCell className="text-center text-indigo-600 dark:text-indigo-400">
                    {row.inProgressCount}
                  </TableCell>
                  <TableCell className="text-center font-semibold text-emerald-600 dark:text-emerald-400">
                    {row.completedInPeriod}
                  </TableCell>
                  <TableCell className="text-center text-rose-600 dark:text-rose-400">
                    {row.rejectedCount}
                  </TableCell>
                  <TableCell className="text-center text-amber-600 dark:text-amber-400">
                    {row.reworkCount}
                  </TableCell>
                  <TableCell className="text-center text-rose-700 dark:text-rose-300 font-semibold">
                    {row.totalRejected}
                  </TableCell>
                  <TableCell className="text-center text-amber-700 dark:text-amber-300 font-semibold">
                    {row.totalRework}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {row.avgResponseMin}&apos;
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {row.avgWorkMin}&apos;
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={
                        row.errorRate === 0 ? 'outline' : row.errorRate < 0.2 ? 'secondary' : 'destructive'
                      }
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Timeline */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold">Timeline per-designer</h3>
              <p className="text-[11px] text-muted-foreground">
                4 series: gán / nhận / xong / làm lại — theo ngày.
              </p>
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
              Chọn 1 designer ở leaderboard để xem timeline.
            </p>
          ) : (
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={timeline} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => d.slice(5)}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{ fontSize: 11, padding: 6 }}
                    labelStyle={{ fontSize: 10 }}
                  />
                  <Line type="monotone" dataKey="assigned" stroke="#71717A" strokeWidth={2} dot={false} name="Gán" />
                  <Line type="monotone" dataKey="started" stroke="#6366F1" strokeWidth={2} dot={false} name="Nhận" />
                  <Line type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={2} dot={false} name="Xong" />
                  <Line type="monotone" dataKey="rework" stroke="#F59E0B" strokeWidth={2} dot={false} name="Làm lại" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Error stats pie */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Lỗi xưởng — phân loại</h3>
          <p className="text-[11px] text-muted-foreground mb-2">
            Designer vs xưởng. {errorStats?.total || 0} đơn lỗi tổng.
          </p>
          {pieData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              Không có lỗi nào trong period này.
            </p>
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
                <div
                  key={row.code}
                  className="flex items-center justify-between text-[11px] gap-2"
                >
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
    </div>
  );
}
