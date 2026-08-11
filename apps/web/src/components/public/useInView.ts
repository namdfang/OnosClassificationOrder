import { useEffect, useRef, useState } from 'react';

/**
 * Báo khi element lọt vào viewport lần đầu (chỉ bắn 1 lần rồi ngắt observer).
 * Dùng cho hiệu ứng reveal khi cuộn ở trang landing — không cần thư viện animation.
 */
export function useInView<T extends HTMLElement>(rootMargin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Trình duyệt quá cũ / môi trường không có IntersectionObserver → hiện luôn.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    // Đã nằm sẵn trong viewport ngay lúc mount (mở thẳng link `#team`, khôi phục
    // vị trí cuộn, bfcache…) → hiện ngay, không chờ callback đầu tiên của
    // observer. Trình duyệt có thể hoãn callback đó khi tab chưa được vẽ, và khi
    // ấy nội dung sẽ kẹt ở `opacity: 0`.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
