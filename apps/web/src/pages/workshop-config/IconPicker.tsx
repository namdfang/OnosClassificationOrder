import React, { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/cn';

const SUGGESTED = [
  'User', 'Wrench', 'Ban', 'AlertCircle', 'CheckCircle', 'XCircle',
  'Hash', 'Minus', 'Plus', 'Shirt', 'Scissors', 'CircleDot', 'Clock',
  'Stamp', 'Rows', 'AlignVerticalJustifyCenter', 'ArrowLeftRight',
  'PersonStanding', 'MessageCircleQuestion', 'Box', 'Flag', 'Tag',
  'Star', 'Heart', 'ThumbsUp', 'Eye', 'Settings',
];

export function LucideIcon({ name, size = 16, className }: { name?: string; size?: number; className?: string }) {
  if (!name) return null;
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name];
  if (!Icon) return <span className={cn('text-muted-foreground text-xs', className)}>{name}</span>;
  return <Icon size={size} className={className} />;
}

interface Props {
  value?: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return SUGGESTED;
    const s = search.toLowerCase();
    return SUGGESTED.filter((n) => n.toLowerCase().includes(s));
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="gap-2 justify-start w-full">
          <LucideIcon name={value} size={16} />
          <span className="text-sm">{value || 'Chọn icon'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="relative mb-3">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm icon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-8 text-sm"
          />
        </div>
        <div className="grid grid-cols-6 gap-1 max-h-60 overflow-y-auto">
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
              className={cn(
                'flex items-center justify-center h-9 w-9 rounded border transition-colors',
                value === name
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-accent',
              )}
            >
              <LucideIcon name={name} size={16} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
