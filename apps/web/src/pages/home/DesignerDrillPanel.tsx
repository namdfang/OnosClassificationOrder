import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, History, ImageOff, ListChecks, Plus, X } from 'lucide-react';
import { PRODUCT_LEVEL_MAP } from 'shared';

import { useDesignerTeamStore } from '@/store/designerTeamStore';

import { RepositoryRemote } from '@/services';

import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { Spinner } from '@/components/common/Spinner';
import { AssignFactoryDialog } from '@/components/orders/AssignFactoryDialog';
import { OrderLogTimelineDialog } from '@/components/orders/OrderLogTimelineDialog';
import {
  buildColGroups,
  GroupCellContent,
  WORKSHOP_COLS,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { usePermission } from '@/hooks/usePermission';

/** Cap số đơn fetch cho 1 lần drill — đủ cho mọi con số theo ngày thực tế. */
const FETCH_LIMIT = 500;

export interface DrillTarget {
  /** Mô tả con số vừa bấm (vd. "Tổng lỗi · 12/07"). */
  title: React.ReactNode;
  /** Query string (không `?`, không page/limit) cho `GET /orders/overview-list`. */
  query: string;
}

interface Props {
  target: DrillTarget | null;
  onClose: () => void;
}

interface ProductGroup {
  key: string;
  fullName: string;
  shortName?: string;
  mockup?: string;
  level?: number;
  rows: WorkshopOrderRow[];
}

/**
 * Panel drill-down inline cho bảng "Tổng quan N ngày" (thay OrderListDialog) —
 * bấm 1 con số trên bảng tổng quan / bảng con "Tồn theo designer" → panel này
 * hiện NGAY DƯỚI (trên bảng "Cần gán designer"), gom nhóm theo SẢN PHẨM giống
 * `DesignerAssignBacklog` (header: mockup + badge level + tên + count; mở nhóm
 * → bảng cột workshop đầy đủ, inline edit theo quyền + lịch sử).
 * Fetch qua `overview-list` (không scoping role — khớp con số team-wide).
 */
export function DesignerDrillPanel({ target, onClose }: Props) {
  const { canViewField, canEditField, roleName, has, isAdmin } = usePermission();
  const canTransfer = isAdmin || has('order.transfer');
  const [rows, setRows] = useState<WorkshopOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // Mặc định THU GỌN mọi nhóm sản phẩm — chỉ mở nhóm user bấm vào.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ url?: string; originalUrl?: string; title?: string } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; productionId: string } | null>(null);
  // Gán xưởng cho đơn CHƯA map (nhóm "Chưa map") — tái dùng AssignFactoryDialog
  // (tự fetch danh sách xưởng, xem `components/orders/AssignFactoryDialog.tsx`).
  const [assignDialog, setAssignDialog] = useState<{ ids: string[]; single?: WorkshopOrderRow } | null>(null);
  // Bump sau khi gán xưởng xong → refetch panel.
  const [reloadKey, setReloadKey] = useState(0);
  // Filter nội bộ panel: theo designer ('__none__' = chưa gán) + theo khách (userSku).
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterCustomer, setFilterCustomer] = useState<string | null>(null);
  const seqRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Resolve tên designer cho thanh filter thống kê.
  const teamById = useDesignerTeamStore((s) => s.byId);
  const teamLoaded = useDesignerTeamStore((s) => s.loaded);
  const fetchTeam = useDesignerTeamStore((s) => s.fetch);
  useEffect(() => {
    if (target && !teamLoaded) fetchTeam();
  }, [target, teamLoaded, fetchTeam]);

  useEffect(() => {
    if (!target) return;
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const sp = new URLSearchParams(target.query);
        sp.set('page', '1');
        sp.set('limit', String(FETCH_LIMIT));
        const res = await RepositoryRemote.order.getOverviewList('?' + sp.toString());
        if (seq !== seqRef.current) return;
        setRows((res.data?.data || []) as WorkshopOrderRow[]);
        setTotal(res.data?.total || 0);
      } catch (err) {
        if (seq === seqRef.current) handleAxiosError(err);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, [target, reloadKey]);

  // Mở / đổi con số → cuộn panel vào tầm nhìn + THU GỌN lại mọi nhóm
  // (refetch sau khi gán xưởng — reloadKey — giữ nguyên nhóm đang mở).
  useEffect(() => {
    if (!target) return;
    setExpanded(new Set());
    setFilterAssignee(null);
    setFilterCustomer(null);
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [target]);

  const visibleCols = useMemo(() => WORKSHOP_COLS.filter((c) => !c.perm || canViewField(c.key)), [canViewField]);
  const colGroups = useMemo(() => buildColGroups(visibleCols, roleName), [visibleCols, roleName]);

  // ── Filter nội bộ theo designer / khách hàng (thống kê + cross-facet:
  // count mỗi chiều tính trên rows đã lọc bởi chiều còn lại). ──
  const assigneeKey = (r: WorkshopOrderRow) => r.assignee || '__none__';
  const matchAssignee = (r: WorkshopOrderRow) => !filterAssignee || assigneeKey(r) === filterAssignee;
  const matchCustomer = (r: WorkshopOrderRow) => !filterCustomer || (r.userSku || '—') === filterCustomer;

  const assigneeFacet = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (matchCustomer(r)) m.set(assigneeKey(r), (m.get(assigneeKey(r)) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filterCustomer]);

  const customerFacet = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (matchAssignee(r)) m.set(r.userSku || '—', (m.get(r.userSku || '—') || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filterAssignee]);

  const filteredRows = useMemo(
    () => rows.filter((r) => matchAssignee(r) && matchCustomer(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filterAssignee, filterCustomer],
  );

  const assigneeName = (id: string) =>
    id === '__none__' ? 'Chưa gán' : teamById[id]?.fullName || `#${id.slice(-4)}`;

  // Gom nhóm theo sản phẩm (productConfigId) — đơn chưa map → nhóm "Chưa map".
  const groups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>();
    for (const r of filteredRows) {
      const key = r.productConfigId ? String(r.productConfigId) : 'unmapped';
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          fullName: r.productConfig?.fullName || (key === 'unmapped' ? 'Chưa map' : r.type || 'Không rõ'),
          shortName: r.productConfig?.shortName,
          mockup: r.productConfig?.mockup,
          level: r.productConfig?.level,
          rows: [],
        };
        map.set(key, g);
      }
      g.rows.push(r);
    }
    return [...map.values()].sort((a, b) => b.rows.length - a.rows.length || a.fullName.localeCompare(b.fullName));
  }, [filteredRows]);

  if (!target) return null;

  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const ctx: WorkshopRenderCtx = {
    canEditField,
    patchRow: (id, patch) => setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r))),
    openPreview: (url, title, originalUrl) => setPreview({ url, title, originalUrl }),
  };

  return (
    <div ref={rootRef} className="rounded-lg border border-indigo-300 dark:border-indigo-800 bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border flex-wrap">
        <ListChecks size={16} className="text-indigo-600 shrink-0" />
        <span className="text-sm font-semibold">{target.title}</span>
        <span className="text-[11px] text-muted-foreground">
          — {total} đơn
          {total > rows.length && !loading && ` (hiển thị ${rows.length} đơn đầu)`}
          {(filterAssignee || filterCustomer) && ` · đang lọc: ${filteredRows.length} đơn`}
        </span>
        {loading && <Spinner size={13} className="text-muted-foreground" />}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <X size={13} /> Đóng
        </button>
      </div>

      {/* Thanh thống kê + filter theo Designer / Khách hàng (client-side,
          cross-facet: count mỗi chiều tính trên rows đã lọc bởi chiều kia). */}
      {rows.length > 0 && (
        <div className="px-3 py-2 border-b border-border bg-muted/10 space-y-1.5">
          <FacetBar
            label="Designer"
            options={assigneeFacet.map(([id, n]) => ({ key: id, label: assigneeName(id), count: n }))}
            active={filterAssignee}
            onToggle={(k) => setFilterAssignee((cur) => (cur === k ? null : k))}
          />
          <FacetBar
            label="Khách"
            options={customerFacet.map(([sku, n]) => ({ key: sku, label: sku, count: n }))}
            active={filterCustomer}
            onToggle={(k) => setFilterCustomer((cur) => (cur === k ? null : k))}
          />
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="py-10 text-center">
          <Spinner size={18} className="text-muted-foreground" />
        </div>
      ) : filteredRows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">Không có đơn nào phù hợp.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {groups.map((g) => {
            const isOpen = expanded.has(g.key);
            return (
              <div key={g.key}>
                {/* Group header — mockup + level + tên + count (giống bảng Cần gán). */}
                <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30">
                  <button type="button" onClick={() => toggleGroup(g.key)} className="text-muted-foreground shrink-0">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {g.mockup ? (
                    <button
                      type="button"
                      onClick={() => setPreview({ url: g.mockup, title: g.fullName })}
                      className="shrink-0"
                    >
                      <img
                        src={g.mockup}
                        alt="mockup"
                        className="w-9 h-9 rounded object-cover border border-border bg-muted"
                      />
                    </button>
                  ) : (
                    <div className="w-9 h-9 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground shrink-0">
                      <ImageOff size={14} />
                    </div>
                  )}
                  {g.level != null && (
                    <Badge
                      className="font-normal border shrink-0"
                      style={{
                        backgroundColor: PRODUCT_LEVEL_MAP[g.level]?.color,
                        color: '#fff',
                        borderColor: PRODUCT_LEVEL_MAP[g.level]?.color,
                      }}
                    >
                      Lv {g.level}
                    </Badge>
                  )}
                  <button type="button" onClick={() => toggleGroup(g.key)} className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium truncate">{g.fullName}</div>
                    {g.shortName && <div className="text-[10px] text-muted-foreground">{g.shortName}</div>}
                  </button>
                  <Badge variant="secondary" className="shrink-0">
                    {g.rows.length} đơn
                  </Badge>
                </div>

                {/* Bảng đơn đầy đủ — cột workshop gộp nhóm + lịch sử. */}
                {isOpen && (
                  <div className="overflow-x-auto bg-muted/10">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-[11px] text-muted-foreground border-b border-border/50">
                          {colGroups.map((grp) => (
                            <th
                              key={grp.key}
                              className="text-left font-medium px-2 py-1.5 whitespace-nowrap"
                              style={{ minWidth: grp.width }}
                            >
                              {grp.title}
                            </th>
                          ))}
                          <th className="w-10 px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((row) => {
                          const renderedByKey = new Map(visibleCols.map((c) => [c.key, c.render(row, ctx)]));
                          return (
                            <tr key={row._id} className="border-t border-border/40 hover:bg-muted/30 align-top">
                              {colGroups.map((grp) => (
                                <td key={grp.key} className="px-2 py-2 align-top">
                                  <GroupCellContent
                                    group={grp}
                                    renderedByKey={renderedByKey}
                                    extra={(memberKey) =>
                                      // Đơn CHƯA map → nút "Gán xưởng" cạnh ô Xưởng
                                      // (mirror OrderFactoryTab, chỉ role transfer/admin).
                                      memberKey === 'factoryMachine' && !row.factory?.name && canTransfer ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 text-[11px] px-2 w-fit border-amber-300 bg-amber-50/40 hover:bg-amber-100/60 dark:border-amber-500/40 dark:bg-amber-500/10 dark:hover:bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                          onClick={() => setAssignDialog({ ids: [row._id], single: row })}
                                        >
                                          <Plus size={11} /> Gán xưởng
                                        </Button>
                                      ) : null
                                    }
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Lịch sử"
                                  onClick={() => setHistoryTarget({ id: row._id, productionId: row.productionId })}
                                >
                                  <History size={13} className="text-muted-foreground" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AssignFactoryDialog
        open={!!assignDialog}
        onOpenChange={(o) => !o && setAssignDialog(null)}
        ids={assignDialog?.ids || []}
        single={assignDialog?.single}
        onSuccess={() => {
          setAssignDialog(null);
          setReloadKey((k) => k + 1);
        }}
      />
      <ImagePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        url={preview?.url}
        originalUrl={preview?.originalUrl}
        title={preview?.title}
      />
      <OrderLogTimelineDialog
        open={!!historyTarget}
        onOpenChange={(o) => !o && setHistoryTarget(null)}
        orderId={historyTarget?.id}
        productionId={historyTarget?.productionId}
      />
    </div>
  );
}

/**
 * Thanh chip thống kê + filter 1 chiều (Designer / Khách) trong panel drill.
 * Chip = giá trị + count; bấm để lọc, bấm lại để bỏ; "Tất cả" = tổng.
 */
function FacetBar({
  label,
  options,
  active,
  onToggle,
}: {
  label: string;
  options: { key: string; label: string; count: number }[];
  active: string | null;
  onToggle: (key: string) => void;
}) {
  const totalCount = options.reduce((s, o) => s + o.count, 0);
  const chip = (isActive: boolean) =>
    cn(
      'rounded-full border px-2 py-0.5 text-[11px] leading-4 cursor-pointer transition-colors whitespace-nowrap',
      isActive
        ? 'bg-indigo-600 border-indigo-600 text-white'
        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
    );
  return (
    <div className="flex items-start gap-2">
      <span className="text-[11px] font-medium text-muted-foreground shrink-0 pt-0.5 w-16">{label}</span>
      <div className="flex flex-wrap gap-1 max-h-[4.5rem] overflow-y-auto">
        <button type="button" onClick={() => active && onToggle(active)} className={chip(active === null)}>
          Tất cả · {totalCount}
        </button>
        {options.map((o) => (
          <button key={o.key} type="button" onClick={() => onToggle(o.key)} className={chip(active === o.key)}>
            {o.label} · {o.count}
          </button>
        ))}
      </div>
    </div>
  );
}
