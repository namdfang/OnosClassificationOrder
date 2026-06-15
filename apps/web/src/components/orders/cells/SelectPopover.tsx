import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { WorkshopConfig } from 'shared';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/cn';

interface Props {
  options: WorkshopConfig[];
  value?: string | null;
  onSelect: (code: string | null) => void;
  triggerClassName?: string;
  children: React.ReactNode; // the trigger UI (badge / icon button)
  disabled?: boolean;
  renderOption: (item: WorkshopConfig, isSelected: boolean) => React.ReactNode;
}

/**
 * Shared popover used by ColorBadgeSelectCell + IconSelectCell. Has a "clear"
 * row at the top so workers can unset a value.
 */
export function SelectPopover({
  options,
  value,
  onSelect,
  triggerClassName,
  children,
  disabled,
  renderOption,
}: Props) {
  const [open, setOpen] = useState(false);

  const handleSelect = (code: string | null) => {
    onSelect(code);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex items-center max-w-full text-left rounded border border-transparent hover:border-border',
            disabled && 'cursor-not-allowed opacity-60 hover:border-transparent',
            triggerClassName,
          )}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <button
          type="button"
          onClick={() => handleSelect(null)}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-accent',
            !value && 'bg-accent/60',
          )}
        >
          {!value && <Check size={12} />}
          <span className={!value ? '' : 'ml-[18px]'}>— Bỏ chọn —</span>
        </button>
        <div className="max-h-72 overflow-y-auto">
          {options.map((it) => {
            const isSelected = value === it.code;
            return (
              <button
                key={it._id}
                type="button"
                onClick={() => handleSelect(it.code)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left',
                  isSelected && 'bg-accent/60',
                )}
              >
                {isSelected ? <Check size={12} /> : <span className="w-[12px]" />}
                <span className="flex-1">{renderOption(it, isSelected)}</span>
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">Chưa có lựa chọn</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
