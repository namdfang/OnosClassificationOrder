'use client';

/**
 * Cột "Vận đơn" ở `/hub/orders*` — ops nhìn một chỗ để biết đơn nào đã có label,
 * đơn nào cần mua, và mua ngay tại hàng (SellerPortal.md §9.3).
 *
 * Vì sao đặt ở đây thay vì bắt ops mở app xưởng: hôm nay mọi người lên đơn ở
 * OnosPod rồi sang OnosExpress mua label — hai hệ, hai lần đăng nhập. Hub gom
 * cả hai việc vào một màn: thấy đơn cần label → bấm mua → có tracking ngay.
 *
 * Luồng mua dùng NGUYÊN endpoint của khu quản trị
 * (`POST shipping-vnp/orders/:orderRefId/shipment`), không nhân bản nghiệp vụ:
 * chống mua trùng, giữ chỗ `purchasing`, đối soát ví đều nằm sẵn ở đó
 * (ShippingLabelPatterns.md).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, Truck } from 'lucide-react';
import type { AdminInternalStatus } from 'shared';
import { CopyButton } from '@/components/shared/copy-button';
import { apiFetch } from '@/hooks/use-api';

/** Chặng mà đơn đã sẵn sàng dán label — trước đó mua sớm thì hàng chưa có thật. */
export const SHIPMENT_READY_STAGES = ['pack', 'done'];

export function canBuyLabel(s?: AdminInternalStatus): boolean {
  if (!s?.orderRefId) return false;
  if (s.shipment?.trackingCode) return false;

  return true;
}

export async function buyLabel(orderRefId: string): Promise<{ trackingCode?: string; labelUrl?: string }> {
  const res = await apiFetch<{ data?: { shipment?: { trackingCode?: string; labelUrl?: string } } }>(
    `/api/hub/v1/shipping-vnp/orders/${encodeURIComponent(orderRefId)}/shipment`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Cân nặng/kích thước lấy từ ĐƠN (đã chép từ biến thể lúc đẩy sản xuất).
      // `requestId` = khoá chống mua trùng khi ops bấm hai lần hoặc mạng chập chờn.
      body: JSON.stringify({ requestId: `hub-${orderRefId}` }),
    },
  );

  return res?.data?.shipment ?? {};
}

export function ShipmentCell({ s, onBought }: { s?: AdminInternalStatus; onBought?: () => void }) {
  const { t } = useTranslation(['hub', 'customerPortal']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ship = s?.shipment;

  if (ship?.trackingCode) {
    return (
      <div className="text-[10.5px] leading-tight">
        <span className="inline-flex items-center gap-1 font-mono text-text-primary">
          {ship.trackingCode}
          <CopyButton text={ship.trackingCode} size={10} />
        </span>
        <p className="text-text-muted">
          {ship.provider === 'vnp' ? 'VNP' : ship.carrier || t('hub:shipment.selfProvided')}
          {ship.status ? ` · ${ship.status}` : ''}
        </p>
        {ship.labelUrl && (
          <a href={ship.labelUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
            {t('hub:shipment.label')} <ExternalLink size={9} />
          </a>
        )}
      </div>
    );
  }

  if (!s?.orderRefId) return <span className="text-text-muted text-[10.5px]">—</span>;

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      await buyLabel(s.orderRefId!);
      onBought?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-[10.5px] leading-tight">
      <button
        type="button"
        onClick={buy}
        disabled={busy}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border1 bg-card hover:border-accent hover:text-accent font-semibold disabled:opacity-60"
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Truck size={11} />}
        {t('hub:shipment.buy')}
      </button>
      {!s.weight && <p className="text-warning mt-0.5">{t('hub:shipment.noWeight')}</p>}
      {error && <p className="text-error mt-0.5 whitespace-normal max-w-[190px]">{error}</p>}
    </div>
  );
}
