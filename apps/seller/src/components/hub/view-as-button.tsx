'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Loader2 } from 'lucide-react';
import { useToast } from '@/components/shared/toast';

interface ViewAsButtonProps {
  customerId: string;
  /** Trang đích trong portal khách sau khi mạo danh (mặc định danh sách đơn). */
  target?: string;
  compact?: boolean;
  className?: string;
}

/** "Xem với tư cách seller": `POST /api/hub/impersonate` → cookie phiên khách → mở `/portal/...` ngay trong app. */
export function ViewAsButton({ customerId, target = '/portal/orders', compact, className }: ViewAsButtonProps) {
  const { t } = useTranslation('hub');
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/hub/impersonate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message || `HTTP ${res.status}`);
      }
      window.location.href = target;
    } catch (e) {
      toast('error', (e as Error).message);
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      title={t('sellers.viewAs')}
      className={`inline-flex items-center gap-1 rounded-md text-[10px] font-bold bg-cta text-cta-foreground hover:bg-cta-hover disabled:opacity-60 ${compact ? 'px-1.5 py-1' : 'px-2 py-1'} ${className ?? ''}`}
    >
      {busy ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
      {!compact && t('sellers.viewAs')}
    </button>
  );
}
