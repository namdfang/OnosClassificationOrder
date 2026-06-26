import React, { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { OrderWorkshopField, WorkshopConfigCategory } from 'shared';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { cn } from '@/utils/cn';
import { handleAxiosError } from '@/utils';

import { LucideIcon } from '@/pages/workshop-config/IconPicker';

interface Props {
  orderId: string;
  field: OrderWorkshopField;
  category: WorkshopConfigCategory;
  /**
   * Workshop_config codes đang được chọn. Chấp nhận:
   * - `string[]` (shape chuẩn sau migrate)
   * - `string` (legacy data chưa migrate — auto wrap)
   * - `null`/`undefined`
   */
  value?: string[] | string | null;
  canEdit: boolean;
  /** Max badge hiển thị inline trước khi gộp "+N". */
  maxVisible?: number;
  onUpdated?: (newValue: string[] | null) => void;
}

/**
 * Multi-select cell hiển thị tối đa `maxVisible` badge inline, phần thừa gộp
 * `+N` và hover xem toàn bộ. Click → popover checkbox list, chọn xong bấm
 * "Lưu" (1 PATCH cho cả set).
 */
export function MultiIconSelectCell({
  orderId,
  field,
  category,
  value,
  canEdit,
  maxVisible = 2,
  onUpdated,
}: Props) {
  const items = useWorkshopConfigStore((s) => s.byCategory[category] || []);
  const resolve = useWorkshopConfigStore((s) => s.resolve);

  /**
   * Normalize value runtime → string[] để xử lý đồng nhất:
   *  - array → flat 1 level + filter chỉ giữ string (chống nested array nếu data
   *    bị wrap nhầm 2 lần ở đâu đó).
   *  - string đơn → wrap [string] (legacy data chưa migrate).
   *  - null/undefined → [].
   */
  const selectedCodes = useMemo(() => {
    if (value == null) return [];
    if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
    if (Array.isArray(value)) {
      // defensive: phòng nested array ([[code]]) — flatten max 2 lần
      return (value as unknown[])
        .flat(2)
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim());
    }
    return [];
  }, [value]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selectedCodes);
  const [saving, setSaving] = useState(false);

  // Sync draft khi prop value đổi (rỗ lúc nhập popover) hoặc popover mở.
  useEffect(() => {
    if (open) setDraft(selectedCodes);
  }, [open, selectedCodes]);

  const selected = useMemo(
    () => selectedCodes.map((c) => ({ code: c, item: resolve(category, c) })),
    [selectedCodes, resolve, category],
  );

  const dirty = useMemo(() => {
    if (draft.length !== selectedCodes.length) return true;
    const set = new Set(selectedCodes);
    return draft.some((c) => !set.has(c));
  }, [draft, selectedCodes]);

  const toggleDraft = (code: string) => {
    setDraft((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const clearDraft = () => setDraft([]);

  const handleSave = async () => {
    try {
      setSaving(true);
      // Sanitize payload trước khi gửi: flat + filter chỉ giữ string non-empty
      // → loại bỏ mọi khả năng nested array hoặc value rác từ runtime cũ.
      const sanitized = (draft as unknown[])
        .flat(2)
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim());
      const payload = sanitized.length > 0 ? sanitized : null;
      await RepositoryRemote.order.updateField(orderId, { field, value: payload });
      toast.success(
        payload ? `Đã lưu ${payload.length} mục` : 'Đã bỏ chọn',
      );
      onUpdated?.(payload);
      setOpen(false);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const visibleSelected = selected.slice(0, maxVisible);
  const overflow = selected.length - maxVisible;

  const fullTooltip = selected.map((s) => s.item?.name || s.code).join(', ');

  const trigger = (
    <span className="inline-flex items-center gap-1 max-w-full" title={fullTooltip || 'Chưa chọn'}>
      {saving && <Spinner size={10} className="text-current" />}
      {selected.length === 0 ? (
        <span className="text-muted-foreground text-xs">—</span>
      ) : (
        <>
          {visibleSelected.map((s) => (
            <Badge key={s.code} icon={s.item?.icon} label={s.item?.name || s.code} />
          ))}
          {overflow > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent text-accent-foreground"
              title={fullTooltip}
            >
              +{overflow}
            </span>
          )}
        </>
      )}
    </span>
  );

  return (
    <Popover open={open} onOpenChange={(o) => canEdit && !saving && setOpen(o)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!canEdit || saving}
          className={cn(
            'inline-flex items-center max-w-full text-left rounded border border-transparent hover:border-border',
            (!canEdit || saving) && 'cursor-not-allowed opacity-60 hover:border-transparent',
          )}
        >
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-foreground">
            Chọn ({draft.length})
          </p>
          {draft.length > 0 && (
            <button
              type="button"
              onClick={clearDraft}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X size={11} /> Bỏ hết
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto -mx-1">
          {items.map((it) => {
            const checked = draft.includes(it.code);
            return (
              <button
                key={it._id}
                type="button"
                onClick={() => toggleDraft(it.code)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left',
                  checked && 'bg-accent/60',
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-4 h-4 rounded border',
                    checked
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-input',
                  )}
                >
                  {checked && <Check size={11} />}
                </span>
                <LucideIcon name={it.icon} size={13} />
                <span className="flex-1 truncate">{it.name}</span>
              </button>
            );
          })}
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">Chưa có lựa chọn</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Huỷ
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving && <Spinner size={11} />}
            Lưu
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Badge({ icon, label }: { icon?: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-accent/60 text-foreground whitespace-nowrap">
      <LucideIcon name={icon} size={11} />
      <span className="truncate max-w-[80px]">{label}</span>
    </span>
  );
}
