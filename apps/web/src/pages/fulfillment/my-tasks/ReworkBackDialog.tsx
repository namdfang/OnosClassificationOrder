import React, { useMemo, useState } from 'react';
import type { ProductionOrder } from 'shared';
import {
  FULFILLMENT_STAGE_LABELS,
  FULFILLMENT_STAGE_ORDER,
  FULFILLMENT_STAGES,
  FulfillmentStage,
} from 'shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Target = 'designer' | FulfillmentStage;

interface Props {
  order: ProductionOrder;
  myStage: FulfillmentStage;
  onClose: () => void;
  onSubmit: (target: Target, reason: string) => Promise<void>;
}

export function ReworkBackDialog({ order, myStage, onClose, onSubmit }: Props) {
  const myIdx = FULFILLMENT_STAGE_ORDER[myStage];
  const previousStages = useMemo(
    () => FULFILLMENT_STAGES.filter((s) => FULFILLMENT_STAGE_ORDER[s] < myIdx),
    [myIdx],
  );

  const defaultTarget: Target = previousStages.length > 0 ? previousStages[previousStages.length - 1]! : 'designer';
  const [target, setTarget] = useState<Target>(defaultTarget);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = reason.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(target, reason.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Báo lỗi đơn {order.productionId}</DialogTitle>
          <DialogDescription>
            Chọn nơi nhận xử lý (Designer hoặc 1 stage trước) + mô tả lỗi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Đẩy về</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              <button
                type="button"
                onClick={() => setTarget('designer')}
                className={chipClass(target === 'designer')}
              >
                Designer
              </button>
              {previousStages.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTarget(s)}
                  className={chipClass(target === s)}
                >
                  {FULFILLMENT_STAGE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="reason" className="text-xs">
              Lý do lỗi <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Mô tả ngắn gọn lỗi gặp phải..."
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Đẩy về xử lý
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function chipClass(active: boolean): string {
  const base =
    'inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border transition-colors';
  return active
    ? `${base} bg-primary text-primary-foreground border-primary`
    : `${base} bg-background text-foreground border-border hover:bg-accent`;
}
