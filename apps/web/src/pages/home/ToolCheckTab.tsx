import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  FileSearch,
  PackageSearch,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import type { OrderPriority, ToolCheckDayRow, ToolCheckErrorRow, ToolCheckFacet, ToolCheckOrder } from 'shared';
import { ORDER_PRIORITY_LABELS, PRODUCT_LEVEL_MAP, WorkshopConfigCategory } from 'shared';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { CopyButton } from '@/components/common/CopyButton';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { PipelineDailyOverview } from '@/components/common/PipelineDailyOverview';
import { SelectFilter } from '@/components/common/SelectFilter';
import { Spinner } from '@/components/common/Spinner';
import { ColorBadgeSelectCell } from '@/components/orders/cells/ColorBadgeSelectCell';
import { ImageThumbCell } from '@/components/orders/cells/ImageThumbCell';
import { MultiIconSelectCell } from '@/components/orders/cells/MultiIconSelectCell';
import { PriorityBadge } from '@/components/orders/cells/PrioritySelectCell';
import { ProductionErrorSelectCell } from '@/components/orders/cells/ProductionErrorSelectCell';
import { TextEditCell } from '@/components/orders/cells/TextEditCell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';
import { DATE_PRESETS } from '@/utils/dateRangePresets';
import { formatCountdown, getStageDeadline } from '@/utils/priorityEstimate';

import { useNow } from '@/hooks/useNow';
import { usePermission } from '@/hooks/usePermission';

interface Overview {
  checkedCount: number;
  errorCount: number;
  reworkList: ToolCheckOrder[];
  unreviewedList: ToolCheckOrder[];
  errorHistory: ToolCheckErrorRow[];
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

/** Key định danh khách = userSku + userEmail (1 khách = cặp này). */
const custKey = (r: { userSku?: string; userEmail?: string }) => `${r.userSku ?? ''}|||${r.userEmail ?? ''}`;

export default function ToolCheckTab() {
  const { canEditField } = usePermission();
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);
  const resolveConfig = useWorkshopConfigStore((s) => s.resolve);
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
  // Cross-filter nội bộ 3 ô thống kê lỗi (client-side, không refetch):
  // selCust = key `userSku|||userEmail`, selType = mã sản phẩm (`type`).
  const [selCust, setSelCust] = useState('');
  const [selType, setSelType] = useState('');
  // Loại lỗi (mã note) đang mở panel chi tiết (đơn + note lỗi).
  const [selCode, setSelCode] = useState('');
  // Mở rộng / ẩn bớt: 3 cột thống kê + bảng chi tiết loại lỗi.
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState(false);
  // Modal "Xem theo từng khách hàng" (full-screen) + tập khách đang mở rộng.
  const [customerView, setCustomerView] = useState(false);
  const [expandedCust, setExpandedCust] = useState<Set<string>>(new Set());
  const toggleCust = (k: string) =>
    setExpandedCust((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

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
    // Đổi kỳ/filter → bỏ ngày đang chọn + cross-filter thống kê.
    setDayFilter('');
    setSelCust('');
    setSelType('');
    setSelCode('');
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
  // tiếp giống Danh sách đơn; đổi Note kq Tool / Lỗi xưởng có thể đổi list → refetch.
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
      {
        key: 'rework',
        label: 'In trả về (cần làm lại)',
        value: reworkAll.length,
        cls: 'text-amber-600 dark:text-amber-400',
      },
      { key: 'unreviewed', label: 'Chưa soát', value: unreviewedAll.length, cls: 'text-slate-600 dark:text-slate-400' },
      {
        key: 'error',
        label: 'Lỗi soát tool (đang chờ)',
        value: data?.errorCount ?? 0,
        cls: 'text-rose-600 dark:text-rose-400',
      },
    ],
    [data, reworkAll.length, unreviewedAll.length],
  );

  const days = useMemo(() => [...(data?.days || [])].reverse(), [data]);

  // 3 ô thống kê lỗi Soát tool (lịch sử, kể cả đơn đã sửa). Đếm ĐƠN riêng biệt
  // (dedup theo orderId). Cross-filter: chọn Khách → lọc Sản phẩm + Loại lỗi;
  // chọn Sản phẩm → lọc Khách + Loại lỗi.
  const stats = useMemo(() => {
    const rows = data?.errorHistory ?? [];
    const byCust = (r: ToolCheckErrorRow) => !selCust || custKey(r) === selCust;
    const byType = (r: ToolCheckErrorRow) => !selType || (r.type ?? '') === selType;

    const custMap = new Map<string, { userSku?: string; userEmail?: string; orders: Set<string> }>();
    const prodMap = new Map<
      string,
      { type?: string; fullName?: string; mockup?: string; level?: number; orders: Set<string> }
    >();
    const errMap = new Map<string, { code: string; label?: string; orders: Set<string> }>();

    for (const r of rows) {
      if (byType(r)) {
        const k = custKey(r);
        let g = custMap.get(k);
        if (!g) custMap.set(k, (g = { userSku: r.userSku, userEmail: r.userEmail, orders: new Set() }));
        g.orders.add(r.orderId);
      }
      if (byCust(r)) {
        const k = r.type ?? '';
        let g = prodMap.get(k);
        if (!g)
          prodMap.set(
            k,
            (g = { type: r.type, fullName: r.fullName, mockup: r.mockup, level: r.level, orders: new Set() }),
          );
        g.orders.add(r.orderId);
      }
      if (byCust(r) && byType(r)) {
        const k = r.code || '';
        let g = errMap.get(k);
        if (!g) errMap.set(k, (g = { code: r.code, label: r.codeLabel, orders: new Set() }));
        g.orders.add(r.orderId);
      }
    }

    return {
      byCustomer: [...custMap.entries()]
        .map(([key, g]) => ({ key, userSku: g.userSku, userEmail: g.userEmail, count: g.orders.size }))
        .sort((a, b) => b.count - a.count),
      byProduct: [...prodMap.entries()]
        .map(([key, g]) => ({
          key,
          type: g.type,
          fullName: g.fullName,
          mockup: g.mockup,
          level: g.level,
          count: g.orders.size,
        }))
        .sort((a, b) => b.count - a.count),
      byError: [...errMap.values()]
        .map((g) => ({ code: g.code, label: g.label, count: g.orders.size }))
        .sort((a, b) => b.count - a.count),
    };
  }, [data?.errorHistory, selCust, selType]);

  // Panel chi tiết 1 loại lỗi (selCode): các ĐƠN dính note đó (dedup theo
  // orderId) + sản phẩm + note lỗi, tôn trọng cross-filter khách/sản phẩm.
  const codeDetail = useMemo(() => {
    type DetailItem = {
      orderId: string;
      productionId?: string;
      product: string;
      note?: string;
      errorFile?: string[];
      mockup?: string;
      level?: number;
      mockupUrl?: string;
      mockupOriginalUrl?: string;
      size?: string;
      color?: string;
    };
    if (!selCode) return { label: '', items: [] as DetailItem[] };
    const rows = data?.errorHistory ?? [];
    const seen = new Set<string>();
    let label = selCode;
    const items: DetailItem[] = [];
    for (const r of rows) {
      if ((r.code || '') !== selCode) continue;
      if (selCust && custKey(r) !== selCust) continue;
      if (selType && (r.type ?? '') !== selType) continue;
      if (r.codeLabel) label = r.codeLabel;
      if (seen.has(r.orderId)) continue;
      seen.add(r.orderId);
      items.push({
        orderId: r.orderId,
        productionId: r.productionId,
        product: r.fullName || r.type || '(Chưa rõ)',
        note: r.note,
        errorFile: r.errorFile,
        mockup: r.mockup,
        level: r.level ?? undefined,
        mockupUrl: r.mockupUrl,
        mockupOriginalUrl: r.mockupOriginalUrl,
        size: r.size,
        color: r.color,
      });
    }

    // Sắp xếp: nhóm sản phẩm giống tên đứng cạnh nhau (nhóm nhiều đơn lên đầu);
    // trong mỗi sản phẩm, nhóm File lỗi giống nhau đứng cạnh nhau (nhiều lên đầu).
    const efKeyOf = (it: DetailItem) => (it.errorFile && it.errorFile.length ? [...it.errorFile].sort().join('|') : '');
    const prodCount = new Map<string, number>();
    const efCountByProd = new Map<string, Map<string, number>>();
    for (const it of items) {
      prodCount.set(it.product, (prodCount.get(it.product) ?? 0) + 1);
      const m = efCountByProd.get(it.product) ?? new Map<string, number>();
      const ek = efKeyOf(it);
      m.set(ek, (m.get(ek) ?? 0) + 1);
      efCountByProd.set(it.product, m);
    }
    items.sort((a, b) => {
      const pc = (prodCount.get(b.product) ?? 0) - (prodCount.get(a.product) ?? 0);
      if (pc) return pc;
      const pn = a.product.localeCompare(b.product);
      if (pn) return pn;
      const ak = efKeyOf(a);
      const bk = efKeyOf(b);
      const ec = (efCountByProd.get(b.product)?.get(bk) ?? 0) - (efCountByProd.get(a.product)?.get(ak) ?? 0);
      if (ec) return ec;
      return ak.localeCompare(bk);
    });

    return { label: label || '(Chưa rõ)', items };
  }, [data?.errorHistory, selCode, selCust, selType]);

  // Chế độ "xem theo từng khách hàng": mỗi khách → sản phẩm lỗi + loại lỗi
  // (đếm đơn riêng biệt), sort nhiều→ít. KHÔNG áp cross-filter (hiện mọi khách).
  const perCustomer = useMemo(() => {
    const rows = data?.errorHistory ?? [];
    type Grp = {
      key: string;
      userSku?: string;
      userEmail?: string;
      orders: Set<string>;
      products: Map<string, { product: string; mockup?: string; level?: number; orders: Set<string> }>;
      codes: Map<string, { code: string; label?: string; orders: Set<string> }>;
    };
    const map = new Map<string, Grp>();
    for (const r of rows) {
      const k = custKey(r);
      let g = map.get(k);
      if (!g) {
        g = {
          key: k,
          userSku: r.userSku,
          userEmail: r.userEmail,
          orders: new Set(),
          products: new Map(),
          codes: new Map(),
        };
        map.set(k, g);
      }
      g.orders.add(r.orderId);
      const pk = r.type ?? '';
      let p = g.products.get(pk);
      if (!p) {
        p = {
          product: r.fullName || r.type || '(Chưa rõ)',
          mockup: r.mockup,
          level: r.level ?? undefined,
          orders: new Set(),
        };
        g.products.set(pk, p);
      }
      p.orders.add(r.orderId);
      const ck = r.code || '';
      let c = g.codes.get(ck);
      if (!c) {
        c = { code: r.code, label: r.codeLabel, orders: new Set() };
        g.codes.set(ck, c);
      }
      c.orders.add(r.orderId);
    }
    return [...map.values()]
      .map((g) => ({
        key: g.key,
        userSku: g.userSku,
        userEmail: g.userEmail,
        count: g.orders.size,
        products: [...g.products.values()]
          .map((p) => ({ product: p.product, mockup: p.mockup, level: p.level, count: p.orders.size }))
          .sort((a, b) => b.count - a.count),
        codes: [...g.codes.values()]
          .map((c) => ({ code: c.code, label: c.label, count: c.orders.size }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count);
  }, [data?.errorHistory]);

  const allCustExpanded = perCustomer.length > 0 && perCustomer.every((c) => expandedCust.has(c.key));

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

        {/* Thống kê lịch sử lỗi Soát tool (kể cả đơn đã sửa) — đếm ĐƠN riêng biệt.
          3 cột Khách → Sản phẩm → Loại lỗi, click Khách/Sản phẩm để lọc chéo. */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-wrap">
            <AlertTriangle size={15} className="text-amber-500" />
            <span className="text-sm font-semibold">Thống kê lỗi Soát tool</span>
            <span className="hidden md:inline text-[11px] text-muted-foreground">
              — đơn từng bị người soát tool đánh Note kq Tool ≠ ok (kể cả đã sửa về ok), theo ngày vào SX · đếm số đơn
            </span>
            <div className="ml-auto flex items-center gap-2">
              {(selCust || selType) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelCust('');
                    setSelType('');
                  }}
                  className="inline-flex items-center gap-1 text-[11px] rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-2 py-0.5"
                >
                  Bỏ lọc chéo
                  <X size={11} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setCustomerView(true)}
                className="inline-flex items-center gap-1 text-[11px] rounded-md border border-border px-2 py-1 hover:bg-muted transition-colors"
              >
                <Users size={13} />
                Xem theo khách hàng
              </button>
              <button
                type="button"
                onClick={() => setStatsExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] rounded-md border border-border px-2 py-1 hover:bg-muted transition-colors"
              >
                {statsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {statsExpanded ? 'Ẩn bớt' : 'Mở rộng'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
            {/* Cột 1 — Khách hàng */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-indigo-600" />
                <h3 className="text-sm font-semibold">Theo khách hàng</h3>
                {selCust && (
                  <button
                    type="button"
                    onClick={() => setSelCust('')}
                    className="ml-auto inline-flex items-center gap-1 text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                  >
                    <X size={10} /> bỏ chọn
                  </button>
                )}
              </div>
              {stats.byCustomer.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Chưa có dữ liệu.</p>
              ) : (
                <div className={cn('space-y-0.5', statsExpanded ? '' : 'max-h-72 overflow-y-auto')}>
                  {stats.byCustomer.map((c) => {
                    const active = selCust === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setSelCust((cur) => (cur === c.key ? '' : c.key))}
                        className={`w-full flex items-center gap-2 text-[13px] rounded px-2 py-1 text-left transition-colors ${
                          active ? 'bg-indigo-100 dark:bg-indigo-500/20' : 'hover:bg-muted/60'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium" title={c.userSku || '(Chưa rõ)'}>
                            {c.userSku || '(Chưa rõ)'}
                          </div>
                          {c.userEmail && (
                            <div className="truncate text-[11px] text-muted-foreground" title={c.userEmail}>
                              {c.userEmail}
                            </div>
                          )}
                        </div>
                        <span className="text-muted-foreground tabular-nums shrink-0">{c.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cột 2 — Sản phẩm */}
            <div className="lg:border-l lg:border-border lg:pl-4">
              <div className="flex items-center gap-2 mb-3">
                <PackageSearch size={16} className="text-indigo-600" />
                <h3 className="text-sm font-semibold">Theo sản phẩm</h3>
                {selType && (
                  <button
                    type="button"
                    onClick={() => setSelType('')}
                    className="ml-auto inline-flex items-center gap-1 text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                  >
                    <X size={10} /> bỏ chọn
                  </button>
                )}
              </div>
              {stats.byProduct.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Chưa có dữ liệu.</p>
              ) : (
                <div className={cn('space-y-0.5', statsExpanded ? '' : 'max-h-72 overflow-y-auto')}>
                  {stats.byProduct.map((p) => {
                    const active = selType === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setSelType((cur) => (cur === p.key ? '' : p.key))}
                        className={`w-full flex items-center gap-2 text-[13px] rounded px-2 py-1 text-left transition-colors ${
                          active ? 'bg-indigo-100 dark:bg-indigo-500/20' : 'hover:bg-muted/60'
                        }`}
                      >
                        {p.mockup ? (
                          <img
                            src={p.mockup}
                            alt=""
                            className="w-7 h-7 rounded object-cover border border-border shrink-0"
                          />
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
                        <span className="flex-1 min-w-0 truncate" title={p.fullName || p.type || '(Chưa rõ)'}>
                          {p.fullName || p.type || '(Chưa rõ)'}
                        </span>
                        <span className="text-muted-foreground tabular-nums shrink-0">{p.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cột 3 — Loại lỗi (click để mở chi tiết đơn + note lỗi) */}
            <div className="lg:border-l lg:border-border lg:pl-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className="text-amber-500" />
                <h3 className="text-sm font-semibold">Theo loại lỗi</h3>
                <span className="hidden xl:inline text-[10px] text-muted-foreground">— bấm để xem chi tiết</span>
              </div>
              {stats.byError.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Chưa có dữ liệu.</p>
              ) : (
                <div className={cn('space-y-0.5', statsExpanded ? '' : 'max-h-72 overflow-y-auto')}>
                  {stats.byError.map((e) => {
                    const active = selCode === (e.code || '');
                    return (
                      <button
                        key={e.code || '(unknown)'}
                        type="button"
                        onClick={() => setSelCode((cur) => (cur === (e.code || '') ? '' : e.code || ''))}
                        className={`w-full flex items-center gap-2 text-[13px] rounded px-2 py-1 text-left transition-colors ${
                          active ? 'bg-amber-100 dark:bg-amber-500/20' : 'hover:bg-muted/60'
                        }`}
                      >
                        <Badge
                          variant="outline"
                          className="font-normal text-amber-700 border-amber-300 dark:text-amber-300 truncate"
                        >
                          {e.label || e.code || '(Chưa rõ)'}
                        </Badge>
                        <span className="ml-auto text-muted-foreground tabular-nums shrink-0">{e.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Panel chi tiết 1 loại lỗi: đơn + sản phẩm + note lỗi */}
          {selCode && (
            <div className="border-t border-border px-4 py-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[13px] font-semibold">Chi tiết loại lỗi:</span>
                <Badge variant="outline" className="font-normal text-amber-700 border-amber-300 dark:text-amber-300">
                  {codeDetail.label}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{codeDetail.items.length} đơn</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailExpanded((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] rounded-md border border-border px-2 py-1 hover:bg-muted transition-colors"
                  >
                    {detailExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {detailExpanded ? 'Ẩn bớt' : 'Mở rộng'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelCode('')}
                    className="inline-flex items-center gap-1 text-[11px] rounded bg-muted px-2 py-0.5 text-muted-foreground"
                  >
                    <X size={11} /> đóng
                  </button>
                </div>
              </div>
              {codeDetail.items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Không có đơn khớp bộ lọc.</p>
              ) : (
                <div className={cn('overflow-x-auto', detailExpanded ? '' : 'max-h-80 overflow-y-auto')}>
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-[11px] uppercase text-muted-foreground whitespace-nowrap">
                        <th className="w-12 px-1 py-1.5">Ảnh</th>
                        <th className="px-2 py-1.5">Mã đơn</th>
                        <th className="px-2 py-1.5">Sản phẩm</th>
                        <th className="px-2 py-1.5">Size/Màu</th>
                        <th className="px-2 py-1.5">File lỗi</th>
                        <th className="px-2 py-1.5">Note lỗi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {codeDetail.items.map((it) => (
                        <tr key={it.orderId} className="border-t border-border/40 hover:bg-muted/30 align-top">
                          <td className="w-12 px-1 py-1.5">
                            <ImageThumbCell
                              url={it.mockupUrl}
                              originalUrl={it.mockupOriginalUrl}
                              title={`Mockup: ${it.productionId || ''}`}
                              onOpen={(url, title, originalUrl) => setPreview({ url, title, originalUrl })}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <span className="font-medium whitespace-nowrap">{it.productionId || '—'}</span>
                              {it.productionId && (
                                <CopyButton value={it.productionId} label="Production ID" iconSize={11} />
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              {it.mockup ? (
                                <img
                                  src={it.mockup}
                                  alt=""
                                  className="w-6 h-6 rounded object-cover border border-border shrink-0"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded border border-dashed border-border shrink-0" />
                              )}
                              {it.level != null && (
                                <Badge
                                  className="font-normal border shrink-0 text-[10px]"
                                  style={{
                                    backgroundColor: PRODUCT_LEVEL_MAP[it.level]?.color,
                                    color: '#fff',
                                    borderColor: PRODUCT_LEVEL_MAP[it.level]?.color,
                                  }}
                                >
                                  Lv {it.level}
                                </Badge>
                              )}
                              <span className="min-w-0 truncate" title={it.product}>
                                {it.product}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                            {it.size || '—'}
                            {it.color ? ` / ${it.color}` : ''}
                          </td>
                          <td className="px-2 py-1.5">
                            {it.errorFile && it.errorFile.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {it.errorFile.map((code) => {
                                  const cfg = resolveConfig(WorkshopConfigCategory.ErrorFileType, code);
                                  return (
                                    <Badge
                                      key={code}
                                      variant="outline"
                                      className="font-normal text-[11px] truncate"
                                      style={cfg?.color ? { color: cfg.color, borderColor: cfg.color } : undefined}
                                    >
                                      {cfg?.name || code}
                                    </Badge>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground whitespace-pre-wrap max-w-[360px]">
                            {it.note || <span className="text-muted-foreground/50">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <ImagePreviewDialog
          open={preview !== null}
          onOpenChange={(v) => !v && setPreview(null)}
          url={preview?.url}
          originalUrl={preview?.originalUrl}
          title={preview?.title}
        />

        {/* Modal full-screen: xem lỗi Soát tool theo TỪNG khách hàng */}
        <Dialog open={customerView} onOpenChange={setCustomerView}>
          <DialogContent className="max-w-none w-[92vw] md:w-[60vw] h-screen p-0 gap-0 flex flex-col sm:rounded-none">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
              <Users size={16} className="text-indigo-600" />
              <DialogTitle className="text-base">Lỗi Soát tool theo từng khách hàng</DialogTitle>
              <span className="hidden sm:inline text-[12px] text-muted-foreground">
                {perCustomer.length} khách · theo ngày vào SX trong kỳ · đếm số đơn (kể cả đã sửa)
              </span>
              {perCustomer.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedCust(allCustExpanded ? new Set() : new Set(perCustomer.map((c) => c.key)))}
                  className="ml-auto mr-8 inline-flex items-center gap-1 text-[11px] rounded-md border border-border px-2 py-1 hover:bg-muted transition-colors"
                >
                  {allCustExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {allCustExpanded ? 'Ẩn tất cả' : 'Mở rộng tất cả'}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {perCustomer.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">Chưa có dữ liệu.</p>
              ) : (
                perCustomer.map((c) => {
                  const exp = expandedCust.has(c.key);
                  return (
                    <div key={c.key} className="rounded-lg border border-border bg-card p-3 pr-5">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-bold text-[17px]">{c.userSku || '(Chưa rõ)'}</span>
                        {c.userEmail && <span className="text-[12px] text-muted-foreground">{c.userEmail}</span>}
                        <div className="ml-auto flex items-center gap-3">
                          <span className="inline-flex items-baseline gap-1 rounded-md bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40 px-2.5 py-1">
                            <span className="text-lg font-extrabold tabular-nums leading-none">{c.count}</span>
                            <span className="text-[11px] font-medium">đơn lỗi</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleCust(c.key)}
                            className="inline-flex items-center gap-1 text-[11px] rounded-md border border-border px-2 py-1 hover:bg-muted transition-colors"
                          >
                            {exp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            {exp ? 'Ẩn bớt' : 'Mở rộng'}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-2">
                        {/* Sản phẩm lỗi */}
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                            <PackageSearch size={12} /> Sản phẩm lỗi
                            <span className="text-[14px] font-extrabold tabular-nums text-indigo-600 dark:text-indigo-400 normal-case">
                              {c.products.length}
                            </span>
                          </div>
                          <div className={cn('space-y-0.5 max-w-xl', exp ? '' : 'max-h-28 overflow-y-auto')}>
                            {c.products.map((p, i) => (
                              <div key={`${p.product}-${i}`} className="flex items-center gap-2 text-[13px]">
                                {p.mockup ? (
                                  <img
                                    src={p.mockup}
                                    alt=""
                                    className="w-6 h-6 rounded object-cover border border-border shrink-0"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded border border-dashed border-border shrink-0" />
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
                                <span className="flex-1 min-w-0 truncate" title={p.product}>
                                  {p.product}
                                </span>
                                <span className="shrink-0 tabular-nums text-[15px] font-extrabold text-indigo-600 dark:text-indigo-400">
                                  {p.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Loại lỗi */}
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                            <AlertTriangle size={12} className="text-amber-500" /> Loại lỗi
                            <span className="text-[14px] font-extrabold tabular-nums text-amber-600 dark:text-amber-400 normal-case">
                              {c.codes.length}
                            </span>
                          </div>
                          <div className={cn('space-y-1 max-w-xl', exp ? '' : 'max-h-28 overflow-y-auto')}>
                            {c.codes.map((e, i) => (
                              <div key={`${e.code}-${i}`} className="flex items-center gap-2 text-[13px]">
                                <Badge
                                  variant="outline"
                                  className="font-normal text-amber-700 border-amber-300 dark:text-amber-300 truncate"
                                >
                                  {e.label || e.code || '(Chưa rõ)'}
                                </Badge>
                                <span className="ml-auto shrink-0 tabular-nums text-[15px] font-extrabold text-amber-600 dark:text-amber-400">
                                  {e.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        </Dialog>
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
      <td className={`sticky left-0 z-10 bg-card px-3 py-1.5 border-b border-border/60 font-medium ${cls}`}>{label}</td>
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
