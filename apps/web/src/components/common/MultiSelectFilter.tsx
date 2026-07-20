import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { cn } from '@/utils/cn';

export interface MultiSelectOption {
  /** Mã code dùng làm value (gửi BE). */
  code: string;
  /** Tên hiển thị. */
  name: string;
  /** Optional — màu hex để render badge khi `renderType='color'`. */
  color?: string;
}

interface MultiSelectFilterProps {
  /** Label trên trigger button + popover header. */
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (codes: string[]) => void;
  /** `color` = hiển thị chấm/badge màu, `text` = label trắng. Default `text`. */
  renderType?: 'color' | 'text';
  /** Min width của popover. Default 220px. */
  width?: number;
  className?: string;
}

/**
 * Popover multi-select dùng cho filter dạng "chọn nhiều giá trị từ list cố
 * định". Thay thế cho block FilterChips dàn ngang chiếm chỗ.
 *
 * - Trigger button: `<Label>: N giá trị` + chevron. Highlight viền primary
 *   khi đang chọn.
 * - Popover content: search bar + checkbox list + nút "Chọn tất cả" / "Xóa".
 * - Auto ẩn (return null) khi `options.length === 0`.
 */
export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  renderType = 'text',
  width = 240,
  className,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Tất cả hook PHẢI chạy trước mọi early return — nếu đặt return ở giữa,
  // khi options đi từ `[]` sang non-empty (workshop config load async) số hook
  // khác nhau giữa các render → "Rendered more hooks than during the previous render".
  const selected = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q));
  }, [options, query]);
  // Label text trên trigger button — show first 2 selected names, "+N" nếu nhiều hơn
  const triggerLabel = useMemo(() => {
    if (selected.size === 0) return label;
    const names = options.filter((o) => selected.has(o.code)).map((o) => o.name);
    if (names.length <= 2) return `${label}: ${names.join(', ')}`;
    return `${label}: ${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }, [selected, options, label]);

  if (options.length === 0) return null;

  const toggle = (code: string) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(Array.from(next));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5 text-xs justify-start font-normal max-w-[280px]',
            selected.size > 0 && 'border-primary bg-primary/5',
            className,
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          {selected.size > 0 && (
            <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-1 shrink-0">
              {selected.size}
            </span>
          )}
          <ChevronDown size={12} className="text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="p-0" style={{ width }}>
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          <Search size={12} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm…"
            className="flex-1 bg-transparent outline-none text-xs h-7"
          />
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange([]);
                setQuery('');
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1"
              title="Xóa tất cả"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="max-h-[280px] overflow-y-auto py-1">
          {filtered.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">Không tìm thấy</p>}
          {filtered.map((opt) => {
            const isOn = selected.has(opt.code);
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => toggle(opt.code)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left',
                  isOn && 'bg-primary/5',
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-4 h-4 rounded border shrink-0',
                    isOn ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
                  )}
                >
                  {isOn && <Check size={11} strokeWidth={3} />}
                </span>
                {renderType === 'color' && opt.color && (
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                <span className="truncate flex-1">{opt.name}</span>
              </button>
            );
          })}
        </div>

        {options.length > 1 && (
          <div className="border-t border-border px-2 py-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChange(options.map((o) => o.code))}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Chọn tất cả
            </button>
            <span className="text-[10px] text-muted-foreground">
              {selected.size}/{options.length}
            </span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
