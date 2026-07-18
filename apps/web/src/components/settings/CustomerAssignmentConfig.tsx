import React, { useEffect, useMemo, useState } from 'react';
import { Factory as FactoryIcon, RefreshCw, Save, UserPlus, Users } from 'lucide-react';
import type { Customer, CustomerAssignmentConfig as Config } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { MultiSelectFilter } from '@/components/common/MultiSelectFilter';
import { Spinner } from '@/components/common/Spinner';
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

export default function CustomerAssignmentConfig() {
  const [factories, setFactories] = useState<FactoryLite[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [alloc, setAlloc] = useState<AllocState>({});
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const factoryById = useMemo(() => new Map(factories.map((f) => [f._id, f])), [factories]);

  // customerId → factoryId đang giữ (chặn 1 khách ở nhiều xưởng).
  const customerFactory = useMemo(() => {
    const m = new Map<string, string>();
    for (const [factoryId, ids] of Object.entries(alloc)) {
      for (const id of ids) m.set(id, factoryId);
    }
    return m;
  }, [alloc]);

  const customerLabel = (c: Customer) => (c.userEmail ? `${c.userSku} · ${c.userEmail}` : c.userSku);

  const setFactoryCustomers = (factoryId: string, ids: string[]) => {
    setAlloc((prev) => ({ ...prev, [factoryId]: ids }));
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await RepositoryRemote.customer.sync();
      const d = res.data?.data as { created: number; total: number };
      await loadCustomers();
      toast.success(`Sync xong: +${d?.created ?? 0} khách mới (tổng ${d?.total ?? 0})`);
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSyncing(false);
    }
  };

  const handleAdd = async () => {
    if (!newSku.trim()) {
      toast.error('User SKU không được để trống');
      return;
    }
    try {
      setAdding(true);
      await RepositoryRemote.customer.create({ userSku: newSku.trim(), userEmail: newEmail.trim() });
      await loadCustomers();
      toast.success('Đã thêm khách hàng');
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
      toast.success('Đã lưu cấu hình gán xưởng theo khách');
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
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Ưu tiên gán xưởng theo khách hàng
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Khi bật, đơn của khách đã gán sẽ ép về xưởng tương ứng lúc import (ưu tiên hơn cấu hình sản phẩm). Khách
              chưa gán vẫn theo cấu hình sản phẩm. Mỗi khách chỉ thuộc 1 xưởng.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size={13} className="mr-1.5" /> : <Save size={14} />}
          Lưu
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {enabled ? 'Đang bật' : 'Đang tắt'}
          </span>
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
          {syncing ? <Spinner size={13} className="mr-1.5" /> : <RefreshCw size={14} />}
          Sync khách hàng
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <UserPlus size={14} /> Thêm khách
        </Button>
        <span className="text-xs text-slate-400">{customers.length} khách</span>
      </div>

      {factories.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có xưởng nào.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {factories.map((f) => {
          const selected = alloc[f._id] || [];
          // Khách đã gán ở xưởng khác → loại khỏi options (đảm bảo 1 khách 1 xưởng).
          // Khách của chính xưởng này vẫn hiển thị để có thể bỏ chọn.
          const options = customers
            .filter((c) => {
              const usedIn = customerFactory.get(String(c._id));
              return !usedIn || usedIn === f._id;
            })
            .map((c) => ({ code: String(c._id), name: customerLabel(c) }));
          return (
            <div
              key={f._id}
              className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800 p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <FactoryIcon size={16} className="text-sky-600 dark:text-sky-400" />
                <span className="font-medium text-slate-800 dark:text-slate-100">{f.name}</span>
                {f.shortName && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">
                    {f.shortName}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">{selected.length} khách</span>
              </div>

              <MultiSelectFilter
                label="Khách hàng"
                options={options}
                value={selected}
                onChange={(ids) => setFactoryCustomers(f._id, ids)}
                width={280}
                className="w-full"
              />
            </div>
          );
        })}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm khách hàng</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">User SKU *</label>
              <Input value={newSku} onChange={(e) => setNewSku(e.target.value)} placeholder="VD: HB-16459" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">User email</label>
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="VD: customer@example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Hủy
            </Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? <Spinner size={13} className="mr-1.5" /> : null}
              Thêm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
