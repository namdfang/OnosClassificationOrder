import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileSearch, PackageSearch, RefreshCw, Users } from 'lucide-react';
import { PRODUCT_LEVEL_MAP, WorkshopConfigCategory } from 'shared';
import type {
  ToolCheckCustomerError,
  ToolCheckCustomerStat,
  ToolCheckOrder,
  ToolCheckProductStat,
} from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/common/CopyButton';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { Spinner } from '@/components/common/Spinner';
import { ColorBadgeSelectCell } from '@/components/orders/cells/ColorBadgeSelectCell';
import { ImageThumbCell } from '@/components/orders/cells/ImageThumbCell';
import { MultiIconSelectCell } from '@/components/orders/cells/MultiIconSelectCell';
import { ProductionErrorSelectCell } from '@/components/orders/cells/ProductionErrorSelectCell';
import { TextEditCell } from '@/components/orders/cells/TextEditCell';
import { usePermission } from '@/hooks/usePermission';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';

interface Overview {
  checkedCount: number;
  errorCount: number;
  reworkList: ToolCheckOrder[];
  unreviewedList: ToolCheckOrder[];
  byProduct: ToolCheckProductStat[];
  byCustomer: ToolCheckCustomerStat[];
  topCustomerError: ToolCheckCustomerError[];
  rangeDays: number;
}

type ListTab = 'rework' | 'unreviewed';

export default function ToolCheckTab() {
  const { canEditField } = usePermission();
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(7);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const customRange = !!(dateFrom && dateTo);
  const pickPreset = (d: 7 | 14 | 30) => {
    setRangeDays(d);
    setDateFrom('');
    setDateTo('');
  };

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [listTab, setListTab] = useState<ListTab>('rework');
  const [preview, setPreview] = useState<{ url?: string; originalUrl?: string; title?: string } | null>(null);
  const seqRef = useRef(0);

  const fetchData = () => {
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.designer.toolCheckOverview({
          days: rangeDays,
          ...(customRange ? { from: dateFrom, to: dateTo } : {}),
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
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays, dateFrom, dateTo]);

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

  const reworkList = data?.reworkList || [];
  const unreviewedList = data?.unreviewedList || [];
  const activeList = listTab === 'rework' ? reworkList : unreviewedList;

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
      { key: 'rework', label: 'In trả về (cần làm lại)', value: reworkList.length, cls: 'text-amber-600 dark:text-amber-400' },
      { key: 'unreviewed', label: 'Chưa soát', value: unreviewedList.length, cls: 'text-slate-600 dark:text-slate-400' },
      { key: 'error', label: 'Lỗi soát tool (đang chờ)', value: data?.errorCount ?? 0, cls: 'text-rose-600 dark:text-rose-400' },
    ],
    [data, reworkList.length, unreviewedList.length],
  );

  return (
    <div className="space-y-5">
      {/* Filter bar (thời gian) */}
      <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-2 flex-wrap">
        <FileSearch size={16} className="text-indigo-600" />
        <span className="text-sm font-semibold">Soát tool</span>
        <span className="hidden md:inline text-[11px] text-muted-foreground">
          — đơn cần làm lại + backlog chưa soát cho Support
        </span>
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
          <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
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
  );
}
