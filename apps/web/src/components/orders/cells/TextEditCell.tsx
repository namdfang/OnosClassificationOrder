import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { OrderWorkshopField } from 'shared';

import { Hint } from '@/components/common/Hint';
import { Spinner } from '@/components/common/Spinner';
import { Input } from '@/components/ui/input';
import { RepositoryRemote } from '@/services';
import { cn } from '@/utils/cn';
import { handleAxiosError } from '@/utils';

interface Props {
  orderId: string;
  field: OrderWorkshopField;
  value?: string | null;
  canEdit: boolean;
  onUpdated?: (newValue: string | null) => void;
  /** Tooltip label prefix, e.g. "Ghi chú file lỗi" → "Ghi chú file lỗi: {value}". */
  tooltipLabel?: string;
}

/**
 * Inline-editable text input. Saves on blur OR enter, only when value changed.
 * Shows a small spinner inside the input while saving.
 */
export function TextEditCell({ orderId, field, value, canEdit, onUpdated, tooltipLabel }: Props) {
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const commit = async () => {
    const trimmed = draft.trim();
    const original = (value || '').trim();
    if (trimmed === original) return;
    try {
      setSaving(true);
      await RepositoryRemote.order.updateField(orderId, { field, value: trimmed || null });
      toast.success('Đã lưu');
      onUpdated?.(trimmed || null);
    } catch (err) {
      handleAxiosError(err);
      setDraft(value || '');
    } finally {
      setSaving(false);
    }
  };

  const tooltipContent = value ? (tooltipLabel ? `${tooltipLabel}: ${value}` : value) : '';

  if (!canEdit) {
    return (
      <Hint content={tooltipContent} forceRich>
        <span className={cn('text-xs line-clamp-2 break-words', !value && 'text-muted-foreground')}>
          {value || '—'}
        </span>
      </Hint>
    );
  }

  return (
    <Hint content={tooltipContent} forceRich>
      <div className="relative">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              inputRef.current?.blur();
            }
            if (e.key === 'Escape') {
              setDraft(value || '');
              inputRef.current?.blur();
            }
          }}
          placeholder="—"
          className="h-7 text-xs px-2"
        />
        {saving && (
          <Spinner size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
    </Hint>
  );
}
