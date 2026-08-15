import React from 'react';
import { Shirt } from 'lucide-react';

import { cn } from '@/utils/cn';

import { useImageFallback } from '@/hooks/useImageFallback';

interface ProductImageProps {
  /** URL ưu tiên — với catalog là `mockupLarge` (ảnh gốc full-size). */
  src?: string;
  /** URL dự phòng khi `src` hỏng — với catalog là `mockup` (thumbnail `-100x100`). */
  fallbackSrc?: string;
  alt: string;
  className?: string;
  /** Cỡ icon của ảnh mặc định — thẻ trong lưới nhỏ, trang chi tiết lớn. */
  iconSize?: number;
  priority?: boolean;
}

/**
 * Ảnh sản phẩm cho trang public, kèm **ảnh mặc định** khi thiếu `mockup`.
 *
 * Thực tế chỉ ~1% sản phẩm có `mockup`, nên phần lớn thẻ sẽ rơi vào nhánh mặc
 * định — vì vậy ảnh mặc định được vẽ bằng CSS/SVG (nền gradient tím nhạt + lưới
 * mờ + icon áo) thay vì tải 1 file ảnh: không thêm request nào, không bao giờ
 * hỏng, và co giãn theo mọi kích thước.
 *
 * **Chuỗi dự phòng 3 bậc** (`Catalog.md` §5.1): `src` (ảnh gốc full-size) → hỏng
 * thì `fallbackSrc` (thumbnail) → hỏng nốt thì ảnh mặc định. Ảnh gốc có thể đã
 * bị xóa khỏi onospod trong khi thumbnail vẫn còn, nên bậc giữa là thứ giữ cho
 * sản phẩm không tụt từ "ảnh mờ" xuống "không có ảnh". Không bậc nào để lại ô vỡ.
 *
 * Nhánh mặc định là **trang trí thuần**, không gắn nhãn cho screen reader: thẻ
 * và trang chi tiết đều đã có tên sản phẩm ở `<h3>`/`<h1>` ngay cạnh, thêm nữa
 * sẽ khiến trình đọc màn hình đọc tên hai lần.
 */
function ProductImage({ src, fallbackSrc, alt, className, iconSize = 30, priority = false }: ProductImageProps) {
  const { src: current, onError } = useImageFallback([src, fallbackSrc]);
  const showPlaceholder = !current;

  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-slate-50', className)}>
      {showPlaceholder ? (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-brand-100/70"
          />
          {/* Lưới mờ — cho ảnh mặc định có kết cấu thay vì mảng màu phẳng. */}
          <span
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(111,38,194,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(111,38,194,0.07) 1px, transparent 1px)',
              backgroundSize: '14px 14px',
            }}
          />
          <Shirt size={iconSize} className="relative text-brand-300" aria-hidden="true" />
        </>
      ) : (
        <img
          // `key` theo URL → mỗi bậc dự phòng là một phần tử <img> mới, thay vì
          // dựa vào việc trình duyệt bắn lại `error` trên đúng thẻ vừa hỏng.
          key={current}
          src={current}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={onError}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}

export default ProductImage;
