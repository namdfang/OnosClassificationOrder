'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, X } from 'lucide-react';
import type { CustomerAdminRow } from 'shared';
import { useApi } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';

interface SellerFilterPickerProps {
  value: string;
  onChange: (customerId: string) => void;
}

/** Chọn 1 seller để khoá kết quả (khuôn `SellerFilterPicker` của thghub): ô gõ tìm + danh sách thả. */
export function SellerFilterPicker({ value, onChange }: SellerFilterPickerProps) {
  const { t } = useTranslation('hub');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useApi<ApiRes<CustomerAdminRow[]>>(`/api/hub/v1/customers?page=1&limit=15${q ? `&search=${encodeURIComponent(q)}` : ''}`);
  const { data: current } = useApi<ApiRes<CustomerAdminRow[]>>(value ? `/api/hub/v1/customers?page=1&limit=50&search=${encodeURIComponent(value)}` : null);
  const selected = current?.data?.find((c) => String(c._id) === value);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold ${value ? 'border-accent bg-accent-light text-accent' : 'border-border1 bg-card text-text-secondary hover:bg-card-hover'}`}>
        {value ? (selected?.userSku || selected?.userEmail || value) : t('orders.allSellers')}
        {value ? (
          <span role="button" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="ml-0.5 hover:text-error"><X size={11} /></span>
        ) : (
          <ChevronDown size={11} />
        )}
      </button>
      {open && (
        <div className="absolute z-[70] mt-1 w-72 bg-card border border-border1 rounded-xl shadow-elevated overflow-hidden">
          <div className="p-2 border-b border-border2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sellers.search')} className="w-full px-2.5 py-1.5 rounded-lg border border-border1 bg-card text-[11px] outline-none focus:border-accent" />
          </div>
          <ul className="max-h-64 overflow-y-auto scrollbar-thin">
            {(data?.data ?? []).map((c) => (
              <li key={String(c._id)}>
                <button type="button" onClick={() => { onChange(String(c._id)); setOpen(false); setQ(''); }} className="w-full text-left px-3 py-2 hover:bg-card-hover">
                  <p className="text-[11px] font-semibold text-text-primary">{c.userSku || '—'}<span className="ml-1.5 text-[10px] font-normal text-text-muted">{(c.orderCount ?? 0).toLocaleString()} {t('sellers.columns.orders').toLowerCase()}</span></p>
                  <p className="text-[10px] text-text-muted truncate">{c.userEmail}</p>
                </button>
              </li>
            ))}
            {(data?.data ?? []).length === 0 && <li className="px-3 py-3 text-[11px] text-text-muted">{t('sellers.empty')}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
