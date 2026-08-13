import React from 'react';

import { cn } from '@/utils/cn';

import { useInView } from './useInView';

interface RevealProps {
  children: React.ReactNode;
  /** Trễ theo bậc để các item trong 1 lưới hiện lần lượt (ms). */
  delay?: number;
  className?: string;
}

/**
 * Fade + trượt lên nhẹ khi cuộn tới. Tôn trọng `prefers-reduced-motion`:
 * người dùng tắt chuyển động sẽ thấy nội dung hiện sẵn, không dịch chuyển.
 */
function Reveal({ children, delay = 0, className }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-all duration-700 ease-out motion-reduce:transition-none',
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        'motion-reduce:opacity-100 motion-reduce:translate-y-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default Reveal;
