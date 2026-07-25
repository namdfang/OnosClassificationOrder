import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImageIcon, Pencil, Plus, RotateCw } from 'lucide-react';
import type { ProductItemSpecific, ProductPrintArea, ProductVariation } from 'shared';
import { PRODUCT_LEVEL_MAP, PRODUCT_LEVELS, ProductConfigStatus, WorkshopConfigCategory } from 'shared';
import { toast } from 'sonner';

import { PATHS } from '@/constants/paths';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

import { RepositoryRemote } from '@/services';

import { PaginationBar } from '@/components/common/PaginationBar';
import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { handleAxiosError } from '@/utils';

import { ImportProductConfigDialog } from './ImportProductConfigDialog';

export interface ProductConfigRow {
  _id: string;
  fullName: string;
  shortName: string;
  sku?: string;
  status?: ProductConfigStatus;
  machineNumber?: string;
  fabricType?: string;
  toolResult?: string;
  mockup?: string;
  level?: number;
  guide?: string;
  factoryId?: string;
  machineTypeId?: string;
  factory?: { name: string; shortName: string };
  machineType?: { name: string; shortName: string };
  // Thông tin chi tiết sản phẩm (catalog cho khách hàng)
  productCategoryId?: string;
  productCategory?: { name: string; shortName: string };
  printMethod?: string;
  printArea?: ProductPrintArea;
  sizeChartUrl?: string;
  description?: string;
  itemSpecifics?: ProductItemSpecific[];
  weight?: number;
  width?: number;
  height?: number;
  length?: number;
  variations?: ProductVariation[];
}

/** Item danh sách Xưởng / Phòng cho dropdown (chỉ cần id + nhãn). */
export interface RefItem {
  _id: string;
  name: string;
  shortName: string;
  /** Chỉ Product Category dùng (danh mục đa cấp độ) — Xưởng/Phòng bỏ trống. */
  parentId?: string;
}

export const STATUS_META: Record<ProductConfigStatus, { label: string; className: string }> = {
  [ProductConfigStatus.Active]: { label: 'Hiển thị', className: 'bg-emerald-500 text-white border-emerald-500' },
  [ProductConfigStatus.Inactive]: { label: 'Ẩn khách hàng', className: 'bg-amber-500 text-white border-amber-500' },
  [ProductConfigStatus.Hidden]: { label: 'Đã ẩn', className: 'bg-slate-500 text-white border-slate-500' },
};

export function ProductConfigTab() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ProductConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  // Rỗng = mặc định BE (loại Hidden, vẫn thấy Active + Inactive).
  const [statusFilter, setStatusFilter] = useState<'' | ProductConfigStatus>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  // Danh sách Xưởng / Phòng cho dropdown chỉnh sửa inline + trang chi tiết.
  const [factories, setFactories] = useState<RefItem[]>([]);
  const [machineTypes, setMachineTypes] = useState<RefItem[]>([]);
  const fabricOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.FabricType] || []);
  const toolOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.ToolResult] || []);
  const machineOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.Machine] || []);
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // Load danh sách Xưởng + Phòng 1 lần (cho dropdown chỉnh sửa inline trong bảng).
  useEffect(() => {
    (async () => {
      try {
        const [fRes, mRes] = await Promise.all([
          RepositoryRemote.factory.getFactories('?page=1&limit=200'),
          RepositoryRemote.machineType.getMachineTypes('?page=1&limit=200'),
        ]);
        setFactories((fRes.data?.data || []) as RefItem[]);
        setMachineTypes((mRes.data?.data || []) as RefItem[]);
      } catch (error) {
        handleAxiosError(error);
      }
    })();
  }, []);

  const handleFactoryChange = async (id: string, factoryId: string) => {
    if (!factoryId) return; // Xưởng là bắt buộc — không cho về rỗng.
    const f = factories.find((x) => x._id === factoryId);
    setItems((prev) =>
      prev.map((it) =>
        it._id === id ? { ...it, factoryId, factory: f ? { name: f.name, shortName: f.shortName } : it.factory } : it,
      ),
    );
    try {
      await RepositoryRemote.productConfig.updateProductConfig(id, { factoryId } as never);
    } catch (error) {
      handleAxiosError(error);
      fetchData();
    }
  };

  const handleMachineTypeChange = async (id: string, machineTypeId: string) => {
    if (!machineTypeId) return; // Phòng là bắt buộc — không cho về rỗng.
    const m = machineTypes.find((x) => x._id === machineTypeId);
    setItems((prev) =>
      prev.map((it) =>
        it._id === id
          ? {
              ...it,
              machineTypeId,
              machineType: m ? { name: m.name, shortName: m.shortName } : it.machineType,
            }
          : it,
      ),
    );
    try {
      await RepositoryRemote.productConfig.updateProductConfig(id, { machineTypeId } as never);
    } catch (error) {
      handleAxiosError(error);
      fetchData();
    }
  };

  const handleFabricChange = async (id: string, value: string) => {
    const newFabric = value || undefined;
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, fabricType: newFabric } : it)));
    try {
      await RepositoryRemote.productConfig.updateProductConfig(id, { fabricType: newFabric });
    } catch (error) {
      handleAxiosError(error);
      fetchData();
    }
  };

  const handleToolChange = async (id: string, value: string) => {
    const newTool = value || undefined;
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, toolResult: newTool } : it)));
    try {
      await RepositoryRemote.productConfig.updateProductConfig(id, { toolResult: newTool });
    } catch (error) {
      handleAxiosError(error);
      fetchData();
    }
  };

  const handleStatusChange = async (id: string, value: ProductConfigStatus) => {
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, status: value } : it)));
    try {
      await RepositoryRemote.productConfig.updateProductConfig(id, { status: value });
      // Nếu đang lọc theo 1 trạng thái cụ thể, đổi sang trạng thái khác thì dòng này biến mất khỏi filter hiện tại.
      if (statusFilter && statusFilter !== value) fetchData();
    } catch (error) {
      handleAxiosError(error);
      fetchData();
    }
  };

  const patchField = async (id: string, patch: Partial<ProductConfigRow>) => {
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, ...patch } : it)));
    try {
      await RepositoryRemote.productConfig.updateProductConfig(id, patch as never);
    } catch (error) {
      handleAxiosError(error);
      fetchData();
    }
  };

  const handleLevelChange = (id: string, value: string) => {
    patchField(id, { level: value ? Number(value) : undefined });
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const resp = await RepositoryRemote.productConfig.getProductConfigs(`?${params.toString()}`);
      const rows: ProductConfigRow[] = resp.data.data || [];
      setTotal(resp.data.total || 0);
      setItems(rows);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, statusFilter]);

  // Search → luôn về trang 1 (setPage(1) tự trigger refetch; nếu đang ở 1 thì gọi tay).
  const handleSearch = () => {
    if (page !== 1) setPage(1);
    else fetchData();
  };

  const handleClearAll = async () => {
    if (!confirm('Xóa toàn bộ Product Config? Hành động này không thể hoàn tác.')) return;
    try {
      const res = await RepositoryRemote.productConfig.clearAllProductConfigs();
      const removed = res.data.data?.removed ?? 0;
      toast.success(`Đã xóa ${removed} product config`);
      if (page !== 1) setPage(1);
      else fetchData();
    } catch (error) {
      handleAxiosError(error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Tìm theo tên, viết tắt, SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as '' | ProductConfigStatus);
              setPage(1);
            }}
            className="rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="Lọc theo trạng thái — mặc định ẩn các sản phẩm Đã ẩn"
          >
            <option value="">Tất cả (trừ Đã ẩn)</option>
            <option value={ProductConfigStatus.Active}>{STATUS_META[ProductConfigStatus.Active].label}</option>
            <option value={ProductConfigStatus.Inactive}>{STATUS_META[ProductConfigStatus.Inactive].label}</option>
            <option value={ProductConfigStatus.Hidden}>{STATUS_META[ProductConfigStatus.Hidden].label}</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const res = await RepositoryRemote.order.backfillFabric();
                const { scanned, updated } = res.data.data;
                toast.success(`Đã backfill ${updated}/${scanned} đơn (loại vải / tool / máy)`);
              } catch (error) {
                handleAxiosError(error);
              }
            }}
            title="Sau khi set Loại vải / Kết quả Tool / Máy cho sản phẩm, click để áp dụng cho các đơn đã import (idempotent — không ghi đè giá trị đã có)"
          >
            <RotateCw size={14} />
            Backfill vải + tool + máy cho đơn
          </Button>
          {/* <Button variant="outline" onClick={handleClearAll} title="Xóa toàn bộ product config — dùng khi bắt đầu lại từ đầu">
            <Eraser size={14} />
            Xóa tất cả
          </Button> */}
          <Button onClick={() => setImportOpen(true)}>
            <Plus size={14} />
            Import từ Excel
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Mockup</TableHead>
              <TableHead>Tên sản phẩm</TableHead>
              <TableHead>Viết tắt</TableHead>
              <TableHead className="w-20">Máy</TableHead>
              <TableHead>Phòng</TableHead>
              <TableHead>Xưởng</TableHead>
              <TableHead className="min-w-[160px]">Loại vải</TableHead>
              <TableHead className="min-w-[140px]">Kết quả Tool</TableHead>
              <TableHead className="w-[150px]">Level</TableHead>
              <TableHead className="min-w-[140px]">Danh mục / Biến thể</TableHead>
              <TableHead className="min-w-[140px]">Trạng thái</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  Chưa có product config nào. Click "Import từ Excel" để bắt đầu.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              items.map((it) => (
                <TableRow key={it._id}>
                  <TableCell>
                    {it.mockup ? (
                      <a href={it.mockup} target="_blank" rel="noreferrer" title="Mở ảnh mockup">
                        <img
                          src={it.mockup}
                          alt="mockup"
                          className="w-14 h-14 rounded object-cover border border-border bg-muted"
                        />
                      </a>
                    ) : (
                      <div className="w-14 h-14 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground">
                        <ImageIcon size={16} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{it.fullName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{it.shortName}</Badge>
                  </TableCell>
                  <TableCell>
                    {it.machineNumber ? (
                      (() => {
                        const m = machineOptions.find((o) => o.code === it.machineNumber);
                        if (m?.color) {
                          return (
                            <Badge
                              className="font-normal border"
                              style={{ backgroundColor: m.color, color: '#fff', borderColor: m.color }}
                            >
                              {m.name}
                            </Badge>
                          );
                        }
                        return <Badge variant="secondary">{m?.name ?? it.machineNumber}</Badge>;
                      })()
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <select
                      value={it.machineTypeId || ''}
                      onChange={(e) => handleMachineTypeChange(it._id, e.target.value)}
                      className="w-full min-w-[130px] rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {!it.machineTypeId && <option value="">— Chưa chọn —</option>}
                      {machineTypes.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.shortName} · {m.name}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <select
                      value={it.factoryId || ''}
                      onChange={(e) => handleFactoryChange(it._id, e.target.value)}
                      className="w-full min-w-[130px] rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {!it.factoryId && <option value="">— Chưa chọn —</option>}
                      {factories.map((f) => (
                        <option key={f._id} value={f._id}>
                          {f.shortName} · {f.name}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <select
                      value={it.fabricType || ''}
                      onChange={(e) => handleFabricChange(it._id, e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">— Chưa chọn —</option>
                      {fabricOptions.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <select
                      value={it.toolResult || ''}
                      onChange={(e) => handleToolChange(it._id, e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">— Chưa chọn —</option>
                      {toolOptions.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {it.level ? (
                        <Badge
                          className="font-normal border shrink-0"
                          style={{
                            backgroundColor: PRODUCT_LEVEL_MAP[it.level]?.color,
                            color: '#fff',
                            borderColor: PRODUCT_LEVEL_MAP[it.level]?.color,
                          }}
                        >
                          Lv {it.level}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs shrink-0">—</span>
                      )}
                      <select
                        value={it.level ?? ''}
                        onChange={(e) => handleLevelChange(it._id, e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">— Chưa chọn —</option>
                        {PRODUCT_LEVELS.map((lv) => (
                          <option key={lv.value} value={lv.value}>
                            {lv.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs">
                      {it.productCategory ? (
                        <Badge variant="secondary" className="w-fit font-normal">
                          {it.productCategory.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <span className="text-muted-foreground">{it.variations?.length || 0} biến thể</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge className={`font-normal border w-fit ${STATUS_META[it.status || ProductConfigStatus.Active].className}`}>
                        {STATUS_META[it.status || ProductConfigStatus.Active].label}
                      </Badge>
                      <select
                        value={it.status || ProductConfigStatus.Active}
                        onChange={(e) => handleStatusChange(it._id, e.target.value as ProductConfigStatus)}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value={ProductConfigStatus.Active}>{STATUS_META[ProductConfigStatus.Active].label}</option>
                        <option value={ProductConfigStatus.Inactive}>{STATUS_META[ProductConfigStatus.Inactive].label}</option>
                        <option value={ProductConfigStatus.Hidden}>{STATUS_META[ProductConfigStatus.Hidden].label}</option>
                      </select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate(PATHS.PRODUCT_DETAIL.replace(':id', it._id))}
                      title="Chỉnh sửa sản phẩm"
                    >
                      <Pencil size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <PaginationBar
          position="bottom"
          page={page}
          pageSize={pageSize}
          total={total}
          loading={loading && items.length === 0}
          onChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
        />
      </div>

      <ImportProductConfigDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => {
          fetchData();
          loadConfig(true);
        }}
      />
    </div>
  );
}
