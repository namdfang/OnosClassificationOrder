import React, { useEffect, useState } from 'react';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  CreateWorkshopConfigDto,
  WorkshopConfig,
  WorkshopConfigCategory,
  WorkshopConfigDisplayMode,
} from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

import { ColorPicker } from './ColorPicker';
import { IconPicker, LucideIcon } from './IconPicker';

interface FormState {
  open: boolean;
  mode: 'create' | 'edit';
  id?: string;
  code: string;
  name: string;
  color?: string;
  icon?: string;
  isActive: boolean;
  /** Required khi category=production_error. */
  errorSource?: 'designer' | 'factory' | 'tool-check';
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

interface Props {
  category: WorkshopConfigCategory;
  mode: WorkshopConfigDisplayMode;
}

export function CategoryEditor({ category, mode }: Props) {
  const { byCategory, load, loaded, loading, upsertItem, removeItem } = useWorkshopConfigStore();
  const items = byCategory[category] || [];

  // Chỉ category `production_error` cần errorSource (designer/factory) để
  // dashboard stats phân loại lỗi.
  const needsErrorSource = (category as string) === 'production_error';

  const [form, setForm] = useState<FormState>({ open: false, mode: 'create', code: '', name: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WorkshopConfig | null>(null);

  useEffect(() => {
    if (!loaded && !loading) load();
  }, [loaded, loading, load]);

  const openCreate = () =>
    setForm({
      open: true,
      mode: 'create',
      code: '',
      name: '',
      color: mode === 'color' ? '#3B82F6' : undefined,
      icon: mode === 'icon' ? 'User' : undefined,
      isActive: true,
      errorSource: needsErrorSource ? 'factory' : undefined,
    });

  const openEdit = (item: WorkshopConfig) =>
    setForm({
      open: true,
      mode: 'edit',
      id: item._id,
      code: item.code,
      name: item.name,
      color: item.color,
      icon: item.icon,
      isActive: item.isActive,
      errorSource: (item as { errorSource?: 'designer' | 'factory' | 'tool-check' }).errorSource,
    });

  const handleNameChange = (name: string) => {
    if (form.mode === 'create') {
      setForm({ ...form, name, code: form.code || slugify(name) });
    } else {
      setForm({ ...form, name });
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Vui lòng nhập tên và mã');
      return;
    }
    if (mode === 'color' && !form.color) {
      toast.error('Hãy chọn màu');
      return;
    }
    if (mode === 'icon' && !form.icon) {
      toast.error('Hãy chọn icon');
      return;
    }
    if (needsErrorSource && !form.errorSource) {
      toast.error('Phải chọn lỗi do designer hay do xưởng');
      return;
    }
    try {
      setSaving(true);
      if (form.mode === 'create') {
        const payload: CreateWorkshopConfigDto = {
          category,
          code: form.code,
          name: form.name,
          color: mode === 'color' ? form.color : undefined,
          icon: mode === 'icon' ? form.icon : undefined,
          isActive: form.isActive,
          errorSource: needsErrorSource ? form.errorSource : undefined,
        };
        const res = await RepositoryRemote.workshopConfig.create(payload);
        upsertItem(res.data.data);
        toast.success('Đã thêm');
      } else if (form.id) {
        const res = await RepositoryRemote.workshopConfig.update(form.id, {
          code: form.code,
          name: form.name,
          color: mode === 'color' ? form.color : undefined,
          icon: mode === 'icon' ? form.icon : undefined,
          isActive: form.isActive,
          errorSource: needsErrorSource ? form.errorSource : undefined,
        });
        upsertItem(res.data.data);
        toast.success('Đã cập nhật');
      }
      setForm({ ...form, open: false });
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await RepositoryRemote.workshopConfig.remove(confirmDelete._id!);
      removeItem(confirmDelete._id!);
      toast.success('Đã xóa');
      setConfirmDelete(null);
    } catch (error) {
      handleAxiosError(error);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <p className="text-xs text-muted-foreground">
          {items.length} mục — hiển thị dạng <span className="font-medium text-foreground">{mode === 'color' ? 'badge màu' : 'icon'}</span>
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} /> Thêm
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead className="w-20">Hiển thị</TableHead>
            <TableHead>Tên</TableHead>
            <TableHead>Mã</TableHead>
            <TableHead className="w-24">Trạng thái</TableHead>
            <TableHead className="w-28 text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                <Spinner size={20} className="text-muted-foreground" />
              </TableCell>
            </TableRow>
          )}
          {!loading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                Chưa có mục nào
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            items.map((it) => (
              <TableRow key={it._id}>
                <TableCell className="text-muted-foreground">
                  <GripVertical size={14} />
                </TableCell>
                <TableCell>
                  {mode === 'color' ? (
                    <Badge
                      className="font-normal border"
                      style={{ backgroundColor: it.color, color: '#fff', borderColor: it.color }}
                    >
                      {it.name}
                    </Badge>
                  ) : (
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-muted">
                      <LucideIcon name={it.icon} size={16} />
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-medium">
                  {it.name}
                  {needsErrorSource && (
                    <ErrorSourceBadge source={(it as { errorSource?: 'designer' | 'factory' | 'tool-check' }).errorSource} />
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{it.code}</TableCell>
                <TableCell>
                  {it.isActive ? (
                    <Badge variant="success">Bật</Badge>
                  ) : (
                    <Badge variant="secondary">Tắt</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(it)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(it)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>

      <Dialog open={form.open} onOpenChange={(open) => setForm({ ...form, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.mode === 'create' ? 'Thêm mục' : 'Sửa mục'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Tên hiển thị</Label>
              <Input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="VD: Đã in (máy 1)"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Mã <span className="text-muted-foreground">(slug, dùng để lưu trữ)</span>
              </Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: slugify(e.target.value) })}
                placeholder="vd: machine-1"
                className="font-mono"
              />
            </div>
            {mode === 'color' ? (
              <div className="space-y-2">
                <Label>Màu</Label>
                <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Icon</Label>
                <IconPicker value={form.icon} onChange={(i) => setForm({ ...form, icon: i })} />
              </div>
            )}
            {needsErrorSource && (
              <div className="space-y-2">
                <Label>Loại lỗi *</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, errorSource: 'designer' })}
                    className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                      form.errorSource === 'designer'
                        ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
                        : 'border-border bg-background text-muted-foreground hover:border-violet-300'
                    }`}
                  >
                    Do designer làm
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, errorSource: 'factory' })}
                    className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                      form.errorSource === 'factory'
                        ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
                        : 'border-border bg-background text-muted-foreground hover:border-sky-300'
                    }`}
                  >
                    Do xưởng làm
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, errorSource: 'tool-check' })}
                    className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                      form.errorSource === 'tool-check'
                        ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                        : 'border-border bg-background text-muted-foreground hover:border-amber-300'
                    }`}
                  >
                    Do soát tool
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Lỗi do designer → "Cần làm lại" cho designer. Do soát tool → đẩy về Support
                  (vd thiếu file để in). Dashboard thống kê phân biệt các loại.
                </p>
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label>Hoạt động</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm({ ...form, open: false })}>
              Hủy
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Spinner size={14} className="mr-2" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa mục</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Xóa <span className="font-medium text-foreground">{confirmDelete?.name}</span>? Mục đã được dùng trong đơn hàng vẫn giữ giá trị cũ nhưng sẽ không chọn được nữa.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ErrorSourceBadge({ source }: { source?: 'designer' | 'factory' | 'tool-check' }) {
  if (!source) {
    return (
      <span className="ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/20">
        ? CHƯA GÁN
      </span>
    );
  }
  if (source === 'designer') {
    return (
      <span className="ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
        DES
      </span>
    );
  }
  if (source === 'tool-check') {
    return (
      <span className="ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
        SOÁT TOOL
      </span>
    );
  }
  return (
    <span className="ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
      XƯỞNG
    </span>
  );
}
