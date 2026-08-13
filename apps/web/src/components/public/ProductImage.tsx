import React, { useState } from 'react';
import { Shirt } from 'lucide-react';

import { cn } from '@/utils/cn';

interface ProductImageProps {
  src?: string;
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
 * `onError` cũng rơi về ảnh mặc định — link mockup hỏng sẽ không để lại ô vỡ.
 *
 * Nhánh mặc định là **trang trí thuần**, không gắn nhãn cho screen reader: thẻ
 * và trang chi tiết đều đã có tên sản phẩm ở `<h3>`/`<h1>` ngay cạnh, thêm nữa
 * sẽ khiến trình đọc màn hình đọc tên hai lần.
 */
function ProductImage({ src, alt, className, iconSize = 30, priority = false }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

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
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}

export default ProductImage;
