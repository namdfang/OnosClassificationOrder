'use client';

import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Factory, PauseCircle, PenTool, StickyNote } from 'lucide-react';
import type { AdminInternalStatus } from 'shared';

const STAGE_COLORS: Record<string, string> = {
  'tool-check': '#7f9a2b', designer: '#48a05c', print: '#c9a400', press: '#e01008', 'qc-post-press': '#c40c68', 'sew-in': '#a80a58', 'sew-out': '#800808', pack: '#3a0c24', done: '#2f7a40',
};

/**
 * Cột "Nội bộ" ở `/hub/orders` — tình trạng sản xuất để admin support seller nhanh: chặng + xưởng + designer,
 * lỗi sản xuất (nguồn · loại · ghi chú), ghi chú soát tool, lý do giữ, nhật ký gần nhất. Dữ liệu này KHÔNG có ở cổng khách.
 */
export function InternalStatus({ s, compact = false }: { s?: AdminInternalStatus; compact?: boolean }) {
  const { t } = useTranslation(['hub', 'track']);
  if (!s) return <span className="text-text-muted">—</span>;
  const stageLabel = s.stage ? (s.stage === 'done' ? t('track:progress.stageStatus.done') : t(`track:progress.stages.${s.stage}`, { defaultValue: s.stage })) : undefined;
  const color = s.stage ? (STAGE_COLORS[s.stage] ?? '#5c5361') : '#5c5361';
  // Ghi chú soát tool có thể lặp giữa `toolResultNote` và `toolCheckErrorNotes` → gộp + bỏ trùng.
  const notes = [...new Set([s.toolResultNote && s.toolResultNote.toLowerCase() !== 'ok' ? s.toolResultNote : undefined, ...(s.toolCheckErrorNotes ?? []), s.errorFileNote, s.printStatusNote, s.designerRejectedReason].filter((x): x is string => !!x && x.trim() !== ''))];
  return (
    <div className={`space-y-0.5 ${compact ? 'text-[10px]' : 'text-[10.5px]'} leading-snug`}>
      <div className="flex flex-wrap items-center gap-1">
        {stageLabel && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold text-white" style={{ background: color }}>{stageLabel}</span>}
        {s.factoryShortName && <span className="inline-flex items-center gap-0.5 text-text-secondary" title={s.factoryName}><Factory size={9} />{s.factoryShortName}</span>}
        {s.designerName && <span className="inline-flex items-center gap-0.5 text-text-secondary"><PenTool size={9} />{s.designerName}{s.designerStatus ? <span className="text-text-muted"> · {s.designerStatus}</span> : null}</span>}
        {s.priority != null && s.priority > 0 && <span className="px-1 rounded bg-warning-bg text-warning font-bold text-[9px]">P{s.priority}</span>}
      </div>
      {s.productionError && (
        <p className="text-error font-semibold inline-flex items-start gap-1"><AlertTriangle size={10} className="mt-0.5 shrink-0" /><span>{s.productionErrorSource ? `[${t(`hub:internal.source.${s.productionErrorSource}`, { defaultValue: s.productionErrorSource })}] ` : ''}{s.productionError}{s.productionErrorNote ? ` — ${s.productionErrorNote}` : ''}</span></p>
      )}
      {s.holdReason && <p className="text-warning inline-flex items-start gap-1"><PauseCircle size={10} className="mt-0.5 shrink-0" /><span>{s.holdReason}</span></p>}
      {notes.slice(0, compact ? 1 : 2).map((n, i) => <p key={i} className="text-text-secondary inline-flex items-start gap-1"><StickyNote size={10} className="mt-0.5 shrink-0 text-text-muted" /><span className="line-clamp-2">{n}</span></p>)}
      {s.lastLog && (
        <p className="text-text-muted">
          {t('hub:internal.lastLog')}: <span className="font-mono">{s.lastLog.action}{s.lastLog.field ? `:${s.lastLog.field}` : ''}</span>
          {s.lastLog.userName ? ` · ${s.lastLog.userName}` : ''}{s.lastLog.at ? ` · ${dayjs(s.lastLog.at).format('DD/MM HH:mm')}` : ''}
        </p>
      )}
    </div>
  );
}
