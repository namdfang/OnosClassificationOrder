import React from 'react';
import { DATE_PRESETS, matchPreset } from '@/utils/dateRangePresets';
import { cn } from '@/utils/cn';

interface DateRangePresetsProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** Layout — `chip` = bo tròn nhẹ, `compact` = nút mảnh. Default `chip`. */
  variant?: 'chip' | 'compact';
  className?: string;
}

/**
 * Hàng nút preset cho range ngày: Hôm nay / Hôm qua / Tuần này / Tuần trước /
 * Tháng này / Tháng trước / Năm nay / Năm trước.
 *
 * - Click preset → gọi `onChange(from, to)` với 2 chuỗi `yyyy-mm-dd` local.
 * - Highlight preset đang khớp với `(from, to)` hiện tại.
 * - Dùng kèm 2 `<Input type="date">` để user có thể chọn nhanh **HOẶC** tinh
 *   chỉnh thủ công.
 */
export function DateRangePresets({
  from,
  to,
  onChange,
  variant = 'chip',
  className,
}: DateRangePresetsProps) {
  const active = matchPreset(from, to);

  const baseBtn =
    variant === 'compact'
      ? 'text-xs h-7 px-2 rounded-md transition-colors'
      : 'text-xs h-7 px-2.5 rounded-md border transition-colors';

  return (
    <div className={cn('flex items-center gap-1 flex-wrap', className)}>
      {DATE_PRESETS.map((p) => {
        const isActive = p.key === active;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              const r = p.range();
              onChange(r.from, r.to);
            }}
            className={cn(
              baseBtn,
              variant === 'compact'
                ? isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-background text-muted-foreground hover:text-foreground'
                : isActive
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
