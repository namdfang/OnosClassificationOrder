import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AutoAssignPlanRow } from 'shared';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export interface AutoAssignPlan {
  plan: AutoAssignPlanRow[];
  unassignedCount: number;
  totalRequested: number;
}

interface Props {
  /** null = đóng. */
  plan: AutoAssignPlan | null;
  applying: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Dialog xác nhận "Tự động gán theo cấu hình" — hiển thị plan gọn theo designer
 * (từ `POST /orders/auto-assign-preview`); Xác nhận → parent áp ĐÚNG plan này
 * qua `POST /orders/auto-assign-apply`. Dùng chung cho bảng "Cần gán designer"
 * (`DesignerAssignBacklog`) và panel drill-down (`DesignerDrillPanel`).
 */
export function AutoAssignPlanDialog({ plan, applying, onCancel, onConfirm }: Props) {
  const { t } = useTranslation('dashboard');
  const planTotal = plan?.plan.reduce((s, r) => s + r.count, 0) ?? 0;
  return (
    <Dialog open={plan !== null} onOpenChange={(v) => !v && !applying && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t('assignBacklog.autoAssignTitle')}</DialogTitle>
        {plan &&
          (plan.plan.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('assignBacklog.autoAssignEmpty')}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t('assignBacklog.autoAssignSummary', { assigned: planTotal, total: plan.totalRequested })}
              </p>
              <div className="max-h-[50vh] overflow-y-auto divide-y divide-border/60 rounded-md border border-border">
                {plan.plan.map((r) => (
                  <div key={r.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.fullName}</div>
                      {r.email && <div className="text-[11px] text-muted-foreground truncate">{r.email}</div>}
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {t('assignBacklog.orderCount', { count: r.count })}
                    </Badge>
                  </div>
                ))}
              </div>
              {plan.unassignedCount > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t('assignBacklog.autoAssignUnassigned', { count: plan.unassignedCount })}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onCancel} disabled={applying}>
                  {t('assignBacklog.autoAssignCancel')}
                </Button>
                <Button size="sm" onClick={onConfirm} disabled={applying}>
                  {applying && <Spinner size={13} />}
                  {t('assignBacklog.autoAssignConfirm', { count: planTotal })}
                </Button>
              </div>
            </>
          ))}
      </DialogContent>
    </Dialog>
  );
}
