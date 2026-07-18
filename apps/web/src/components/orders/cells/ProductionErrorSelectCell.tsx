import React, { useState } from 'react';
import type { WorkshopConfigCategory } from 'shared';
import { toast } from 'sonner';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { ProductionErrorOtherDialog } from './ProductionErrorOtherDialog';
import { SelectPopover } from './SelectPopover';

interface Props {
  orderId: string;
  category: WorkshopConfigCategory;
  value?: string | null;
  /** Nguồn lỗi hiện tại (pre-fill khi mở dialog "Lỗi khác" lại). */
  errorSourceValue?: 'designer' | 'factory' | 'tool-check';
  /** Note hiện tại (pre-fill dialog). */
  errorNoteValue?: string;
  canEdit: boolean;
  /** Callback patch row sau khi chọn — caller cần update cả 3 field nếu là 'other'. */
  onUpdated?: (code: string | null, source?: 'designer' | 'factory' | 'tool-check', note?: string) => void;
}

const OTHER_CODE = 'other';

/**
 * Cell cho field `productionError`. Khác `ColorBadgeSelectCell` thường ở chỗ:
 *   - Pick code 'other' → mở dialog bắt buộc source + note (BE cũng validate)
 *   - Code khác → updateField bình thường (BE auto-fill source từ config)
 */
export function ProductionErrorSelectCell({
  orderId,
  category,
  value,
  errorSourceValue,
  errorNoteValue,
  canEdit,
  onUpdated,
}: Props) {
  const items = useWorkshopConfigStore((s) => s.byCategory[category] || []);
  const resolve = useWorkshopConfigStore((s) => s.resolve);
  const current = resolve(category, value || undefined);
  const [saving, setSaving] = useState(false);
  const [otherDialogOpen, setOtherDialogOpen] = useState(false);

  const handleSelect = async (newCode: string | null) => {
    if (newCode === (value || null)) return;
    if (newCode === OTHER_CODE) {
      // Mở dialog buộc nhập source + note.
      setOtherDialogOpen(true);
      return;
    }
    try {
      setSaving(true);
      // BE auto-fill `productionErrorSource` từ config.errorSource khi đổi
      // productionError. Resolve sẵn ở FE để patch cột "Loại lỗi" ngay (không
      // chờ refetch) → UI đồng bộ với BE.
      const cfg = resolve(category, newCode || undefined);
      await RepositoryRemote.order.updateField(orderId, {
        field: 'productionError',
        value: newCode,
      });
      toast.success(newCode ? `Đã đổi → ${cfg?.name || newCode}` : 'Đã bỏ chọn');
      onUpdated?.(newCode, cfg?.errorSource);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleOtherSaved = (source: 'designer' | 'factory', note: string) => {
    onUpdated?.(OTHER_CODE, source, note);
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
    <>
      <SelectPopover
        options={items}
        value={value || undefined}
        onSelect={handleSelect}
        disabled={!canEdit || saving}
        renderOption={(it) => (
          <span className="inline-flex items-center gap-2 w-full">
            <span className="inline-block w-3 h-3 rounded shrink-0" style={{ backgroundColor: it.color || '#888' }} />
            <span className="flex-1">{it.name}</span>
            {it.errorSource === 'designer' && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                DES
              </span>
            )}
            {it.errorSource === 'factory' && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                XƯỞNG
              </span>
            )}
            {it.errorSource === 'tool-check' && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                SOÁT TOOL
              </span>
            )}
            {it.code === OTHER_CODE && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                CẦN CHI TIẾT
              </span>
            )}
          </span>
        )}
      >
        {trigger}
      </SelectPopover>

      <ProductionErrorOtherDialog
        open={otherDialogOpen}
        orderId={orderId}
        defaultSource={errorSourceValue}
        defaultNote={errorNoteValue}
        onClose={() => setOtherDialogOpen(false)}
        onSaved={handleOtherSaved}
      />
    </>
  );
}
