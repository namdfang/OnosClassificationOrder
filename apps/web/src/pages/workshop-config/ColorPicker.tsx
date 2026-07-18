import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { cn } from '@/utils/cn';

const PRESETS = [
  '#9CA3AF',
  '#6B7280',
  '#374151',
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#EAB308',
  '#84CC16',
  '#22C55E',
  '#10B981',
  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#A855F7',
  '#D946EF',
  '#EC4899',
  '#F43F5E',
  '#0F172A',
];

interface Props {
  value?: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="gap-2 justify-start w-full">
          <span
            className="inline-block w-4 h-4 rounded border border-border"
            style={{ backgroundColor: value || 'transparent' }}
          />
          <span className="text-sm font-mono">{value || 'Chọn màu'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="grid grid-cols-7 gap-1.5 mb-3">
          {PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={cn(
                'h-7 w-7 rounded border transition-transform hover:scale-110',
                value?.toLowerCase() === c.toLowerCase()
                  ? 'border-foreground ring-2 ring-offset-1 ring-foreground/40'
                  : 'border-border',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            className="h-8 text-sm font-mono"
            maxLength={7}
          />
          <Input
            type="color"
            value={value || '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 p-0.5 cursor-pointer"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
