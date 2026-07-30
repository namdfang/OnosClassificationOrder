import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookmarkPlus, ChevronDown, ChevronRight, Grab, History, ImageOff, ListChecks, Plus, UserPlus, Wand2, X } from 'lucide-react';
import { PRODUCT_LEVEL_MAP } from 'shared';
import { toast } from 'sonner';

import { useDesignerTeamStore } from '@/store/designerTeamStore';

import { RepositoryRemote } from '@/services';

import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { Spinner } from '@/components/common/Spinner';
import { AssignDesignerDialog } from '@/components/orders/AssignDesignerDialog';
import { AssignFactoryDialog } from '@/components/orders/AssignFactoryDialog';
import { type AutoAssignPlan,AutoAssignPlanDialog } from '@/components/orders/AutoAssignPlanDialog';
import { OrderLogTimelineDialog } from '@/components/orders/OrderLogTimelineDialog';
import {
  RememberAssignConfigDialog,
  type RememberProductItem,
} from '@/components/orders/RememberAssignConfigDialog';
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

// Cùng phân quyền nút với bảng "Cần gán designer" (DesignerAssignBacklog.tsx).
const CLAIM_SELF_ROLES = ['Designer', 'DesignerLeader'];
const ASSIGN_OTHERS_ROLES = ['SuperAdmin', 'Admin', 'Manager', 'DesignerLeader'];
const REMEMBER_CONFIG_ROLES = ['SuperAdmin', 'Admin'];

export interface DrillTarget {
  /** Mô tả con số vừa bấm (vd. "Tổng lỗi · 12/07"). */
  title: React.ReactNode;
  /** Query string (không `?`, không page/limit) cho `GET /orders/overview-list`. */
  query: string;
  /**
   * Bật chế độ chọn đơn + cụm nút gán (Nhận về mình / Gán design / Ghi nhớ cấu
   * hình / Tự động gán — giống hệt bảng "Cần gán designer"). CHỈ set cho các
   * con số hàng "Chưa gán designer" (đơn chưa ai ôm).
   */
  selectable?: boolean;
}

interface Props {
  target: DrillTarget | null;
  onClose: () => void;
  /** Gọi sau khi gán/nhận xong để bảng tổng quan phía trên refetch cập nhật số. */
  onMutated?: () => void;
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
export function DesignerDrillPanel({ target, onClose, onMutated }: Props) {
  const { t } = useTranslation('dashboard');
  const { t: tOrders } = useTranslation('orders');
  const { canViewField, canEditField, roleName, has, isAdmin } = usePermission();
  const canTransfer = isAdmin || has('order.transfer');
  const selectable = !!target?.selectable;
  const canClaimSelf = selectable && !!roleName && CLAIM_SELF_ROLES.includes(roleName);
  const canAssignOthers = selectable && !!roleName && ASSIGN_OTHERS_ROLES.includes(roleName);
  const canRememberConfig = selectable && !!roleName && REMEMBER_CONFIG_ROLES.includes(roleName);
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
  // Chế độ chọn đơn để gán (chỉ khi target.selectable) — mirror DesignerAssignBacklog.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [rememberOpen, setRememberOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [autoPlan, setAutoPlan] = useState<AutoAssignPlan | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoApplying, setAutoApplying] = useState(false);
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
        // Pool đổi → bỏ chọn để không giữ id đã biến mất khỏi danh sách.
        setSelected(new Set());
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
    id === '__none__' ? t('drillPanel.unassigned') : teamById[id]?.fullName || `#${id.slice(-4)}`;

  // Gom nhóm theo sản phẩm (productConfigId) — đơn chưa map → nhóm "Chưa map".
  const groups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>();
    for (const r of filteredRows) {
      const key = r.productConfigId ? String(r.productConfigId) : 'unmapped';
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          fullName: r.productConfig?.fullName || (key === 'unmapped' ? t('drillPanel.unmapped') : r.type || t('drillPanel.unknown')),
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
  }, [filteredRows, t]);

  // ── Chọn đơn + hành động gán (chỉ khi selectable) — mirror DesignerAssignBacklog. ──
  const selectedCount = selected.size;
  const selectedIds = useMemo(() => [...selected], [selected]);
  const rememberProducts = useMemo<RememberProductItem[]>(
    () =>
      groups
        .map((g) => ({
          id: g.key,
          name: g.fullName,
          selectedCount: g.rows.filter((r) => selected.has(r._id)).length,
        }))
        .filter((p) => p.selectedCount > 0 && p.id !== 'unmapped'),
    [groups, selected],
  );
  const unmappedSelectedCount = useMemo(() => {
    const g = groups.find((x) => x.key === 'unmapped');
    return g ? g.rows.filter((r) => selected.has(r._id)).length : 0;
  }, [groups, selected]);

  if (!target) return null;

  const finishMutation = () => {
    setSelected(new Set());
    setReloadKey((k) => k + 1);
    onMutated?.();
  };

  const toggleOrderSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleGroupSel = (g: ProductGroup) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = g.rows.every((r) => next.has(r._id));
      if (allSelected) g.rows.forEach((r) => next.delete(r._id));
      else g.rows.forEach((r) => next.add(r._id));
      return next;
    });

  const handleClaimSelf = async () => {
    if (selectedIds.length === 0) return;
    try {
      setClaiming(true);
      const res = await RepositoryRemote.order.claimDesignerTasks({ ids: selectedIds });
      const data = res.data?.data as {
        matched: number;
        modified: number;
        skipped: { orderId: string; productionId: string; reason: string }[];
      };
      const msg = t('assignBacklog.claimedSelf', { modified: data.modified, matched: data.matched });
      if (data.skipped.length === 0) {
        toast.success(msg);
      } else {
        toast.warning(t('assignBacklog.claimedSelfWithSkipped', { msg, count: data.skipped.length }), {
          duration: 6000,
        });
        toast.message(t('assignBacklog.skippedOrders'), {
          description: data.skipped
            .slice(0, 5)
            .map((s) => `• ${s.productionId}: ${s.reason}`)
            .join('\n'),
          duration: 9000,
        });
      }
      finishMutation();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setClaiming(false);
    }
  };

  // "Tự động gán": phạm vi = toàn bộ đơn đang hiển thị trong panel (đã áp filter chip).
  const handleAutoPreview = async () => {
    const ids = filteredRows.map((r) => r._id);
    if (ids.length === 0) return;
    try {
      setAutoLoading(true);
      const res = await RepositoryRemote.order.autoAssignPreview({ orderIds: ids });
      setAutoPlan((res.data?.data ?? null) as AutoAssignPlan | null);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setAutoLoading(false);
    }
  };

  const handleAutoApply = async () => {
    if (!autoPlan || autoPlan.plan.length === 0) return;
    try {
      setAutoApplying(true);
      const res = await RepositoryRemote.order.autoAssignApply({
        assignments: autoPlan.plan.map((r) => ({ userId: r.userId, orderIds: r.orderIds })),
      });
      const data = res.data?.data as { assigned: number; skipped: number };
      if (data.skipped > 0) {
        toast.warning(t('assignBacklog.autoAssignDoneSkipped', { assigned: data.assigned, skipped: data.skipped }), {
          duration: 7000,
        });
      } else {
        toast.success(t('assignBacklog.autoAssignDone', { assigned: data.assigned }));
      }
      setAutoPlan(null);
      finishMutation();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setAutoApplying(false);
    }
  };

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
    t: tOrders,
  };

  return (
    <div ref={rootRef} className="rounded-lg border border-indigo-300 dark:border-indigo-800 bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border flex-wrap">
        <ListChecks size={16} className="text-indigo-600 shrink-0" />
        <span className="text-sm font-semibold">{target.title}</span>
        <span className="text-[11px] text-muted-foreground">
          — {t('drillPanel.orderCount', { count: total })}
          {total > rows.length && !loading && ` (${t('drillPanel.showingFirst', { count: rows.length })})`}
          {(filterAssignee || filterCustomer) &&
            ` · ${t('drillPanel.filtering', { count: filteredRows.length })}`}
        </span>
        {loading && <Spinner size={13} className="text-muted-foreground" />}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <X size={13} /> {t('drillPanel.close')}
        </button>
      </div>

      {/* Cụm nút gán (chỉ drill "Chưa gán designer") — giống hệt bảng "Cần gán
          designer": Nhận về mình / Gán design / Ghi nhớ cấu hình / Tự động gán. */}
      {selectable && (canClaimSelf || canAssignOthers) && (
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-border flex-wrap">
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t('assignBacklog.deselect', { count: selectedCount })}
            </button>
          )}
          {canClaimSelf && (
            <Button size="sm" onClick={handleClaimSelf} disabled={claiming || selectedCount === 0}>
              <Grab size={13} />
              {t('assignBacklog.claimSelf', { count: selectedCount })}
            </Button>
          )}
          {canAssignOthers && (
            <Button
              size="sm"
              variant={canClaimSelf ? 'outline' : 'default'}
              onClick={() => setAssignOpen(true)}
              disabled={claiming || selectedCount === 0}
            >
              <UserPlus size={13} />
              {t('assignBacklog.assignDesign', { count: selectedCount })}
            </Button>
          )}
          {canRememberConfig && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRememberOpen(true)}
              disabled={claiming || selectedCount === 0}
            >
              <BookmarkPlus size={13} />
              {t('assignBacklog.rememberConfig')}
            </Button>
          )}
          {canAssignOthers && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAutoPreview}
              disabled={autoLoading || filteredRows.length === 0}
            >
              <Wand2 size={13} />
              {autoLoading ? t('assignBacklog.autoAssignLoading') : t('assignBacklog.autoAssign')}
            </Button>
          )}
        </div>
      )}

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
            label={t('drillPanel.customer')}
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
        <p className="text-xs text-muted-foreground text-center py-10">{t('drillPanel.noMatchingOrders')}</p>
      ) : (
        <div className="divide-y divide-border/60">
          {groups.map((g) => {
            const isOpen = expanded.has(g.key);
            return (
              <div key={g.key}>
                {/* Group header — mockup + level + tên + count (giống bảng Cần gán). */}
                <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30">
                  {selectable && (
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 cursor-pointer"
                      checked={g.rows.length > 0 && g.rows.every((r) => selected.has(r._id))}
                      ref={(el) => {
                        if (el) {
                          const n = g.rows.filter((r) => selected.has(r._id)).length;
                          el.indeterminate = n > 0 && n < g.rows.length;
                        }
                      }}
                      onChange={() => toggleGroupSel(g)}
                    />
                  )}
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
                      {t('drillPanel.level', { level: g.level })}
                    </Badge>
                  )}
                  <button type="button" onClick={() => toggleGroup(g.key)} className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium truncate">{g.fullName}</div>
                    {g.shortName && <div className="text-[10px] text-muted-foreground">{g.shortName}</div>}
                  </button>
                  <Badge variant="secondary" className="shrink-0">
                    {t('drillPanel.orderCount', { count: g.rows.length })}
                  </Badge>
                </div>

                {/* Bảng đơn đầy đủ — cột workshop gộp nhóm + lịch sử. */}
                {isOpen && (
                  <div className="overflow-x-auto bg-muted/10">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-[11px] text-muted-foreground border-b border-border/50">
                          {selectable && <th className="w-8 px-3 py-1.5"></th>}
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
                            <tr
                              key={row._id}
                              className={cn(
                                'border-t border-border/40 hover:bg-muted/30 align-top',
                                selectable && selected.has(row._id) && 'bg-primary/5',
                              )}
                            >
                              {selectable && (
                                <td className="w-8 px-3 py-2">
                                  <input
                                    type="checkbox"
                                    className="size-4 cursor-pointer"
                                    checked={selected.has(row._id)}
                                    onChange={() => toggleOrderSel(row._id)}
                                  />
                                </td>
                              )}
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
                                          <Plus size={11} /> {t('drillPanel.assignFactory')}
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
                                  title={t('drillPanel.history')}
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
      <AssignDesignerDialog
        open={assignOpen}
        selectedIds={selectedIds}
        onClose={() => setAssignOpen(false)}
        onApplied={() => {
          setAssignOpen(false);
          finishMutation();
        }}
      />
      <RememberAssignConfigDialog
        open={rememberOpen}
        products={rememberProducts}
        selectedOrderIds={selectedIds}
        unmappedSelectedCount={unmappedSelectedCount}
        onClose={() => setRememberOpen(false)}
        onApplied={finishMutation}
      />
      <AutoAssignPlanDialog
        plan={autoPlan}
        applying={autoApplying}
        onCancel={() => setAutoPlan(null)}
        onConfirm={handleAutoApply}
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
  const { t } = useTranslation('dashboard');
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
          {t('drillPanel.all')} · {totalCount}
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
