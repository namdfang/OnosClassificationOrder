import React, { useEffect, useRef, useState } from 'react';
import { ImageIcon, Pencil, Plus, RotateCw } from 'lucide-react';
import type { ProductItemSpecific, ProductVariation } from 'shared';
import { PRODUCT_LEVEL_MAP, PRODUCT_LEVELS, WorkshopConfigCategory } from 'shared';
import { toast } from 'sonner';

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
import { ProductConfigEditDialog } from './ProductConfigEditDialog';

export interface ProductConfigRow {
  _id: string;
  fullName: string;
  shortName: string;
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
  printArea?: string;
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
}

export function ProductConfigTab() {
  const [items, setItems] = useState<ProductConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [editItem, setEditItem] = useState<ProductConfigRow | null>(null);
  // Danh sách Xưởng / Phòng cho dropdown chỉnh sửa inline + dialog.
  const [factories, setFactories] = useState<RefItem[]>([]);
  const [machineTypes, setMachineTypes] = useState<RefItem[]>([]);
  const fabricOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.FabricType] || []);
  const toolOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.ToolResult] || []);
  const machineOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.Machine] || []);
  const printMethodOptions = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.PrintMethod] || []);
  const [productCategoryOptions, setProductCategoryOptions] = useState<RefItem[]>([]);
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // Load danh sách Xưởng + Phòng + Danh mục sản phẩm 1 lần (cho dropdown chỉnh sửa inline + dialog).
  useEffect(() => {
    (async () => {
      try {
        const [fRes, mRes, cRes] = await Promise.all([
          RepositoryRemote.factory.getFactories('?page=1&limit=200'),
          RepositoryRemote.machineType.getMachineTypes('?page=1&limit=200'),
          RepositoryRemote.productCategory.getProductCategories('?page=1&limit=200'),
        ]);
        setFactories((fRes.data?.data || []) as RefItem[]);
        setMachineTypes((mRes.data?.data || []) as RefItem[]);
        setProductCategoryOptions((cRes.data?.data || []) as RefItem[]);
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

  // Giá trị đã lưu (id → {mockup, guide}) để onBlur chỉ PATCH khi thực sự đổi.
  const savedText = useRef<Record<string, { mockup?: string; guide?: string }>>({});

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

  // Sau khi lưu từ dialog Edit: merge lạc quan + đồng bộ ref gate text.
  const applyEdit = (id: string, patch: Partial<ProductConfigRow>) => {
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, ...patch } : it)));
    savedText.current[id] = {
      mockup: patch.mockup ?? savedText.current[id]?.mockup ?? '',
      guide: patch.guide ?? savedText.current[id]?.guide ?? '',
    };
  };

  // Text field (mockup/guide): gõ chỉ cập nhật local; blur mới lưu nếu đổi.
  const handleTextInput = (id: string, field: 'mockup' | 'guide', value: string) => {
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, [field]: value } : it)));
  };
  const handleTextBlur = (id: string, field: 'mockup' | 'guide', value: string) => {
    const next = value.trim();
    if ((savedText.current[id]?.[field] || '') === next) return;
    savedText.current[id] = { ...savedText.current[id], [field]: next };
    patchField(id, { [field]: next });
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      const resp = await RepositoryRemote.productConfig.getProductConfigs(`?${params.toString()}`);
      const rows: ProductConfigRow[] = resp.data.data || [];
      setTotal(resp.data.total || 0);
      savedText.current = Object.fromEntries(
        rows.map((r) => [r._id, { mockup: r.mockup || '', guide: r.guide || '' }]),
      );
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
  }, [page, pageSize]);

  // Search → luôn về trang 1 (setPage(1) tự trigger refetch; nếu đang ở 1 thì gọi tay).
  const handleSearch = () => {
    if (page !== 1) setPage(1);
    else fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xoá product config này?')) return;
    try {
      await RepositoryRemote.productConfig.deleteProductConfig(id);
      toast.success('Đã xoá');
      fetchData();
    } catch (error) {
      handleAxiosError(error);
    }
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
        <Input
          placeholder="Tìm theo tên hoặc viết tắt…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="max-w-sm"
        />
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
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  Chưa có product config nào. Click "Import từ Excel" để bắt đầu.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              items.map((it) => (
                <TableRow key={it._id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
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
                      <Input
                        value={it.mockup || ''}
                        onChange={(e) => handleTextInput(it._id, 'mockup', e.target.value)}
                        onBlur={(e) => handleTextBlur(it._id, 'mockup', e.target.value)}
                        placeholder="URL mockup"
                        className="h-7 w-[118px] text-xs"
                      />
                    </div>
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
                    <Button variant="ghost" size="icon" onClick={() => setEditItem(it)} title="Chỉnh sửa sản phẩm">
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

      <ProductConfigEditDialog
        open={editItem !== null}
        onOpenChange={(v) => !v && setEditItem(null)}
        item={editItem}
        fabricOptions={fabricOptions}
        toolOptions={toolOptions}
        factoryOptions={factories}
        machineTypeOptions={machineTypes}
        productCategoryOptions={productCategoryOptions}
        printMethodOptions={printMethodOptions}
        onSaved={applyEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
