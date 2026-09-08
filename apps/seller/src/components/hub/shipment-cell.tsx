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
 *
 * **Cân nặng là BẮT BUỘC** (`weightGram` của DTO mua) và nó quyết định cước.
 * Đơn cũ (đẩy trước 08/09/2026) chưa chép cân nặng từ biến thể nên trống — khi
 * đó ô này cho ops nhập gram tại chỗ rồi mua, thay vì bấm nút chết.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, Truck } from 'lucide-react';
import type { AdminInternalStatus } from 'shared';
import { CopyButton } from '@/components/shared/copy-button';
import { apiFetch } from '@/hooks/use-api';

export interface BuyLabelInput {
  weightGram: number;
  lengthCm?: number;
  wideCm?: number;
  heightCm?: number;
}

/** Đơn mua được label: có id đơn sản xuất và chưa có mã vận đơn nào. */
export function canBuyLabel(s?: AdminInternalStatus): boolean {
  return !!s?.orderRefId && !s.shipment?.trackingCode;
}

/** Mua được NGAY (không phải hỏi thêm): đã có cân nặng trên đơn. */
export function canBuyLabelNow(s?: AdminInternalStatus): boolean {
  return canBuyLabel(s) && !!s?.weight && s.weight > 0;
}

export async function buyLabel(orderRefId: string, input: BuyLabelInput): Promise<{ trackingCode?: string; labelUrl?: string }> {
  const res = await apiFetch<{ data?: { shipment?: { trackingCode?: string; labelUrl?: string } } }>(
    `/api/hub/v1/shipping-vnp/orders/${encodeURIComponent(orderRefId)}/shipment`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...input,
        // Khoá chống mua trùng khi ops bấm hai lần hoặc mạng chập chờn — gắn cả
        // cân nặng để lần nhập lại (sửa cân) không bị coi là lượt mua cũ.
        requestId: `hub-${orderRefId}-${input.weightGram}`,
      }),
    },
  );

  return res?.data?.shipment ?? {};
}

/** Dựng payload mua từ dòng đơn; trả null khi thiếu cân nặng. */
export function buyInputFrom(s?: AdminInternalStatus): BuyLabelInput | null {
  if (!s?.weight || s.weight <= 0) return null;

  return { weightGram: s.weight, lengthCm: s.length, wideCm: s.width, heightCm: s.height };
}

export function ShipmentCell({ s, onBought }: { s?: AdminInternalStatus; onBought?: () => void }) {
  const { t } = useTranslation(['hub', 'customerPortal']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualWeight, setManualWeight] = useState('');
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

  const known = buyInputFrom(s);
  const typed = Number(manualWeight);
  const input: BuyLabelInput | null = known ?? (typed > 0 ? { weightGram: typed, lengthCm: s.length, wideCm: s.width, heightCm: s.height } : null);

  const buy = async () => {
    if (!input) return;
    setBusy(true);
    setError(null);
    try {
      await buyLabel(s.orderRefId!, input);
      onBought?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-[10.5px] leading-tight space-y-1">
      {!known && (
        // Thiếu cân nặng: cho nhập tại chỗ thay vì để ops mắc kẹt. Số này chỉ dùng
        // cho lượt mua đang bấm; muốn hết cảnh báo vĩnh viễn thì điền cân nặng cho
        // biến thể ở trang Sản phẩm (đơn mới tự lấy theo biến thể).
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            value={manualWeight}
            onChange={(e) => setManualWeight(e.target.value)}
            placeholder={t('hub:shipment.weightPlaceholder')}
            className="w-16 px-1.5 py-1 rounded border border-warning/60 bg-card text-[10.5px] outline-none focus:border-accent"
          />
          <span className="text-text-muted">g</span>
        </div>
      )}
      <button
        type="button"
        onClick={buy}
        disabled={busy || !input}
        title={!input ? t('hub:shipment.noWeightHint') : undefined}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border1 bg-card hover:border-accent hover:text-accent font-semibold disabled:opacity-50 disabled:hover:border-border1 disabled:hover:text-inherit"
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Truck size={11} />}
        {t('hub:shipment.buy')}
      </button>
      {!known && !error && <p className="text-warning">{t('hub:shipment.noWeight')}</p>}
      {error && <p className="text-error whitespace-normal max-w-[190px]">{error}</p>}
    </div>
  );
}
