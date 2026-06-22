import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';

interface Props {
  open: boolean;
  orderId: string | null;
  /** Source/note đã có sẵn của order (pre-fill khi đang edit). */
  defaultSource?: 'designer' | 'factory';
  defaultNote?: string;
  onClose: () => void;
  onSaved: (source: 'designer' | 'factory', note: string) => void;
}

const MAX_NOTE = 500;

/**
 * Dialog yêu cầu user pick lỗi do designer/xưởng + nhập note khi chọn code
 * "Lỗi khác" (other). BE validate cùng rule, dialog này chỉ là UX layer.
 */
export function ProductionErrorOtherDialog({
  open,
  orderId,
  defaultSource,
  defaultNote,
  onClose,
  onSaved,
}: Props) {
  const [source, setSource] = useState<'designer' | 'factory' | undefined>(defaultSource);
  const [note, setNote] = useState(defaultNote || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSource(defaultSource);
      setNote(defaultNote || '');
    }
  }, [open, defaultSource, defaultNote]);

  const handleSubmit = async () => {
    if (!orderId) return;
    if (!source) {
      toast.error('Phải chọn lỗi do designer hay do xưởng');
      return;
    }
    if (!note.trim()) {
      toast.error('Phải nhập mô tả lỗi');
      return;
    }
    try {
      setSaving(true);
      await RepositoryRemote.order.setProductionError(orderId, {
        code: 'other',
        source,
        note: note.trim(),
      });
      toast.success('Đã ghi nhận lỗi');
      onSaved(source, note.trim());
      onClose();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lỗi khác — bắt buộc phân loại</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          "Lỗi khác" cần phân loại nguồn lỗi (designer/xưởng) + mô tả cụ thể để dashboard thống kê
          chính xác và team biết chi tiết.
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Lỗi do *</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSource('designer')}
                className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                  source === 'designer'
                    ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
                    : 'border-border bg-background text-muted-foreground hover:border-violet-300'
                }`}
              >
                Do designer
              </button>
              <button
                type="button"
                onClick={() => setSource('factory')}
                className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                  source === 'factory'
                    ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
                    : 'border-border bg-background text-muted-foreground hover:border-sky-300'
                }`}
              >
                Do xưởng
              </button>
            </div>
            {source === 'designer' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Lỗi designer → task sẽ tự chuyển về "Cần làm lại" cho designer đã làm đơn này.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Mô tả lỗi *</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
              placeholder="Mô tả cụ thể lỗi là gì, ở đâu, do nguyên nhân nào…"
            />
            <div className="text-right text-[10px] text-muted-foreground">
              {note.length}/{MAX_NOTE}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !source || !note.trim()}>
            {saving && <Spinner size={14} className="mr-2" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
