'use client';

import { STATUS_COLORS } from '@/lib/constants';

interface StatusPillProps {
  status: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

export function StatusPill({ status, label, count, active, onClick }: StatusPillProps) {
  const color = STATUS_COLORS[status] || '#4b5563';
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer"
      style={{
        border: `1.5px solid ${active ? color : 'var(--color-border1)'}`,
        background: active ? color + '10' : 'var(--color-card)',
        color,
      }}
    >
      {label}
      <span className="text-[9px] font-extrabold px-1.5 py-0 rounded-[10px] text-white" style={{ background: color }}>
        {count}
      </span>
    </button>
  );
}
