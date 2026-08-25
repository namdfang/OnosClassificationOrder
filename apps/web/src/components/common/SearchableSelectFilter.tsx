import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { cn } from '@/utils/cn';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; count?: number }>;
}

/**
 * Bản select-có-tìm-kiếm của `SelectFilter` — cùng props + cùng hình dạng
 * trigger (đổi lẫn nhau được trong lưới facet `OrderFilterBar`), nhưng mở
 * Popover chứa ô gõ từ khóa lọc option theo label (không phân biệt hoa
 * thường). Dùng cho facet có danh sách option dài, vd. Loại sản phẩm ở bảng
 * Classic (ORD-2).
 */
export function SearchableSelectFilter({ label, value, onChange, options }: Props) {
  const { t } = useTranslation('common');
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  // Guard undefined như SelectFilter: response BE có thể chưa có facet này.
  const opts = options ?? [];
  const total = opts.reduce((s, o) => s + (o.count ?? 0), 0);
  const selected = opts.find((o) => o.value === value);

  const q = query.trim().toLowerCase();
  const filtered = q ? opts.filter((o) => o.label.toLowerCase().includes(q)) : opts;

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</label>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'mt-1 w-full flex items-center justify-between gap-1 rounded-md border bg-background px-2 py-1.5 text-xs text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              value ? 'border-primary' : 'border-input',
            )}
          >
            {/* value không còn trong options (vd. ctype cũ trên URL) → hiện raw value, khớp cách chip bar fallback */}
            <span className="truncate">
              {selected
                ? `${selected.label} (${selected.count ?? 0})`
                : value || t('selectFilter.all', { count: total })}
            </span>
            <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[224px] p-1" align="start">
          <div className="relative mb-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('selectFilter.searchPlaceholder')}
              className="h-7 pl-6 text-xs"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-accent text-left',
                !value && 'bg-accent/60',
              )}
            >
              {!value ? <Check size={12} /> : <span className="w-[12px] shrink-0" />}
              <span className="flex-1 truncate">{t('selectFilter.all', { count: total })}</span>
            </button>
            {filtered.map((o) => {
              const isSelected = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleSelect(o.value)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left',
                    isSelected && 'bg-accent/60',
                  )}
                >
                  {isSelected ? <Check size={12} /> : <span className="w-[12px] shrink-0" />}
                  <span className="flex-1 truncate">
                    {o.label} ({o.count ?? 0})
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">{t('selectFilter.noResults')}</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
