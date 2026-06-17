import React, { useEffect, useMemo, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import type { ProductionOrderLog, ProductionOrderLogAction } from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId?: string;
  productionId?: string;
}

const ACTION_BADGE: Record<ProductionOrderLogAction, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline' }> = {
  create: { label: 'Tạo', variant: 'success' },
  update: { label: 'Cập nhật', variant: 'default' },
  bulk_update: { label: 'Bulk', variant: 'default' },
  import: { label: 'Import', variant: 'outline' },
  delete: { label: 'Xóa', variant: 'destructive' },
  transfer: { label: 'Chuyển xưởng', variant: 'warning' },
};

const FIELD_LABEL: Record<string, string> = {
  printStatus: 'Trạng thái in',
  printStatusNote: 'Note trạng thái in',
  toolResult: 'Kết quả Tool',
  toolResultNote: 'Note kết quả Tool',
  errorFile: 'File sửa lỗi',
  errorFileNote: 'Ghi chú file lỗi',
  assignee: 'Người thực hiện',
  assigneeNote: 'Note người thực hiện',
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function formatDate(d: Date | string | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('vi-VN', { hour12: false });
}

export function OrderLogTimelineDialog({ open, onOpenChange, orderId, productionId }: Props) {
  const [logs, setLogs] = useState<ProductionOrderLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      const res = await RepositoryRemote.order.getLogs(orderId, '?page=1&limit=200&order=desc');
      setLogs(res.data?.data || []);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && orderId) {
      fetchLogs();
    } else if (!open) {
      setLogs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const headerLabel = useMemo(() => {
    if (productionId) return `Lịch sử thay đổi — ${productionId}`;
    return 'Lịch sử thay đổi';
  }, [productionId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History size={18} className="text-muted-foreground" />
            {headerLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{logs.length} bản ghi</span>
          <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Tải lại
          </Button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1">
          {loading && logs.length === 0 && (
            <div className="flex items-center justify-center py-10">
              <Spinner size={20} className="text-muted-foreground" />
            </div>
          )}

          {!loading && logs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">Chưa có lịch sử thay đổi.</p>
          )}

          {logs.length > 0 && (
            <ol className="relative border-l border-border ml-3">
              {logs.map((log) => {
                const meta = ACTION_BADGE[log.action as ProductionOrderLogAction] || ACTION_BADGE.update;
                const fieldLabel = log.field ? FIELD_LABEL[log.field] || log.field : null;
                return (
                  <li key={log._id} className="ml-4 pb-4 last:pb-0">
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        {fieldLabel && (
                          <span className="text-sm font-medium text-foreground">{fieldLabel}</span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>

                    {log.field && (log.action === 'update' || log.action === 'bulk_update') && (
                      <div className="text-xs font-mono bg-muted/50 rounded px-2 py-1.5 mb-1">
                        <span className="text-destructive line-through">{formatValue(log.before)}</span>
                        <span className="mx-2 text-muted-foreground">→</span>
                        <span className="text-emerald-600 dark:text-emerald-400">{formatValue(log.after)}</span>
                      </div>
                    )}

                    {log.action === 'import' && log.after && (
                      <div className="text-xs font-mono text-muted-foreground bg-muted/50 rounded px-2 py-1.5 mb-1">
                        {formatValue(log.after)}
                      </div>
                    )}

                    <div className="text-[11px] text-muted-foreground">
                      {log.userName || log.userEmail || 'system'}
                      {log.roleCode && <> · <span className="text-foreground/70">{log.roleCode}</span></>}
                      {log.ip && <> · {log.ip}</>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
