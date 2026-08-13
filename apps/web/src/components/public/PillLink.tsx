import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/utils/cn';

type PillVariant = 'solid' | 'outline' | 'onDark' | 'outlineDark';

interface PillLinkProps {
  children: React.ReactNode;
  /** Đường dẫn nội bộ (react-router). Dùng `href` cho anchor `#...` hoặc link ngoài. */
  to?: string;
  href?: string;
  variant?: PillVariant;
  size?: 'default' | 'sm';
  withArrow?: boolean;
  className?: string;
}

const VARIANTS: Record<PillVariant, string> = {
  solid: 'bg-brand-600 text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700',
  outline: 'border-2 border-[#0f110f]/15 text-[#0f110f] hover:border-brand-600 hover:text-brand-600',
  onDark: 'bg-white text-ink-900 hover:bg-brand-50',
  outlineDark: 'border-2 border-white/25 text-white hover:border-white/70 hover:bg-white/10',
};

/**
 * Nút dạng viên thuốc chữ hoa — hình dáng CTA đặc trưng của nhận diện Onos
 * (bo tròn hoàn toàn, chữ 12px đậm, giãn chữ rộng, mũi tên nhỏ bên phải).
 */
function PillLink({
  children,
  to,
  href,
  variant = 'solid',
  size = 'default',
  withArrow = true,
  className,
}: PillLinkProps) {
  const classes = cn(
    'group/pill inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-bold uppercase tracking-[0.1em] transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2',
    size === 'sm' ? 'px-5 py-2.5 text-[0.68rem]' : 'px-7 py-4 text-[0.72rem]',
    VARIANTS[variant],
    className,
  );

  const content = (
    <>
      {children}
      {withArrow && (
        <ChevronRight
          size={14}
          className="transition-transform duration-200 group-hover/pill:translate-x-0.5 motion-reduce:transition-none"
        />
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} className={classes}>
        {content}
      </a>
    );
  }

  return (
    <Link to={to ?? '/'} className={classes}>
      {content}
    </Link>
  );
}

export default PillLink;
