import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, Search, UserRound } from 'lucide-react';
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

/**
 * Card kanban dùng chung cho 2 mức ưu tiên auto-gán designer:
 * - Khách hàng: `title`=userSku, `subtitle`=email, `tier` (badge VIP).
 * - Sản phẩm: `title`=fullName, `subtitle`=shortName, `mockup` (thumbnail).
 */
export interface DesignerAssignItem {
  id: string;
  title: string;
  subtitle?: string;
  tier?: number | null;
  mockup?: string;
  /** Nhãn hạn hiệu lực (mapping tạm thời từ "Ghi nhớ cấu hình") — chip vàng. */
  expiryLabel?: string;
}

interface DesignerLite {
  _id: string;
  fullName: string;
}

/** Khách VIP 0→5 lên đầu cột, khách lẻ/sản phẩm (không tier) sort theo tên. */
function itemRank(it: DesignerAssignItem): number {
  return typeof it.tier === 'number' ? it.tier : 999;
}

function sortItems(list: DesignerAssignItem[]): DesignerAssignItem[] {
  return [...list].sort((a, b) => itemRank(a) - itemRank(b) || a.title.localeCompare(b.title));
}

function ItemCard({ it }: { it: DesignerAssignItem }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800 px-2.5 py-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        {it.mockup && (
          <img src={it.mockup} alt="" className="w-7 h-7 rounded object-cover shrink-0 bg-slate-100 dark:bg-slate-700" />
        )}
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200" title={it.title}>
            {it.title}
          </p>
          {it.subtitle && <p className="truncate text-[11px] text-slate-400">{it.subtitle}</p>}
        </div>
        {it.expiryLabel && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">
            {it.expiryLabel}
          </span>
        )}
        {it.tier !== undefined && <TierBadge tier={it.tier} />}
      </div>
    </div>
  );
}

function DraggableCard({ it }: { it: DesignerAssignItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: it.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('cursor-grab active:cursor-grabbing touch-none', isDragging && 'opacity-30')}
    >
      <ItemCard it={it} />
    </div>
  );
}

function Column({
  id,
  title,
  items,
  visible,
}: {
  id: string;
  title: string;
  items: DesignerAssignItem[];
  visible: DesignerAssignItem[];
}) {
  const { t } = useTranslation('designerAutoAssign');
  const { setNodeRef, isOver } = useDroppable({ id });
  const isUnassigned = id === UNASSIGNED_COL;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Cột cao cố định — danh sách cuộn bên trong.
        'flex flex-col h-[55vh] rounded-xl border bg-slate-50 dark:bg-slate-800/40 transition-colors',
        isOver
          ? 'border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-500/30'
          : 'border-slate-200 dark:border-slate-700/60',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200/70 dark:border-slate-700/60">
        {isUnassigned ? (
          <Inbox size={15} className="text-slate-400" />
        ) : (
          <UserRound size={15} className="text-indigo-600 dark:text-indigo-400" />
        )}
        <span className="flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">{title}</span>
        <span className="text-xs tabular-nums text-slate-400">
          {visible.length === items.length ? items.length : `${visible.length}/${items.length}`}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {visible.map((it) => (
          <DraggableCard key={it.id} it={it} />
        ))}
        {visible.length === 0 && (
          <p className="py-4 text-center text-[11px] text-slate-400">
            {items.length === 0 ? t('kanban.emptyColumn') : t('kanban.noSearchMatch')}
          </p>
        )}
      </div>
    </div>
  );
}

interface DesignerAssignKanbanProps {
  designers: DesignerLite[];
  items: DesignerAssignItem[];
  alloc: Record<string, string[]>; // designerId → itemIds
  onMove: (itemId: string, targetDesignerId: string | null) => void;
  searchPlaceholder: string;
}

export default function DesignerAssignKanban({
  designers,
  items,
  alloc,
  onMove,
  searchPlaceholder,
}: DesignerAssignKanbanProps) {
  const { t } = useTranslation('designerAutoAssign');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const columns = useMemo(() => {
    const assigned = new Set<string>();
    const cols: { id: string; title: string; items: DesignerAssignItem[] }[] = [];
    for (const d of designers) {
      const list = (alloc[d._id] || []).map((id) => byId.get(id)).filter((it): it is DesignerAssignItem => !!it);
      for (const it of list) assigned.add(it.id);
      cols.push({ id: d._id, title: d.fullName, items: sortItems(list) });
    }
    const unassigned = sortItems(items.filter((it) => !assigned.has(it.id)));
    return [{ id: UNASSIGNED_COL, title: t('kanban.unassignedColumn'), items: unassigned }, ...cols];
  }, [designers, items, alloc, byId, t]);

  const q = search.trim().toLowerCase();
  const matches = (it: DesignerAssignItem) =>
    !q || it.title.toLowerCase().includes(q) || (it.subtitle || '').toLowerCase().includes(q);

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId('');
    const { active, over } = e;
    if (!over) return;
    const itemId = String(active.id);
    const target = String(over.id);
    const from = columns.find((col) => col.items.some((it) => it.id === itemId))?.id;
    if (from === target) return;
    onMove(itemId, target === UNASSIGNED_COL ? null : target);
  };

  const activeItem = activeId ? byId.get(activeId) : undefined;

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 pl-8 text-sm"
        />
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
          {columns.map((col) => (
            <Column key={col.id} id={col.id} title={col.title} items={col.items} visible={col.items.filter(matches)} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <div className="rotate-2 opacity-90">
              <ItemCard it={activeItem} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
