'use client';

/**
 * Dialog seller mua vận đơn (plan SellerWallet-LabelPurchase §6) — mở theo
 * TỪNG đơn staging từ bảng đơn. Luồng: quote (cân prefill từ biến thể, seller
 * chỉ sửa được CÂN NẶNG — kích thước khóa theo biến thể) → xem giá + số dư →
 * xác nhận → BE trừ ví TRƯỚC rồi mua VNP, lỗi thì tự hoàn.
 *
 * `requestId` sinh 1 LẦN khi dialog mount (parent render có điều kiện) — bấm
 * lại/mạng chập gửi CÙNG id, BE idempotent nên không trừ tiền 2 lần.
 * Lỗi BE trả message = mã trong SELLER_SHIP_ERROR_CODES → map i18n
 * `seller:buyLabel.errors.*`; mã lạ rơi về service_unavailable.
 */

import { useState } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { Truck, X } from 'lucide-react';
import type { SellerShipQuote } from 'shared';
import { SELLER_SHIP_ERROR_CODES } from 'shared/client';
import { Button } from '@/components/shared/button';
import { useToast } from '@/components/shared/toast';
import { apiFetch } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';
import { fmtUSD } from '@/lib/utils';

interface BuyLabelDialogProps {
  stagingId: string;
  /** Mã hiển thị của đơn (orderDisplayCode) — chỉ để tiêu đề. */
  code: string;
  onClose: () => void;
  /** Mua xong — parent refetch list để cột vận đơn cập nhật. */
  onBought: () => void;
}

function errorKey(message: string): string {
  return (SELLER_SHIP_ERROR_CODES as readonly string[]).includes(message) ? message : 'service_unavailable';
}

export function BuyLabelDialog({ stagingId, code, onClose, onBought }: BuyLabelDialogProps) {
  const { t } = useTranslation('seller');
  const { toast } = useToast();
  const [requestId] = useState(() => `seller-${stagingId}-${crypto.randomUUID()}`);
  // Cân đã "chốt" để hỏi giá — cập nhật khi blur/Enter, tránh spam quote mỗi phím.
  const [weightInput, setWeightInput] = useState('');
  const [weightCommitted, setWeightCommitted] = useState<number | null>(null);
  const [buying, setBuying] = useState(false);
  const [done, setDone] = useState<{ trackingCode?: string; labelUrl?: string } | null>(null);

  const quoteUrl = `/api/v1/customer/shipping/orders/${encodeURIComponent(stagingId)}/quote${
    weightCommitted ? `?weightGram=${weightCommitted}` : ''
  }`;
  const { data: quoteRes, isLoading: loading } = useSWR(
    done ? null : ['label-quote', quoteUrl],
    () => apiFetch<ApiRes<SellerShipQuote>>(quoteUrl),
    { revalidateOnFocus: false },
  );
  const quote = quoteRes?.data;

  // Prefill ô cân khi quote đầu về (adjust-while-render, không setState trong effect).
  const [prefilled, setPrefilled] = useState(false);
  if (quote && !prefilled) {
    setPrefilled(true);
    if (!weightInput && quote.prefillGram > 0) setWeightInput(String(quote.prefillGram));
  }

  const commitWeight = () => {
    const v = Number(weightInput);
    setWeightCommitted(Number.isFinite(v) && v > 0 ? Math.ceil(v) : null);
  };

  const balanceAfter = quote?.price != null ? quote.walletBalance - quote.price : null;

  const handleBuy = async () => {
    if (!quote?.eligible || quote.price == null) return;
    setBuying(true);
    try {
      const res = await apiFetch<ApiRes<{ trackingCode?: string; labelUrl?: string }>>(
        `/api/v1/customer/shipping/orders/${encodeURIComponent(stagingId)}/label`,
        {
          method: 'POST',
          body: JSON.stringify({ weightGram: quote.actualGram || quote.chargeableGram, requestId }),
        },
      );
      setDone(res.data);
      toast('success', t('buyLabel.success', { tracking: res.data.trackingCode ?? '' }));
      onBought();
    } catch (e) {
      toast('error', t(`buyLabel.errors.${errorKey((e as Error).message)}`));
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'var(--color-overlay)' }} onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-xl border border-border1 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border1">
          <h2 className="text-sm font-bold text-text-primary inline-flex items-center gap-1.5">
            <Truck size={14} /> {t('buyLabel.title', { code })}
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-card-hover text-text-muted">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {done ? (
            <div className="space-y-2 text-center py-2">
              <p className="text-xs text-text-muted">{t('buyLabel.success', { tracking: '' })}</p>
              <p className="font-mono text-sm font-bold text-text-primary">{done.trackingCode ?? '—'}</p>
              {done.labelUrl && (
                <a href={done.labelUrl} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                  {t('buyLabel.labelLink')} ↗
                </a>
              )}
              <p className="text-[10px]">
                <Link href="/portal/wallet" prefetch={false} className="text-accent hover:underline">
                  {t('buyLabel.viewWallet')} →
                </Link>
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[9px] uppercase tracking-wider text-text-muted font-bold">{t('buyLabel.weightLabel')}</label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min={1}
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    onBlur={commitWeight}
                    onKeyDown={(e) => e.key === 'Enter' && commitWeight()}
                    className="w-32 px-2.5 py-1.5 rounded-lg border border-border1 bg-card text-[12px] outline-none focus:border-accent"
                  />
                  <span className="text-xs text-text-muted">g</span>
                  <Button variant="outline" size="sm" onClick={commitWeight}>{t('buyLabel.recalc')}</Button>
                </div>
                <p className="mt-1 text-[10px] text-text-muted">{t('buyLabel.weightHint')}</p>
              </div>

              {loading ? (
                <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
              ) : quote && !quote.eligible ? (
                <p className="text-xs text-error bg-error-bg rounded-lg px-3 py-2">
                  {t(`buyLabel.errors.${errorKey(quote.errorCode ?? 'service_unavailable')}`)}
                </p>
              ) : quote ? (
                <div className="rounded-lg border border-border1 divide-y divide-border2 text-[11px]">
                  <Row label={t('buyLabel.actual')} value={`${quote.actualGram}g`} />
                  <Row label={t('buyLabel.dim')} value={`${quote.dimGram}g`} />
                  <Row label={t('buyLabel.chargeable')} value={<b>{quote.chargeableGram}g</b>} />
                  <Row label={t('buyLabel.tier')} value={quote.tierGram ? `≤ ${quote.tierGram}g` : '—'} />
                  <Row label={t('buyLabel.price')} value={<b className="text-accent">{quote.price != null ? fmtUSD(quote.price) : '—'}</b>} />
                  <Row label={t('buyLabel.wallet')} value={fmtUSD(quote.walletBalance)} />
                  {balanceAfter != null && (
                    <Row
                      label={t('buyLabel.afterBuy')}
                      value={<span className={balanceAfter + quote.creditLimit < 0 ? 'text-error font-semibold' : ''}>{fmtUSD(balanceAfter)}</span>}
                    />
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>

        {!done && (
          <div className="px-5 py-3 border-t border-border1 flex justify-end">
            <Button
              variant="primary"
              onClick={handleBuy}
              loading={buying}
              disabled={loading || !quote?.eligible || quote.price == null || (balanceAfter != null && balanceAfter + (quote?.creditLimit ?? 0) < 0)}
            >
              <Truck size={13} className="mr-1" />
              {t('buyLabel.confirm')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="text-text-muted">{label}</span>
      <span className="tabular-nums text-text-primary">{value}</span>
    </div>
  );
}
