import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

interface VnpFromAddress {
  vnpAddressId: string;
  label: string;
  name: string;
  phoneNumber: string;
  street1: string;
  street2?: string;
  ward: string;
  district: string;
  city: string;
  zipCode?: string;
  country: string;
}

interface VnpConfig {
  addresses: VnpFromAddress[];
  factoryMap: Record<string, string>;
  defaultAddressId?: string;
}

interface FactoryRow {
  _id: string;
  name: string;
  shortName: string;
  isActive?: boolean;
}

const selectCls = 'h-9 rounded-md border border-input bg-background px-3 text-sm';
const emptyForm = { label: '', name: '', phoneNumber: '', street1: '', street2: '', ward: '', district: '', city: '', state: '', zipCode: '', country: 'VN' };

/**
 * Cài đặt → Vận chuyển VNP (`/adm/settings/vnp-shipping`, CHỈ Admin):
 * tạo địa chỉ gửi (ShippingFrom) bên VNP ngay trên UI + gán xưởng → địa chỉ.
 * Config lưu blob `system_configs` SỐNG THEO MÔI TRƯỜNG — production tự bấm
 * ở đây, không restore data từ local. Nhiều xưởng dùng chung 1 địa chỉ được
 * (2D Thái Nguyên + Gỗ Thái Nguyên → cùng địa chỉ Thái Nguyên).
 */
export default function VnpShippingConfig() {
  const { t } = useTranslation('vnpShipping');
  const [config, setConfig] = useState<VnpConfig>({ addresses: [], factoryMap: {} });
  const [factories, setFactories] = useState<FactoryRow[]>([]);
  const [status, setStatus] = useState<{ configured: boolean; missing: string[] } | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [showForm, setShowForm] = useState(false);
  const [remoteRaw, setRemoteRaw] = useState<unknown>();
  const [importForm, setImportForm] = useState({ vnpAddressId: '', label: '', note: '' });
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [wallet, setWallet] = useState<{ balance?: string; raw?: unknown } | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);

  const load = async () => {
    try {
      const [cfgRes, factoryRes, statusRes] = await Promise.all([
        RepositoryRemote.vnpShipping.getConfig(),
        RepositoryRemote.factory.getFactories(),
        RepositoryRemote.vnpShipping.getStatus(),
      ]);
      setConfig((cfgRes.data?.data as VnpConfig) ?? { addresses: [], factoryMap: {} });
      const list = (factoryRes.data?.data as FactoryRow[]) ?? [];
      setFactories(list.filter((f) => f.isActive !== false));
      setStatus(statusRes.data?.data as { configured: boolean; missing: string[] });
    } catch (err) {
      handleAxiosError(err);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const addressLabel = useMemo(() => {
    const map = new Map(config.addresses.map((a) => [a.vnpAddressId, a.label]));
    return (id?: string) => (id ? (map.get(id) ?? id) : '');
  }, [config.addresses]);

  const setField = (key: keyof typeof emptyForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const doCreateAddress = async () => {
    const required: Array<keyof typeof emptyForm> = ['label', 'name', 'phoneNumber', 'street1', 'ward', 'district', 'city'];
    if (required.some((k) => !form[k].trim())) {
      toast.error(t('form.missingRequired'));
      return;
    }
    try {
      setBusy(true);
      const res = await RepositoryRemote.vnpShipping.createFromAddress({
        ...form,
        street2: form.street2.trim() || undefined,
        state: form.state.trim() || undefined,
        zipCode: form.zipCode.trim() || undefined,
      });
      setConfig((res.data?.data as { config: VnpConfig }).config);
      setForm({ ...emptyForm });
      setShowForm(false);
      toast.success(t('form.created'));
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setBusy(false);
    }
  };

  const doDeleteAddress = async (id: string) => {
    try {
      setBusy(true);
      const res = await RepositoryRemote.vnpShipping.deleteFromAddress(id);
      setConfig(res.data?.data as VnpConfig);
      toast.success(t('addresses.deleted'));
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setBusy(false);
    }
  };

  const doSaveMap = async () => {
    try {
      setBusy(true);
      const res = await RepositoryRemote.vnpShipping.saveMap({
        factoryMap: config.factoryMap,
        defaultAddressId: config.defaultAddressId,
      });
      setConfig(res.data?.data as VnpConfig);
      setDirty(false);
      toast.success(t('map.saved'));
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setBusy(false);
    }
  };

  const formFields: Array<{ key: keyof typeof emptyForm; required?: boolean }> = [
    { key: 'label', required: true },
    { key: 'name', required: true },
    { key: 'phoneNumber', required: true },
    { key: 'street1', required: true },
    { key: 'street2' },
    { key: 'ward', required: true },
    { key: 'district', required: true },
    { key: 'city', required: true },
    { key: 'state' },
    { key: 'zipCode' },
    { key: 'country' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MapPin size={18} /> {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {status && !status.configured && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t('notConfigured', { missing: status.missing.join(', ') })}
        </div>
      )}

      {/* ── Ví VNP (cần ≥ $50 mới tạo được vận đơn) ───────────── */}
      <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
        <span className="text-sm font-medium">{t('wallet.title')}</span>
        {wallet ? (
          <span className="text-sm font-mono">{wallet.balance ?? t('wallet.unknown')}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('wallet.hint')}</span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={walletBusy}
          onClick={async () => {
            try {
              setWalletBusy(true);
              const res = await RepositoryRemote.vnpShipping.getWallet();
              setWallet(res.data?.data as { balance?: string; raw?: unknown });
            } catch (err) {
              handleAxiosError(err);
            } finally {
              setWalletBusy(false);
            }
          }}
        >
          {walletBusy ? t('wallet.loading') : t('wallet.check')}
        </Button>
      </div>
      {wallet?.raw !== undefined && (
        <details className="rounded-md border border-border bg-muted/40 -mt-3">
          <summary className="cursor-pointer px-2 py-1 text-xs text-muted-foreground">{t('wallet.raw')}</summary>
          <pre className="max-h-40 overflow-auto px-2 pb-2 text-[11px]">{JSON.stringify(wallet.raw, null, 2)}</pre>
        </details>
      )}

      {/* ── Danh sách địa chỉ gửi ─────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold">{t('addresses.title')}</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                try {
                  setBusy(true);
                  const res = await RepositoryRemote.vnpShipping.getRemoteAddresses();
                  setRemoteRaw((res.data?.data as { raw: unknown }).raw);
                } catch (err) {
                  handleAxiosError(err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('addresses.viewRemote')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowImport((v) => !v)}>
              {t('addresses.importById')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
              <Plus size={14} className="mr-1" /> {t('addresses.add')}
            </Button>
          </div>
        </div>

        {remoteRaw !== undefined && (
          <details open className="rounded-md border border-border bg-muted/40">
            <summary className="cursor-pointer px-2 py-1 text-xs text-muted-foreground">{t('addresses.remoteRaw')}</summary>
            <pre className="max-h-72 overflow-auto px-2 pb-2 text-[11px]">{JSON.stringify(remoteRaw, null, 2)}</pre>
          </details>
        )}

        {showImport && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs text-muted-foreground">{t('addresses.importHint')}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">
                  {t('addresses.importId')} <span className="text-destructive">*</span>
                </span>
                <Input
                  className="h-9"
                  value={importForm.vnpAddressId}
                  onChange={(e) => setImportForm((f) => ({ ...f, vnpAddressId: e.target.value }))}
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">
                  {t('addresses.importLabel')} <span className="text-destructive">*</span>
                </span>
                <Input
                  className="h-9"
                  value={importForm.label}
                  onChange={(e) => setImportForm((f) => ({ ...f, label: e.target.value }))}
                />
              </label>
              <label className="text-xs space-y-1 col-span-2">
                <span className="text-muted-foreground">{t('addresses.importNote')}</span>
                <Input
                  className="h-9"
                  value={importForm.note}
                  onChange={(e) => setImportForm((f) => ({ ...f, note: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy || !importForm.vnpAddressId.trim() || !importForm.label.trim()}
                onClick={async () => {
                  try {
                    setBusy(true);
                    const res = await RepositoryRemote.vnpShipping.importFromAddress({
                      vnpAddressId: importForm.vnpAddressId.trim(),
                      label: importForm.label.trim(),
                      note: importForm.note.trim() || undefined,
                    });
                    setConfig(res.data?.data as VnpConfig);
                    setImportForm({ vnpAddressId: '', label: '', note: '' });
                    setShowImport(false);
                    toast.success(t('addresses.imported'));
                  } catch (err) {
                    handleAxiosError(err);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('addresses.importSubmit')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowImport(false)}>
                {t('form.cancel')}
              </Button>
            </div>
          </div>
        )}

        {config.addresses.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">{t('addresses.empty')}</p>
        )}

        {config.addresses.map((a) => (
          <div key={a.vnpAddressId} className="flex items-start justify-between rounded-md border border-border px-3 py-2">
            <div className="text-sm">
              <div className="font-medium">
                {a.label}
                {config.defaultAddressId === a.vnpAddressId && (
                  <span className="ml-2 rounded bg-indigo-100 dark:bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-300">
                    {t('addresses.default')}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {a.name} · {a.phoneNumber} · {[a.street1, a.street2, a.ward, a.district, a.city].filter(Boolean).join(', ')}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{a.vnpAddressId}</div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-rose-500"
              disabled={busy}
              title={t('addresses.delete')}
              onClick={() => void doDeleteAddress(a.vnpAddressId)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}

        {showForm && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {formFields.map(({ key, required }) => (
                <label key={key} className="text-xs space-y-1">
                  <span className="text-muted-foreground">
                    {t(`form.${key}`)} {required && <span className="text-destructive">*</span>}
                  </span>
                  <Input className="h-9" value={form[key]} onChange={(e) => setField(key, e.target.value)} />
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => void doCreateAddress()}>
                {busy ? t('form.creating') : t('form.submit')}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowForm(false)}>
                {t('form.cancel')}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ── Gán xưởng → địa chỉ ───────────────────────────────── */}
      <section className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">{t('map.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('map.hint')}</p>

        <div className="space-y-1.5">
          {factories.map((f) => (
            <div key={f._id} className="flex items-center gap-3">
              <span className="w-56 truncate text-sm">
                {f.name} <span className="text-muted-foreground">({f.shortName})</span>
              </span>
              <select
                className={`${selectCls} flex-1 max-w-xs`}
                value={config.factoryMap[f._id] ?? ''}
                onChange={(e) => {
                  setConfig((c) => ({ ...c, factoryMap: { ...c.factoryMap, [f._id]: e.target.value } }));
                  setDirty(true);
                }}
              >
                <option value="">{t('map.useDefault')}</option>
                {config.addresses.map((a) => (
                  <option key={a.vnpAddressId} value={a.vnpAddressId}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <span className="w-56 text-sm font-medium">{t('map.default')}</span>
          <select
            className={`${selectCls} flex-1 max-w-xs`}
            value={config.defaultAddressId ?? ''}
            onChange={(e) => {
              setConfig((c) => ({ ...c, defaultAddressId: e.target.value || undefined }));
              setDirty(true);
            }}
          >
            <option value="">{t('map.noDefault')}</option>
            {config.addresses.map((a) => (
              <option key={a.vnpAddressId} value={a.vnpAddressId}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-2">
          <Button size="sm" disabled={busy || !dirty} onClick={() => void doSaveMap()}>
            {busy ? t('map.saving') : t('map.save')}
          </Button>
          {dirty && <span className="ml-2 text-xs text-amber-600">{t('map.unsaved')}</span>}
        </div>
        {factories.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {t('map.resolveNote', { fallback: addressLabel(config.defaultAddressId) || t('map.noDefault') })}
          </p>
        )}
      </section>
    </div>
  );
}
