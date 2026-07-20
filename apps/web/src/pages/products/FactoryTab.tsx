import React, { useEffect, useState } from 'react';
import { Pencil, Plus, RotateCw, Trash2 } from 'lucide-react';
import type { CreateWorkshopConfigDto, WorkshopConfig } from 'shared';
import { WorkshopConfigCategory } from 'shared';
import { toast } from 'sonner';

import { useWorkshopConfigStore } from '@/store/workshopConfigStore';

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

import { IconPicker, LucideIcon } from '@/pages/workshop-config/IconPicker';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

interface FabricFormState {
  open: boolean;
  mode: 'create' | 'edit';
  id?: string;
  code: string;
  name: string;
  icon: string;
  isActive: boolean;
}

const FABRIC_FORM_DEFAULT: FabricFormState = {
  open: false,
  mode: 'create',
  code: '',
  name: '',
  icon: 'Shirt',
  isActive: true,
};

interface ListItem {
  _id: string;
  name: string;
  shortName: string;
  isActive: boolean;
}

interface FormState {
  open: boolean;
  mode: 'create' | 'edit';
  type: 'factory' | 'machineType';
  data: { _id?: string; name: string; shortName: string; isActive: boolean };
}

const DEFAULT_FORM: FormState = {
  open: false,
  mode: 'create',
  type: 'factory',
  data: { name: '', shortName: '', isActive: true },
};

export function FactoryTab() {
  const [factories, setFactories] = useState<ListItem[]>([]);
  const [machineTypes, setMachineTypes] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const fabricItems = useWorkshopConfigStore((s) => s.byCategory[WorkshopConfigCategory.FabricType] || []);
  const fabricLoaded = useWorkshopConfigStore((s) => s.loaded);
  const fabricLoading = useWorkshopConfigStore((s) => s.loading);
  const loadFabrics = useWorkshopConfigStore((s) => s.load);
  const upsertFabric = useWorkshopConfigStore((s) => s.upsertItem);
  const removeFabric = useWorkshopConfigStore((s) => s.removeItem);
  const [fabricForm, setFabricForm] = useState<FabricFormState>(FABRIC_FORM_DEFAULT);
  const [fabricSaving, setFabricSaving] = useState(false);
  const [fabricConfirmDelete, setFabricConfirmDelete] = useState<WorkshopConfig | null>(null);

  useEffect(() => {
    if (!fabricLoaded && !fabricLoading) loadFabrics();
  }, [fabricLoaded, fabricLoading, loadFabrics]);

  const openFabricCreate = () => setFabricForm({ ...FABRIC_FORM_DEFAULT, open: true });
  const openFabricEdit = (item: WorkshopConfig) =>
    setFabricForm({
      open: true,
      mode: 'edit',
      id: item._id,
      code: item.code,
      name: item.name,
      icon: item.icon || 'Shirt',
      isActive: item.isActive,
    });

  const handleFabricNameChange = (name: string) => {
    if (fabricForm.mode === 'create') {
      setFabricForm({ ...fabricForm, name, code: fabricForm.code || slugify(name) });
    } else {
      setFabricForm({ ...fabricForm, name });
    }
  };

  const handleFabricSubmit = async () => {
    if (!fabricForm.name.trim() || !fabricForm.code.trim()) {
      toast.error('Vui lòng nhập tên và mã');
      return;
    }
    try {
      setFabricSaving(true);
      if (fabricForm.mode === 'create') {
        const payload: CreateWorkshopConfigDto = {
          category: WorkshopConfigCategory.FabricType,
          code: fabricForm.code,
          name: fabricForm.name,
          icon: fabricForm.icon,
          isActive: fabricForm.isActive,
        };
        const res = await RepositoryRemote.workshopConfig.create(payload);
        upsertFabric(res.data.data);
        toast.success('Đã thêm loại vải');
      } else if (fabricForm.id) {
        const res = await RepositoryRemote.workshopConfig.update(fabricForm.id, {
          code: fabricForm.code,
          name: fabricForm.name,
          icon: fabricForm.icon,
          isActive: fabricForm.isActive,
        });
        upsertFabric(res.data.data);
        toast.success('Đã cập nhật');
      }
      setFabricForm(FABRIC_FORM_DEFAULT);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setFabricSaving(false);
    }
  };

  const handleFabricDelete = async () => {
    if (!fabricConfirmDelete) return;
    try {
      await RepositoryRemote.workshopConfig.remove(fabricConfirmDelete._id!);
      removeFabric(fabricConfirmDelete._id!);
      toast.success('Đã xóa');
      setFabricConfirmDelete(null);
    } catch (error) {
      handleAxiosError(error);
    }
  };

  const handleFabricReset = async () => {
    if (
      !confirm(
        'Reset toàn bộ Loại vải về danh sách seed? Tất cả entry hiện tại sẽ bị xóa và tạo lại từ seed. Hành động này không thể hoàn tác.',
      )
    )
      return;
    try {
      const res = await RepositoryRemote.workshopConfig.resetCategory(WorkshopConfigCategory.FabricType);
      const { removed, inserted } = res.data.data;
      toast.success(`Đã reset: xóa ${removed}, tạo lại ${inserted} loại vải`);
      await loadFabrics(true);
    } catch (error) {
      handleAxiosError(error);
    }
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [fResp, mResp] = await Promise.all([
        RepositoryRemote.factory.getFactories('?page=1&limit=100'),
        RepositoryRemote.machineType.getMachineTypes('?page=1&limit=100'),
      ]);
      setFactories(fResp.data.data || []);
      setMachineTypes(mResp.data.data || []);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openCreate = (type: 'factory' | 'machineType') =>
    setForm({ open: true, mode: 'create', type, data: { name: '', shortName: '', isActive: true } });

  const openEdit = (type: 'factory' | 'machineType', item: ListItem) =>
    setForm({
      open: true,
      mode: 'edit',
      type,
      data: { _id: item._id, name: item.name, shortName: item.shortName, isActive: item.isActive },
    });

  const handleSubmit = async () => {
    const { mode, type, data } = form;
    if (!data.name.trim() || !data.shortName.trim()) {
      toast.error('Tên và viết tắt là bắt buộc');
      return;
    }

    try {
      if (mode === 'create') {
        if (type === 'factory') {
          await RepositoryRemote.factory.createFactory({
            name: data.name,
            shortName: data.shortName,
            isActive: data.isActive,
          });
        } else {
          await RepositoryRemote.machineType.createMachineType({
            name: data.name,
            shortName: data.shortName,
            isActive: data.isActive,
          });
        }
        toast.success('Đã tạo');
      } else if (data._id) {
        if (type === 'factory') {
          await RepositoryRemote.factory.updateFactory(data._id, {
            name: data.name,
            shortName: data.shortName,
            isActive: data.isActive,
          });
        } else {
          await RepositoryRemote.machineType.updateMachineType(data._id, {
            name: data.name,
            shortName: data.shortName,
            isActive: data.isActive,
          });
        }
        toast.success('Đã cập nhật');
      }
      setForm(DEFAULT_FORM);
      fetchAll();
    } catch (error) {
      handleAxiosError(error);
    }
  };

  const renderTable = (items: ListItem[], type: 'factory' | 'machineType', title: string, description: string) => (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <Button size="sm" onClick={() => openCreate(type)}>
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
                Chưa có dữ liệu
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            items.map((it) => (
              <TableRow key={it._id}>
                <TableCell className="font-medium">{it.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{it.shortName}</Badge>
                </TableCell>
                <TableCell>
                  {it.isActive ? <Badge variant="success">Hoạt động</Badge> : <Badge variant="secondary">Tắt</Badge>}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(type, it)}>
                    Sửa
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      {renderTable(factories, 'factory', 'Xưởng', 'Danh sách các xưởng sản xuất')}
      {renderTable(machineTypes, 'machineType', 'Loại máy', 'Các loại máy in trong xưởng')}

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Loại vải</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Danh sách loại vải / blank. Tự sinh khi import Product Config có label mới.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleFabricReset}
              title="Xóa toàn bộ rồi tạo lại từ seed (22 loại vải mặc định)"
            >
              <RotateCw size={14} />
              Reset từ seed
            </Button>
            <Button size="sm" onClick={openFabricCreate}>
              <Plus size={14} />
              Thêm
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Icon</TableHead>
              <TableHead>Tên</TableHead>
              <TableHead>Mã</TableHead>
              <TableHead className="w-24">Trạng thái</TableHead>
              <TableHead className="w-28 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fabricLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!fabricLoading && fabricItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                  Chưa có loại vải nào
                </TableCell>
              </TableRow>
            )}
            {!fabricLoading &&
              fabricItems.map((it) => (
                <TableRow key={it._id}>
                  <TableCell>
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-muted">
                      <LucideIcon name={it.icon} size={16} />
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{it.code}</TableCell>
                  <TableCell>
                    {it.isActive ? <Badge variant="success">Bật</Badge> : <Badge variant="secondary">Tắt</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openFabricEdit(it)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setFabricConfirmDelete(it)}>
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={fabricForm.open} onOpenChange={(open) => !open && setFabricForm(FABRIC_FORM_DEFAULT)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fabricForm.mode === 'create' ? 'Thêm loại vải' : 'Sửa loại vải'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Tên hiển thị</Label>
              <Input
                value={fabricForm.name}
                onChange={(e) => handleFabricNameChange(e.target.value)}
                placeholder="VD: POLY 2 DA"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Mã <span className="text-muted-foreground">(slug, dùng để lưu trữ)</span>
              </Label>
              <Input
                value={fabricForm.code}
                onChange={(e) => setFabricForm({ ...fabricForm, code: slugify(e.target.value) })}
                placeholder="vd: poly-2-da"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <IconPicker value={fabricForm.icon} onChange={(i) => setFabricForm({ ...fabricForm, icon: i })} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label>Hoạt động</Label>
              <Switch
                checked={fabricForm.isActive}
                onCheckedChange={(v) => setFabricForm({ ...fabricForm, isActive: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFabricForm(FABRIC_FORM_DEFAULT)}>
              Hủy
            </Button>
            <Button onClick={handleFabricSubmit} disabled={fabricSaving}>
              {fabricSaving && <Spinner size={14} className="mr-2" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fabricConfirmDelete} onOpenChange={(open) => !open && setFabricConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa loại vải</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Xóa <span className="font-medium text-foreground">{fabricConfirmDelete?.name}</span>? Product đang dùng vẫn
            giữ giá trị cũ nhưng sẽ không chọn được nữa.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFabricConfirmDelete(null)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleFabricDelete}>
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={form.open} onOpenChange={(open) => !open && setForm(DEFAULT_FORM)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.mode === 'create' ? 'Thêm' : 'Sửa'} {form.type === 'factory' ? 'xưởng' : 'loại máy'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Tên</Label>
              <Input
                value={form.data.name}
                onChange={(e) => setForm({ ...form, data: { ...form.data, name: e.target.value } })}
                placeholder={form.type === 'factory' ? 'Xưởng Mê Linh' : 'In và cắt laser'}
              />
            </div>
            <div className="space-y-2">
              <Label>Tên viết tắt</Label>
              <Input
                value={form.data.shortName}
                onChange={(e) => setForm({ ...form, data: { ...form.data, shortName: e.target.value.toUpperCase() } })}
                placeholder={form.type === 'factory' ? 'ML' : 'ICL'}
                maxLength={20}
              />
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
            <Button variant="outline" onClick={() => setForm(DEFAULT_FORM)}>
              Hủy
            </Button>
            <Button onClick={handleSubmit}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
