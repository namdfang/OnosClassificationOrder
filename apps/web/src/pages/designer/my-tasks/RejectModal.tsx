import React, { useEffect, useState } from 'react';

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

interface Props {
  open: boolean;
  productionId?: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}

const MAX_LEN = 500;

export function RejectModal({ open, productionId, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
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
          Báo file <code className="font-mono">{productionId}</code> không làm được, chuyển về leader để giao người khác.
          Reason giúp leader hiểu lý do.
        </p>
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
          <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Spinner size={14} className="mr-2" />}
            Không làm được
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
