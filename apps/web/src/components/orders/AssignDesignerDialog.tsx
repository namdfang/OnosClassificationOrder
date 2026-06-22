import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignerTeamMember } from 'shared';
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
import { Spinner } from '@/components/common/Spinner';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';

interface Props {
  open: boolean;
  selectedIds: string[];
  onClose: () => void;
  onApplied: () => void;
}

type Preview = {
  total: number;
  byStatus: {
    unassigned: number;
    assigned: number;
    inProgress: number;
    done: number;
    rejected: number;
    rework: number;
  };
  alreadyAssigned: { userId: string; fullName?: string; count: number }[];
  blockedCount: number;
  eligibleCount: number;
};

export function AssignDesignerDialog({ open, selectedIds, onClose, onApplied }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [designers, setDesigners] = useState<DesignerTeamMember[]>([]);
  const [loadingDesigners, setLoadingDesigners] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setSelectedUserId('');
    (async () => {
      try {
        setLoading(true);
        setLoadingDesigners(true);
        const [previewRes, teamRes] = await Promise.all([
          RepositoryRemote.order.bulkAssignDesignerPreview({ ids: selectedIds }),
          RepositoryRemote.designer.listTeam(Status.Active),
        ]);
        setPreview((previewRes.data?.data || null) as Preview | null);
        setDesigners((teamRes.data?.data || []) as DesignerTeamMember[]);
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
        setLoadingDesigners(false);
      }
    })();
  }, [open, selectedIds]);

  // Đơn đã gán cho ai khác designer được chọn — cần confirm reassignOthers.
  const conflictCount = useMemo(() => {
    if (!preview || !selectedUserId) return 0;
    return preview.alreadyAssigned
      .filter((a) => a.userId !== selectedUserId)
      .reduce((s, a) => s + a.count, 0);
  }, [preview, selectedUserId]);

  const handleSubmit = async (force: boolean) => {
    if (!selectedUserId) {
      toast.error('Chọn designer trước.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await RepositoryRemote.order.bulkAssignDesigner({
        ids: selectedIds,
        userId: selectedUserId,
        reassignOthers: force,
      });
      const data = res.data?.data as {
        matched: number;
        modified: number;
        skipped: { orderId: string; productionId: string; reason: string }[];
      };
      const msg = `Đã gán ${data.modified}/${data.matched} đơn`;
      if (data.skipped.length === 0) {
        toast.success(msg);
      } else {
        toast.warning(`${msg}. ${data.skipped.length} đơn bị skip — xem chi tiết.`, {
          duration: 6000,
        });
        // Show first few skipped reasons in a separate toast.
        const sample = data.skipped.slice(0, 5);
        const sampleText = sample
          .map((s) => `• ${s.productionId}: ${s.reason}`)
          .join('\n');
        const more = data.skipped.length > 5 ? `\n…và ${data.skipped.length - 5} đơn khác` : '';
        toast.message('Đơn bị skip', { description: sampleText + more, duration: 10000 });
      }
      onApplied();
      onClose();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gán designer cho {selectedIds.length} đơn</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size={20} />
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {/* Status breakdown */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Trạng thái hiện tại:</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <StatBox label="Chưa gán" value={preview.byStatus.unassigned} cls="text-zinc-600 dark:text-zinc-300" />
                <StatBox label="Đã gán" value={preview.byStatus.assigned} cls="text-zinc-600 dark:text-zinc-300" />
                <StatBox label="Đã trả" value={preview.byStatus.rejected} cls="text-rose-600 dark:text-rose-400" />
                <StatBox label="Đang làm" value={preview.byStatus.inProgress} cls="text-indigo-600 dark:text-indigo-400" />
                <StatBox label="Đã xong" value={preview.byStatus.done} cls="text-emerald-600 dark:text-emerald-400" />
                <StatBox label="Cần làm lại" value={preview.byStatus.rework} cls="text-amber-600 dark:text-amber-400" />
              </div>
              {preview.blockedCount > 0 && (
                <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                  <AlertTriangle size={12} className="shrink-0 mt-px" />
                  <span>
                    <strong>{preview.blockedCount}</strong> đơn đang in-progress/done/rework — sẽ bị skip
                    khi gán.
                  </span>
                </div>
              )}
              {preview.eligibleCount === 0 && (
                <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
                  Không có đơn nào hợp lệ để gán.
                </div>
              )}
            </div>

            {/* Already assigned breakdown */}
            {preview.alreadyAssigned.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Đang ôm task:</p>
                <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                  {preview.alreadyAssigned.map((a) => (
                    <li key={a.userId} className="flex items-center justify-between border-b border-border/40 py-1">
                      <span>{a.fullName || `(deleted user ${a.userId.slice(-4)})`}</span>
                      <span className="font-semibold">{a.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Designer selector */}
            <div className="space-y-2">
              <Label>Gán cho designer *</Label>
              {loadingDesigners ? (
                <Spinner size={14} />
              ) : designers.length === 0 ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  Chưa có sub-designer nào — vào /designer/team tạo trước.
                </p>
              ) : (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Chọn —</option>
                  {designers.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.fullName} · đang ôm {d.activeTaskCount}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {conflictCount > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-[11px] text-amber-800 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {conflictCount} đơn đã được gán cho designer khác.
                    </p>
                    <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                      Bấm <strong>Ghi đè & Gán</strong> để chuyển sang designer mới. Đơn đang
                      in-progress/done/rework vẫn bị skip.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          {conflictCount > 0 ? (
            <Button
              onClick={() => handleSubmit(true)}
              disabled={!selectedUserId || submitting || (preview?.eligibleCount || 0) === 0}
              variant="destructive"
            >
              {submitting && <Spinner size={13} className="mr-1.5" />}
              <ChevronRight size={13} />
              Ghi đè & Gán
            </Button>
          ) : (
            <Button
              onClick={() => handleSubmit(false)}
              disabled={!selectedUserId || submitting || (preview?.eligibleCount || 0) === 0}
            >
              {submitting && <Spinner size={13} className="mr-1.5" />}
              <CheckCircle2 size={13} className="mr-1" />
              Gán
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded border border-border bg-card p-2 flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${cls}`}>{value}</span>
    </div>
  );
}

export { UserPlus as AssignDesignerIcon };
