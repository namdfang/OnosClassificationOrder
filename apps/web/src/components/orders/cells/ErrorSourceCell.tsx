import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { SelectPopover } from './SelectPopover';

type ErrSource = 'designer' | 'factory' | 'tool-check';

interface Props {
  orderId: string;
  value?: ErrSource | null;
  canEdit: boolean;
  onUpdated?: (v: ErrSource | null) => void;
}

function buildOptions(t: TFunction<'orders'>) {
  return [
    { _id: 'designer', code: 'designer', name: t('cells.errorSource.designer'), color: '#7C3AED' },
    { _id: 'factory', code: 'factory', name: t('cells.errorSource.factory'), color: '#0EA5E9' },
    { _id: 'tool-check', code: 'tool-check', name: t('cells.errorSource.toolCheck'), color: '#F59E0B' },
  ];
}

function buildSourceLabel(t: TFunction<'orders'>): Record<ErrSource, string> {
  return {
    designer: t('cells.errorSource.designer'),
    factory: t('cells.errorSource.factory'),
    'tool-check': t('cells.errorSource.toolCheck'),
  };
}

/**
 * Cell pick errorSource cho 1 đơn. Auto-fill từ workshop_config khi user set
 * productionError; user có thể override (vd. "Lỗi khác"). Empty = chưa phân loại.
 */
export function ErrorSourceCell({ orderId, value, canEdit, onUpdated }: Props) {
  const { t } = useTranslation('orders');
  const OPTIONS = useMemo(() => buildOptions(t), [t]);
  const SOURCE_LABEL = useMemo(() => buildSourceLabel(t), [t]);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (newVal: string | null) => {
    if (newVal === (value || null)) return;
    try {
      setSaving(true);
      await RepositoryRemote.order.updateField(orderId, {
        field: 'productionErrorSource',
        value: newVal,
      });
      toast.success(
        newVal ? t('cells.changedTo', { name: SOURCE_LABEL[newVal as ErrSource] ?? newVal }) : t('cells.cleared'),
      );
      onUpdated?.(newVal as ErrSource | null);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const display =
    value === 'designer'
      ? {
          label: t('cells.errorSource.designer'),
          cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
        }
      : value === 'factory'
        ? {
            label: t('cells.errorSource.factory'),
            cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
          }
        : value === 'tool-check'
          ? {
              label: t('cells.errorSource.toolCheck'),
              cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
            }
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
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: it.color }} />
          {it.name}
        </span>
      )}
    >
      {trigger}
    </SelectPopover>
  );
}
