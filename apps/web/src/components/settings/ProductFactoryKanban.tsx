import React, { useEffect, useMemo, useState } from 'react';
import { Factory as FactoryIcon, ImageIcon, Package, Search } from 'lucide-react';
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

function DraggableCard({ p }: { p: ProductLite }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p._id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('cursor-grab active:cursor-grabbing touch-none', isDragging && 'opacity-30')}
    >
      <ProductCard p={p} />
    </div>
  );
}

function Column({
  id,
  title,
  shortName,
  products,
  visible,
}: {
  id: string;
  title: string;
  shortName?: string;
  products: ProductLite[];
  visible: ProductLite[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Cột cao cố định 70vh — danh sách sản phẩm cuộn bên trong.
        'flex flex-col h-[70vh] rounded-xl border bg-slate-50 dark:bg-slate-800/40 transition-colors',
        isOver
          ? 'border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-500/30'
          : 'border-slate-200 dark:border-slate-700/60',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200/70 dark:border-slate-700/60">
        <FactoryIcon size={15} className="text-sky-600 dark:text-sky-400" />
        <span className="flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">{title}</span>
        {shortName && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-500">
            {shortName}
          </span>
        )}
        <span className="text-xs tabular-nums text-slate-400">
          {visible.length === products.length ? products.length : `${visible.length}/${products.length}`}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {visible.map((p) => (
          <DraggableCard key={p._id} p={p} />
        ))}
        {visible.length === 0 && (
          <p className="py-4 text-center text-[11px] text-slate-400">
            {products.length === 0 ? 'Trống — kéo sản phẩm vào đây' : 'Không sản phẩm nào khớp tìm kiếm'}
          </p>
        )}
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

  // Chỉ các cột xưởng — sản phẩm chưa gán xưởng KHÔNG hiển thị (sửa ở bảng Config).
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

  const unassignedCount = useMemo(() => {
    const factoryIds = new Set(factories.map((f) => f._id));
    return products.filter((p) => !p.factoryId || !factoryIds.has(p.factoryId)).length;
  }, [factories, products]);

  const q = search.trim().toLowerCase();
  const matches = (p: ProductLite) =>
    !q || p.fullName.toLowerCase().includes(q) || p.shortName.toLowerCase().includes(q);

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

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId('');
    if (e.over) handleMove(String(e.active.id), String(e.over.id));
  };

  const activeProduct = activeId ? byId.get(activeId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center">
          <Package size={18} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Gán sản phẩm theo xưởng</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kéo thả sản phẩm giữa các cột xưởng — thả vào cột nào là lưu ngay xưởng đó. Chỉ ảnh hưởng đơn import về
            sau, đơn đã import giữ nguyên xưởng cũ.
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
            {unassignedCount > 0 && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {unassignedCount} sản phẩm chưa gán xưởng không hiển thị — gán ở trang Products
              </span>
            )}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                {columns.map((col) => (
                  <Column
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    shortName={col.shortName}
                    products={col.products}
                    visible={col.products.filter(matches)}
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
                {activeProduct ? (
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
