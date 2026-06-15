import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Role } from 'shared';
import { Status } from 'shared';

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
import { handleAxiosError } from '@/utils';

interface UserRow {
  _id: string;
  fullName: string;
  email: string;
  roleId?: string;
  status?: string;
  role?: Role;
}

interface FormState {
  open: boolean;
  mode: 'create' | 'edit';
  id?: string;
  fullName: string;
  email: string;
  password: string;
  roleId: string;
}

const EMPTY_FORM: FormState = { open: false, mode: 'create', fullName: '', email: '', password: '', roleId: '' };

export default function UsersPage() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);

  const roleMap = useMemo(() => Object.fromEntries(roles.map((r) => [r._id, r])), [roles]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [uRes, rRes] = await Promise.all([
        RepositoryRemote.users.getUsers('?page=1&limit=200'),
        RepositoryRemote.roles.getRoles('?page=1&limit=50'),
      ]);
      setItems((uRes.data?.data || []) as UserRow[]);
      setRoles((rRes.data?.data || []) as Role[]);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openCreate = () =>
    setForm({ ...EMPTY_FORM, open: true, mode: 'create', roleId: roles[0]?._id || '' });

  const openEdit = (it: UserRow) =>
    setForm({
      open: true,
      mode: 'edit',
      id: it._id,
      fullName: it.fullName,
      email: it.email,
      password: '',
      roleId: it.roleId || '',
    });

  const handleSubmit = async () => {
    if (!form.fullName.trim() || !form.email.trim() || !form.roleId) {
      toast.error('Vui lòng nhập đủ Tên, Email, Role');
      return;
    }
    if (form.mode === 'create' && form.password.length < 8) {
      toast.error('Mật khẩu phải có ít nhất 8 ký tự');
      return;
    }
    try {
      setSaving(true);
      if (form.mode === 'create') {
        await RepositoryRemote.users.createUser({
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          roleId: form.roleId,
          otherPermissionIds: [],
        } as any);
        toast.success('Đã tạo user');
      } else if (form.id) {
        await RepositoryRemote.users.adminUpdateUser(form.id, {
          fullName: form.fullName,
          email: form.email,
          roleId: form.roleId,
        } as any);
        toast.success('Đã cập nhật');
      }
      setForm(EMPTY_FORM);
      fetchAll();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await RepositoryRemote.users.adminDeleteUser(confirmDelete._id!);
      toast.success('Đã xóa');
      setConfirmDelete(null);
      fetchAll();
    } catch (err) {
      handleAxiosError(err);
    }
  };

  const handleToggle = async (it: UserRow) => {
    try {
      await RepositoryRemote.users.toggleActive(it._id!);
      toast.success('Đã đổi trạng thái');
      fetchAll();
    } catch (err) {
      handleAxiosError(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
          <UsersIcon size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Người dùng</h1>
          <p className="text-sm text-muted-foreground">Tạo, sửa, gán role và toggle trạng thái user</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <p className="text-xs text-muted-foreground">{items.length} user</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Tải lại
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} /> Thêm user
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Họ tên</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-28">Trạng thái</TableHead>
              <TableHead className="w-32 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                  Chưa có user
                </TableCell>
              </TableRow>
            )}
            {items.map((it) => {
              const role = it.role || roleMap[it.roleId || ''];
              return (
                <TableRow key={it._id}>
                  <TableCell className="font-medium">{it.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{it.email}</TableCell>
                  <TableCell>
                    {role ? <Badge variant="outline">{role.name}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={it.status === Status.Active} onCheckedChange={() => handleToggle(it)} />
                      <span className="text-xs text-muted-foreground">{it.status === Status.Active ? 'Bật' : 'Tắt'}</span>
                    </div>
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
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={form.open} onOpenChange={(open) => !open && setForm(EMPTY_FORM)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.mode === 'create' ? 'Thêm user' : 'Sửa user'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Họ tên</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="VD: Nguyễn Văn A"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="user@onos.com"
                type="email"
              />
            </div>
            {form.mode === 'create' && (
              <div className="space-y-2">
                <Label>Mật khẩu</Label>
                <Input
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  type="password"
                  placeholder="Tối thiểu 8 ký tự"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Role</Label>
              <select
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {roles.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(EMPTY_FORM)}>
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
            <DialogTitle>Xóa user</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Xóa user <span className="font-medium text-foreground">{confirmDelete?.fullName}</span> ({confirmDelete?.email})?
            Họ sẽ không đăng nhập được nữa.
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
