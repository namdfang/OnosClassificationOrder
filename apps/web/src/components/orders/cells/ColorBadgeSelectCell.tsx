import React, { useState } from 'react';
import { toast } from 'sonner';
import type { OrderWorkshopField, WorkshopConfigCategory } from 'shared';

import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { cn } from '@/utils/cn';
import { handleAxiosError } from '@/utils';

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
      toast.success(current?.name && newCode ? `Đã đổi → ${resolve(category, newCode)?.name || newCode}` : 'Đã cập nhật');
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
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: it.color || '#888' }} />
          {it.name}
        </span>
      )}
    >
      {trigger}
    </SelectPopover>
  );
}
