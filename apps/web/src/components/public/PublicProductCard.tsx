import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { CustomerCatalogItem } from 'shared';

import { cn } from '@/utils/cn';

import { lowestRetailPrice } from './catalogPrice';
import ProductImage from './ProductImage';

const priceFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

interface PublicProductCardProps {
  item: CustomerCatalogItem;
  to: string;
  className?: string;
}

/**
 * Thẻ sản phẩm cho catalog CÔNG KHAI.
 *
 * **Thiết kế bám theo dữ liệu thật, không theo dữ liệu lý tưởng.** Thực tế hầu
 * hết sản phẩm chỉ có `fullName`: ~1% có `mockup`, gần như không có
 * `productCategory`/`printMethod`, và chưa sản phẩm nào có `variations` nên
 * KHÔNG có giá. Vì vậy:
 *
 * - Tên sản phẩm là nội dung chính (font `display`, cỡ lớn) chứ không phải ảnh.
 * - Ô ảnh luôn hiện để lưới đều nhau; thiếu `mockup` thì `ProductImage` vẽ ảnh
 *   mặc định (gradient tím + icon áo) chứ không để ô trống.
 * - Mọi dòng phụ (danh mục, cách in, giá, số biến thể) đều render có điều kiện;
 *   không bịa nhãn thay thế kiểu "Liên hệ" lặp lại 151 lần.
 *
 * Khi dữ liệu đầy đủ hơn, thẻ tự hiện thêm phần tương ứng mà không cần sửa lại.
 *
 * CHỈ hiện `retailPrice` (giá niêm yết) — giá ưu đãi theo tier là quyền lợi của
 * khách đã đăng nhập, không lộ ở trang public.
 */
function PublicProductCard({ item, to, className }: PublicProductCardProps) {
  const { t } = useTranslation('catalog');
  const from = lowestRetailPrice(item);
  const meta = [item.productCategory, item.printMethod].filter(Boolean) as string[];

  return (
    <Link
      to={to}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-300',
        'hover:-translate-y-1 hover:border-brand-300 hover:shadow-[0_20px_50px_-30px_rgba(111,38,194,0.55)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2',
        'motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      {/* Vệt nhấn chạy dọc mép trái khi hover — thay cho ảnh, giúp thẻ chữ vẫn có điểm nhìn. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 origin-top scale-y-0 bg-brand-600 transition-transform duration-300 group-hover:scale-y-100 motion-reduce:transition-none"
      />

      <ProductImage
        src={item.mockup}
        alt={item.fullName}
        iconSize={30}
        className="mb-4 h-32 rounded-xl transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
      />

      <h3 className="font-display text-base font-medium leading-snug text-[#0f110f]">{item.fullName}</h3>

      {meta.length > 0 && <p className="mt-2 text-xs text-slate-500">{meta.join(' · ')}</p>}

      {from != null && (
        <p className="mt-2 text-sm font-semibold text-[#0f110f]">
          <span className="text-xs font-normal text-slate-500">{t('card.from')} </span>
          {priceFormatter.format(from)}
        </p>
      )}

      {item.variations.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">{t('card.variations', { count: item.variations.length })}</p>
      )}

      <span className="mt-auto flex items-center gap-1.5 pt-5 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-brand-600">
        {t('card.view')}
        <ArrowRight
          size={13}
          className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </span>
    </Link>
  );
}

export default PublicProductCard;
