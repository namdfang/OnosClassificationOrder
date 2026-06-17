import React, { useEffect, useState } from 'react';
import { Plus, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { WorkshopConfigCategory } from 'shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { useWorkshopConfigStore } from '@/store/workshopConfigStore';
import { handleAxiosError } from '@/utils';
import { ImportProductConfigDialog } from './ImportProductConfigDialog';

interface ProductConfigRow {
  _id: string;
  fullName: string;
  shortName: string;
  computerType?: string;
  fabricType?: string;
  toolResult?: string;
  factory?: { name: string; shortName: string };
  machineType?: { name: string; shortName: string };
}

export function ProductConfigTab() {
  const [items, setItems] = useState<ProductConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const fabricOptions = useWorkshopConfigStore(
    (s) => s.byCategory[WorkshopConfigCategory.FabricType] || [],
  );
  const toolOptions = useWorkshopConfigStore(
    (s) => s.byCategory[WorkshopConfigCategory.ToolResult] || [],
  );
  const loadConfig = useWorkshopConfigStore((s) => s.load);
  const configLoaded = useWorkshopConfigStore((s) => s.loaded);

  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

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

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: '1', limit: '100' });
      if (search) params.set('search', search);
      const resp = await RepositoryRemote.productConfig.getProductConfigs(`?${params.toString()}`);
      setItems(resp.data.data || []);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Tìm theo tên hoặc viết tắt…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchData()}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const res = await RepositoryRemote.order.backfillFabric();
                const { scanned, updated } = res.data.data;
                toast.success(`Đã cập nhật loại vải cho ${updated}/${scanned} đơn`);
              } catch (error) {
                handleAxiosError(error);
              }
            }}
            title="Sau khi set Loại vải / Kết quả Tool cho sản phẩm, click để áp dụng cho các đơn đã import (idempotent — không ghi đè giá trị đã có)"
          >
            <RotateCw size={14} />
            Backfill vải + tool cho đơn
          </Button>
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
              <TableHead>Tên sản phẩm</TableHead>
              <TableHead>Viết tắt</TableHead>
              <TableHead>Máy</TableHead>
              <TableHead>Xưởng</TableHead>
              <TableHead className="min-w-[160px]">Loại vải</TableHead>
              <TableHead className="min-w-[140px]">Kết quả Tool</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Chưa có product config nào. Click "Import từ Excel" để bắt đầu.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              items.map((it) => (
                <TableRow key={it._id}>
                  <TableCell className="font-medium">{it.fullName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{it.shortName}</Badge>
                  </TableCell>
                  <TableCell>
                    {it.machineType ? (
                      <span>
                        <Badge variant="secondary">{it.machineType.shortName}</Badge>{' '}
                        <span className="text-xs text-muted-foreground">{it.machineType.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {it.factory ? (
                      <span>
                        <Badge variant="secondary">{it.factory.shortName}</Badge>{' '}
                        <span className="text-xs text-muted-foreground">{it.factory.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
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
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(it._id)}>
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <ImportProductConfigDialog open={importOpen} onOpenChange={setImportOpen} onSuccess={fetchData} />
    </div>
  );
}
