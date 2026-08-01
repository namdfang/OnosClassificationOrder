import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Factory as FactoryIcon, Inbox, Search } from 'lucide-react';
import type { Customer } from 'shared';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

import { TierBadge } from '@/components/settings/CustomerListDialog';
import { Input } from '@/components/ui/input';

import { cn } from '@/utils/cn';

export const UNASSIGNED_COL = '__unassigned__';

/** VIP 0 → VIP 5 lên đầu cột (0 trước), khách lẻ (không tier) xuống cuối. */
function tierRank(c: Customer): number {
  return typeof c.tier === 'number' ? c.tier : 999;
}

function sortCustomers(list: Customer[]): Customer[] {
  return [...list].sort((a, b) => tierRank(a) - tierRank(b) || a.userSku.localeCompare(b.userSku));
}

function CustomerCard({ c }: { c: Customer }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800 px-2.5 py-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
          {c.userSku}
        </span>
        <TierBadge tier={c.tier} />
      </div>
      {c.userEmail && <p className="mt-0.5 truncate text-[11px] text-slate-400">{c.userEmail}</p>}
    </div>
  );
}

function DraggableCard({ c }: { c: Customer }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(c._id) });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('cursor-grab active:cursor-grabbing touch-none', isDragging && 'opacity-30')}
    >
      <CustomerCard c={c} />
    </div>
  );
}

function Column({
  id,
  title,
  shortName,
  icon,
  customers,
  visible,
}: {
  id: string;
  title: string;
  shortName?: string;
  icon?: React.ReactNode;
  customers: Customer[];
  visible: Customer[];
}) {
  const { t } = useTranslation('customerFactoryAssignment');
  const { setNodeRef, isOver } = useDroppable({ id });
  const isUnassigned = id === UNASSIGNED_COL;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Cột cao cố định 70vh — danh sách khách cuộn bên trong.
        'flex flex-col h-[70vh] rounded-xl border bg-slate-50 dark:bg-slate-800/40 transition-colors',
        isOver
          ? 'border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-500/30'
          : 'border-slate-200 dark:border-slate-700/60',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200/70 dark:border-slate-700/60">
        {isUnassigned ? (
          <Inbox size={15} className="text-slate-400" />
        ) : (
          icon ?? <FactoryIcon size={15} className="text-sky-600 dark:text-sky-400" />
        )}
        <span className="flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">{title}</span>
        {shortName && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-500">
            {shortName}
          </span>
        )}
        <span className="text-xs tabular-nums text-slate-400">
          {visible.length === customers.length ? customers.length : `${visible.length}/${customers.length}`}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {visible.map((c) => (
          <DraggableCard key={String(c._id)} c={c} />
        ))}
        {visible.length === 0 && (
          <p className="py-4 text-center text-[11px] text-slate-400">
            {customers.length === 0 ? t('kanban.emptyColumn') : t('kanban.noSearchMatch')}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Kanban khách hàng dùng chung — cột do parent định nghĩa (xưởng ở tab
 * "Gán xưởng theo khách", 3 mức ưu tiên ở tab "Ưu tiên đơn theo khách").
 * Cột "Chưa gán" luôn tự thêm ở đầu.
 */
export interface CustomerKanbanColumnDef {
  id: string;
  title: string;
  shortName?: string;
  icon?: React.ReactNode; // mặc định icon xưởng
}

interface CustomerFactoryKanbanProps {
  columns: CustomerKanbanColumnDef[];
  customers: Customer[];
  alloc: Record<string, string[]>; // columnId → customerIds
  onMove: (customerId: string, targetColumnId: string | null) => void;
}

export default function CustomerFactoryKanban({
  columns: columnDefs,
  customers,
  alloc,
  onMove,
}: CustomerFactoryKanbanProps) {
  const { t } = useTranslation('customerFactoryAssignment');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const byId = useMemo(() => new Map(customers.map((c) => [String(c._id), c])), [customers]);

  const columns = useMemo(() => {
    const assigned = new Set<string>();
    const cols: { id: string; title: string; shortName?: string; icon?: React.ReactNode; customers: Customer[] }[] = [];
    for (const def of columnDefs) {
      const list = (alloc[def.id] || []).map((id) => byId.get(id)).filter((c): c is Customer => !!c);
      for (const c of list) assigned.add(String(c._id));
      cols.push({ ...def, customers: sortCustomers(list) });
    }
    const unassigned = sortCustomers(customers.filter((c) => !assigned.has(String(c._id))));
    const all: typeof cols = [
      { id: UNASSIGNED_COL, title: t('kanban.unassignedColumn'), customers: unassigned },
      ...cols,
    ];
    return all;
  }, [columnDefs, customers, alloc, byId, t]);

  const q = search.trim().toLowerCase();
  const matches = (c: Customer) =>
    !q || c.userSku.toLowerCase().includes(q) || (c.userEmail || '').toLowerCase().includes(q);

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId('');
    const { active, over } = e;
    if (!over) return;
    const customerId = String(active.id);
    const target = String(over.id);
    const from = columns.find((col) => col.customers.some((c) => String(c._id) === customerId))?.id;
    if (from === target) return;
    onMove(customerId, target === UNASSIGNED_COL ? null : target);
  };

  const activeCustomer = activeId ? byId.get(activeId) : undefined;

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('kanban.searchPlaceholder')}
          className="h-8 pl-8 text-sm"
        />
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
          {columns.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              title={col.title}
              shortName={col.shortName}
              icon={col.icon}
              customers={col.customers}
              visible={col.customers.filter(matches)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeCustomer ? (
            <div className="rotate-2 opacity-90">
              <CustomerCard c={activeCustomer} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
