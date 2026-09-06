import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Factory, X } from 'lucide-react';

import { useFactoryOptionsStore } from '@/store/factoryOptionsStore';

import { useFactoryScope } from '@/hooks/useFactoryScope';

/**
 * Nhãn "đang lọc theo xưởng X" cho trang mở từ cụm menu theo xưởng.
 *
 * Trang bị thu hẹp dữ liệu mà không có dấu hiệu gì trên màn hình là cách chắc
 * chắn nhất để người ta đọc nhầm số. Chip này là dấu hiệu đó, kèm nút bỏ lọc.
 * Không render gì khi không có `?factoryId=` — hoặc khi xưởng do TÀI KHOẢN quy
 * định (Fulfillment), vì lúc đó bỏ lọc cũng không được.
 */
export function FactoryScopeChip({ className }: { className?: string }) {
  const { t } = useTranslation('layout');
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = useFactoryScope();
  const urlScope = searchParams.get('factoryId') || undefined;
  const factories = useFactoryOptionsStore((s) => s.factories);
  const load = useFactoryOptionsStore((s) => s.load);

  useEffect(() => {
    if (urlScope) void load();
  }, [urlScope, load]);

  if (!urlScope || scope !== urlScope) return null;
  const factory = factories.find((f) => f._id === urlScope);
  const name = factory ? (factory.shortName ? `${factory.shortName} · ${factory.name}` : factory.name) : urlScope;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary ${className || ''}`}
    >
      <Factory size={13} />
      <span className="font-medium">{t('factoryScopeChip.label', { name })}</span>
      <button
        type="button"
        title={t('factoryScopeChip.clear')}
        onClick={() =>
          setSearchParams(
            (prev) => {
              const sp = new URLSearchParams(prev);
              sp.delete('factoryId');
              return sp;
            },
            { replace: true },
          )
        }
        className="ml-0.5 rounded hover:bg-primary/20"
      >
        <X size={13} />
      </button>
    </span>
  );
}
