import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock, FileSearch, PackageSearch, RefreshCw, Users, X } from 'lucide-react';
import { ORDER_PRIORITY_LABELS, PRODUCT_LEVEL_MAP, WorkshopConfigCategory } from 'shared';
import type {
  OrderPriority,
  ToolCheckCustomerError,
  ToolCheckCustomerStat,
  ToolCheckDayRow,
  ToolCheckFacet,
  ToolCheckOrder,
  ToolCheckProductStat,
} from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/common/CopyButton';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { PipelineDailyOverview } from '@/components/common/PipelineDailyOverview';
import { DATE_PRESETS } from '@/utils/dateRangePresets';
import { SelectFilter } from '@/components/common/SelectFilter';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { Spinner } from '@/components/common/Spinner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ColorBadgeSelectCell } from '@/components/orders/cells/ColorBadgeSelectCell';
import { ImageThumbCell } from '@/components/orders/cells/ImageThumbCell';
import { MultiIconSelectCell } from '@/components/orders/cells/MultiIconSelectCell';
import { PriorityBadge } from '@/components/orders/cells/PrioritySelectCell';
import { ProductionErrorSelectCell } from '@/components/orders/cells/ProductionErrorSelectCell';
import { TextEditCell } from '@/components/orders/cells/TextEditCell';
import { useNow } from '@/hooks/useNow';
import { usePermission } from '@/hooks/usePermission';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';
import { formatCountdown, getStageDeadline } from '@/utils/priorityEstimate';

interface Overview {
  checkedCount: number;
  errorCount: number;
  reworkList: ToolCheckOrder[];
  unreviewedList: ToolCheckOrder[];
  byProduct: ToolCheckProductStat[];
  byCustomer: ToolCheckCustomerStat[];
  topCustomerError: ToolCheckCustomerError[];
  days: ToolCheckDayRow[];
  columnTotals: { unreviewed: number; rework: number };
  facets: {
    type: ToolCheckFacet[];
    customer: ToolCheckFacet[];
    machineNumber: ToolCheckFacet[];
    priority: ToolCheckFacet[];
  };
  rangeDays: number;
}

type ListTab = 'rework' | 'unreviewed';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** ISO → ngày VN (YYYY-MM-DD) để lọc client-side theo cột ngày. */
function vnDay(iso?: string): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function fmtDayHead(day: string): { wd: string; dm: string } {
  const d = new Date(`${day}T12:00:00+07:00`);
  return {
    wd: WEEKDAYS[d.getDay()] ?? '',
    dm: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
  };
}

const toOpts = (f: ToolCheckFacet[] = []) => f.map((o) => ({ value: o.value, label: o.value, count: o.count }));
/** Facet `priority` trả value dạng '1'|'2'|'3' — map sang label tiếng Việt (dropdown "Ưu tiên"). */
const toPriorityOpts = (f: ToolCheckFacet[] = []) =>
  f.map((o) => ({
    value: o.value,
    label: ORDER_PRIORITY_LABELS[Number(o.value) as OrderPriority] || o.value,
    count: o.count,
  }));

export default function ToolCheckTab() {
  const { canEditField } = usePermission();
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // Model từ/đến (thay cho `days` cũ) — mặc định 7 ngày gần nhất (khớp default cũ).
  const last7 = DATE_PRESETS.find((p) => p.key === 'last-7d')!.range();
  const [dateFrom, setDateFrom] = useState(() => last7.from);
  const [dateTo, setDateTo] = useState(() => last7.to);

  const [filterType, setFilterType] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  // Ngày đang lọc (YYYY-MM-DD VN) — click 1 cột trong dải ngày; chỉ lọc DANH
  // SÁCH client-side, KPI/dải/thống kê giữ nguyên cả kỳ.
  const [dayFilter, setDayFilter] = useState('');

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [listTab, setListTab] = useState<ListTab>('rework');
  const [preview, setPreview] = useState<{ url?: string; originalUrl?: string; title?: string } | null>(null);
  const seqRef = useRef(0);
  const now = useNow(30_000);

  const fetchData = () => {
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.designer.toolCheckOverview({
          from: dateFrom,
          to: dateTo,
          ...(filterType ? { type: filterType } : {}),
          ...(filterCustomer ? { customer: filterCustomer } : {}),
          ...(filterMachine ? { machineNumber: filterMachine } : {}),
          ...(filterPriority ? { priority: filterPriority } : {}),
        });
        if (seq !== seqRef.current) return;
        setData((res.data?.data || null) as Overview | null);
      } catch (err) {
        if (seq === seqRef.current) handleAxiosError(err);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  };

  useEffect(() => {
    // Đổi kỳ/filter → bỏ ngày đang chọn (tránh lọc theo ngày ngoài kỳ mới).
    setDayFilter('');
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, filterType, filterCustomer, filterMachine, filterPriority]);

  // Patch 1 đơn trong cả 2 list (optimistic) sau khi edit cell.
  const patchRow = (id: string, partial: Partial<ToolCheckOrder>) =>
    setData((prev) =>
      prev
        ? {
            ...prev,
            reworkList: prev.reworkList.map((o) => (o._id === id ? { ...o, ...partial } : o)),
            unreviewedList: prev.unreviewedList.map((o) => (o._id === id ? { ...o, ...partial } : o)),
          }
        : prev,
    );

  // Full kỳ (cho KPI). Danh sách hiển thị lọc thêm theo ngày đang chọn.
  const reworkAll = data?.reworkList || [];
  const unreviewedAll = data?.unreviewedList || [];
  const applyDay = (list: ToolCheckOrder[]) =>
    dayFilter ? list.filter((o) => vnDay(o.inProductionAt) === dayFilter) : list;
  const reworkList = applyDay(reworkAll);
  const unreviewedList = applyDay(unreviewedAll);
  const activeList = listTab === 'rework' ? reworkList : unreviewedList;

  const toggleDay = (day: string) => setDayFilter((cur) => (cur === day ? '' : day));

  const canEditNote = canEditField('toolResultNote');
  const canEditErrFile = canEditField('errorFile');
  const canEditErrNote = canEditField('errorFileNote');
  const canEditProdErr = canEditField('productionError');

  // Render 1 dòng đơn — cột theo thứ tự bảng "Đơn theo xưởng" (mockup → type/size
  // → Note kq Tool → File sửa lỗi → Ghi chú file lỗi → Lỗi xưởng). Cell edit trực
  // tiếp giống bảng workshop; đổi Note kq Tool / Lỗi xưởng có thể đổi list → refetch.
  const renderRow = (o: ToolCheckOrder) => {
    const showCount = o.toolResultNote === 'error' && (o.productionErrorCount || 0) >= 2;
    return (
      <tr key={o._id} className="border-t border-border/40 hover:bg-muted/30 align-middle">
        <td className="w-12 px-1 py-1.5">
          <ImageThumbCell
            url={o.mockupUrl}
            originalUrl={o.mockupOriginalUrl}
            title={`Mockup: ${o.productionId}`}
            onOpen={(url, title, originalUrl) => setPreview({ url, title, originalUrl })}
          />
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <span className="font-medium whitespace-nowrap">{o.productionId}</span>
            <CopyButton value={o.productionId} label="Production ID" iconSize={11} />
          </div>
        </td>
        <td className="px-2 py-1.5">
          {(() => {
            // Cả 2 list (cần làm lại/chưa soát) đều đang chờ bước "tool-check"
            // — mốc vào bước dùng thẳng `inProductionAt` (không có mốc riêng
            // "quay lại Support"/"vào hàng chờ soát" trong dữ liệu).
            const deadline = getStageDeadline(o.priority, 'tool-check', o.inProductionAt);
            const countdown = deadline ? formatCountdown(deadline, now) : undefined;
            return (
              <div className="flex flex-col gap-1 items-start">
                <PriorityBadge priority={o.priority} />
                {deadline && countdown && (
                  <span
                    className={cn(
                      'text-[10px] inline-flex items-center gap-1 whitespace-nowrap',
                      countdown.overdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground',
                    )}
                  >
                    <Clock size={10} /> {countdown.text}
                  </span>
                )}
              </div>
            );
          })()}
        </td>
        <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{o.userSku || '—'}</td>
        <td className="px-2 py-1.5 text-muted-foreground max-w-[200px] truncate" title={o.type}>
          {o.type || '—'}
        </td>
        <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
          {o.size || '—'}
          {o.color ? ` / ${o.color}` : ''}
        </td>
        {/* Note kq Tool 1 — edit → 'ok' đẩy đơn về In (đổi list → refetch). */}
        <td className="px-2 py-1.5">
          <span className="inline-flex items-center gap-1.5">
            <ColorBadgeSelectCell
              orderId={o._id}
              field="toolResultNote"
              category={WorkshopConfigCategory.ToolResultNote}
              value={o.toolResultNote}
              canEdit={canEditNote}
              onUpdated={(v) => {
                patchRow(o._id, { toolResultNote: v ?? undefined });
                fetchData();
              }}
            />
            {showCount && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                title={`Xưởng đã báo lỗi ${o.productionErrorCount} lần trên đơn này`}
              >
                ×{o.productionErrorCount}
              </span>
            )}
          </span>
        </td>
        {/* File sửa lỗi */}
        <td className="px-2 py-1.5">
          <MultiIconSelectCell
            orderId={o._id}
            field="errorFile"
            category={WorkshopConfigCategory.ErrorFileType}
            value={o.errorFile}
            canEdit={canEditErrFile}
            maxVisible={2}
            onUpdated={(v) => patchRow(o._id, { errorFile: v ?? undefined })}
          />
        </td>
        {/* Ghi chú file lỗi */}
        <td className="px-2 py-1.5 min-w-[150px]">
          <TextEditCell
            orderId={o._id}
            field="errorFileNote"
            value={o.errorFileNote}
            canEdit={canEditErrNote}
            onUpdated={(v) => patchRow(o._id, { errorFileNote: v ?? undefined })}
            tooltipLabel="Ghi chú file lỗi"
          />
        </td>
        {/* Lỗi xưởng */}
        <td className="px-2 py-1.5">
          <ProductionErrorSelectCell
            orderId={o._id}
            category={WorkshopConfigCategory.ProductionError}
            value={o.productionError}
            errorNoteValue={o.productionErrorNote}
            canEdit={canEditProdErr}
            onUpdated={(code) => {
              patchRow(o._id, { productionError: code ?? undefined });
              fetchData();
            }}
          />
        </td>
      </tr>
    );
  };

  const kpis = useMemo(
    () => [
      { key: 'checked', label: 'Đã soát trong kỳ', value: data?.checkedCount ?? 0, cls: 'text-foreground' },
      { key: 'rework', label: 'In trả về (cần làm lại)', value: reworkAll.length, cls: 'text-amber-600 dark:text-amber-400' },
      { key: 'unreviewed', label: 'Chưa soát', value: unreviewedAll.length, cls: 'text-slate-600 dark:text-slate-400' },
      { key: 'error', label: 'Lỗi soát tool (đang chờ)', value: data?.errorCount ?? 0, cls: 'text-rose-600 dark:text-rose-400' },
    ],
    [data, reworkAll.length, unreviewedAll.length],
  );

  const days = useMemo(() => [...(data?.days || [])].reverse(), [data]);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-5">
      {/* Filter bar (thời gian) */}
      <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-2 flex-wrap">
        <FileSearch size={16} className="text-indigo-600" />
        <span className="text-sm font-semibold">Soát tool</span>
        <span className="hidden md:inline text-[11px] text-muted-foreground">
          — đơn cần làm lại + backlog chưa soát cho Support
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={fetchData} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </Button>
        <DateRangePicker
          variant="inline"
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => {
            setDateFrom(f);
            setDateTo(t);
          }}
        />
        {/* Hàng filter: Sản phẩm / Khách / Máy / Ưu tiên — options từ facet BE (cả kỳ). */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <SelectFilter
            label="Sản phẩm"
            value={filterType}
            onChange={setFilterType}
            options={toOpts(data?.facets.type)}
          />
          <SelectFilter
            label="Khách hàng"
            value={filterCustomer}
            onChange={setFilterCustomer}
            options={toOpts(data?.facets.customer)}
          />
          <SelectFilter
            label="Máy"
            value={filterMachine}
            onChange={setFilterMachine}
            options={toOpts(data?.facets.machineNumber)}
          />
          <SelectFilter
            label="Ưu tiên"
            value={filterPriority}
            onChange={setFilterPriority}
            options={toPriorityOpts(data?.facets.priority)}
          />
        </div>
      </div>

      {/* Tổng quan theo ngày FULL luồng (toàn nhà máy) — highlight lane Soát tool.
          Ăn cùng filter ngày; click 1 ngày → lọc danh sách bên dưới (dùng chung
          dayFilter với dải focus phía dưới). */}
      <PipelineDailyOverview
        lane="tool"
        from={dateFrom}
        to={dateTo}
        dayFilter={dayFilter || undefined}
        onPickDay={toggleDay}
        caption="— TOÀN nhà máy · lane Soát tool được tô đậm · di chuột xem chi tiết · bấm 1 ngày để lọc danh sách"
      />

      {/* Dải tổng quan theo ngày — Chưa soát + In trả về. Click 1 ngày → lọc
          danh sách bên dưới (client-side); click lại/✕ để bỏ. */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold">Tổng quan theo ngày</span>
          <span className="hidden sm:inline text-[11px] text-muted-foreground">
            — bấm 1 ngày để lọc danh sách bên dưới
          </span>
          {dayFilter && (
            <button
              type="button"
              onClick={() => setDayFilter('')}
              className="ml-auto inline-flex items-center gap-1 text-[11px] rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-2 py-0.5"
            >
              Đang lọc {fmtDayHead(dayFilter).dm}
              <X size={11} />
            </button>
          )}
        </div>
        {days.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Không có dữ liệu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-card text-left font-medium px-3 py-2 border-b border-border min-w-[110px]">
                    Chỉ số
                  </th>
                  {days.map((d) => {
                    const { wd, dm } = fmtDayHead(d.day);
                    const active = dayFilter === d.day;
                    return (
                      <th
                        key={d.day}
                        onClick={() => toggleDay(d.day)}
                        className={`font-medium px-1.5 py-1.5 border-b border-l border-border text-center min-w-[58px] cursor-pointer transition-colors ${
                          active ? 'bg-indigo-100 dark:bg-indigo-500/25' : 'bg-card hover:bg-muted/60'
                        }`}
                      >
                        <div className="text-[11px] text-muted-foreground leading-tight">{wd}</div>
                        <div className="leading-tight font-semibold">{dm}</div>
                      </th>
                    );
                  })}
                  <th className="bg-muted/30 font-semibold px-2 py-1.5 border-b border-l border-border text-center min-w-[58px]">
                    Tổng
                  </th>
                </tr>
              </thead>
              <tbody>
                <DayMetricRow
                  label="Chưa soát"
                  cls="text-slate-600 dark:text-slate-300"
                  days={days}
                  dayFilter={dayFilter}
                  pick={(d) => d.unreviewed}
                  total={data?.columnTotals.unreviewed ?? 0}
                  onPick={toggleDay}
                />
                <DayMetricRow
                  label="In trả về"
                  cls="text-amber-600"
                  days={days}
                  dayFilter={dayFilter}
                  pick={(d) => d.rework}
                  total={data?.columnTotals.rework ?? 0}
                  onPick={toggleDay}
                />
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.key} className="rounded-lg border border-border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className={`text-2xl font-bold tabular-nums ${k.cls}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Danh sách: 2 nhóm (làm cái nào trước) */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 p-3 border-b border-border flex-wrap">
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setListTab('rework')}
              className={`px-3 py-1.5 font-medium ${
                listTab === 'rework'
                  ? 'bg-amber-500 text-white'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              Cần làm lại ({reworkList.length})
            </button>
            <button
              type="button"
              onClick={() => setListTab('unreviewed')}
              className={`px-3 py-1.5 font-medium ${
                listTab === 'unreviewed'
                  ? 'bg-slate-600 text-white'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              Chưa soát ({unreviewedList.length})
            </button>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {listTab === 'rework'
              ? '⚠ Ưu tiên — In trả về do thiếu file. Đổi Note kq Tool → "ok" để đẩy lại In.'
              : 'Backlog đơn chưa có Note kq Tool.'}
          </span>
        </div>

        {loading && !data ? (
          <div className="py-10 text-center">
            <Spinner size={20} className="text-muted-foreground" />
          </div>
        ) : activeList.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">
            {listTab === 'rework' ? 'Không có đơn In trả về.' : 'Không có đơn chưa soát.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] uppercase text-muted-foreground whitespace-nowrap">
                  <th className="w-12 px-1 py-2" />
                  <th className="px-2 py-2">Mã đơn</th>
                  <th className="px-2 py-2">Ưu tiên</th>
                  <th className="px-2 py-2">Khách</th>
                  <th className="px-2 py-2">Sản phẩm</th>
                  <th className="px-2 py-2">Size/Màu</th>
                  <th className="px-2 py-2">Note kq Tool 1</th>
                  <th className="px-2 py-2">File sửa lỗi</th>
                  <th className="px-2 py-2">Ghi chú file lỗi</th>
                  <th className="px-2 py-2">Lỗi xưởng</th>
                </tr>
              </thead>
              <tbody>{activeList.map(renderRow)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Thống kê lỗi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Theo sản phẩm */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <PackageSearch size={16} className="text-indigo-600" />
            <h3 className="text-sm font-semibold">Lỗi theo sản phẩm</h3>
          </div>
          {(data?.byProduct.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Chưa có dữ liệu.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {data!.byProduct.map((p) => (
                <div key={p.type} className="flex items-center gap-2 text-[13px]">
                  {p.mockup ? (
                    <img src={p.mockup} alt="" className="w-7 h-7 rounded object-cover border border-border shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded border border-dashed border-border shrink-0" />
                  )}
                  {p.level != null && (
                    <Badge
                      className="font-normal border shrink-0 text-[10px]"
                      style={{
                        backgroundColor: PRODUCT_LEVEL_MAP[p.level]?.color,
                        color: '#fff',
                        borderColor: PRODUCT_LEVEL_MAP[p.level]?.color,
                      }}
                    >
                      Lv {p.level}
                    </Badge>
                  )}
                  <span className="flex-1 min-w-0 truncate" title={p.fullName || p.type}>
                    {p.fullName || p.type}
                  </span>
                  <span className="text-muted-foreground tabular-nums shrink-0">{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Theo khách hàng */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-indigo-600" />
            <h3 className="text-sm font-semibold">Lỗi theo khách hàng</h3>
          </div>
          {(data?.byCustomer.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Chưa có dữ liệu.</p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {data!.byCustomer.map((c) => (
                <div key={c.userSku} className="flex items-center justify-between text-[13px] gap-2">
                  <span className="truncate" title={c.userSku}>{c.userSku}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Khách × loại lỗi hay gặp nhất */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="text-sm font-semibold">Khách hay gặp lỗi nào</h3>
          </div>
          {(data?.topCustomerError.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Chưa có dữ liệu.</p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {data!.topCustomerError.map((r, i) => (
                <div key={`${r.userSku}-${r.code}-${i}`} className="flex items-center gap-2 text-[13px]">
                  <span className="truncate max-w-[45%]" title={r.userSku}>{r.userSku}</span>
                  <Badge variant="outline" className="font-normal text-amber-700 border-amber-300 dark:text-amber-300 truncate">
                    {r.label || r.code}
                  </Badge>
                  <span className="ml-auto text-muted-foreground tabular-nums shrink-0">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ImagePreviewDialog
        open={preview !== null}
        onOpenChange={(v) => !v && setPreview(null)}
        url={preview?.url}
        originalUrl={preview?.originalUrl}
        title={preview?.title}
      />
    </div>
    </TooltipProvider>
  );
}

function DayMetricRow({
  label,
  cls,
  days,
  dayFilter,
  pick,
  total,
  onPick,
}: {
  label: string;
  cls: string;
  days: ToolCheckDayRow[];
  dayFilter: string;
  pick: (d: ToolCheckDayRow) => number;
  total: number;
  onPick: (day: string) => void;
}) {
  return (
    <tr className="group">
      <td className={`sticky left-0 z-10 bg-card px-3 py-1.5 border-b border-border/60 font-medium ${cls}`}>
        {label}
      </td>
      {days.map((d) => {
        const v = pick(d);
        const active = dayFilter === d.day;
        return (
          <td
            key={d.day}
            onClick={() => onPick(d.day)}
            className={`border-b border-l border-border/60 text-center px-1 py-1.5 cursor-pointer transition-colors ${
              active ? 'bg-indigo-100 dark:bg-indigo-500/25' : 'hover:bg-muted/50'
            }`}
          >
            {v === 0 ? (
              <span className="text-muted-foreground/30">·</span>
            ) : (
              <span className={`font-semibold ${cls}`}>{v}</span>
            )}
          </td>
        );
      })}
      <td className={`bg-muted/30 border-b border-l border-border text-center px-2 py-1.5 font-semibold ${cls}`}>
        {total || <span className="text-muted-foreground/40">·</span>}
      </td>
    </tr>
  );
}
