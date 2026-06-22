import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Palette, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignerTeamMember } from 'shared';
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

import { TeamMemberDialog, type DialogMode } from './TeamMemberDialog';

interface DialogState {
  open: boolean;
  mode: DialogMode;
  member: DesignerTeamMember | null;
}

const EMPTY_DIALOG: DialogState = { open: false, mode: 'create', member: null };

export default function DesignerTeamPage() {
  const [items, setItems] = useState<DesignerTeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(EMPTY_DIALOG);
  const [confirmDelete, setConfirmDelete] = useState<DesignerTeamMember | null>(null);
  const [resetTarget, setResetTarget] = useState<DesignerTeamMember | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const res = await RepositoryRemote.designer.listTeam();
      setItems((res.data?.data || []) as DesignerTeamMember[]);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const totals = useMemo(() => {
    const active = items.filter((i) => i.status === Status.Active).length;
    const inactive = items.length - active;
    const totalActiveTasks = items.reduce((s, i) => s + i.activeTaskCount, 0);
    return { active, inactive, totalActiveTasks };
  }, [items]);

  const openCreate = () => setDialog({ open: true, mode: 'create', member: null });
  const openEdit = (m: DesignerTeamMember) =>
    setDialog({ open: true, mode: 'edit', member: m });

  const handleToggle = async (m: DesignerTeamMember) => {
    try {
      await RepositoryRemote.designer.updateMember(m._id, {
        status: m.status === Status.Active ? Status.Disabled : Status.Active,
      });
      toast.success('Đã đổi trạng thái');
      fetchAll();
    } catch (err) {
      handleAxiosError(err);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await RepositoryRemote.designer.removeMember(confirmDelete._id);
      toast.success('Đã xoá');
      setConfirmDelete(null);
      fetchAll();
    } catch (err) {
      handleAxiosError(err);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (resetPwd.length < 8) {
      toast.error('Mật khẩu phải ít nhất 8 ký tự');
      return;
    }
    try {
      setResetting(true);
      await RepositoryRemote.designer.resetPassword(resetTarget._id, { password: resetPwd });
      toast.success(`Đã reset mật khẩu cho ${resetTarget.fullName} — gửi cho họ trước khi đóng`);
      setResetTarget(null);
      setResetPwd('');
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
          <Palette size={20} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Designer</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý sub-designer.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Đang làm" value={totals.active} accent="text-emerald-600" />
        <StatCard label="Tạm tắt" value={totals.inactive} accent="text-zinc-500" />
        <StatCard label="Task active toàn team" value={totals.totalActiveTasks} accent="text-indigo-600" />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <p className="text-xs text-muted-foreground">{items.length} thành viên</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Tải lại
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} /> Thêm sub-designer
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Họ tên</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-24 text-center">Đang làm</TableHead>
              <TableHead className="w-24 text-center">Đã xong</TableHead>
              <TableHead className="w-32">Vào làm</TableHead>
              <TableHead className="w-28">Trạng thái</TableHead>
              <TableHead className="w-40 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Spinner size={20} className="text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                  Chưa có sub-designer — bấm <strong>+ Thêm sub-designer</strong> ở góc trên.
                </TableCell>
              </TableRow>
            )}
            {items.map((it) => (
              <TableRow key={it._id}>
                <TableCell className="font-medium">{it.fullName}</TableCell>
                <TableCell className="text-muted-foreground">{it.email}</TableCell>
                <TableCell className="text-center">
                  {it.activeTaskCount > 0 ? (
                    <Badge variant="default" className="bg-indigo-500 hover:bg-indigo-500">
                      {it.activeTaskCount}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">
                  {it.completedTaskCount}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {it.hireDate ? new Date(it.hireDate).toLocaleDateString('vi-VN') : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={it.status === Status.Active}
                      onCheckedChange={() => handleToggle(it)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {it.status === Status.Active ? 'Bật' : 'Tắt'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setResetTarget(it)}
                    title="Reset mật khẩu"
                  >
                    <KeyRound size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(it)} title="Sửa">
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(it)}
                    title="Xoá"
                    disabled={it.activeTaskCount > 0}
                  >
                    <Trash2
                      size={14}
                      className={it.activeTaskCount > 0 ? 'text-muted-foreground' : 'text-destructive'}
                    />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TeamMemberDialog
        open={dialog.open}
        mode={dialog.mode}
        member={dialog.member}
        onClose={() => setDialog(EMPTY_DIALOG)}
        onSaved={fetchAll}
      />

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá sub-designer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Xoá <span className="font-medium text-foreground">{confirmDelete?.fullName}</span> ({confirmDelete?.email})?
            User sẽ không đăng nhập được. Các đơn đã hoàn thành của user vẫn giữ liên kết để stats không mất.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Huỷ
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && (setResetTarget(null), setResetPwd(''))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset mật khẩu</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Reset mật khẩu cho <span className="font-medium text-foreground">{resetTarget?.fullName}</span>.
            User sẽ phải đổi mật khẩu khi đăng nhập lần kế.
          </p>
          <div className="space-y-2">
            <Label>Mật khẩu mới</Label>
            <Input
              type="text"
              className="font-mono"
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              placeholder="Ít nhất 8 ký tự"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetTarget(null);
                setResetPwd('');
              }}
            >
              Huỷ
            </Button>
            <Button onClick={handleResetPassword} disabled={resetting}>
              {resetting && <Spinner size={14} className="mr-2" />}
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}
