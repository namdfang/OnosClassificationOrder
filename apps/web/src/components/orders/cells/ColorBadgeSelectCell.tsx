import React, { useState } from 'react';
import type { OrderWorkshopField, WorkshopConfigCategory } from 'shared';
import { toast } from 'sonner';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { SelectPopover } from './SelectPopover';

interface Props {
  orderId: string;
  field: OrderWorkshopField;
  category: WorkshopConfigCategory;
  value?: string | null;
  canEdit: boolean;
  onUpdated?: (newValue: string | null) => void;
}

/**
 * Badge filled with workshop_config.color. Click → select popover → PATCH.
 * Toast success / error; rollback handled by re-fetch via `onUpdated` callback.
 */
export function ColorBadgeSelectCell({ orderId, field, category, value, canEdit, onUpdated }: Props) {
  const items = useWorkshopConfigStore((s) => s.byCategory[category] || []);
  const resolve = useWorkshopConfigStore((s) => s.resolve);
  const current = resolve(category, value || undefined);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (newCode: string | null) => {
    if (newCode === (value || null)) return;
    try {
      setSaving(true);
      await RepositoryRemote.order.updateField(orderId, { field, value: newCode });
      toast.success(
        current?.name && newCode ? `Đã đổi → ${resolve(category, newCode)?.name || newCode}` : 'Đã cập nhật',
      );
      onUpdated?.(newCode);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const badgeStyle = current?.color
    ? { backgroundColor: current.color, color: '#fff', borderColor: current.color }
    : undefined;

  const trigger = (
    <span
      title={current?.name || 'Chưa chọn'}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap',
        !current && 'bg-muted text-muted-foreground border-dashed border-border',
      )}
      style={badgeStyle}
    >
      {saving && <Spinner size={10} className="text-current" />}
      {current?.name || '—'}
    </span>
  );

  return (
    <SelectPopover
      options={items}
      value={value || undefined}
      onSelect={handleSelect}
      disabled={!canEdit || saving}
      renderOption={(it) => (
        <span className="inline-flex items-center gap-2 w-full">
          <span className="inline-block w-3 h-3 rounded shrink-0" style={{ backgroundColor: it.color || '#888' }} />
          <span className="flex-1">{it.name}</span>
          {it.errorSource && <ErrorSourceTag source={it.errorSource} />}
        </span>
      )}
    >
      {trigger}
    </SelectPopover>
  );
}

function ErrorSourceTag({ source }: { source: 'designer' | 'factory' | 'tool-check' }) {
  if (source === 'designer') {
    return (
      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
        DES
      </span>
    );
  }
  if (source === 'tool-check') {
    return (
      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
        SOÁT TOOL
      </span>
    );
  }
  return (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
      XƯỞNG
    </span>
  );
}
