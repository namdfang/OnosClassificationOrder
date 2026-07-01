import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ImageOff, UserPlus } from 'lucide-react';
import { PRODUCT_LEVEL_MAP, WorkshopConfigCategory } from 'shared';
import type { AssignBacklogGroup, AssignBacklogOrder } from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/common/CopyButton';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { ImageThumbCell } from '@/components/orders/cells/ImageThumbCell';
import { AssignDesignerDialog } from '@/components/orders/AssignDesignerDialog';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

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

const STATUS_META: Record<string, { label: string; cls: string }> = {
  unassigned: { label: 'Chưa gán', cls: 'text-slate-600 border-slate-300' },
  rejected: { label: 'Trả lại', cls: 'text-rose-600 border-rose-300' },
  rework: { label: 'Làm lại', cls: 'text-amber-600 border-amber-300' },
};

export function DesignerAssignBacklog({ days = 7, from, to, type, customer, reloadToken, onAssigned }: Props) {
  const [groups, setGroups] = useState<AssignBacklogGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [preview, setPreview] = useState<{ url?: string; originalUrl?: string; title?: string } | null>(null);
  const seqRef = useRef(0);

  const resolve = useWorkshopConfigStore((s) => s.resolve);
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

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

  const noteName = (code?: string) =>
    code ? resolve(WorkshopConfigCategory.ToolResultNote, code)?.name || code : '';

  const selectedCount = selected.size;
  const selectedIds = useMemo(() => [...selected], [selected]);

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-3 border-b border-border flex-wrap">
        <div className="flex items-center gap-2">
          <UserPlus size={16} className="text-indigo-600" />
          <span className="text-sm font-semibold">Cần gán designer</span>
          <span className="text-[11px] text-muted-foreground">
            — {total} đơn (chưa gán / trả lại / làm lại chưa ôm, đã soát ≠ ok)
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
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <UserPlus size={13} />
              Gán design ({selectedCount})
            </Button>
          </div>
        )}
      </div>

      {!loading && groups.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">
          Không có đơn cần gán trong khoảng đã chọn.
        </p>
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
                  <button
                    type="button"
                    onClick={() => toggleExpand(g.key)}
                    className="text-muted-foreground shrink-0"
                  >
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
                  <button
                    type="button"
                    onClick={() => toggleExpand(g.key)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="text-sm font-medium truncate">{g.fullName}</div>
                    {g.shortName && (
                      <div className="text-[10px] text-muted-foreground">{g.shortName}</div>
                    )}
                  </button>
                  <Badge variant="secondary" className="shrink-0">
                    {g.count} đơn
                  </Badge>
                </div>

                {/* Orders */}
                {isOpen && (
                  <div className="overflow-x-auto bg-muted/10">
                    <table className="w-full text-[13px]">
                      <tbody>
                        {g.orders.map((o: AssignBacklogOrder) => (
                          <tr key={o._id} className="border-t border-border/40 hover:bg-muted/30">
                            <td className="w-8 px-3 py-1.5">
                              <input
                                type="checkbox"
                                className="size-4 cursor-pointer"
                                checked={selected.has(o._id)}
                                onChange={() => toggleOrder(o._id)}
                              />
                            </td>
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
                                <span className="font-medium">{o.productionId}</span>
                                <CopyButton value={o.productionId} label="Production ID" iconSize={11} />
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                              {o.size || '—'}
                              {o.color ? ` / ${o.color}` : ''}
                            </td>
                            <td className="px-2 py-1.5">
                              {o.toolResultNote ? (
                                <Badge variant="outline" className="text-rose-600 border-rose-300 font-normal">
                                  {noteName(o.toolResultNote)}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground/40">·</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {(() => {
                                const m = STATUS_META[o.designerStatus || ''] || {
                                  label: o.designerStatus || '—',
                                  cls: 'text-muted-foreground',
                                };
                                return (
                                  <Badge variant="outline" className={cn('font-normal', m.cls)}>
                                    {m.label}
                                  </Badge>
                                );
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
  );
}
