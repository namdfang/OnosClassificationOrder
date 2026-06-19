import React, { useState } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DATE_PRESETS, matchPreset } from '@/utils/dateRangePresets';
import { cn } from '@/utils/cn';

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** Cho phép clear range về `('', '')`. Default `true`. */
  clearable?: boolean;
  /** Override label khi `from === to === ''`. Default "Chọn ngày". */
  placeholder?: string;
  className?: string;
}

/**
 * Trigger button + Popover gói gọn cả 8 preset + 2 input chỉnh tay vào 1 chỗ
 * thay vì dàn ngang chiếm chiều ngang. Thay thế cho block "2 Input + DateRangePresets"
 * trong các filter bar.
 *
 * Pattern dùng:
 *   <DateRangePicker
 *     from={createdFrom}
 *     to={createdTo}
 *     onChange={(f, t) => { setCreatedFrom(f); setCreatedTo(t); }}
 *   />
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  clearable = true,
  placeholder = 'Chọn ngày',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  // Buffer trong popover — user gõ vào input không trigger fetch ngay, đợi
  // click "Áp dụng" hoặc preset. Sync lại từ props mỗi lần popover mở.
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  React.useEffect(() => {
    if (open) {
      setDraftFrom(from);
      setDraftTo(to);
    }
  }, [open, from, to]);

  const activeKey = matchPreset(from, to);
  const activeLabel = DATE_PRESETS.find((p) => p.key === activeKey)?.label;
  const label =
    activeLabel || (from && to ? `${fmt(from)} → ${fmt(to)}` : from || to || placeholder);
  const hasValue = !!(from || to);

  return (
    <div className={cn('inline-flex items-center', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs justify-start font-normal"
          >
            <Calendar size={13} className="text-muted-foreground" />
            <span className={cn(!hasValue && 'text-muted-foreground')}>{label}</span>
            <ChevronDown size={12} className="text-muted-foreground ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[420px] p-3" sideOffset={6}>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {DATE_PRESETS.map((p) => {
              const isActive = p.key === activeKey;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    const r = p.range();
                    onChange(r.from, r.to);
                    setOpen(false);
                  }}
                  className={cn(
                    'text-xs h-8 px-2 rounded-md border transition-colors',
                    isActive
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-background hover:bg-muted/40 text-foreground',
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Hoặc chọn khoảng tùy chỉnh
            </p>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Từ</label>
              <Input
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="h-8 text-xs flex-1"
              />
              <label className="text-xs text-muted-foreground">đến</label>
              <Input
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                className="h-8 text-xs flex-1"
              />
            </div>
            <div className="flex items-center justify-end gap-1.5 pt-1">
              {clearable && hasValue && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    onChange('', '');
                    setOpen(false);
                  }}
                >
                  <X size={11} /> Xóa
                </Button>
              )}
              <Button
                size="sm"
                className="text-xs h-7"
                disabled={draftFrom === from && draftTo === to}
                onClick={() => {
                  onChange(draftFrom, draftTo);
                  setOpen(false);
                }}
              >
                Áp dụng
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function fmt(iso: string): string {
  // yyyy-mm-dd → dd/mm
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}
