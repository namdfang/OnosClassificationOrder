import React from 'react';
import { Calendar, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { WorkshopConfigCategory } from 'shared';
import { cn } from '@/utils/cn';

import { LucideIcon } from '@/pages/workshop-config/IconPicker';
import type { StatusFilter, StatusFilterCategory } from './useStatusFilter';

const CATEGORY_LABEL: Record<StatusFilterCategory, string> = {
  printStatus: 'Trạng thái in',
  printStatusNote: 'Note in',
  toolResult: 'Tool',
  toolResultNote: 'Note Tool',
  errorFile: 'File lỗi',
  assignee: 'Người TH',
  assigneeNote: 'Note người TH',
};

const CATEGORY_TO_WS: Record<StatusFilterCategory, WorkshopConfigCategory> = {
  printStatus: WorkshopConfigCategory.PrintStatus,
  printStatusNote: WorkshopConfigCategory.PrintStatusNote,
  toolResult: WorkshopConfigCategory.ToolResult,
  toolResultNote: WorkshopConfigCategory.ToolResultNote,
  errorFile: WorkshopConfigCategory.ErrorFileType,
  assignee: WorkshopConfigCategory.Assignee,
  assigneeNote: WorkshopConfigCategory.AssigneeNote,
};

interface Props {
  filter: StatusFilter;
  isActive: boolean;
  onToggle: (cat: StatusFilterCategory, code: string) => void;
  onScalar: (key: 'createdFrom' | 'createdTo', value: string | undefined) => void;
  onClearAll: () => void;
}

export function FilterChipBar({ filter, isActive, onToggle, onScalar, onClearAll }: Props) {
  const resolve = useWorkshopConfigStore((s) => s.resolve);

  const chips: Array<{ cat: StatusFilterCategory; code: string; label: string; color?: string; icon?: string }> = [];
  for (const cat of Object.keys(CATEGORY_LABEL) as StatusFilterCategory[]) {
    for (const code of filter[cat]) {
      const meta = resolve(CATEGORY_TO_WS[cat], code);
      chips.push({
        cat,
        code,
        label: `${CATEGORY_LABEL[cat]}: ${meta?.name || code}`,
        color: meta?.color,
        icon: meta?.icon,
      });
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar size={13} />
          <span>Từ</span>
          <Input
            type="date"
            value={filter.createdFrom || ''}
            onChange={(e) => onScalar('createdFrom', e.target.value || undefined)}
            className="h-8 w-[140px] text-xs"
          />
          <span>đến</span>
          <Input
            type="date"
            value={filter.createdTo || ''}
            onChange={(e) => onScalar('createdTo', e.target.value || undefined)}
            className="h-8 w-[140px] text-xs"
          />
        </div>
        {isActive && (
          <Button variant="ghost" size="sm" onClick={onClearAll} className="text-xs h-7 ml-auto">
            <X size={12} /> Xóa toàn bộ filter
          </Button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {chips.map((c) => (
            <button
              key={`${c.cat}-${c.code}`}
              type="button"
              onClick={() => onToggle(c.cat, c.code)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border bg-background pl-2 pr-1.5 py-0.5 text-[11px] hover:border-destructive/40',
              )}
            >
              {c.color && (
                <span className="inline-block w-2 h-2 rounded" style={{ backgroundColor: c.color }} />
              )}
              {c.icon && !c.color && <LucideIcon name={c.icon} size={11} />}
              <span>{c.label}</span>
              <X size={11} className="text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
