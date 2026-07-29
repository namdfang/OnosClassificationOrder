import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Search, Send, Users, X } from 'lucide-react';
import type { Customer, CustomerNotification } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { useDebounce } from '@/hooks/useDebounce';

export default function CustomerNotificationSender() {
  const { t } = useTranslation(['customerNotifications', 'common']);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'one'>('all');
  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  const [history, setHistory] = useState<CustomerNotification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await RepositoryRemote.customerNotification.listSent(1, 20);
      setHistory((res.data?.data || []) as CustomerNotification[]);
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (target !== 'one' || selectedCustomer) return;
    (async () => {
      try {
        setSearching(true);
        const res = await RepositoryRemote.customer.list(debouncedCustomerSearch || undefined);
        setCustomerOptions((res.data?.data || []) as Customer[]);
      } catch (error) {
        handleAxiosError(error);
      } finally {
        setSearching(false);
      }
    })();
  }, [target, debouncedCustomerSearch, selectedCustomer]);

  const canSend = useMemo(() => title.trim().length > 0 && (target === 'all' || !!selectedCustomer), [title, target, selectedCustomer]);

  const handleSend = async () => {
    if (!title.trim()) return toast.error(t('sender.titleRequired'));
    if (target === 'one' && !selectedCustomer) return toast.error(t('sender.customerRequired'));
    try {
      setSending(true);
      await RepositoryRemote.customerNotification.send({
        title: title.trim(),
        body: body.trim() || undefined,
        customerId: target === 'one' ? String(selectedCustomer!._id) : undefined,
      });
      toast.success(t('sender.sendSuccess'));
      setTitle('');
      setBody('');
      setTarget('all');
      setSelectedCustomer(null);
      setCustomerSearch('');
      loadHistory();
    } catch (error) {
      handleAxiosError(error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-primary" />
        <div>
          <h2 className="font-semibold text-sm">{t('sender.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('sender.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">{t('sender.titleLabel')}</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('sender.titlePlaceholder')} className="h-10" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">{t('sender.bodyLabel')}</label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('sender.bodyPlaceholder')} rows={3} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">{t('sender.targetLabel')}</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTarget('all')}
              className={cn(
                'flex items-center gap-1.5 px-3 h-9 rounded-md border text-xs font-medium transition-colors',
                target === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input hover:bg-accent',
              )}
            >
              <Users size={13} /> {t('sender.targetAll')}
            </button>
            <button
              type="button"
              onClick={() => setTarget('one')}
              className={cn(
                'flex items-center gap-1.5 px-3 h-9 rounded-md border text-xs font-medium transition-colors',
                target === 'one' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input hover:bg-accent',
              )}
            >
              <Search size={13} /> {t('sender.targetOne')}
            </button>
          </div>

          {target === 'one' &&
            (selectedCustomer ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="text-xs font-medium truncate">
                  {selectedCustomer.fullName || selectedCustomer.userEmail || selectedCustomer.userSku}
                </span>
                <button type="button" onClick={() => setSelectedCustomer(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="rounded-md border border-border">
                <Input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder={t('sender.customerSearchPlaceholder')}
                  className="h-9 border-0 rounded-b-none"
                />
                <div className="max-h-40 overflow-y-auto border-t border-border">
                  {searching ? (
                    <div className="flex justify-center py-3">
                      <Spinner size={14} />
                    </div>
                  ) : customerOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">{t('sender.customerNotSelected')}</p>
                  ) : (
                    customerOptions.slice(0, 20).map((c) => (
                      <button
                        key={String(c._id)}
                        type="button"
                        onClick={() => setSelectedCustomer(c)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent truncate"
                      >
                        {c.fullName || '—'} · {c.userEmail || c.userSku || '—'}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
        </div>

        <Button onClick={handleSend} disabled={!canSend || sending} className="h-10">
          {sending ? <Spinner size={14} className="text-primary-foreground" /> : <Send size={14} />}
          {t('sender.send')}
        </Button>
      </div>

      <div className="pt-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('sender.historyTitle')}</h3>
        {historyLoading ? (
          <div className="flex justify-center py-6">
            <Spinner size={18} />
          </div>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">{t('sender.historyEmpty')}</p>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('sender.columns.title')}</TableHead>
                  <TableHead className="text-xs">{t('sender.columns.target')}</TableHead>
                  <TableHead className="text-xs">{t('sender.columns.sentBy')}</TableHead>
                  <TableHead className="text-xs">{t('sender.columns.sentAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((n) => (
                  <TableRow key={String(n._id)}>
                    <TableCell className="text-xs font-medium">{n.title}</TableCell>
                    <TableCell className="text-xs">
                      {n.customerId ? (
                        n.customerLabel
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          {t('bell.broadcastLabel')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{n.createdByName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString('vi-VN') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
