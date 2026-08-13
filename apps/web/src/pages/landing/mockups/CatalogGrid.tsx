import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Shirt } from 'lucide-react';

/**
 * Minh hoạ catalog sản phẩm phía khách hàng (mirror `pages/customer/catalog/`).
 *
 * CỐ Ý không hiển thị giá: giá bán theo hạng khách là dữ liệu kinh doanh thật,
 * không đưa lên trang public. Xem Landing.md §8.
 */

const PRODUCTS = ['hoodie', 'tshirt', 'cap', 'tote'];

function CatalogGrid() {
  const { t } = useTranslation('landing');

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
        <Search size={13} className="shrink-0 text-slate-400" />
        <span className="text-[0.65rem] text-slate-400">{t('mockup.catalog.subtitle')}</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {PRODUCTS.map((key) => (
          <div key={key} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex h-16 items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100/60">
              <Shirt size={22} className="text-brand-400" />
            </div>
            <div className="p-2">
              <p className="truncate text-[0.65rem] font-semibold text-[#0f110f]">
                {t(`mockup.catalog.products.${key}.name`)}
              </p>
              <p className="mt-0.5 truncate text-[0.55rem] text-slate-500">
                {t(`mockup.catalog.products.${key}.variant`)}
              </p>
              <span className="mt-1.5 block rounded-full bg-brand-600 py-1 text-center text-[0.5rem] font-bold uppercase tracking-wide text-white">
                {t('mockup.catalog.order')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CatalogGrid;
