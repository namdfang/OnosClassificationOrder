import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignerTeamMember } from 'shared';

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
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';

export type DialogMode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: DialogMode;
  member: DesignerTeamMember | null;
  onClose: () => void;
  onSaved: () => void;
}

const PASSWORD_LENGTH = 12;

function randomPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  let out = '';
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function TeamMemberDialog({ open, mode, member, onClose, onSaved }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hireDate, setHireDate] = useState<string>('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && member) {
      setFullName(member.fullName);
      setEmail(member.email);
      setPassword('');
      setHireDate(member.hireDate ? new Date(member.hireDate).toISOString().slice(0, 10) : '');
      setTelegramChatId(member.telegramChatId || '');
    } else {
      setFullName('');
      setEmail('');
      setPassword(randomPassword());
      setHireDate('');
      setTelegramChatId('');
    }
  }, [open, mode, member]);

  const copyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success('Đã copy password');
    } catch {
      toast.error('Trình duyệt chặn clipboard — copy thủ công');
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast.error('Vui lòng nhập đủ Tên + Email');
      return;
    }
    if (mode === 'create' && password.length < 8) {
      toast.error('Mật khẩu phải có ít nhất 8 ký tự');
      return;
    }
    try {
      setSaving(true);
      if (mode === 'create') {
        await RepositoryRemote.designer.createMember({
          fullName,
          email,
          password,
          hireDate: hireDate ? (new Date(hireDate) as unknown as Date) : undefined,
          telegramChatId: telegramChatId || undefined,
        });
        toast.success(`Đã tạo ${fullName} — gửi mật khẩu cho team trước khi đóng dialog`);
      } else if (member) {
        await RepositoryRemote.designer.updateMember(member._id, {
          fullName,
          email,
          hireDate: hireDate ? (new Date(hireDate) as unknown as Date) : null,
          telegramChatId: telegramChatId || null,
        });
        toast.success('Đã cập nhật');
      }
      onSaved();
      onClose();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Thêm sub-designer' : 'Sửa thông tin'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Tên hiển thị *</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="VD: Nguyễn Văn Huy"
            />
          </div>

          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="huy@onospod.com"
              type="email"
            />
          </div>

          {mode === 'create' && (
            <div className="space-y-2">
              <Label>Mật khẩu *</Label>
              <div className="flex gap-2">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="text"
                  className="font-mono"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setPassword(randomPassword())} title="Random">
                  <RefreshCw size={14} />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={copyPassword} title="Copy">
                  <Copy size={14} />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <KeyRound size={11} /> Copy mật khẩu rồi gửi riêng cho team — sau khi đóng dialog không xem lại được.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Ngày vào làm</Label>
              <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telegram Chat ID</Label>
              <Input
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Spinner size={14} className="mr-2" />}
            {mode === 'create' ? 'Tạo' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
