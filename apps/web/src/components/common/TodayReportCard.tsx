import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Inbox,
  Layers,
  RefreshCw,
  RotateCw,
} from 'lucide-react';
import type { TodayReport, TodayReportOrder } from 'shared';

import { Spinner } from '@/components/common/Spinner';
import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

export type TodayReportTileKey =
  | 'received'
  | 'completed'
  | 'reworkDone'
  | 'errorsFound'
  | 'backlog';

interface TileMeta {
  label: string;
  icon: React.ElementType;
  /** class cho số + icon khi active. */
  accent: string;
  ring: string;
}

const TILE_META: Record<TodayReportTileKey, TileMeta> = {
  received: {
    label: 'Đã nhận',
    icon: Inbox,
    accent: 'text-indigo-600 dark:text-indigo-400',
    ring: 'ring-indigo-400/70 bg-indigo-50/60 dark:bg-indigo-500/10',
  },
  completed: {
    label: 'Làm được',
    icon: CheckCircle2,
    accent: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-400/70 bg-emerald-50/60 dark:bg-emerald-500/10',
  },
  reworkDone: {
    label: 'Đã sửa lại',
    icon: RotateCw,
    accent: 'text-sky-600 dark:text-sky-400',
    ring: 'ring-sky-400/70 bg-sky-50/60 dark:bg-sky-500/10',
  },
  errorsFound: {
    label: 'Tìm được lỗi',
    icon: AlertTriangle,
    accent: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-400/70 bg-rose-50/60 dark:bg-rose-500/10',
  },
  backlog: {
    label: 'Còn tồn',
    icon: Layers,
    accent: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-400/70 bg-amber-50/60 dark:bg-amber-500/10',
  },
};

interface TodayReportCardProps {
  title: string;
  /** Hàm fetch báo cáo — page truyền RepositoryRemote tương ứng. */
  fetcher: () => Promise<TodayReport>;
  /** Các ô hiển thị (theo thứ tự) — cấu hình theo từng nơi. */
  tiles: TodayReportTileKey[];
  /** Bump để refetch (vd sau khi transition đơn). */
  reloadToken?: number;
}

/**
 * "Báo cáo hôm nay" dùng chung: dãy ô số bấm được → bấm ô nào thì list đơn của
 * ô đó hiện ngay bên dưới. Component tự fetch qua `fetcher`. Ô "Còn tồn" hiển
 * thị 2 số (hôm nay / tổng), list mở = tổng tồn.
 */
export function TodayReportCard({ title, fetcher, tiles, reloadToken }: TodayReportCardProps) {
  const [report, setReport] = useState<TodayReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<TodayReportTileKey | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetcher();
      setReport(data);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
    // fetcher là closure ổn định do page tạo — không đưa vào deps để tránh loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const valueFor = (key: TodayReportTileKey): number => {
    if (!report) return 0;
    const c = report.counts;
    switch (key) {
      case 'received':
        return c.received;
      case 'completed':
        return c.completed;
      case 'reworkDone':
        return c.reworkDone;
      case 'errorsFound':
        return c.errorsFound ?? 0;
      case 'backlog':
        return c.backlogTotal;
    }
  };

  const listFor = (key: TodayReportTileKey): TodayReportOrder[] => {
    if (!report) return [];
    switch (key) {
      case 'received':
        return report.lists.received;
      case 'completed':
        return report.lists.completed;
      case 'reworkDone':
        return report.lists.reworkDone;
      case 'errorsFound':
        return report.lists.errorsFound ?? [];
      case 'backlog':
        return report.lists.backlog;
    }
  };

  const activeList = useMemo(
    () => (selected ? listFor(selected) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, report],
  );

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          {title}
          {report && (
            <span className="text-xs font-normal text-muted-foreground">
              · {dayjs(report.day).format('DD/MM/YYYY')}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          title="Tải lại"
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Tiles */}
          <div
            className={cn(
              'grid gap-2',
              tiles.length <= 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
            )}
          >
            {tiles.map((key) => {
              const meta = TILE_META[key];
              const Icon = meta.icon;
              const active = selected === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected((cur) => (cur === key ? null : key))}
                  className={cn(
                    'rounded-md border border-border bg-background p-2.5 text-left transition-all hover:shadow-sm',
                    active && `ring-2 ${meta.ring}`,
                  )}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <Icon size={13} className={meta.accent} />
                    {meta.label}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className={cn('text-2xl font-bold leading-none', meta.accent)}>
                      {loading && !report ? '—' : valueFor(key)}
                    </span>
                    {key === 'backlog' && report && (
                      <span className="text-[10px] text-muted-foreground">
                        hôm nay {report.counts.backlogToday}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Danh sách đơn của ô đang chọn */}
          {selected && (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/40 text-[11px] font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {React.createElement(TILE_META[selected].icon, {
                    size: 12,
                    className: TILE_META[selected].accent,
                  })}
                  {TILE_META[selected].label}
                  <span className="text-muted-foreground font-normal">({activeList.length})</span>
                </span>
              </div>
              {activeList.length === 0 ? (
                <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                  {loading ? <Spinner size={16} className="mx-auto text-primary" /> : 'Không có đơn nào.'}
                </div>
              ) : (
                <ul className="divide-y divide-border max-h-[42vh] overflow-y-auto">
                  {activeList.map((o) => (
                    <ReportRow key={o._id} order={o} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function smallThumb(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.includes('/designs/preview/')) return url.replace('/designs/preview/', '/designs/thumb/');
  return url;
}

function ReportRow({ order }: { order: TodayReportOrder }) {
  const thumb = smallThumb(order.mockupUrl);
  return (
    <li className="flex items-center gap-2.5 px-2.5 py-2">
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="w-9 h-9 rounded border border-border object-contain bg-checker shrink-0"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-9 h-9 rounded border border-dashed border-border bg-muted/40 flex items-center justify-center text-muted-foreground shrink-0">
          <ImageIcon size={14} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-mono text-xs font-semibold truncate">{order.productionId}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {order.type || '—'}
          {order.size && <> · {order.size}</>}
          {order.color && <> · {order.color}</>}
          {order.userSku && <> · {order.userSku}</>}
        </div>
      </div>
      {order.at && (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {dayjs(order.at).format('HH:mm')}
        </span>
      )}
    </li>
  );
}
