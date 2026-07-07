import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Send, Wrench } from 'lucide-react';
import type { PersonErrorRow } from 'shared';

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
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { DATE_PRESETS } from '@/utils/dateRangePresets';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';

interface PersonErrorOrderRow {
  _id: string;
  productionId: string;
  type?: string;
  size?: string;
  color?: string;
  quantity?: number;
  mockupUrl?: string;
  productionError?: string;
  productionErrorNote?: string;
  productionErrorSource?: string;
  currentFulfillmentStage?: string;
  designerStatus?: string;
  inProductionAt?: string;
}

function srcLabel(s?: string): string {
  if (s === 'designer') return 'Do designer';
  if (s === 'tool-check') return 'Do soát tool';
  if (s === 'factory') return 'Do xưởng';
  return '—';
}

/**
 * Dashboard tab "Lỗi theo người" — leaderboard 2 chiều:
 *  - Đang cần fix (bị quy lỗi / phải sửa): đơn lỗi đang đứng ở công đoạn người đó.
 *  - Đã báo lỗi: số lần người đó đẩy đơn về (chiều phát hiện) trong kỳ.
 * Click 1 dòng → xổ list đơn lỗi đang cần người đó sửa (drill-down theo inProductionAt).
 */
export default function PersonErrorTab() {
  const last7 = DATE_PRESETS.find((p) => p.key === 'last-7d')!.range();
  const [dateFrom, setDateFrom] = useState(() => last7.from);
  const [dateTo, setDateTo] = useState(() => last7.to);
  const [rows, setRows] = useState<PersonErrorRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [drillRows, setDrillRows] = useState<PersonErrorOrderRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await RepositoryRemote.designer.personErrorOverview({ from: dateFrom, to: dateTo });
      setRows((res.data?.data?.rows ?? []) as PersonErrorRow[]);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const toggleRow = useCallback(
    async (userId: string) => {
      if (expanded === userId) {
        setExpanded(null);
        setDrillRows([]);
        return;
      }
      setExpanded(userId);
      setDrillRows([]);
      setDrillLoading(true);
      try {
        const res = await RepositoryRemote.designer.personErrorOrders({
          userId,
          from: dateFrom,
          to: dateTo,
        });
        setDrillRows((res.data?.data ?? []) as PersonErrorOrderRow[]);
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setDrillLoading(false);
      }
    },
    [expanded, dateFrom, dateTo],
  );

  const totals = useMemo(
    () => ({
      needFix: rows.reduce((s, r) => s + r.needFixCount, 0),
      reported: rows.reduce((s, r) => s + r.reportedCount, 0),
    }),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => {
            setDateFrom(f);
            setDateTo(t);
          }}
        />
        <Button variant="outline" size="sm" onClick={() => void fetchOverview()} disabled={loading}>
          {loading ? <Spinner size={14} className="mr-1.5" /> : <RefreshCw size={14} className="mr-1.5" />}
          Tải lại
        </Button>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
            <Wrench size={15} /> Đang cần fix: <strong>{totals.needFix}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <Send size={15} /> Đã báo: <strong>{totals.reported}</strong>
          </span>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Người</TableHead>
              <TableHead>Vai trò / Công đoạn</TableHead>
              <TableHead className="text-right">Đang cần fix</TableHead>
              <TableHead className="text-right">Đã báo lỗi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Không có lỗi trong kỳ.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const isOpen = expanded === r.userId;
              return (
                <React.Fragment key={r.userId}>
                  <TableRow
                    className="cursor-pointer hover:bg-accent/40"
                    onClick={() => void toggleRow(r.userId)}
                  >
                    <TableCell className="text-muted-foreground">
                      {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.roleLabel}</TableCell>
                    <TableCell className="text-right">
                      {r.needFixCount > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                          <AlertTriangle size={13} /> {r.needFixCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.reportedCount > 0 ? (
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {r.reportedCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={5} className="p-0">
                        <DrillPanel loading={drillLoading} rows={drillRows} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DrillPanel({ loading, rows }: { loading: boolean; rows: PersonErrorOrderRow[] }) {
  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
        <Spinner size={14} /> Đang tải đơn cần fix…
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">Không còn đơn nào cần fix.</div>;
  }
  return (
    <div className="p-3 space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground px-1">
        Đơn lỗi đang cần fix ({rows.length})
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((o) => (
          <div key={o._id} className="rounded-md border bg-card p-2 flex gap-2 text-xs">
            {o.mockupUrl ? (
              <img
                src={o.mockupUrl}
                alt=""
                className="w-10 h-10 rounded object-cover border bg-checker shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded border bg-muted shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-mono font-semibold truncate">{o.productionId}</div>
              <div className="text-muted-foreground truncate">
                {[o.type, o.size, o.color].filter(Boolean).join(' · ')}
              </div>
              <div className="text-rose-600 dark:text-rose-400 truncate" title={o.productionErrorNote}>
                {srcLabel(o.productionErrorSource)}
                {o.productionErrorNote ? ` · ${o.productionErrorNote}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
