import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { handleAxiosError } from '@/utils';
import { sortCategoryTree } from '@/utils/categoryTree';

interface ProductCategoryRow {
  _id: string;
  name: string;
  shortName: string;
  isActive: boolean;
  parentId?: string;
}

interface FormState {
  open: boolean;
  mode: 'create' | 'edit';
  data: { _id?: string; name: string; shortName: string; isActive: boolean; parentId: string };
}

const DEFAULT_FORM: FormState = {
  open: false,
  mode: 'create',
  data: { name: '', shortName: '', isActive: true, parentId: '' },
};

export function ProductCategoryTab() {
  const [items, setItems] = useState<ProductCategoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await RepositoryRemote.productCategory.getProductCategories('?page=1&limit=200');
      setItems(res.data?.data || []);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreate = () =>
    setForm({ open: true, mode: 'create', data: { name: '', shortName: '', isActive: true, parentId: '' } });

  const openEdit = (item: ProductCategoryRow) =>
    setForm({
      open: true,
      mode: 'edit',
      data: {
        _id: item._id,
        name: item.name,
        shortName: item.shortName,
        isActive: item.isActive,
        parentId: item.parentId || '',
      },
    });

  const handleSubmit = async () => {
    const { mode, data } = form;
    if (!data.name.trim() || !data.shortName.trim()) {
      toast.error('Tên và viết tắt là bắt buộc');
      return;
    }

    const payload = {
      name: data.name,
      shortName: data.shortName,
      isActive: data.isActive,
      parentId: data.parentId || undefined,
    };
    try {
      setSaving(true);
      if (mode === 'create') {
        await RepositoryRemote.productCategory.createProductCategory(payload);
        toast.success('Đã tạo danh mục');
      } else if (data._id) {
        await RepositoryRemote.productCategory.updateProductCategory(data._id, payload);
        toast.success('Đã cập nhật');
      }
      setForm(DEFAULT_FORM);
      fetchData();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Danh mục sản phẩm</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dùng để phân loại sản phẩm ở catalog khách hàng + phạm vi chương trình giảm giá.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} />
            Thêm
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Viết tắt</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                  Chưa có danh mục nào.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              sortCategoryTree(items).map((it) => (
                <TableRow key={it._id}>
                  <TableCell className="font-medium">
                    <span style={{ paddingLeft: it.depth * 20 }} className="inline-flex items-center gap-1.5">
                      {it.depth > 0 && <span className="text-muted-foreground">└</span>}
                      {it.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{it.shortName}</Badge>
                  </TableCell>
                  <TableCell>
                    {it.isActive ? <Badge variant="success">Hoạt động</Badge> : <Badge variant="secondary">Tắt</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(it)}>
                      Sửa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={form.open} onOpenChange={(open) => !open && setForm(DEFAULT_FORM)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.mode === 'create' ? 'Thêm danh mục sản phẩm' : 'Sửa danh mục sản phẩm'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Tên</Label>
              <Input
                value={form.data.name}
                onChange={(e) => setForm({ ...form, data: { ...form.data, name: e.target.value } })}
                placeholder="VD: Áo/Quần"
              />
            </div>
            <div className="space-y-2">
              <Label>Tên viết tắt</Label>
              <Input
                value={form.data.shortName}
                onChange={(e) => setForm({ ...form, data: { ...form.data, shortName: e.target.value.toUpperCase() } })}
                placeholder="VD: APPAREL"
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label>Danh mục cha (để trống = danh mục gốc)</Label>
              <select
                value={form.data.parentId}
                onChange={(e) => setForm({ ...form, data: { ...form.data, parentId: e.target.value } })}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— Không có (danh mục gốc) —</option>
                {sortCategoryTree(items)
                  .filter((it) => it._id !== form.data._id)
                  .map((it) => (
                    <option key={it._id} value={it._id}>
                      {'—'.repeat(it.depth)} {it.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label>Hoạt động</Label>
              <Switch
                checked={form.data.isActive}
                onCheckedChange={(v) => setForm({ ...form, data: { ...form.data, isActive: v } })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(DEFAULT_FORM)} disabled={saving}>
              Hủy
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Spinner size={14} className="mr-2" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
