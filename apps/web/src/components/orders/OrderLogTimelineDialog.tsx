import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, History, RefreshCw } from 'lucide-react';
import type { FulfillmentStage, ProductionOrderLog, ProductionOrderLogAction } from 'shared';
import { FULFILLMENT_STAGE_LABELS, WorkshopConfigCategory } from 'shared';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId?: string;
  productionId?: string;
}

const ACTION_BADGE: Record<
  ProductionOrderLogAction,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline' }
> = {
  create: { label: 'Tạo', variant: 'success' },
  update: { label: 'Cập nhật', variant: 'default' },
  bulk_update: { label: 'Bulk', variant: 'default' },
  import: { label: 'Import', variant: 'outline' },
  delete: { label: 'Xóa', variant: 'destructive' },
  transfer: { label: 'Chuyển xưởng', variant: 'warning' },
  cancel: { label: 'Hủy đơn', variant: 'destructive' },
  update_design: { label: 'Đổi design', variant: 'default' },
  hold: { label: 'Giữ đơn', variant: 'warning' },
  unhold: { label: 'Mở giữ', variant: 'success' },
};

// Import log ghi `after` = object tóm tắt (productionId/type/isMapped/_subAction).
// `_subAction` = đơn được tạo mới hay cập nhật trong lần import.
const IMPORT_SUBACTION: Record<string, { label: string; variant: 'default' | 'success' }> = {
  create: { label: 'Tạo mới', variant: 'success' },
  update: { label: 'Cập nhật', variant: 'default' },
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
  designerStatus: 'TT Designer',
  fabricType: 'Loại vải',
  machineNumber: 'Máy',
  productionError: 'Lỗi xưởng',
  productionErrorNote: 'Mô tả lỗi xưởng',
  productionErrorSource: 'Nguồn lỗi',
  cancelledAt: 'Hủy đơn',
  heldAt: 'Giữ đơn',
  designs: 'Design',
  designsOriginal: 'Design gốc',
  mockupUrl: 'Mockup',
  // Field bị re-import (importOrders) ghi đè — xem OrderLog.md §4.
  factoryId: 'Xưởng',
  machineTypeId: 'Loại máy',
  type: 'Loại sản phẩm',
  color: 'Màu',
  size: 'Size',
  quantity: 'Số lượng',
  status: 'Trạng thái đơn (OnosPod)',
};

// Field nào resolve code→name (+ color) qua workshop_config store.
const FIELD_CATEGORY: Record<string, WorkshopConfigCategory> = {
  printStatus: WorkshopConfigCategory.PrintStatus,
  printStatusNote: WorkshopConfigCategory.PrintStatusNote,
  toolResult: WorkshopConfigCategory.ToolResult,
  toolResultNote: WorkshopConfigCategory.ToolResultNote,
  errorFile: WorkshopConfigCategory.ErrorFileType,
  assigneeNote: WorkshopConfigCategory.AssigneeNote,
  fabricType: WorkshopConfigCategory.FabricType,
  machineNumber: WorkshopConfigCategory.Machine,
  productionError: WorkshopConfigCategory.ProductionError,
};

// designerStatus là enum → nhãn + màu tiếng Việt (không phải workshop_config).
const DESIGNER_STATUS_LABELS: Record<string, string> = {
  unassigned: 'Chưa gán',
  assigned: 'Đã gán',
  'in-progress': 'Đang làm',
  done: 'Đã xong',
  rejected: 'Không làm được',
  rework: 'Cần làm lại',
};
const DESIGNER_STATUS_COLOR: Record<string, string> = {
  unassigned: '#a1a1aa',
  assigned: '#71717a',
  'in-progress': '#6366f1',
  done: '#10b981',
  rejected: '#f43f5e',
  rework: '#f59e0b',
};
const SOURCE_COLOR: Record<string, string> = { designer: '#8b5cf6', factory: '#0ea5e9' };

// Trạng thái công đoạn fulfillment (waiting/in-progress/done/rework) → nhãn + màu.
const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  waiting: 'Chờ làm',
  'in-progress': 'Đang làm',
  done: 'Đã xong',
  rework: 'Cần làm lại',
};
const FULFILLMENT_STATUS_COLOR: Record<string, string> = {
  waiting: '#a1a1aa',
  'in-progress': '#6366f1',
  done: '#10b981',
  rework: '#f59e0b',
};
// Field key dạng `fulfillmentStages.<stage>.status` (log của Task Fulfillment).
const FULFILLMENT_STAGE_STATUS_RE = /^fulfillmentStages\.(.+)\.status$/;

/** Nhãn tiếng Việt cho field key (gồm key động của fulfillment stage). */
function fieldLabelFor(field: string): string {
  const m = field.match(FULFILLMENT_STAGE_STATUS_RE);
  if (m) {
    const stage = m[1] as FulfillmentStage;
    return `Công đoạn ${FULFILLMENT_STAGE_LABELS[stage] || m[1]}`;
  }
  if (field === 'currentFulfillmentStage') return 'Công đoạn hiện tại';
  return FIELD_LABEL[field] || field;
}

/** Style tint từ hex `#rrggbb` — chữ = color, nền = color 12% (8-digit hex). */
function tintStyle(color?: string): React.CSSProperties | undefined {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return undefined;
  return { color, backgroundColor: `${color}1f` };
}

/** Nhãn đẹp cho key snapshot của update_design (`mockupUrl`, `designs.front`, …). */
function designFieldLabel(key: string): string {
  if (key === 'mockupUrl') return 'Mockup';
  return key.replace(/^designs\./, '');
}

/** Ghép before/after (object keyed theo field) thành list URL cũ→mới. */
function designChangeEntries(before: unknown, after: unknown): { key: string; before: string; after: string }[] {
  const b = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  return keys.map((key) => ({
    key,
    before: b[key] == null ? '' : String(b[key]),
    after: a[key] == null ? '' : String(a[key]),
  }));
}

function formatDate(d: Date | string | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('vi-VN', { hour12: false });
}

type Display = { text: string; color?: string };

/** Pill trạng thái — có màu (tint) nếu resolve được, `strike` cho giá trị cũ. */
function StatusPill({ text, color, strike }: { text: string; color?: string; strike?: boolean }) {
  const tint = strike ? undefined : tintStyle(color);
  return (
    <span
      style={tint}
      className={cn(
        'px-1.5 py-0.5 rounded text-[13px]',
        strike && 'bg-muted/60 text-muted-foreground line-through decoration-muted-foreground/40',
        !strike && !tint && 'bg-emerald-50 text-emerald-700 font-medium dark:bg-emerald-500/10 dark:text-emerald-300',
        !strike && tint && 'font-medium',
      )}
    >
      {text || '—'}
    </span>
  );
}

function DiffRow({ before, after }: { before: Display; after: Display }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <StatusPill text={before.text} color={before.color} strike />
      <ArrowRight size={13} className="text-muted-foreground shrink-0" />
      <StatusPill text={after.text} color={after.color} />
    </div>
  );
}

export function OrderLogTimelineDialog({ open, onOpenChange, orderId, productionId }: Props) {
  const [logs, setLogs] = useState<ProductionOrderLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Store để resolve code → name + color (workshop_config). Assignee đã được BE
  // resolve sang tên sẵn trong response nên FE không cần user store.
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);
  const resolve = useWorkshopConfigStore((s) => s.resolve);

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
      if (!configLoaded) loadConfig();
    } else if (!open) {
      setLogs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  // Resolve 1 giá trị field → { tên hiển thị, màu } (KHÔNG hiện code cho user).
  const resolveDisplay = (field: string | undefined, value: unknown): Display => {
    if (value === null || value === undefined || value === '') return { text: '—' };
    if (Array.isArray(value)) {
      const parts = value.map((v) => resolveDisplay(field, v).text).filter((s) => s && s !== '—');
      return { text: parts.length ? parts.join(', ') : '—' };
    }
    if (typeof value === 'object') return { text: JSON.stringify(value) };
    const raw = String(value);
    if (!field) return { text: raw };
    if (field === 'designerStatus') {
      return { text: DESIGNER_STATUS_LABELS[raw] || raw, color: DESIGNER_STATUS_COLOR[raw] };
    }
    if (field === 'productionErrorSource') {
      const text = raw === 'designer' ? 'Do designer' : raw === 'factory' ? 'Do xưởng' : raw;
      return { text, color: SOURCE_COLOR[raw] };
    }
    if (field === 'currentFulfillmentStage') {
      return { text: FULFILLMENT_STAGE_LABELS[raw as FulfillmentStage] || raw };
    }
    if (FULFILLMENT_STAGE_STATUS_RE.test(field)) {
      return { text: FULFILLMENT_STATUS_LABELS[raw] || raw, color: FULFILLMENT_STATUS_COLOR[raw] };
    }
    const cat = FIELD_CATEGORY[field];
    if (cat) {
      const cfg = resolve(cat, raw);
      return { text: cfg?.name || raw, color: cfg?.color || undefined };
    }
    return { text: raw };
  };

  // Import: `after` là object tóm tắt → render dễ đọc (không dump JSON).
  const renderImportPayload = (after: unknown): React.ReactNode => {
    if (after == null) return null;
    if (typeof after !== 'object') {
      return <div className="text-xs text-muted-foreground">{String(after)}</div>;
    }
    const o = after as Record<string, unknown>;
    const sub = typeof o._subAction === 'string' ? IMPORT_SUBACTION[o._subAction] : undefined;
    const pid = o.productionId != null ? String(o.productionId) : undefined;
    const type = o.type != null ? String(o.type) : undefined;
    const isMapped = typeof o.isMapped === 'boolean' ? (o.isMapped as boolean) : undefined;
    // Các key khác (nếu có) — hiển thị "label: name" để không giấu thông tin.
    const rest = Object.entries(o).filter(
      ([k]) => !k.startsWith('_') && !['productionId', 'type', 'isMapped'].includes(k),
    );
    return (
      <div className="space-y-1 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {sub && <Badge variant={sub.variant}>{sub.label}</Badge>}
          {pid && <span className="font-mono text-foreground">{pid}</span>}
          {type && <span className="text-muted-foreground">· {type}</span>}
          {isMapped !== undefined && (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] font-medium',
                isMapped
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
              )}
            >
              {isMapped ? 'Đã map sản phẩm' : 'Chưa map sản phẩm'}
            </span>
          )}
        </div>
        {rest.map(([k, v]) => (
          <div key={k} className="text-muted-foreground">
            {fieldLabelFor(k)}: <span className="text-foreground">{resolveDisplay(k, v).text}</span>
          </div>
        ))}
      </div>
    );
  };

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
            <div className="space-y-2">
              {logs.map((log) => {
                const meta = ACTION_BADGE[log.action as ProductionOrderLogAction] || ACTION_BADGE.update;
                const fieldLabel = log.field ? fieldLabelFor(log.field) : null;
                const isFieldUpdate = !!log.field && (log.action === 'update' || log.action === 'bulk_update');
                return (
                  <div key={log._id} className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-1.5">
                    {/* Header: action + field + thời gian */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        {fieldLabel && (
                          <span className="text-sm font-semibold text-foreground truncate">{fieldLabel}</span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>

                    {/* Field update: diff cũ → mới (đã resolve name + màu) */}
                    {isFieldUpdate && (
                      <DiffRow
                        before={resolveDisplay(log.field, log.before)}
                        after={resolveDisplay(log.field, log.after)}
                      />
                    )}

                    {/* Đổi design: before/after là object keyed theo field
                        (mockupUrl / designs.front / ...) → render từng URL cũ→mới. */}
                    {log.action === 'update_design' && (
                      <div className="space-y-2">
                        {designChangeEntries(log.before, log.after).map(({ key, before, after }) => (
                          <div key={key} className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">{designFieldLabel(key)}</span>
                            <div className="text-[11px] font-mono break-all leading-relaxed">
                              <span className="text-destructive line-through">{before || '—'}</span>
                              <span className="mx-1 text-muted-foreground">→</span>
                              <span className="text-emerald-600 dark:text-emerald-400">{after || '—'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Hủy đơn: after = lý do. */}
                    {log.action === 'cancel' && (
                      <div className="text-[13px] rounded bg-rose-50 dark:bg-rose-500/10 px-2 py-1">
                        <span className="text-muted-foreground">Lý do: </span>
                        <span className="text-foreground">{resolveDisplay(undefined, log.after).text}</span>
                      </div>
                    )}

                    {log.action === 'import' && log.after != null && renderImportPayload(log.after)}

                    {/* Meta: người thực hiện · role · ip */}
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                      <span className="font-medium text-foreground/70">
                        {log.userName || log.userEmail || 'system'}
                      </span>
                      {log.roleCode && <span>· {log.roleCode}</span>}
                      {log.ip && <span>· {log.ip}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
