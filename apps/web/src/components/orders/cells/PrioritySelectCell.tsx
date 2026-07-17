import React, { useState } from 'react';
import { toast } from 'sonner';
import { ORDER_PRIORITIES, ORDER_PRIORITY_LABELS, OrderPriority } from 'shared';

import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { cn } from '@/utils/cn';
import { handleAxiosError } from '@/utils';

import { SelectPopover, type SelectOption } from './SelectPopover';

export const PRIORITY_META: Record<OrderPriority, { label: string; cls: string; dot: string }> = {
  [OrderPriority.Low]: {
    label: ORDER_PRIORITY_LABELS[OrderPriority.Low],
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    dot: '#3b82f6',
  },
  [OrderPriority.Normal]: {
    label: ORDER_PRIORITY_LABELS[OrderPriority.Normal],
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    dot: '#f59e0b',
  },
  [OrderPriority.High]: {
    label: ORDER_PRIORITY_LABELS[OrderPriority.High],
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    dot: '#ef4444',
  },
};

const PRIORITY_OPTIONS: SelectOption[] = ORDER_PRIORITIES.map((p) => ({
  _id: String(p),
  code: String(p),
  name: PRIORITY_META[p].label,
  color: PRIORITY_META[p].dot,
}));

/** Badge đọc-only cho card Kanban — không có popover chỉnh sửa. */
export function PriorityBadge({ priority }: { priority?: OrderPriority | number | null }) {
  if (!priority) return null;
  const meta = PRIORITY_META[priority as OrderPriority];
  if (!meta) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap',
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

interface Props {
  orderId: string;
  value?: OrderPriority | number | null;
  canEdit: boolean;
  onUpdated?: (newValue: number | null) => void;
}

/**
 * Cell "Ưu tiên" — 3 mức cố định (không qua workshop_config). Cùng pattern
 * `ColorBadgeSelectCell`/`AssigneeSelectCell`: badge trigger + `SelectPopover`,
 * PATCH qua `updateField` field `priority`.
 */
export function PrioritySelectCell({ orderId, value, canEdit, onUpdated }: Props) {
  const [saving, setSaving] = useState(false);
  const current = value ? PRIORITY_META[value as OrderPriority] : undefined;

  const handleSelect = async (newCode: string | null) => {
    const newValue = newCode ? Number(newCode) : null;
    if (newValue === (value || null)) return;
    try {
      setSaving(true);
      await RepositoryRemote.order.updateField(orderId, { field: 'priority', value: newCode });
      toast.success(
        newValue ? `Đã đổi → ${PRIORITY_META[newValue as OrderPriority].label}` : 'Đã bỏ ưu tiên',
      );
      onUpdated?.(newValue);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const trigger = (
    <span
      title={current?.label || 'Chưa chọn'}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-transparent whitespace-nowrap',
        current ? current.cls : 'bg-muted text-muted-foreground border-dashed border-border',
      )}
    >
      {saving && <Spinner size={10} className="text-current" />}
      {current?.label || '—'}
    </span>
  );

  return (
    <SelectPopover
      options={PRIORITY_OPTIONS}
      value={value ? String(value) : undefined}
      onSelect={handleSelect}
      disabled={!canEdit || saving}
      renderOption={(it) => (
        <span className="inline-flex items-center gap-2 w-full">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: it.color }}
          />
          <span className="flex-1">{it.name}</span>
        </span>
      )}
    >
      {trigger}
    </SelectPopover>
  );
}
