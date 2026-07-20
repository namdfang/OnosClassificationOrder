import React from 'react';
import { X } from 'lucide-react';
import { WorkshopConfigCategory } from 'shared';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { Button } from '@/components/ui/button';

import { cn } from '@/utils/cn';

import { LucideIcon } from '@/pages/workshop-config/IconPicker';

import type { StatusFilter, StatusFilterCategory } from './useStatusFilter';

const CATEGORY_LABEL: Record<StatusFilterCategory, string> = {
  printStatus: 'Trạng thái in',
  printStatusNote: 'Note in',
  toolResult: 'Tool',
  toolResultNote: 'Note Tool',
  errorFile: 'File lỗi',
  productionError: 'Lỗi xưởng',
  assignee: 'Người TH',
  assigneeNote: 'Note người TH',
};

/** Map sang WorkshopConfigCategory để resolve label/color/icon cho chip.
 *  Chú ý: `assignee` lưu userId → workshop_config không có nên fallback raw. */
const CATEGORY_TO_WS: Partial<Record<StatusFilterCategory, WorkshopConfigCategory>> = {
  printStatus: WorkshopConfigCategory.PrintStatus,
  printStatusNote: WorkshopConfigCategory.PrintStatusNote,
  toolResult: WorkshopConfigCategory.ToolResult,
  toolResultNote: WorkshopConfigCategory.ToolResultNote,
  errorFile: WorkshopConfigCategory.ErrorFileType,
  productionError: WorkshopConfigCategory.ProductionError,
  assigneeNote: WorkshopConfigCategory.AssigneeNote,
};

interface StatusFilterTopActionsProps {
  hasError?: boolean;
  isActive: boolean;
  onHasError: (v: boolean | undefined) => void;
  onClearAll: () => void;
}

/** "Lỗi cần xử lý" toggle + "Xóa toàn bộ filter" — chèn vào `topActionsRight`
 *  của `<OrderFilterBar>` trong OrderStatusTab. */
export function StatusFilterTopActions({ hasError, isActive, onHasError, onClearAll }: StatusFilterTopActionsProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => onHasError(hasError ? undefined : true)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors',
          hasError
            ? 'border-rose-400 bg-rose-50/70 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 font-medium'
            : 'border-border bg-background text-muted-foreground hover:text-foreground',
        )}
      >
        Lỗi cần xử lý
      </button>
      {isActive && (
        <Button variant="ghost" size="sm" onClick={onClearAll} className="text-xs h-7 ml-auto">
          <X size={12} /> Xóa toàn bộ filter
        </Button>
      )}
    </>
  );
}

interface StatusActiveChipsProps {
  filter: StatusFilter;
  onToggle: (cat: StatusFilterCategory, code: string) => void;
}

/** Pill chip cho từng filter đang active (1 chip per code). Chèn vào
 *  `middleRow` của `<OrderFilterBar>`. */
export function StatusActiveChips({ filter, onToggle }: StatusActiveChipsProps) {
  const resolve = useWorkshopConfigStore((s) => s.resolve);

  const chips: Array<{
    cat: StatusFilterCategory;
    code: string;
    label: string;
    color?: string;
    icon?: string;
  }> = [];
  for (const cat of Object.keys(CATEGORY_LABEL) as StatusFilterCategory[]) {
    for (const code of filter[cat]) {
      const wsCat = CATEGORY_TO_WS[cat];
      const meta = wsCat ? resolve(wsCat, code) : undefined;
      chips.push({
        cat,
        code,
        label: `${CATEGORY_LABEL[cat]}: ${meta?.name || code}`,
        color: meta?.color,
        icon: meta?.icon,
      });
    }
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map((c) => (
        <button
          key={`${c.cat}-${c.code}`}
          type="button"
          onClick={() => onToggle(c.cat, c.code)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background pl-2 pr-1.5 py-0.5 text-[11px] hover:border-destructive/40"
        >
          {c.color && <span className="inline-block w-2 h-2 rounded" style={{ backgroundColor: c.color }} />}
          {c.icon && !c.color && <LucideIcon name={c.icon} size={11} />}
          <span>{c.label}</span>
          <X size={11} className="text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}
