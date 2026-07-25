import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { List, RefreshCw, Save, UserPlus, Users } from 'lucide-react';
import type { Customer, CustomerAssignmentConfig as Config } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import CustomerFactoryKanban from '@/components/settings/CustomerFactoryKanban';
import CustomerListDialog from '@/components/settings/CustomerListDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

import { handleAxiosError } from '@/utils';

interface FactoryLite {
  _id: string;
  name: string;
  shortName?: string;
}
type AllocState = Record<string, string[]>; // factoryId → customerIds[]

/** Snapshot ổn định (sort ids, bỏ xưởng rỗng) để so sánh dirty — thứ tự trong cột không có ý nghĩa. */
function snapshot(enabled: boolean, alloc: AllocState): string {
  const norm = Object.fromEntries(
    Object.entries(alloc)
      .map(([fid, ids]) => [fid, [...ids].sort()] as const)
      .filter(([, ids]) => ids.length > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify({ enabled, alloc: norm });
}

export default function CustomerAssignmentConfig() {
  const { t } = useTranslation(['customerFactoryAssignment', 'common']);
  const [factories, setFactories] = useState<FactoryLite[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [alloc, setAlloc] = useState<AllocState>({});
  const [enabled, setEnabled] = useState(false);
  const [baseline, setBaseline] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [listOpen, setListOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newSku, setNewSku] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const loadCustomers = async () => {
    const res = await RepositoryRemote.customer.list();
    setCustomers((res.data?.data || []) as Customer[]);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [facRes, cfgRes] = await Promise.all([
          RepositoryRemote.factory.getFactories(),
          RepositoryRemote.customerAssignment.getConfig(),
        ]);
        await loadCustomers();
        const facs = (facRes.data?.data || []) as FactoryLite[];
        const cfg = (cfgRes.data?.data || { enabled: false, factories: [] }) as Config;
        setFactories(facs);
        setEnabled(!!cfg.enabled);
        const next: AllocState = {};
        for (const f of cfg.factories || []) {
          next[String(f.factoryId)] = (f.customerIds || []).map(String);
        }
        setAlloc(next);
        setBaseline(snapshot(!!cfg.enabled, next));
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dirty = useMemo(() => !loading && snapshot(enabled, alloc) !== baseline, [loading, enabled, alloc, baseline]);

  // Kéo thả kanban: gỡ khách khỏi mọi cột rồi thêm vào cột đích (null = "Chưa gán")
  // → tự đảm bảo 1 khách 1 xưởng.
  const moveCustomer = (customerId: string, targetFactoryId: string | null) => {
    setAlloc((prev) => {
      const next: AllocState = {};
      for (const [fid, ids] of Object.entries(prev)) next[fid] = ids.filter((id) => id !== customerId);
      if (targetFactoryId) next[targetFactoryId] = [...(next[targetFactoryId] || []), customerId];
      return next;
    });
  };

  // Guard thoát khi có thay đổi chưa lưu: beforeunload (đóng tab/reload) + chặn
  // click link trong app (BrowserRouter không có API block điều hướng).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClickCapture = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('#')) return;
      const ok = window.confirm(t('leaveConfirm'));
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [dirty, t]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await RepositoryRemote.customer.sync();
      const d = res.data?.data as { created: number; total: number };
      await loadCustomers();
      toast.success(t('toasts.syncSuccess', { created: d?.created ?? 0, total: d?.total ?? 0 }));
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSyncing(false);
    }
  };

  const handleAdd = async () => {
    if (!newSku.trim()) {
      toast.error(t('toasts.skuRequired'));
      return;
    }
    try {
      setAdding(true);
      await RepositoryRemote.customer.create({ userSku: newSku.trim(), userEmail: newEmail.trim() });
      await loadCustomers();
      toast.success(t('toasts.addSuccess'));
      setAddOpen(false);
      setNewSku('');
      setNewEmail('');
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setAdding(false);
    }
  };

  const handleSave = async () => {
    const payload: Config = {
      enabled,
      factories: factories
        .map((f) => ({ factoryId: f._id, customerIds: alloc[f._id] || [] }))
        .filter((f) => f.customerIds.length > 0),
    };
    try {
      setSaving(true);
      await RepositoryRemote.customerAssignment.saveConfig(payload);
      setBaseline(snapshot(enabled, alloc));
      toast.success(t('toasts.saveSuccess'));
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={20} className="text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
            <Users size={18} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t('title')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
              ● {t('unsavedBadge')}
            </span>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size={13} className="mr-1.5" /> : <Save size={14} />}
            {t('actions.save', { ns: 'common' })}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {enabled ? t('enabledOn') : t('enabledOff')}
          </span>
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
          {syncing ? <Spinner size={13} className="mr-1.5" /> : <RefreshCw size={14} />}
          {t('syncCustomers')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <UserPlus size={14} /> {t('addCustomer')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setListOpen(true)}>
          <List size={14} /> {t('customerList')}
        </Button>
        <span className="text-xs text-slate-400">{t('customerCount', { count: customers.length })}</span>
      </div>

      {factories.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{t('noFactories')}</p>}

      {factories.length > 0 && (
        <CustomerFactoryKanban factories={factories} customers={customers} alloc={alloc} onMove={moveCustomer} />
      )}

      <CustomerListDialog open={listOpen} onOpenChange={setListOpen} customers={customers} onReload={loadCustomers} />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('addDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t('addDialog.skuLabel')}</label>
              <Input value={newSku} onChange={(e) => setNewSku(e.target.value)} placeholder={t('addDialog.skuPlaceholder')} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t('addDialog.emailLabel')}
              </label>
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={t('addDialog.emailPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              {t('actions.cancel', { ns: 'common' })}
            </Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? <Spinner size={13} className="mr-1.5" /> : null}
              {t('addDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
