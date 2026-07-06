import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Search,
  User,
} from 'lucide-react';
import type { DesignerBacklogDay, DesignerBacklogRow } from 'shared';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Click 1 ngày (hoặc 1 trạng thái) → parent set filter (assignee + ngày
   *  [+ status]) + đóng modal. `status` rỗng = mọi trạng thái. */
  onDrillDay: (userId: string, day: string, status?: string) => void;
}

type BacklogData = {
  total: number;
  oldestDay: string | null;
  designers: DesignerBacklogRow[];
};

const STATUS_META: Array<{
  key: keyof DesignerBacklogDay['byStatus'];
  /** Mã filter `designerStatus` để drill bảng. */
  code: string;
  label: string;
  cls: string;
}> = [
  { key: 'unassigned', code: 'unassigned', label: 'Chưa gán', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' },
  { key: 'assigned', code: 'assigned', label: 'Đã gán', cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200' },
  { key: 'inProgress', code: 'in-progress', label: 'Đang làm', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  { key: 'rework', code: 'rework', label: 'Làm lại', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
];

/** Màu + nhãn theo tuổi đơn (ngày). */
function ageMeta(ageDays: number): { cls: string; label: string } {
  if (ageDays < 0) return { cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400', label: 'Không rõ ngày' };
  if (ageDays === 0) return { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', label: 'Hôm nay' };
  if (ageDays <= 2) return { cls: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300', label: `${ageDays} ngày` };
  if (ageDays <= 7) return { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: `${ageDays} ngày` };
  if (ageDays <= 15) return { cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', label: `${ageDays} ngày` };
  return { cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: `${ageDays} ngày` };
}

function fmtDay(day: string): string {
  if (day === '__nodate__') return 'Chưa có ngày SX';
  const [, m, d] = day.split('-');
  return d && m ? `${d}/${m}` : day;
}

export function DesignerBacklogDialog({ open, onClose, onDrillDay }: Props) {
  const [data, setData] = useState<BacklogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSearch('');
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.order.getDesignerBacklog();
        const d = (res.data?.data || null) as BacklogData | null;
        setData(d);
        // Mặc định mở designer tồn nhiều nhất (đầu list) cho dễ nhìn.
        setExpanded(new Set(d?.designers.slice(0, 1).map((x) => x.userId) || []));
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const designers = useMemo(() => {
    const list = data?.designers || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((d) => d.fullName.toLowerCase().includes(q));
  }, [data, search]);

  const allExpanded = designers.length > 0 && designers.every((d) => expanded.has(d.userId));
  const toggleAll = () =>
    setExpanded(allExpanded ? new Set() : new Set(designers.map((d) => d.userId)));

  const renderDesigner = (d: DesignerBacklogRow) => {
    const isOpen = expanded.has(d.userId);
    const oldest = ageMeta(d.oldestAgeDays);
    return (
      <div key={d.userId} className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => toggle(d.userId)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <User size={14} className="text-muted-foreground" />
          <span className="font-medium text-sm flex-1 truncate">{d.fullName}</span>
          {d.oldestDay && (
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', oldest.cls)}>
              cũ nhất {oldest.label}
            </span>
          )}
          <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-bold tabular-nums">
            {d.total} tồn
          </span>
        </button>

        {isOpen && (
          <div className="border-t border-border/60 divide-y divide-border/40">
            {d.days.map((day) => {
              const age = ageMeta(day.ageDays);
              return (
                <div
                  key={day.day}
                  className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/40 transition-colors"
                >
                  {/* Vùng ngày — drill mọi trạng thái của ngày đó. */}
                  <button
                    type="button"
                    onClick={() => onDrillDay(d.userId, day.day)}
                    className="flex items-center gap-2 shrink-0 text-left hover:opacity-70"
                    title="Xem tất cả task ngày này ở bảng"
                  >
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium w-[72px] text-center', age.cls)}>
                      {age.label}
                    </span>
                    <span className="font-mono font-medium w-12">{fmtDay(day.day)}</span>
                    <span className="font-bold tabular-nums w-14">{day.total} task</span>
                  </button>
                  {/* Chip trạng thái — drill đúng trạng thái đó. */}
                  <span className="flex flex-wrap gap-1 flex-1">
                    {STATUS_META.map((s) =>
                      day.byStatus[s.key] > 0 ? (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => onDrillDay(d.userId, day.day, s.code)}
                          className={cn('rounded px-1.5 py-0.5 text-[10px] hover:ring-1 hover:ring-primary/40', s.cls)}
                          title={`Lọc ${s.label} ngày này ở bảng`}
                        >
                          {s.label} {day.byStatus[s.key]}
                        </button>
                      ) : null,
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={16} className="text-primary" />
            Chi tiết tồn đọng theo ngày vào sản xuất
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={22} />
          </div>
        ) : !data || data.total === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            🎉 Không còn task tồn đọng.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Tổng <strong className="text-foreground">{data.total}</strong> task chưa xong
                {data.oldestDay && <> · cũ nhất {fmtDay(data.oldestDay)}</>}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={toggleAll}>
                  {allExpanded ? (
                    <>
                      <ChevronsDownUp size={13} className="mr-1" /> Thu gọn hết
                    </>
                  ) : (
                    <>
                      <ChevronsUpDown size={13} className="mr-1" /> Mở rộng hết
                    </>
                  )}
                </Button>
                <div className="relative w-44">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Tìm designer…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-7 h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="mt-2 flex-1 overflow-y-auto pr-1">
              {designers.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Không có designer khớp.</p>
              ) : (
                // 2 cột độc lập (round-robin) → chiều cao mỗi card không kéo lệch cột kia.
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                  <div className="space-y-2">
                    {designers.filter((_, i) => i % 2 === 0).map(renderDesigner)}
                  </div>
                  <div className="space-y-2">
                    {designers.filter((_, i) => i % 2 === 1).map(renderDesigner)}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
