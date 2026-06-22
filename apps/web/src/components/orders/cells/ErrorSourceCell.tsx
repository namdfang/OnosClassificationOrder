import React, { useState } from 'react';
import { toast } from 'sonner';

import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { cn } from '@/utils/cn';
import { handleAxiosError } from '@/utils';

import { SelectPopover } from './SelectPopover';

interface Props {
  orderId: string;
  value?: 'designer' | 'factory' | null;
  canEdit: boolean;
  onUpdated?: (v: 'designer' | 'factory' | null) => void;
}

const OPTIONS = [
  { _id: 'designer', code: 'designer', name: 'Do designer', color: '#7C3AED' },
  { _id: 'factory', code: 'factory', name: 'Do xưởng', color: '#0EA5E9' },
];

/**
 * Cell pick errorSource cho 1 đơn. Auto-fill từ workshop_config khi user set
 * productionError; user có thể override (vd. "Lỗi khác"). Empty = chưa phân loại.
 */
export function ErrorSourceCell({ orderId, value, canEdit, onUpdated }: Props) {
  const [saving, setSaving] = useState(false);

  const handleSelect = async (newVal: string | null) => {
    if (newVal === (value || null)) return;
    try {
      setSaving(true);
      await RepositoryRemote.order.updateField(orderId, {
        field: 'productionErrorSource',
        value: newVal,
      });
      toast.success(newVal ? `Đã đổi → ${newVal === 'designer' ? 'Do designer' : 'Do xưởng'}` : 'Đã bỏ chọn');
      onUpdated?.(newVal as 'designer' | 'factory' | null);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const display = value === 'designer'
    ? { label: 'Do designer', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' }
    : value === 'factory'
      ? { label: 'Do xưởng', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' }
      : null;

  const trigger = (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap',
        display ? display.cls : 'text-muted-foreground',
      )}
    >
      {saving ? <Spinner size={10} className="mr-1" /> : null}
      {display ? display.label : '—'}
    </span>
  );

  return (
    <SelectPopover
      options={OPTIONS}
      value={value || undefined}
      onSelect={handleSelect}
      disabled={!canEdit || saving}
      renderOption={(it) => (
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded"
            style={{ backgroundColor: it.color }}
          />
          {it.name}
        </span>
      )}
    >
      {trigger}
    </SelectPopover>
  );
}
