import React from 'react';

import { cn } from '@/utils/cn';

import Reveal from './Reveal';
import Swoosh from './Swoosh';

interface SectionHeadingProps {
  eyebrow: string;
  /** Phần đầu tiêu đề (không gạch chân). */
  lead: string;
  /** Cụm từ nhấn — được gạch chân bằng nét vẽ tay. */
  accent: string;
  subtitle?: string;
  align?: 'left' | 'center';
  tone?: 'light' | 'dark';
  className?: string;
}

/**
 * Cụm tiêu đề dùng chung cho mọi section: eyebrow tím viết hoa → tiêu đề lớn
 * font display kèm nét gạch chân → mô tả ngắn.
 */
function SectionHeading({
  eyebrow,
  lead,
  accent,
  subtitle,
  align = 'left',
  tone = 'light',
  className,
}: SectionHeadingProps) {
  return (
    <Reveal className={cn(align === 'center' && 'text-center', className)}>
      <p
        className={cn(
          'text-xs font-bold uppercase tracking-[0.18em]',
          tone === 'dark' ? 'text-brand-300' : 'text-brand-600',
        )}
      >
        {eyebrow}
      </p>

      <h2
        className={cn(
          'mt-3 font-display text-[1.75rem] font-medium leading-[1.18] tracking-tight sm:text-4xl lg:text-[2.75rem]',
          tone === 'dark' ? 'text-white' : 'text-[#0f110f]',
        )}
      >
        {lead}{' '}
        <span className="relative inline-block whitespace-nowrap">
          {accent}
          <Swoosh />
        </span>
      </h2>

      {subtitle && (
        <p
          className={cn(
            'mt-5 max-w-2xl text-base leading-relaxed',
            align === 'center' && 'mx-auto',
            tone === 'dark' ? 'text-white/70' : 'text-slate-600',
          )}
        >
          {subtitle}
        </p>
      )}
    </Reveal>
  );
}

export default SectionHeading;
