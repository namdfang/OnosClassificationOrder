import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Factory, LayoutList, Loader2, Search, Send, User } from 'lucide-react';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';
import type { ReportView } from '@/services/reports';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { handleAxiosError } from '@/utils';

interface FactoryOpt {
  _id: string;
  name: string;
  shortName?: string;
}

/**
 * Nút gửi báo cáo Telegram — popover chọn view: Tổng quan / Theo designer /
 * Soát tool + 1 nút mỗi xưởng sản xuất (phễu lọc theo xưởng). BE giữ khóa
 * in-flight, trả `busy` nếu đang chạy.
 */
export function SendTelegramReportButton() {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [factories, setFactories] = useState<FactoryOpt[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await RepositoryRemote.factory.getFactories();
        const list = ((res.data?.data || []) as FactoryOpt[]).filter((f) => f.shortName !== 'US');
        setFactories(list);
      } catch {
        // Không chặn nút chính nếu lấy danh sách xưởng lỗi.
      }
    })();
  }, []);

  const send = async (key: string, view: ReportView, factoryId?: string, successLabel?: string) => {
    setLoading(key);
    try {
      const res = await RepositoryRemote.reports.runNow(view, factoryId);
      const data = res.data?.data as { ok?: boolean; busy?: boolean } | undefined;
      if (data?.ok) {
        toast.success(t('telegramReport.sentView', { view: successLabel }));
      } else if (data?.busy) {
        toast.warning(t('telegramReport.busy'));
      } else {
        toast.warning(t('telegramReport.failed'), { description: t('telegramReport.disabledHint') });
      }
      setOpen(false);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setLoading(null);
    }
  };

  const viewOptions: Array<{ view: ReportView; icon: React.ReactNode }> = [
    { view: 'daily', icon: <LayoutList size={15} /> },
    { view: 'designer', icon: <User size={15} /> },
    { view: 'tool-check', icon: <Search size={15} /> },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Send size={14} />
          {t('telegramReport.button')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1.5">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('telegramReport.choose')}
        </p>
        {viewOptions.map((o) => (
          <button
            key={o.view}
            type="button"
            disabled={loading !== null}
            onClick={() => send(o.view, o.view, undefined, t(`telegramReport.views.${o.view}`))}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-muted-foreground">
              {loading === o.view ? <Loader2 size={15} className="animate-spin" /> : o.icon}
            </span>
            <span>{t(`telegramReport.views.${o.view}`)}</span>
          </button>
        ))}

        {factories.length > 0 && (
          <>
            <div className="my-1 border-t border-border" />
            {factories.map((f) => {
              const label = t('telegramReport.views.factory', { name: f.shortName || f.name });
              return (
                <button
                  key={f._id}
                  type="button"
                  disabled={loading !== null}
                  onClick={() => send(`fac:${f._id}`, 'daily', f._id, label)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-muted-foreground">
                    {loading === `fac:${f._id}` ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Factory size={15} />
                    )}
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
