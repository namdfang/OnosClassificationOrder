import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Status } from 'shared';

import { useAuthStore } from '@/store/authStore';
import { useDesignerTeamStore } from '@/store/designerTeamStore';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  productionId?: string;
  onConfirm: (reason: string, targetUserId: string) => Promise<void> | void;
  onClose: () => void;
  /**
   * Designer đang SỞ HỮU task — mặc định là người đăng nhập, nhưng khi quản lý
   * "xem thay" kanban của nhân viên khác thì là nhân viên đó. Người này bị loại
   * khỏi danh sách nhận thay: bàn giao cho chính người đang ôm đơn là no-op mà
   * BE trả lỗi, để trong dropdown chỉ tổ làm người dùng chọn nhầm.
   */
  ownerUserId?: string;
}

const MAX_LEN = 500;

const selectCls =
  'w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function RejectModal({ open, productionId, onConfirm, onClose, ownerUserId }: Props) {
  const { t } = useTranslation(['designerTaskWorkflow', 'common']);
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

  // Người nhận thay = sub-designer đang Active, KHÁC người đang ôm đơn. Sắp xếp
  // theo số đơn đang ôm tăng dần để dễ chọn người đang rảnh.
  const excludeId = ownerUserId || profileId;
  const candidates = useMemo(
    () =>
      members
        .filter((m) => m.status === Status.Active && m._id !== excludeId)
        .sort((a, b) => (a.activeTaskCount ?? 0) - (b.activeTaskCount ?? 0)),
    [members, excludeId],
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
          <DialogTitle>{t('rejectModal.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t('rejectModal.reportPrefix')} <code className="font-mono">{productionId}</code>{' '}
          {t('rejectModal.reportMiddle')} <strong>{t('rejectModal.reportHandoff')}</strong>{' '}
          {t('rejectModal.reportSuffix')}
        </p>

        <div className="space-y-2">
          <Label>
            {t('rejectModal.targetLabel')} <span className="text-rose-600">*</span>
          </Label>
          <select
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            className={selectCls}
            disabled={submitting}
          >
            <option value="">{t('rejectModal.targetPlaceholder')}</option>
            {candidates.map((m) => (
              <option key={m._id} value={m._id}>
                {t('rejectModal.targetOption', { name: m.fullName, count: m.activeTaskCount ?? 0 })}
              </option>
            ))}
          </select>
          {candidates.length === 0 && (
            <p className="text-[11px] text-amber-600">{t('rejectModal.noCandidates')}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>{t('rejectModal.reasonLabel', { maxLen: MAX_LEN })}</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_LEN))}
            rows={4}
            placeholder={t('rejectModal.reasonPlaceholder')}
          />
          <div className="text-right text-[10px] text-muted-foreground">
            {reason.length}/{MAX_LEN}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting || !targetUserId}
            title={!targetUserId ? t('rejectModal.confirmTitle') : undefined}
          >
            {submitting && <Spinner size={14} className="mr-2" />}
            {t('rejectModal.confirmButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
