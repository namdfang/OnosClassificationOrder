import React, { useState } from 'react';
import { toast } from 'sonner';
import type { OrderWorkshopField, WorkshopConfigCategory } from 'shared';

import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { cn } from '@/utils/cn';
import { handleAxiosError } from '@/utils';

import { LucideIcon } from '@/pages/workshop-config/IconPicker';
import { SelectPopover } from './SelectPopover';

interface Props {
  orderId: string;
  field: OrderWorkshopField;
  category: WorkshopConfigCategory;
  value?: string | null;
  canEdit: boolean;
  onUpdated?: (newValue: string | null) => void;
}

export function IconSelectCell({ orderId, field, category, value, canEdit, onUpdated }: Props) {
  const items = useWorkshopConfigStore((s) => s.byCategory[category] || []);
  const resolve = useWorkshopConfigStore((s) => s.resolve);
  const current = resolve(category, value || undefined);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (newCode: string | null) => {
    if (newCode === (value || null)) return;
    try {
      setSaving(true);
      await RepositoryRemote.order.updateField(orderId, { field, value: newCode });
      toast.success(newCode ? `Đã đổi → ${resolve(category, newCode)?.name || newCode}` : 'Đã bỏ chọn');
      onUpdated?.(newCode);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const trigger = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap',
        current ? 'bg-accent/60 text-foreground' : 'text-muted-foreground',
      )}
      title={current?.name}
    >
      {saving ? <Spinner size={10} className="text-current" /> : <LucideIcon name={current?.icon} size={12} />}
      <span className="truncate max-w-[100px]">{current?.name || '—'}</span>
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
          <LucideIcon name={it.icon} size={13} />
          {it.name}
        </span>
      )}
    >
      {trigger}
    </SelectPopover>
  );
}
