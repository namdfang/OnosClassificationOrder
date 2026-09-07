'use client';

import { CheckCircle2, Clock, Factory, Package, PauseCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CustomerOrderCounts } from 'shared';

interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}

function StatsCard({ icon, label, value, color }: StatsCardProps) {
  return (
    <div className="bg-card border border-border1 rounded-xl p-3 border-t-4" style={{ borderTopColor: color }}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-1">{label}</div>
          <div className="text-[18px] font-extrabold truncate tabular-nums" style={{ color }} title={value}>
            {value}
          </div>
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

const INK = '#800808';

export function OrdersStatsBar({ counts }: { counts: CustomerOrderCounts | null }) {
  const { t } = useTranslation('seller');
  const n = (v?: number) => (v ?? 0).toLocaleString();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatsCard icon={<Package size={16} style={{ color: INK }} />} label={t('stats.total')} value={n(counts?.all)} color={INK} />
      <StatsCard icon={<Clock size={16} style={{ color: '#9a7a05' }} />} label={t('stats.pending')} value={n(counts?.pending)} color="#a16207" />
      <StatsCard icon={<Factory size={16} style={{ color: '#c40c68' }} />} label={t('stats.inProduction')} value={n(counts?.inProduction)} color="#4338ca" />
      <StatsCard icon={<CheckCircle2 size={16} style={{ color: '#3a8a4c' }} />} label={t('stats.completed')} value={n((counts?.fulfilled ?? 0) + (counts?.completed ?? 0))} color="#15803d" />
      <StatsCard icon={<PauseCircle size={16} style={{ color: '#c30d07' }} />} label={t('stats.held')} value={n(counts?.held)} color="#c2410c" />
    </div>
  );
}
