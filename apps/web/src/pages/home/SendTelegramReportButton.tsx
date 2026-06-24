import React, { useState } from 'react';
import { Send, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RepositoryRemote } from '@/services';
import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';
import type { ReportSlot, ReportType } from '@/services/reports';

const SLOT_OPTIONS: Array<{ value: ReportSlot | ''; label: string; hint: string }> = [
  { value: '', label: 'Tự động theo giờ', hint: 'BE chọn slot dựa trên giờ hiện tại' },
  { value: 'morning', label: 'Ca sáng', hint: '07:30 — period 18:30 hôm trước → 07:30' },
  { value: 'noon', label: 'Ca trưa', hint: '13:00 — period 07:30 → 13:00' },
  { value: 'evening', label: 'Ca chiều', hint: '18:30 — period 13:00 → 18:30' },
];

const REPORT_OPTIONS: Array<{ value: ReportType; label: string; emoji: string }> = [
  { value: 'all', label: 'Tất cả 3 báo cáo', emoji: '📨' },
  { value: 'designer', label: 'Chỉ Designer', emoji: '🎨' },
  { value: 'factory', label: 'Chỉ Xưởng', emoji: '🏭' },
  { value: 'error', label: 'Chỉ Đơn lỗi', emoji: '⚠️' },
];

export function SendTelegramReportButton() {
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
          `Đã gửi ${ran.length} báo cáo (${ran.join(', ')})${
            resolvedSlot ? ` · slot=${resolvedSlot}` : ''
          }`,
        );
      } else {
        toast.warning('Không có báo cáo nào được gửi', {
          description: skipped.length
            ? `Skipped: ${skipped.join(', ')}`
            : 'Có thể SCHEDULED_REPORTS_ENABLED=false',
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
          Gửi báo cáo Telegram
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-3 space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-indigo-600" />
          <p className="text-sm font-semibold text-foreground">Gửi báo cáo Telegram</p>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">
            Chọn ca
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
            Loại báo cáo
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Hủy
          </Button>
          <Button size="sm" onClick={handleSend} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Gửi ngay
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
