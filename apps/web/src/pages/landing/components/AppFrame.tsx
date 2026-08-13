import React from 'react';

import { cn } from '@/utils/cn';

interface AppFrameProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Khung "cửa sổ ứng dụng" bọc quanh các ảnh minh hoạ giao diện, để người xem
 * đọc chúng như màn hình sản phẩm thật chứ không phải hình trang trí.
 */
function AppFrame({ title, subtitle, children, className }: AppFrameProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_70px_-30px_rgba(15,17,15,0.45)]',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-slate-200/80 bg-slate-50/80 px-4 py-3">
        <div className="flex shrink-0 gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-[#0f110f]">{title}</p>
          {subtitle && <p className="truncate text-[0.65rem] text-slate-500">{subtitle}</p>}
        </div>
      </div>

      <div className="p-4">{children}</div>
    </div>
  );
}

export default AppFrame;
