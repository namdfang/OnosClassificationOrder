import React, { useEffect, useMemo, useState } from 'react';
import { Factory as FactoryIcon, ImageIcon, Package, PackageSearch, RefreshCw, Search } from 'lucide-react';
import type { CreateProductConfigDto } from 'shared';
import { toast } from 'sonner';
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

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

interface ProductLite {
  _id: string;
  fullName: string;
  shortName: string;
  mockup?: string;
  factoryId?: string;
}

interface FactoryLite {
  _id: string;
  name: string;
  shortName?: string;
}

/** 1 loại sản phẩm quét từ đơn 14 ngày gần nhất nhưng CHƯA có Product Config. */
interface PendingType {
  type: string;
  orderCount: number;
}

/** Prefix phân biệt draggable id của pending type với `_id` product config. */
const PENDING_PREFIX = 'pending:';
/** Droppable id của cột "Chưa xác định xưởng" — thả vào đây là no-op. */
const UNASSIGNED_COL_ID = '__unassigned__';
const SYNC_DAYS = 14;

const stripDiacritics = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

/** shortName tự sinh khi tạo nhanh config từ pending type (uppercase, bỏ dấu, max 60). */
const makeShortName = (fullName: string) =>
  stripDiacritics(fullName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 60) || 'SP';

function ProductCard({ p }: { p: ProductLite }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800 px-2 py-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        {p.mockup ? (
          <img
            src={p.mockup}
            alt=""
            className="w-9 h-9 shrink-0 rounded object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700/50"
            draggable={false}
          />
        ) : (
          <div className="w-9 h-9 shrink-0 rounded border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400">
            <ImageIcon size={14} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{p.fullName}</p>
          <p className="truncate text-[10px] font-mono text-slate-400">{p.shortName}</p>
        </div>
      </div>
    </div>
  );
}

function PendingCard({ p }: { p: PendingType }) {
  return (
    <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10 px-2 py-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 shrink-0 rounded border border-dashed border-amber-300 dark:border-amber-500/40 flex items-center justify-center text-amber-500">
          <Package size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{p.type}</p>
          <p className="text-[10px] text-amber-600 dark:text-amber-400 tabular-nums">
            {p.orderCount} đơn / {SYNC_DAYS} ngày — chưa có config
          </p>
        </div>
      </div>
    </div>
  );
}

function DraggableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('cursor-grab active:cursor-grabbing touch-none', isDragging && 'opacity-30')}
    >
      {children}
    </div>
  );
}

function Column({
  id,
  title,
  shortName,
  icon,
  totalCount,
  visibleCount,
  emptyText,
  children,
}: {
  id: string;
  title: string;
  shortName?: string;
  icon: React.ReactNode;
  totalCount: number;
  visibleCount: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Cột cao cố định 70vh — danh sách sản phẩm cuộn bên trong.
        'flex flex-col h-[70vh] rounded-xl border bg-slate-50 dark:bg-slate-800/40 transition-colors',
        isOver && id !== UNASSIGNED_COL_ID
          ? 'border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-500/30'
          : 'border-slate-200 dark:border-slate-700/60',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200/70 dark:border-slate-700/60">
        {icon}
        <span className="flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">{title}</span>
        {shortName && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-500">
            {shortName}
          </span>
        )}
        <span className="text-xs tabular-nums text-slate-400">
          {visibleCount === totalCount ? totalCount : `${visibleCount}/${totalCount}`}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {children}
        {visibleCount === 0 && <p className="py-4 text-center text-[11px] text-slate-400">{emptyText}</p>}
      </div>
    </div>
  );
}

export default function ProductFactoryKanban() {
  const [factories, setFactories] = useState<FactoryLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState('');
  const [pending, setPending] = useState<PendingType[]>([]);
  const [synced, setSynced] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const fetchData = async () => {
    try {
      setLoading(true);
      const [facRes, prodRes] = await Promise.all([
        RepositoryRemote.factory.getFactories(),
        RepositoryRemote.productConfig.getProductConfigs('?page=1&limit=2000'),
      ]);
      setFactories((facRes.data?.data || []) as FactoryLite[]);
      setProducts((prodRes.data?.data || []) as ProductLite[]);
      setTotal(prodRes.data?.total || 0);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);

  const columns = useMemo(
    () =>
      factories.map((f) => ({
        id: f._id,
        title: f.name,
        shortName: f.shortName,
        products: products
          .filter((p) => p.factoryId === f._id)
          .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      })),
    [factories, products],
  );

  // Config đã tồn tại nhưng chưa gán xưởng (hoặc trỏ xưởng đã xóa) — nằm chung
  // cột "Chưa xác định xưởng" với pending types, kéo sang xưởng là PATCH như thường.
  const unassignedProducts = useMemo(() => {
    const factoryIds = new Set(factories.map((f) => f._id));
    return products
      .filter((p) => !p.factoryId || !factoryIds.has(p.factoryId))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [factories, products]);

  const q = search.trim().toLowerCase();
  const matches = (p: ProductLite) =>
    !q || p.fullName.toLowerCase().includes(q) || p.shortName.toLowerCase().includes(q);
  const matchesPending = (p: PendingType) => !q || p.type.toLowerCase().includes(q);
  const visiblePending = pending.filter(matchesPending);
  const visibleUnassigned = unassignedProducts.filter(matches);

  /** Quét đơn 14 ngày gần nhất → đổ các loại sản phẩm chưa có config vào cột "Chưa xác định xưởng". */
  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await RepositoryRemote.productConfig.getUnmatchedOrderTypes(`?days=${SYNC_DAYS}`);
      const rows = (res.data?.data || []) as PendingType[];
      setPending(rows);
      setSynced(true);
      toast.success(
        rows.length > 0
          ? `Tìm thấy ${rows.length} loại sản phẩm chưa có config trong ${SYNC_DAYS} ngày gần nhất`
          : `Không có loại sản phẩm nào thiếu config trong ${SYNC_DAYS} ngày gần nhất`,
      );
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSyncing(false);
    }
  };

  // Thả vào cột xưởng khác → update lạc quan + PATCH lưu ngay; lỗi thì refetch rollback.
  const handleMove = async (productId: string, targetFactoryId: string) => {
    const product = byId.get(productId);
    if (!product || product.factoryId === targetFactoryId) return;
    const factory = factories.find((f) => f._id === targetFactoryId);
    setProducts((prev) => prev.map((p) => (p._id === productId ? { ...p, factoryId: targetFactoryId } : p)));
    try {
      await RepositoryRemote.productConfig.updateProductConfig(productId, { factoryId: targetFactoryId });
      toast.success(`Đã chuyển "${product.fullName}" sang ${factory?.name || 'xưởng khác'}`);
    } catch (error) {
      handleAxiosError(error);
      fetchData();
    }
  };

  /**
   * Thả pending type vào cột xưởng → TẠO ngay Product Config tối thiểu
   * (fullName + shortName tự sinh + xưởng; Loại máy bổ sung sau ở trang
   * Products — schema đã nới machineTypeId optional). Đơn tồn của loại này gán
   * bằng nút "Tự động gán xưởng" ở trang Không xác định xưởng.
   */
  const handleCreateFromPending = async (type: string, targetFactoryId: string) => {
    const item = pending.find((p) => p.type === type);
    if (!item) return;
    const factory = factories.find((f) => f._id === targetFactoryId);
    setPending((prev) => prev.filter((p) => p.type !== type));
    try {
      const res = await RepositoryRemote.productConfig.createProductConfig({
        fullName: item.type,
        shortName: makeShortName(item.type),
        factoryId: targetFactoryId,
      } as CreateProductConfigDto);
      const created = (res.data?.data || {}) as Partial<ProductLite>;
      setProducts((prev) => [
        ...prev,
        {
          _id: created._id || `${PENDING_PREFIX}${item.type}`,
          fullName: created.fullName || item.type,
          shortName: created.shortName || makeShortName(item.type),
          mockup: created.mockup,
          factoryId: targetFactoryId,
        },
      ]);
      toast.success(
        `Đã tạo sản phẩm "${item.type}" ở ${factory?.name || 'xưởng'} — bổ sung Loại máy ở trang Products`,
      );
    } catch (error) {
      handleAxiosError(error);
      setPending((prev) => [item, ...prev]);
    }
  };

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId('');
    if (!e.over) return;
    const overId = String(e.over.id);
    if (overId === UNASSIGNED_COL_ID) return;
    const dragId = String(e.active.id);
    if (dragId.startsWith(PENDING_PREFIX)) {
      handleCreateFromPending(dragId.slice(PENDING_PREFIX.length), overId);
    } else {
      handleMove(dragId, overId);
    }
  };

  const activePending = activeId.startsWith(PENDING_PREFIX)
    ? pending.find((p) => p.type === activeId.slice(PENDING_PREFIX.length))
    : undefined;
  const activeProduct = activeId && !activePending ? byId.get(activeId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center">
          <Package size={18} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Gán sản phẩm theo xưởng</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kéo thả sản phẩm giữa các cột xưởng — thả vào cột nào là lưu ngay xưởng đó. Thẻ vàng ở cột "Chưa xác
            định xưởng" là loại sản phẩm quét từ đơn {SYNC_DAYS} ngày gần nhất chưa có config — kéo sang xưởng để
            tạo config mới. Chỉ ảnh hưởng đơn import về sau; đơn tồn gán bằng nút "Tự động gán xưởng" ở trang
            Không xác định xưởng.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size={20} className="text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-xs flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm sản phẩm trong mọi cột..."
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={13} className={cn(syncing && 'animate-spin')} />
              Sync sản phẩm chưa có xưởng ({SYNC_DAYS} ngày)
            </Button>
            {total > products.length && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Chỉ tải {products.length}/{total} sản phẩm đầu tiên
              </span>
            )}
          </div>

          {factories.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có xưởng nào.</p>
          )}

          {factories.length > 0 && (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
                <Column
                  id={UNASSIGNED_COL_ID}
                  title="Chưa xác định xưởng"
                  icon={<PackageSearch size={15} className="text-amber-600 dark:text-amber-400" />}
                  totalCount={pending.length + unassignedProducts.length}
                  visibleCount={visiblePending.length + visibleUnassigned.length}
                  emptyText={
                    pending.length + unassignedProducts.length === 0
                      ? synced
                        ? 'Không có sản phẩm nào chưa xác định xưởng'
                        : `Bấm "Sync sản phẩm chưa có xưởng" để quét đơn ${SYNC_DAYS} ngày gần nhất`
                      : 'Không sản phẩm nào khớp tìm kiếm'
                  }
                >
                  {visiblePending.map((p) => (
                    <DraggableCard key={`${PENDING_PREFIX}${p.type}`} id={`${PENDING_PREFIX}${p.type}`}>
                      <PendingCard p={p} />
                    </DraggableCard>
                  ))}
                  {visibleUnassigned.map((p) => (
                    <DraggableCard key={p._id} id={p._id}>
                      <ProductCard p={p} />
                    </DraggableCard>
                  ))}
                </Column>
                {columns.map((col) => {
                  const visible = col.products.filter(matches);
                  return (
                    <Column
                      key={col.id}
                      id={col.id}
                      title={col.title}
                      shortName={col.shortName}
                      icon={<FactoryIcon size={15} className="text-sky-600 dark:text-sky-400" />}
                      totalCount={col.products.length}
                      visibleCount={visible.length}
                      emptyText={
                        col.products.length === 0 ? 'Trống — kéo sản phẩm vào đây' : 'Không sản phẩm nào khớp tìm kiếm'
                      }
                    >
                      {visible.map((p) => (
                        <DraggableCard key={p._id} id={p._id}>
                          <ProductCard p={p} />
                        </DraggableCard>
                      ))}
                    </Column>
                  );
                })}
              </div>
              <DragOverlay dropAnimation={null}>
                {activePending ? (
                  <div className="rotate-2 opacity-90 w-64">
                    <PendingCard p={activePending} />
                  </div>
                ) : activeProduct ? (
                  <div className="rotate-2 opacity-90 w-64">
                    <ProductCard p={activeProduct} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}
    </div>
  );
}
