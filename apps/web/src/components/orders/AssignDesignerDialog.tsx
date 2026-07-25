import React, { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, ChevronRight, UserPlus } from 'lucide-react';
import type { DesignerTeamMember } from 'shared';
import { Status } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

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
  reworkHeldCount: number;
  okCount: number;
  noToolCount: number;
  eligibleCount: number;
  eligibleWithToolCount: number;
};

export function AssignDesignerDialog({ open, selectedIds, onClose, onApplied }: Props) {
  const { t } = useTranslation('orders');
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
    return preview.alreadyAssigned.filter((a) => a.userId !== selectedUserId).reduce((s, a) => s + a.count, 0);
  }, [preview, selectedUserId]);

  const handleSubmit = async (force: boolean, skipUnreviewed = false) => {
    if (!selectedUserId) {
      toast.error(t('dialogs.assignDesigner.chooseDesignerFirst'));
      return;
    }
    try {
      setSubmitting(true);
      const res = await RepositoryRemote.order.bulkAssignDesigner({
        ids: selectedIds,
        userId: selectedUserId,
        reassignOthers: force,
        skipUnreviewed,
      });
      const data = res.data?.data as {
        matched: number;
        modified: number;
        skipped: { orderId: string; productionId: string; reason: string }[];
      };
      const msg = t('dialogs.assignDesigner.assignedMsg', { modified: data.modified, matched: data.matched });
      if (data.skipped.length === 0) {
        toast.success(msg);
      } else {
        toast.warning(t('dialogs.assignDesigner.skipWarning', { msg, count: data.skipped.length }), {
          duration: 6000,
        });
        // Show first few skipped reasons in a separate toast.
        const sample = data.skipped.slice(0, 5);
        const sampleText = sample.map((s) => `• ${s.productionId}: ${s.reason}`).join('\n');
        const more =
          data.skipped.length > 5 ? t('dialogs.assignDesigner.andMore', { count: data.skipped.length - 5 }) : '';
        toast.message(t('dialogs.assignDesigner.skippedTitle'), { description: sampleText + more, duration: 10000 });
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
          <DialogTitle>{t('dialogs.assignDesigner.title', { count: selectedIds.length })}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size={20} />
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {/* Status breakdown */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">{t('dialogs.assignDesigner.currentStatus')}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <StatBox
                  label={t('dialogs.assignDesigner.statusUnassigned')}
                  value={preview.byStatus.unassigned}
                  cls="text-zinc-600 dark:text-zinc-300"
                />
                <StatBox
                  label={t('dialogs.assignDesigner.statusAssigned')}
                  value={preview.byStatus.assigned}
                  cls="text-zinc-600 dark:text-zinc-300"
                />
                <StatBox
                  label={t('dialogs.assignDesigner.statusRejected')}
                  value={preview.byStatus.rejected}
                  cls="text-rose-600 dark:text-rose-400"
                />
                <StatBox
                  label={t('dialogs.assignDesigner.statusInProgress')}
                  value={preview.byStatus.inProgress}
                  cls="text-indigo-600 dark:text-indigo-400"
                />
                <StatBox
                  label={t('dialogs.assignDesigner.statusDone')}
                  value={preview.byStatus.done}
                  cls="text-emerald-600 dark:text-emerald-400"
                />
                <StatBox
                  label={t('dialogs.assignDesigner.statusRework')}
                  value={preview.byStatus.rework}
                  cls="text-amber-600 dark:text-amber-400"
                />
              </div>
              {preview.blockedCount > 0 && (
                <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                  <AlertTriangle size={12} className="shrink-0 mt-px" />
                  <span>
                    <Trans
                      i18nKey="dialogs.assignDesigner.blockedMsg"
                      ns="orders"
                      values={{ count: preview.blockedCount }}
                      components={{ strong: <strong /> }}
                    />
                  </span>
                </div>
              )}
              {preview.reworkHeldCount > 0 && (
                <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                  <AlertTriangle size={12} className="shrink-0 mt-px" />
                  <span>
                    <Trans
                      i18nKey="dialogs.assignDesigner.reworkHeldMsg"
                      ns="orders"
                      values={{ count: preview.reworkHeldCount }}
                      components={{ strong: <strong /> }}
                    />
                  </span>
                </div>
              )}
              {preview.okCount > 0 && (
                <div className="mt-2 flex items-start gap-2 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 rounded p-2">
                  <AlertTriangle size={12} className="shrink-0 mt-px" />
                  <span>
                    <Trans
                      i18nKey="dialogs.assignDesigner.okCountMsg"
                      ns="orders"
                      values={{ count: preview.okCount, eligible: preview.eligibleCount }}
                      components={{ strong: <strong /> }}
                    />
                  </span>
                </div>
              )}
              {preview.noToolCount > 0 && (
                <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                  <AlertTriangle size={12} className="shrink-0 mt-px" />
                  <span>
                    <Trans
                      i18nKey="dialogs.assignDesigner.noToolMsg"
                      ns="orders"
                      values={{ count: preview.noToolCount }}
                      components={{ strong: <strong /> }}
                    />
                  </span>
                </div>
              )}
              {preview.eligibleCount === 0 && (
                <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
                  {t('dialogs.assignDesigner.noEligible')}
                </div>
              )}
            </div>

            {/* Already assigned breakdown */}
            {preview.alreadyAssigned.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('dialogs.assignDesigner.holdingTasks')}</p>
                <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                  {preview.alreadyAssigned.map((a) => (
                    <li key={a.userId} className="flex items-center justify-between border-b border-border/40 py-1">
                      <span>
                        {a.fullName || t('dialogs.assignDesigner.deletedUser', { id: a.userId.slice(-4) })}
                      </span>
                      <span className="font-semibold">{a.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Designer selector */}
            <div className="space-y-2">
              <Label>{t('dialogs.assignDesigner.selectLabel')}</Label>
              {loadingDesigners ? (
                <Spinner size={14} />
              ) : designers.length === 0 ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">{t('dialogs.assignDesigner.noDesigners')}</p>
              ) : (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{t('dialogs.assignDesigner.selectPlaceholder')}</option>
                  {designers.map((d) => (
                    <option key={d._id} value={d._id}>
                      {t('dialogs.assignDesigner.designerOption', { fullName: d.fullName, count: d.activeTaskCount })}
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
                    <p className="font-medium">{t('dialogs.assignDesigner.conflictTitle', { count: conflictCount })}</p>
                    <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                      <Trans
                        i18nKey="dialogs.assignDesigner.conflictDesc"
                        ns="orders"
                        components={{ strong: <strong /> }}
                      />
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common:actions.cancel')}
          </Button>
          {(preview?.noToolCount || 0) > 0 ? (
            // Có đơn chưa soát → 2 lựa chọn. `force` = conflictCount>0 (ghi đè).
            <>
              <Button
                onClick={() => handleSubmit(conflictCount > 0, true)}
                disabled={!selectedUserId || submitting || (preview?.eligibleWithToolCount || 0) === 0}
                variant="outline"
              >
                {submitting && <Spinner size={13} className="mr-1.5" />}
                {t('dialogs.assignDesigner.onlyReviewed', { count: preview?.eligibleWithToolCount || 0 })}
              </Button>
              <Button
                onClick={() => handleSubmit(conflictCount > 0, false)}
                disabled={!selectedUserId || submitting || (preview?.eligibleCount || 0) === 0}
                variant={conflictCount > 0 ? 'destructive' : 'default'}
              >
                {submitting && <Spinner size={13} className="mr-1.5" />}
                <CheckCircle2 size={13} className="mr-1" />
                {t('dialogs.assignDesigner.assignAll', { count: preview?.eligibleCount || 0 })}
              </Button>
            </>
          ) : conflictCount > 0 ? (
            <Button
              onClick={() => handleSubmit(true)}
              disabled={!selectedUserId || submitting || (preview?.eligibleCount || 0) === 0}
              variant="destructive"
            >
              {submitting && <Spinner size={13} className="mr-1.5" />}
              <ChevronRight size={13} />
              {t('dialogs.assignDesigner.overwriteAssign')}
            </Button>
          ) : (
            <Button
              onClick={() => handleSubmit(false)}
              disabled={!selectedUserId || submitting || (preview?.eligibleCount || 0) === 0}
            >
              {submitting && <Spinner size={13} className="mr-1.5" />}
              <CheckCircle2 size={13} className="mr-1" />
              {t('dialogs.assignDesigner.assign')}
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
