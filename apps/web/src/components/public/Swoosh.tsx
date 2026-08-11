import React from 'react';

import { cn } from '@/utils/cn';

import { useInView } from './useInView';

/**
 * Nét gạch chân vẽ tay dưới cụm từ nhấn trong tiêu đề — chi tiết nhận diện
 * lấy từ trang thương hiệu Onos. Nét tự "vẽ" ra khi cuộn tới; người dùng tắt
 * chuyển động sẽ thấy nét hiện sẵn.
 */
function Swoosh({ className }: { className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>();

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-x-0 -bottom-1.5 block', className)}
    >
      <svg viewBox="0 0 400 24" preserveAspectRatio="none" fill="none" className="h-[0.42em] w-full overflow-visible">
        <path
          d="M3 17C64 8 152 3 232 6c52 2 106 6 165 14"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={inView ? 0 : 1}
          className="text-brand-600 transition-[stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none motion-reduce:[stroke-dashoffset:0]"
        />
      </svg>
    </span>
  );
}

export default Swoosh;
