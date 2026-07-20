import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Grab, ImageOff, UserPlus } from 'lucide-react';
import type { AssignBacklogGroup } from 'shared';
import { PRODUCT_LEVEL_MAP } from 'shared';
import { toast } from 'sonner';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { Spinner } from '@/components/common/Spinner';
import { AssignDesignerDialog } from '@/components/orders/AssignDesignerDialog';
import {
  buildColGroups,
  GroupCellContent,
  WORKSHOP_COLS,
  type WorkshopOrderRow,
  type WorkshopRenderCtx,
} from '@/components/orders/workshopTableConfig';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';
import { formatCountdown, getStageDeadline } from '@/utils/priorityEstimate';

import { useNow } from '@/hooks/useNow';
import { usePermission } from '@/hooks/usePermission';

// Role được TỰ NHẬN task về mình (self-claim) vs. role được gán cho người khác.
const CLAIM_SELF_ROLES = ['Designer', 'DesignerLeader'];
const ASSIGN_OTHERS_ROLES = ['SuperAdmin', 'Admin', 'Manager', 'DesignerLeader'];

interface Props {
  days?: 7 | 14 | 30;
  /** Khoảng tùy biến (YYYY-MM-DD) — nếu có cả 2 thì override `days`. */
  from?: string;
  to?: string;
  type?: string;
  customer?: string;
  reloadToken?: number;
  /** Gọi sau khi gán xong để bảng tổng quan bên trên refetch cập nhật số. */
  onAssigned?: () => void;
}

export function DesignerAssignBacklog({ days = 7, from, to, type, customer, reloadToken, onAssigned }: Props) {
  const [groups, setGroups] = useState<AssignBacklogGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [preview, setPreview] = useState<{ url?: string; originalUrl?: string; title?: string } | null>(null);
  // Full workshop rows theo nhóm — lazy fetch khi mở rộng nhóm (qua /orders/by-ids).
  const [fullRows, setFullRows] = useState<Record<string, WorkshopOrderRow[]>>({});
  const [rowsLoading, setRowsLoading] = useState<Set<string>>(new Set());
  const seqRef = useRef(0);
  const now = useNow(30_000);

  const { roleName, canViewField, canEditField } = usePermission();
  const canClaimSelf = !!roleName && CLAIM_SELF_ROLES.includes(roleName);
  const canAssignOthers = !!roleName && ASSIGN_OTHERS_ROLES.includes(roleName);

  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // Cột workshop (đã lọc quyền) — dựng bảng đơn đầy đủ giống bảng tổng quan.
  const visibleCols = useMemo(() => WORKSHOP_COLS.filter((c) => !c.perm || canViewField(c.key)), [canViewField]);
  const colGroups = useMemo(() => buildColGroups(visibleCols, roleName), [visibleCols, roleName]);
  const openPreview = (url: string, title: string, originalUrl?: string) => setPreview({ url, title, originalUrl });

  const fetchData = () => {
    const seq = ++seqRef.current;
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.designer.assignBacklog({
          days,
          ...(from && to ? { from, to } : {}),
          ...(type ? { type } : {}),
          ...(customer ? { customer } : {}),
        });
        if (seq !== seqRef.current) return;
        const data = res.data?.data as { groups: AssignBacklogGroup[]; total: number };
        setGroups(data?.groups || []);
        setTotal(data?.total || 0);
        // Pool đổi → xóa cache full rows để nhóm đang mở tự nạp lại.
        setFullRows({});
      } catch (err) {
        if (seq === seqRef.current) handleAxiosError(err);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  };

  useEffect(() => {
    setSelected(new Set());
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, from, to, type, customer, reloadToken]);

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Lazy-load full workshop rows cho nhóm vừa mở (chưa có cache & chưa đang tải).
  useEffect(() => {
    const toLoad = [...expanded].filter((k) => !(k in fullRows) && !rowsLoading.has(k));
    if (toLoad.length === 0) return;
    for (const key of toLoad) {
      const g = groups.find((x) => x.key === key);
      if (!g || g.orderIds.length === 0) {
        setFullRows((p) => ({ ...p, [key]: [] }));
        continue;
      }
      setRowsLoading((p) => new Set(p).add(key));
      (async () => {
        try {
          const sp = new URLSearchParams();
          sp.set('ids', g.orderIds.join(','));
          sp.set('page', '1');
          sp.set('limit', String(Math.min(g.orderIds.length, 500)));
          const res = await RepositoryRemote.order.getOrdersByIds('?' + sp.toString());
          setFullRows((p) => ({ ...p, [key]: (res.data?.data || []) as WorkshopOrderRow[] }));
        } catch (err) {
          handleAxiosError(err);
        } finally {
          setRowsLoading((p) => {
            const n = new Set(p);
            n.delete(key);
            return n;
          });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, groups]);

  const toggleOrder = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleGroup = (g: AssignBacklogGroup) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = g.orderIds.every((id) => next.has(id));
      if (allSelected) g.orderIds.forEach((id) => next.delete(id));
      else g.orderIds.forEach((id) => next.add(id));
      return next;
    });

  const selectedCount = selected.size;
  const selectedIds = useMemo(() => [...selected], [selected]);

  // Designer TỰ NHẬN các đơn đã chọn về chính mình (self-claim). BE chỉ nhận đơn
  // chưa ai ôm + ghi log ai nhận / lúc nào.
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
      const msg = `Đã nhận ${data.modified}/${data.matched} đơn về mình`;
      if (data.skipped.length === 0) {
        toast.success(msg);
      } else {
        toast.warning(`${msg}. ${data.skipped.length} đơn bị bỏ qua.`, { duration: 6000 });
        toast.message('Đơn bị bỏ qua', {
          description: data.skipped
            .slice(0, 5)
            .map((s) => `• ${s.productionId}: ${s.reason}`)
            .join('\n'),
          duration: 9000,
        });
      }
      setSelected(new Set());
      fetchData();
      onAssigned?.();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-3 border-b border-border flex-wrap">
        <div className="flex items-center gap-2">
          <UserPlus size={16} className="text-indigo-600" />
          <span className="text-sm font-semibold">Cần gán designer</span>
          <span className="text-[11px] text-muted-foreground">
            — {total} đơn (chưa gán / không làm được / làm lại chưa ôm, đã soát ≠ ok)
          </span>
        </div>
        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Bỏ chọn ({selectedCount})
            </button>
            {canClaimSelf && (
              <Button size="sm" onClick={handleClaimSelf} disabled={claiming}>
                <Grab size={13} />
                Nhận về mình ({selectedCount})
              </Button>
            )}
            {canAssignOthers && (
              <Button
                size="sm"
                variant={canClaimSelf ? 'outline' : 'default'}
                onClick={() => setAssignOpen(true)}
                disabled={claiming}
              >
                <UserPlus size={13} />
                Gán design ({selectedCount})
              </Button>
            )}
          </div>
        )}
      </div>

      {!loading && groups.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">Không có đơn cần gán trong khoảng đã chọn.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {groups.map((g) => {
            const isOpen = expanded.has(g.key);
            const selInGroup = g.orderIds.filter((id) => selected.has(id)).length;
            const allSel = selInGroup > 0 && selInGroup === g.orderIds.length;
            return (
              <div key={g.key}>
                {/* Group header */}
                <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 cursor-pointer"
                    checked={allSel}
                    ref={(el) => {
                      if (el) el.indeterminate = selInGroup > 0 && !allSel;
                    }}
                    onChange={() => toggleGroup(g)}
                  />
                  <button type="button" onClick={() => toggleExpand(g.key)} className="text-muted-foreground shrink-0">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {/* Mockup */}
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
                  <button type="button" onClick={() => toggleExpand(g.key)} className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium truncate">{g.fullName}</div>
                    {g.shortName && <div className="text-[10px] text-muted-foreground">{g.shortName}</div>}
                  </button>
                  <Badge variant="secondary" className="shrink-0">
                    {g.count} đơn
                  </Badge>
                </div>

                {/* Orders — bảng đơn ĐẦY ĐỦ (giống bảng tổng quan): cột workshop
                    gộp nhóm + checkbox chọn để gán. Lazy-load qua /orders/by-ids. */}
                {isOpen && (
                  <div className="overflow-x-auto bg-muted/10">
                    {rowsLoading.has(g.key) && !fullRows[g.key] ? (
                      <div className="py-6 text-center">
                        <Spinner size={16} className="text-muted-foreground" />
                      </div>
                    ) : (
                      <table className="w-full text-[13px]">
                        <thead>
                          <tr className="text-[11px] text-muted-foreground border-b border-border/50">
                            <th className="w-8 px-3 py-1.5"></th>
                            {colGroups.map((grp) => (
                              <th
                                key={grp.key}
                                className="text-left font-medium px-2 py-1.5 whitespace-nowrap"
                                style={{ minWidth: grp.width }}
                              >
                                {grp.title}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(fullRows[g.key] || []).map((row) => {
                            const ctx: WorkshopRenderCtx = {
                              canEditField,
                              patchRow: (id, patch) =>
                                setFullRows((prev) => ({
                                  ...prev,
                                  [g.key]: (prev[g.key] || []).map((r) => (r._id === id ? { ...r, ...patch } : r)),
                                })),
                              openPreview,
                            };
                            const renderedByKey = new Map(visibleCols.map((c) => [c.key, c.render(row, ctx)]));
                            // Chip đếm ngược hạn design (đơn chưa chạy bước designer →
                            // mốc `inProductionAt`) — gắn cạnh badge Ưu tiên trong group.
                            const deadline = getStageDeadline(row.priority, 'designer', row.inProductionAt);
                            const countdown = deadline ? formatCountdown(deadline, now) : undefined;
                            return (
                              <tr
                                key={row._id}
                                className={cn(
                                  'border-t border-border/40 hover:bg-muted/30 align-top',
                                  selected.has(row._id) && 'bg-primary/5',
                                )}
                              >
                                <td className="w-8 px-3 py-2">
                                  <input
                                    type="checkbox"
                                    className="size-4 cursor-pointer"
                                    checked={selected.has(row._id)}
                                    onChange={() => toggleOrder(row._id)}
                                  />
                                </td>
                                {colGroups.map((grp) => (
                                  <td key={grp.key} className="px-2 py-2 align-top">
                                    <GroupCellContent
                                      group={grp}
                                      renderedByKey={renderedByKey}
                                      extra={(memberKey) =>
                                        memberKey === 'priority' && deadline && countdown ? (
                                          <span
                                            className={cn(
                                              'text-[10px] inline-flex items-center gap-1 whitespace-nowrap',
                                              countdown.overdue
                                                ? 'text-rose-600 dark:text-rose-400'
                                                : 'text-muted-foreground',
                                            )}
                                          >
                                            <Clock size={10} /> {countdown.text}
                                          </span>
                                        ) : null
                                      }
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AssignDesignerDialog
        open={assignOpen}
        selectedIds={selectedIds}
        onClose={() => setAssignOpen(false)}
        onApplied={() => {
          setAssignOpen(false);
          setSelected(new Set());
          fetchData();
          onAssigned?.();
        }}
      />

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
