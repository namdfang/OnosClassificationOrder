import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { handleAxiosError } from '@/utils';

interface Props {
  open: boolean;
  orderId: string | null;
  /** Source/note đã có sẵn của order (pre-fill khi đang edit). 'tool-check'
   *  không phải lựa chọn của dialog "Lỗi khác" → coi như chưa chọn. */
  defaultSource?: 'designer' | 'factory' | 'tool-check';
  defaultNote?: string;
  onClose: () => void;
  onSaved: (source: 'designer' | 'factory', note: string) => void;
}

const MAX_NOTE = 500;

/**
 * Dialog yêu cầu user pick lỗi do designer/xưởng + nhập note khi chọn code
 * "Lỗi khác" (other). BE validate cùng rule, dialog này chỉ là UX layer.
 */
export function ProductionErrorOtherDialog({ open, orderId, defaultSource, defaultNote, onClose, onSaved }: Props) {
  const { t } = useTranslation('orders');
  const normSource = (s?: 'designer' | 'factory' | 'tool-check') => (s === 'tool-check' ? undefined : s);
  const [source, setSource] = useState<'designer' | 'factory' | undefined>(normSource(defaultSource));
  const [note, setNote] = useState(defaultNote || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSource(normSource(defaultSource));
      setNote(defaultNote || '');
    }
  }, [open, defaultSource, defaultNote]);

  const handleSubmit = async () => {
    if (!orderId) return;
    if (!source) {
      toast.error(t('cells.errorOtherDialog.sourceRequired'));
      return;
    }
    if (!note.trim()) {
      toast.error(t('cells.errorOtherDialog.noteRequired'));
      return;
    }
    try {
      setSaving(true);
      await RepositoryRemote.order.setProductionError(orderId, {
        code: 'other',
        source,
        note: note.trim(),
      });
      toast.success(t('cells.errorOtherDialog.recorded'));
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
          <DialogTitle>{t('cells.errorOtherDialog.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t('cells.errorOtherDialog.description')}</p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('cells.errorOtherDialog.sourceLabel')}</Label>
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
                {t('cells.errorSource.designer')}
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
                {t('cells.errorSource.factory')}
              </button>
            </div>
            {source === 'designer' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {t('cells.errorOtherDialog.designerHint')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('cells.errorOtherDialog.noteLabel')}</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
              placeholder={t('cells.errorOtherDialog.notePlaceholder')}
            />
            <div className="text-right text-[10px] text-muted-foreground">
              {note.length}/{MAX_NOTE}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('cells.multiIcon.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !source || !note.trim()}>
            {saving && <Spinner size={14} className="mr-2" />}
            {t('cells.multiIcon.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
