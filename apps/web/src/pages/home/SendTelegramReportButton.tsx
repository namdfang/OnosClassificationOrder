import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';
import type { ReportSlot, ReportType } from '@/services/reports';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

function buildSlotOptions(t: TFunction<'dashboard'>): Array<{ value: ReportSlot | ''; label: string; hint: string }> {
  return [
    { value: '', label: t('telegramReport.slots.auto'), hint: t('telegramReport.slots.autoHint') },
    { value: 'morning', label: t('telegramReport.slots.morning'), hint: t('telegramReport.slots.morningHint') },
    { value: 'noon', label: t('telegramReport.slots.noon'), hint: t('telegramReport.slots.noonHint') },
    { value: 'evening', label: t('telegramReport.slots.evening'), hint: t('telegramReport.slots.eveningHint') },
  ];
}

function buildReportOptions(t: TFunction<'dashboard'>): Array<{ value: ReportType; label: string; emoji: string }> {
  return [
    { value: 'all', label: t('telegramReport.types.all'), emoji: '📨' },
    { value: 'designer', label: t('telegramReport.types.designer'), emoji: '🎨' },
    { value: 'factory', label: t('telegramReport.types.factory'), emoji: '🏭' },
    { value: 'error', label: t('telegramReport.types.error'), emoji: '⚠️' },
  ];
}

export function SendTelegramReportButton() {
  const { t } = useTranslation('dashboard');
  const SLOT_OPTIONS = buildSlotOptions(t);
  const REPORT_OPTIONS = buildReportOptions(t);
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<ReportSlot | ''>('');
  const [report, setReport] = useState<ReportType>('all');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    try {
      const res = await RepositoryRemote.reports.runNow({
        slot: slot || undefined,
        report,
      });
      const data = res.data?.data;
      const ran = (data?.ran as string[]) || [];
      const skipped = (data?.skipped as string[]) || [];
      const resolvedSlot = data?.slot as string | undefined;
      if (ran.length > 0) {
        toast.success(
          t('telegramReport.sentSuccess', {
            count: ran.length,
            names: ran.join(', '),
            slot: resolvedSlot ? ` · slot=${resolvedSlot}` : '',
          }),
        );
      } else {
        toast.warning(t('telegramReport.noneSent'), {
          description: skipped.length
            ? t('telegramReport.skipped', { names: skipped.join(', ') })
            : t('telegramReport.disabledHint'),
        });
      }
      setOpen(false);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {t('telegramReport.button')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-3 space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-indigo-600" />
          <p className="text-sm font-semibold text-foreground">{t('telegramReport.button')}</p>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">
            {t('telegramReport.chooseSlot')}
          </p>
          <div className="grid grid-cols-2 gap-1">
            {SLOT_OPTIONS.map((opt) => (
              <button
                key={opt.value || 'auto'}
                type="button"
                onClick={() => setSlot(opt.value)}
                title={opt.hint}
                className={cn(
                  'text-xs px-2 py-1.5 rounded border transition-colors text-left',
                  slot === opt.value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    : 'border-border bg-background hover:bg-accent text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">
            {t('telegramReport.chooseType')}
          </p>
          <div className="space-y-1">
            {REPORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setReport(opt.value)}
                className={cn(
                  'w-full text-xs px-2 py-1.5 rounded border transition-colors flex items-center gap-2',
                  report === opt.value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    : 'border-border bg-background hover:bg-accent text-muted-foreground hover:text-foreground',
                )}
              >
                <span>{opt.emoji}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={loading}>
            {t('telegramReport.cancel')}
          </Button>
          <Button size="sm" onClick={handleSend} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {t('telegramReport.sendNow')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
