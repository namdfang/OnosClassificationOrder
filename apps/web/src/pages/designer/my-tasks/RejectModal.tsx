import React, { useEffect, useMemo, useState } from 'react';
import { Status } from 'shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/common/Spinner';
import { useAuthStore } from '@/store/authStore';
import { useDesignerTeamStore } from '@/store/designerTeamStore';

interface Props {
  open: boolean;
  productionId?: string;
  onConfirm: (reason: string, targetUserId: string) => Promise<void> | void;
  onClose: () => void;
}

const MAX_LEN = 500;

const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function RejectModal({ open, productionId, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const profileId = useAuthStore((s) => s.profile?._id);
  const members = useDesignerTeamStore((s) => s.members);
  const fetchTeam = useDesignerTeamStore((s) => s.fetch);
  const loaded = useDesignerTeamStore((s) => s.loaded);

  useEffect(() => {
    if (open) {
      setReason('');
      setTargetUserId('');
      if (!loaded) fetchTeam();
    }
  }, [open, loaded, fetchTeam]);

  // Người nhận thay = sub-designer đang Active, KHÁC chính mình. Sắp xếp theo số
  // đơn đang ôm tăng dần để dễ chọn người đang rảnh.
  const candidates = useMemo(
    () =>
      members
        .filter((m) => m.status === Status.Active && m._id !== profileId)
        .sort((a, b) => (a.activeTaskCount ?? 0) - (b.activeTaskCount ?? 0)),
    [members, profileId],
  );

  const handleConfirm = async () => {
    if (!targetUserId) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim(), targetUserId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Báo file không làm được</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Báo file <code className="font-mono">{productionId}</code> không làm được và{' '}
          <strong>bàn giao cho một designer khác</strong> nhận thay. Đơn sẽ chuyển thẳng sang người
          được chọn.
        </p>

        <div className="space-y-2">
          <Label>
            Chuyển cho designer <span className="text-rose-600">*</span>
          </Label>
          <select
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            className={selectCls}
            disabled={submitting}
          >
            <option value="">— Chọn người nhận thay —</option>
            {candidates.map((m) => (
              <option key={m._id} value={m._id}>
                {m.fullName} ({m.activeTaskCount ?? 0} đơn đang làm)
              </option>
            ))}
          </select>
          {candidates.length === 0 && (
            <p className="text-[11px] text-amber-600">
              Không có designer nào khác đang bật để nhận thay.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Lý do (tùy chọn — max {MAX_LEN} ký tự)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_LEN))}
            rows={4}
            placeholder="VD: Không có file source, mockup không rõ ràng..."
          />
          <div className="text-right text-[10px] text-muted-foreground">
            {reason.length}/{MAX_LEN}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting || !targetUserId}
            title={!targetUserId ? 'Bắt buộc chọn designer nhận thay' : undefined}
          >
            {submitting && <Spinner size={14} className="mr-2" />}
            Không làm được
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
