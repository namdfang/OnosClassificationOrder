import React, { useState } from 'react';
import { Check } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { cn } from '@/utils/cn';

/** Shape tối thiểu cell cần — workshop_config items hoặc designer team items
 *  đều fit. `code` là giá trị truyền vào onSelect (workshop_config code hoặc
 *  user._id tuỳ caller). */
export type SelectOption = {
  _id: string;
  code: string;
  name: string;
  color?: string;
  icon?: string;
  /** Chỉ workshop_config category=production_error: hiển thị badge cạnh tên trong popover. */
  errorSource?: 'designer' | 'factory' | 'tool-check';
};

interface Props {
  options: SelectOption[];
  value?: string | null;
  onSelect: (code: string | null) => void;
  triggerClassName?: string;
  children: React.ReactNode; // the trigger UI (badge / icon button)
  disabled?: boolean;
  renderOption: (item: SelectOption, isSelected: boolean) => React.ReactNode;
}

/**
 * Shared popover used by ColorBadgeSelectCell + IconSelectCell. Has a "clear"
 * row at the top so workers can unset a value.
 */
export function SelectPopover({ options, value, onSelect, triggerClassName, children, disabled, renderOption }: Props) {
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
          {options.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Chưa có lựa chọn</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
