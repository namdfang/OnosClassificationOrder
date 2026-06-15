import React, { useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Role } from 'shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Spinner } from '@/components/common/Spinner';
import { PermissionMatrix } from '@/components/roles/PermissionMatrix';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [draftCodes, setDraftCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const res = await RepositoryRemote.roles.getRoles('?page=1&limit=50');
      setRoles((res.data?.data || []) as Role[]);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openEditor = (role: Role) => {
    setEditing(role);
    setDraftCodes(role.permissionCodes || []);
  };

  const close = () => {
    setEditing(null);
    setDraftCodes([]);
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      setSaving(true);
      await RepositoryRemote.roles.updatePermissions(editing._id!, { codes: draftCodes });
      toast.success('Đã lưu permissions');
      await fetchAll();
      close();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!editing) return;
    if (!confirm('Reset permissions của role này về preset mặc định?')) return;
    try {
      const res = await RepositoryRemote.roles.resetPermissions(editing._id!);
      toast.success('Đã reset về mặc định');
      const fresh = res.data?.data as Role;
      setDraftCodes(fresh?.permissionCodes || []);
      await fetchAll();
    } catch (err) {
      handleAxiosError(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
          <ShieldCheck size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Phân quyền</h1>
          <p className="text-sm text-muted-foreground">Chọn role bên dưới để cấu hình quyền truy cập trang, hành động và field</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <p className="text-xs text-muted-foreground">{roles.length} role</p>
          <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Tải lại
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Mô tả</TableHead>
              <TableHead className="w-24 text-center">Permissions</TableHead>
              <TableHead className="w-20">System</TableHead>
              <TableHead className="w-20 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && roles.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!loading && roles.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                  Chưa có role
                </TableCell>
              </TableRow>
            )}
            {roles.map((r) => (
              <TableRow key={r._id} className="hover:bg-accent/30 cursor-pointer" onClick={() => openEditor(r)}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.description || '—'}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{r.permissionCodes?.length || 0}</Badge>
                </TableCell>
                <TableCell>{r.isSystem && <Badge variant="secondary">System</Badge>}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={() => openEditor(r)}>
                    Sửa
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!editing} onOpenChange={(open) => !open && close()}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span>{editing?.name}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {draftCodes.length} đang chọn
              </span>
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-2 text-sm">
            {editing?.description && (
              <p className="text-muted-foreground">{editing.description}</p>
            )}
            {editing?.isSystem && (
              <p className="text-xs text-muted-foreground">
                Role hệ thống — không xóa được. Có thể chỉnh permissions hoặc reset về preset.
              </p>
            )}
          </div>

          <div className="mt-6">
            <PermissionMatrix value={draftCodes} onChange={setDraftCodes} />
          </div>

          <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-background border-t border-border mt-6 flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={!editing?.isSystem}>
              <RotateCcw size={13} />
              Reset preset
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                <X size={14} /> Hủy
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Spinner size={13} className="mr-1.5" />}
                Lưu
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
