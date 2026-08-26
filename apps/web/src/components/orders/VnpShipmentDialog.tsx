import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import type { VnpShipmentRecord } from 'shared';
import { VNP_SHIPPING_SERVICES, VNP_SHIPPING_TYPES } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import type { WorkshopOrderRow } from '@/components/orders/workshopTableConfig';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { handleAxiosError } from '@/utils';

interface Props {
  order: WorkshopOrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Patch row local sau khi BE lưu vnpShipment vào đơn. */
  onDone: (updated: WorkshopOrderRow) => void;
}

/** Shape vnpShipment trên row (JSON — date là ISO string). */
type RowShipment = NonNullable<WorkshopOrderRow['vnpShipment']>;

interface VnpStatus {
  configured: boolean;
  missing: string[];
  apiUrl?: string;
  shippingUnitId?: string;
}

interface VnpGroupItem {
  id: string;
  productionId: string;
  type?: string;
  quantity?: number;
  weight?: number;
  hasActiveShipment: boolean;
}

interface VnpGroup {
  orderId?: string;
  items: VnpGroupItem[];
}

const selectCls = 'w-full h-9 rounded-md border border-input bg-background px-3 text-sm';

/** Khối xem raw JSON response từ VNP — mục tiêu đợt test là soi label nằm đâu. */
function RawBlock({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <details className="mt-2 rounded-md border border-border bg-muted/40">
      <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-muted-foreground">{label}</summary>
      <pre className="max-h-60 overflow-auto px-2 pb-2 text-[11px] leading-snug">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/**
 * Dialog test toàn trình vận đơn VNP eGlobal cho 1 đơn (Orders — menu "..."
 * → "Vận đơn VNP", CHỈ Admin/SuperAdmin): kiểm tra địa chỉ → tạo vận đơn
 * (createAddress + createShipment, rep1=productionId) → tra tracking / chi
 * tiết / hủy. Mọi bước hiện raw response vì spec VNP không khai response body.
 */
export function VnpShipmentDialog({ order, open, onOpenChange, onDone }: Props) {
  const { t } = useTranslation('orders');
  const [status, setStatus] = useState<VnpStatus | null>(null);
  const [group, setGroup] = useState<VnpGroup | null>(null);
  const [history, setHistory] = useState<VnpShipmentRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [addressResult, setAddressResult] = useState<{ valid: boolean; message?: string; raw: unknown } | null>(null);
  const [createRaw, setCreateRaw] = useState<unknown>();
  const [createRawAddress, setCreateRawAddress] = useState<unknown>();
  const [trackingRaw, setTrackingRaw] = useState<unknown>();
  const [detailRaw, setDetailRaw] = useState<unknown>();

  const [service, setService] = useState<string>('Standard');
  const [shippingType, setShippingType] = useState<string>('DOMESTIC');
  const [weightGram, setWeightGram] = useState<string>('');
  const [packageType, setPackageType] = useState<string>('');

  const shipment = order?.vnpShipment;
  const hasActiveShipment = !!shipment?.shipmentId && !shipment.cancelledAt;
  // Item khác trong nhóm đã có vận đơn (1 orderId = 1 label) → chặn tạo thêm.
  const groupBlocked = !hasActiveShipment && (group?.items.some((it) => it.hasActiveShipment) ?? false);
  const addr = order?.shippingAddress;

  useEffect(() => {
    if (!open) return;
    setAddressResult(null);
    setCreateRaw(undefined);
    setCreateRawAddress(undefined);
    setTrackingRaw(undefined);
    setDetailRaw(undefined);
    setWeightGram(order?.weight ? String(order.weight) : '500');
    RepositoryRemote.vnpShipping
      .getStatus()
      .then((res) => setStatus(res.data?.data as VnpStatus))
      .catch(() => setStatus(null));
    setGroup(null);
    setHistory([]);
    if (order?._id) {
      RepositoryRemote.vnpShipping
        .getGroup(order._id)
        .then((res) => setGroup(res.data?.data as VnpGroup))
        .catch(() => setGroup(null));
      RepositoryRemote.vnpShipping
        .getOrderShipments(order._id)
        .then((res) => setHistory((res.data?.data as VnpShipmentRecord[]) ?? []))
        .catch(() => setHistory([]));
    }
  }, [open, order?._id, order?.weight]);

  const reloadHistory = () => {
    if (!order?._id) return;
    RepositoryRemote.vnpShipping
      .getOrderShipments(order._id)
      .then((res) => setHistory((res.data?.data as VnpShipmentRecord[]) ?? []))
      .catch(() => undefined);
  };

  if (!order) return null;

  const patchOrder = (info: RowShipment | undefined) => {
    if (info) onDone({ ...order, vnpShipment: info });
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    try {
      setBusy(key);
      await fn();
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setBusy(null);
    }
  };

  const doCheckAddress = () =>
    run('address', async () => {
      const res = await RepositoryRemote.vnpShipping.checkAddress(order._id);
      const data = res.data?.data as { valid: boolean; message?: string; raw: unknown };
      setAddressResult(data);
      toast[data.valid ? 'success' : 'error'](data.valid ? t('vnp.addressValid') : t('vnp.addressInvalid'));
    });

  const doCreate = () =>
    run('create', async () => {
      const weight = Number(weightGram);
      if (!weight || weight <= 0) {
        toast.error(t('vnp.weightRequired'));
        return;
      }
      const res = await RepositoryRemote.vnpShipping.createShipment(order._id, {
        service: service as never,
        shippingType: shippingType as never,
        weightGram: weight,
        packages: 1,
        ...(packageType.trim() ? { packageType: packageType.trim() } : {}),
      });
      const data = res.data?.data as { shipment: RowShipment; raw: unknown; rawAddress?: unknown };
      setCreateRaw(data.raw);
      setCreateRawAddress(data.rawAddress);
      patchOrder(data.shipment);
      reloadHistory();
      toast.success(t('vnp.created', { id: data.shipment.shipmentId ?? '?' }));
    });

  const doTracking = () =>
    run('tracking', async () => {
      const res = await RepositoryRemote.vnpShipping.getTracking(order._id);
      const data = res.data?.data as { shipment?: RowShipment; raw: unknown };
      setTrackingRaw(data.raw);
      patchOrder(data.shipment);
    });

  const doDetail = () =>
    run('detail', async () => {
      const res = await RepositoryRemote.vnpShipping.getShipmentDetail(order._id);
      setDetailRaw((res.data?.data as { raw: unknown }).raw);
    });

  const doCancel = () =>
    run('cancel', async () => {
      const res = await RepositoryRemote.vnpShipping.cancelShipment(order._id);
      const data = res.data?.data as { shipment: RowShipment; raw: unknown };
      patchOrder(data.shipment);
      reloadHistory();
      toast.success(t('vnp.cancelled'));
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('vnp.title', { code: order.productionId })}</DialogTitle>
          <DialogDescription>{t('vnp.subtitle')}</DialogDescription>
        </DialogHeader>

        {status && !status.configured && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {t('vnp.notConfigured', { missing: status.missing.join(', ') })}
          </div>
        )}

        {/* ── Bước 1: địa chỉ nhận ─────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('vnp.step1')}</h3>
          {addr ? (
            <div className="rounded-md border border-border px-3 py-2 text-xs space-y-0.5">
              <div className="font-medium">
                {[addr.firstName, addr.lastName].filter(Boolean).join(' ')} {addr.phone ? `· ${addr.phone}` : ''}
              </div>
              <div className="text-muted-foreground">
                {[addr.address1, addr.address2, addr.city, addr.state, addr.postcode, addr.country]
                  .filter(Boolean)
                  .join(', ')}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
              {t('vnp.noAddress')}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!addr || busy !== null} onClick={doCheckAddress}>
              {busy === 'address' ? t('vnp.checking') : t('vnp.checkAddress')}
            </Button>
            {addressResult &&
              (addressResult.valid ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 size={14} /> {t('vnp.addressValid')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-rose-600">
                  <XCircle size={14} /> {addressResult.message ?? t('vnp.addressInvalid')}
                </span>
              ))}
          </div>
          {addressResult && <RawBlock label={t('vnp.rawResponse')} value={addressResult.raw} />}
        </section>

        {/* ── Bước 2: tạo vận đơn ──────────────────────────────── */}
        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">{t('vnp.step2')}</h3>
          {group && group.items.length > 1 && (
            <div className="rounded-md border border-sky-300 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-xs text-sky-800 dark:text-sky-200 space-y-1">
              <div className="font-medium">
                {t('vnp.groupNotice', { orderId: group.orderId ?? '?', count: group.items.length })}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((it) => (
                  <li key={it.id} className="font-mono">
                    {it.productionId}
                    <span className="font-sans text-muted-foreground">
                      {' '}
                      — {it.type ?? '?'} ×{it.quantity ?? 1}
                      {it.weight ? ` · ${it.weight}g` : ` · ${t('vnp.noWeight')}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasActiveShipment ? (
            <div className="rounded-md border border-border px-3 py-2 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">{t('vnp.shipmentId')}:</span>{' '}
                <span className="font-mono">{shipment?.shipmentId}</span>
              </div>
              {shipment?.trackingCode && (
                <div>
                  <span className="text-muted-foreground">{t('vnp.trackingCode')}:</span>{' '}
                  <span className="font-mono">{shipment.trackingCode}</span>
                </div>
              )}
              {shipment?.labelUrl ? (
                <a
                  href={shipment.labelUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline"
                >
                  <ExternalLink size={12} /> {t('vnp.openLabel')}
                </a>
              ) : (
                <div className="text-amber-600">{t('vnp.noLabelYet')}</div>
              )}
              {shipment?.lastTrackingStatus && (
                <div>
                  <span className="text-muted-foreground">{t('vnp.lastStatus')}:</span> {shipment.lastTrackingStatus}{' '}
                  {shipment.lastTrackingAt && (
                    <span className="text-muted-foreground">({dayjs(shipment.lastTrackingAt).format('DD/MM HH:mm')})</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">{t('vnp.service')}</span>
                <select className={selectCls} value={service} onChange={(e) => setService(e.target.value)}>
                  {VNP_SHIPPING_SERVICES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">{t('vnp.shippingType')}</span>
                <select className={selectCls} value={shippingType} onChange={(e) => setShippingType(e.target.value)}>
                  {VNP_SHIPPING_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">{t('vnp.weightGram')}</span>
                <Input
                  type="number"
                  min={1}
                  className="h-9"
                  value={weightGram}
                  onChange={(e) => setWeightGram(e.target.value)}
                />
              </label>
              {service === 'FirstClass' && (
                <label className="text-xs space-y-1">
                  <span className="text-muted-foreground">{t('vnp.packageType')}</span>
                  <Input
                    className="h-9"
                    placeholder="UspsCard / UspsLetter / UspsFlat"
                    value={packageType}
                    onChange={(e) => setPackageType(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            {!hasActiveShipment && (
              <Button size="sm" disabled={!addr || busy !== null || !status?.configured || groupBlocked} onClick={doCreate}>
                {busy === 'create' ? t('vnp.creating') : t('vnp.createShipment')}
              </Button>
            )}
            {groupBlocked && <span className="text-xs text-amber-600">{t('vnp.groupBlocked')}</span>}
            {hasActiveShipment && (
              <>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={doTracking}>
                  {busy === 'tracking' ? t('vnp.checking') : t('vnp.getTracking')}
                </Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={doDetail}>
                  {busy === 'detail' ? t('vnp.checking') : t('vnp.getDetail')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-rose-600 border-rose-300 hover:bg-rose-50"
                  disabled={busy !== null}
                  onClick={doCancel}
                >
                  {busy === 'cancel' ? t('vnp.checking') : t('vnp.cancelShipment')}
                </Button>
              </>
            )}
          </div>
          <RawBlock label={t('vnp.rawAddressResponse')} value={createRawAddress} />
          <RawBlock label={t('vnp.rawResponse')} value={createRaw} />
          <RawBlock label={t('vnp.rawTracking')} value={trackingRaw} />
          <RawBlock label={t('vnp.rawDetail')} value={detailRaw} />
        </section>

        {/* ── Lịch sử vận đơn (bảng shipments — kể cả đã hủy) ───── */}
        {history.length > 0 && (
          <section className="space-y-2 border-t border-border pt-3">
            <h3 className="text-sm font-semibold">{t('vnp.historyTitle')}</h3>
            <ul className="space-y-1.5">
              {history.map((rec) => (
                <li key={rec._id} className="rounded-md border border-border px-3 py-2 text-xs space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        rec.status === 'cancelled'
                          ? 'rounded bg-rose-100 dark:bg-rose-950/40 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-300'
                          : 'rounded bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300'
                      }
                    >
                      {rec.status === 'cancelled' ? t('vnp.historyCancelled') : t('vnp.historyActive')}
                    </span>
                    <span className="text-muted-foreground">
                      {rec.createdAt ? dayjs(rec.createdAt).format('DD/MM/YYYY HH:mm') : ''}
                      {rec.createdByUserName ? ` · ${rec.createdByUserName}` : ''}
                    </span>
                    {rec.labelUrl && !rec.cancelledAt && (
                      <a
                        href={rec.labelUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-primary underline"
                      >
                        <ExternalLink size={11} /> {t('vnp.openLabel')}
                      </a>
                    )}
                  </div>
                  {rec.trackingCode && (
                    <div>
                      <span className="text-muted-foreground">{t('vnp.trackingCode')}:</span>{' '}
                      <span className="font-mono">{rec.trackingCode}</span>
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    {[
                      rec.package?.code,
                      rec.service,
                      rec.shippingCost ? t('vnp.historyCost', { cost: rec.shippingCost }) : undefined,
                      rec.lastTrackingStatus,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
