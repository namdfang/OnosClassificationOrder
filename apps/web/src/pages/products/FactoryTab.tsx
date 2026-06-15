import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { handleAxiosError } from '@/utils';

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
      const repo = type === 'factory' ? RepositoryRemote.factory : RepositoryRemote.machineType;
      if (mode === 'create') {
        if (type === 'factory') {
          await repo.createFactory({ name: data.name, shortName: data.shortName, isActive: data.isActive });
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

  const renderTable = (
    items: ListItem[],
    type: 'factory' | 'machineType',
    title: string,
    description: string,
  ) => (
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
                  {it.isActive ? (
                    <Badge variant="success">Hoạt động</Badge>
                  ) : (
                    <Badge variant="secondary">Tắt</Badge>
                  )}
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
