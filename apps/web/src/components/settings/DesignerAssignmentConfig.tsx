import React, { useEffect, useMemo, useState } from 'react';
import { Factory as FactoryIcon, Plus, Save, Trash2, Users } from 'lucide-react';
import type { DesignerAssignmentConfig as Config } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Spinner } from '@/components/common/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

interface FactoryLite {
  _id: string;
  name: string;
  shortName?: string;
}
interface DesignerLite {
  _id: string;
  fullName: string;
}
type AllocEntry = { designerId: string; weight: number };
type AllocState = Record<string, AllocEntry[]>;

export default function DesignerAssignmentConfig() {
  const [factories, setFactories] = useState<FactoryLite[]>([]);
  const [designers, setDesigners] = useState<DesignerLite[]>([]);
  const [alloc, setAlloc] = useState<AllocState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [facRes, desRes, cfgRes] = await Promise.all([
          RepositoryRemote.factory.getFactories(),
          RepositoryRemote.designer.listTeam('1'), // Status.Active = '1'
          RepositoryRemote.designerAssignment.getConfig(),
        ]);
        const facs = (facRes.data?.data || []) as FactoryLite[];
        const dess = (desRes.data?.data || []) as DesignerLite[];
        const cfg = (cfgRes.data?.data || { factories: [] }) as Config;
        setFactories(facs);
        setDesigners(dess);
        const next: AllocState = {};
        for (const f of cfg.factories || []) {
          next[String(f.factoryId)] = (f.designers || []).map((d) => ({
            designerId: String(d.designerId),
            weight: Number(d.weight) || 0,
          }));
        }
        setAlloc(next);
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const designerById = useMemo(() => new Map(designers.map((d) => [d._id, d])), [designers]);
  const factoryById = useMemo(() => new Map(factories.map((f) => [f._id, f])), [factories]);

  // designerId → tên xưởng đang giữ (để chặn 1 designer ở nhiều xưởng).
  const designerFactory = useMemo(() => {
    const m = new Map<string, string>();
    for (const [factoryId, entries] of Object.entries(alloc)) {
      for (const e of entries) m.set(e.designerId, factoryId);
    }
    return m;
  }, [alloc]);

  const addDesigner = (factoryId: string, designerId: string) => {
    if (!designerId) return;
    setAlloc((prev) => {
      const cur = prev[factoryId] || [];
      if (cur.some((e) => e.designerId === designerId)) return prev;
      return { ...prev, [factoryId]: [...cur, { designerId, weight: 1 }] };
    });
  };

  const removeDesigner = (factoryId: string, designerId: string) => {
    setAlloc((prev) => ({
      ...prev,
      [factoryId]: (prev[factoryId] || []).filter((e) => e.designerId !== designerId),
    }));
  };

  const setWeight = (factoryId: string, designerId: string, weight: number) => {
    setAlloc((prev) => ({
      ...prev,
      [factoryId]: (prev[factoryId] || []).map((e) => (e.designerId === designerId ? { ...e, weight } : e)),
    }));
  };

  const handleSave = async () => {
    const payload: Config = {
      factories: factories
        .map((f) => ({
          factoryId: f._id,
          designers: (alloc[f._id] || []).map((e) => ({
            designerId: e.designerId,
            weight: Number.isFinite(e.weight) ? e.weight : 0,
          })),
        }))
        .filter((f) => f.designers.length > 0),
    };
    try {
      setSaving(true);
      await RepositoryRemote.designerAssignment.saveConfig(payload);
      toast.success('Đã lưu cấu hình gán designer');
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
          <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center">
            <Users size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Gán designer theo xưởng</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sau khi soát tool xong (kết quả != OK), đơn tự động chia cho designer theo tỉ lệ. Mỗi designer chỉ thuộc 1
              xưởng.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size={13} className="mr-1.5" /> : <Save size={14} />}
          Lưu
        </Button>
      </div>

      {factories.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có xưởng nào.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {factories.map((f) => {
          const entries = alloc[f._id] || [];
          const totalWeight = entries.reduce((s, e) => s + (e.weight > 0 ? e.weight : 0), 0);
          // Option "thêm designer": chưa ở xưởng này. Designer đang ở xưởng khác
          // → disabled + ghi chú.
          const inThis = new Set(entries.map((e) => e.designerId));
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
              </div>

              {entries.length === 0 && <p className="text-xs text-slate-400">Chưa gán designer nào.</p>}

              <div className="space-y-1.5">
                {entries.map((e) => {
                  const d = designerById.get(e.designerId);
                  const pct = totalWeight > 0 ? Math.round(((e.weight > 0 ? e.weight : 0) / totalWeight) * 100) : 0;
                  return (
                    <div key={e.designerId} className="flex items-center gap-2">
                      <span className="flex-1 text-sm truncate text-slate-700 dark:text-slate-200">
                        {d?.fullName || `#${e.designerId.slice(-4)}`}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        value={e.weight}
                        onChange={(ev) => setWeight(f._id, e.designerId, Number(ev.target.value))}
                        className="w-16 h-8 text-sm"
                      />
                      <span className="w-10 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
                      <button
                        type="button"
                        onClick={() => removeDesigner(f._id, e.designerId)}
                        className="text-slate-400 hover:text-rose-500 transition-colors"
                        title="Xóa khỏi xưởng"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                <Plus size={14} className="text-slate-400" />
                <select
                  value=""
                  onChange={(ev) => addDesigner(f._id, ev.target.value)}
                  className="flex-1 h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2 text-sm text-slate-700 dark:text-slate-200"
                >
                  <option value="">— Thêm designer —</option>
                  {designers
                    .filter((d) => !inThis.has(d._id))
                    .map((d) => {
                      const usedIn = designerFactory.get(d._id);
                      const elsewhere = usedIn && usedIn !== f._id;
                      const facName = elsewhere
                        ? factoryById.get(usedIn!)?.shortName || factoryById.get(usedIn!)?.name
                        : '';
                      return (
                        <option key={d._id} value={d._id} disabled={!!elsewhere}>
                          {d.fullName}
                          {elsewhere ? ` (đã ở ${facName})` : ''}
                        </option>
                      );
                    })}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
