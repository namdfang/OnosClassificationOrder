import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, BarChart3, BookOpen, Info, PieChart, TrendingDown, TrendingUp } from 'lucide-react';
import type { DesignerRank, PerformanceScoreRow } from 'shared';
import { toast } from 'sonner';

import { RepositoryRemote } from '@/services';

import { Hint } from '@/components/common/Hint';
import { Spinner } from '@/components/common/Spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';

import { handleAxiosError } from '@/utils';
import { cn } from '@/utils/cn';

import { usePermission } from '@/hooks/usePermission';

const SET_LEVEL_ROLES = ['SuperAdmin', 'Admin'];

const RANK_STYLES: Record<DesignerRank, string> = {
  S: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  B: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  C: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  D: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
};

export function RankBadge({ rank, muted, size = 'md' }: { rank: DesignerRank; muted?: boolean; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold',
        size === 'md' ? 'h-6 w-6 text-xs' : 'h-5 w-5 text-[10px]',
        RANK_STYLES[rank],
        muted && 'opacity-40 grayscale',
      )}
    >
      {rank}
    </span>
  );
}

const COMPONENT_KEYS = ['speed', 'quality', 'throughput', 'response', 'reliability', 'proactive'] as const;
const COMPONENT_COLORS: Record<(typeof COMPONENT_KEYS)[number], string> = {
  speed: 'bg-violet-500',
  quality: 'bg-emerald-500',
  throughput: 'bg-sky-500',
  response: 'bg-amber-500',
  reliability: 'bg-slate-500',
  proactive: 'bg-rose-500',
};
/** Hex cho conic-gradient donut (không dùng được class Tailwind trong gradient). */
const COMPONENT_HEX: Record<(typeof COMPONENT_KEYS)[number], string> = {
  speed: '#8b5cf6',
  quality: '#10b981',
  throughput: '#0ea5e9',
  response: '#f59e0b',
  reliability: '#64748b',
  proactive: '#f43f5e',
};
/** Trọng số 5 thành phần — MIRROR công thức BE `scorePerfWindow`. */
const COMPONENT_WEIGHTS: Record<(typeof COMPONENT_KEYS)[number], number> = {
  speed: 0.3,
  quality: 0.25,
  throughput: 0.15,
  response: 0.1,
  reliability: 0.1,
  proactive: 0.1,
};
const RANK_OPTIONS: DesignerRank[] = ['S', 'A', 'B', 'C', 'D'] as DesignerRank[];

/**
 * Donut = điểm tổng: mỗi màu là số điểm thành phần đó ĐÓNG GÓP (component ×
 * trọng số × 100), phần xám = điểm còn thiếu tới 100. Tô kín vòng = 100 điểm.
 */
function ComponentDonut({ row }: { row: PerformanceScoreRow }) {
  let acc = 0;
  const stops: string[] = [];
  for (const k of COMPONENT_KEYS) {
    const pts = row.components[k] * COMPONENT_WEIGHTS[k] * 100;
    stops.push(`${COMPONENT_HEX[k]} ${acc}% ${acc + pts}%`);
    acc += pts;
  }
  stops.push(`rgba(148,163,184,0.25) ${acc}% 100%`);
  return (
    <div
      className="relative h-10 w-10 shrink-0 cursor-help rounded-full"
      style={{ background: `conic-gradient(${stops.join(',')})` }}
    >
      <div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-card text-[10px] font-bold tabular-nums">
        {row.score}
      </div>
    </div>
  );
}

interface DesignerPerformanceCardProps {
  from?: string;
  to?: string;
  reloadToken?: number;
  /** Báo lên tab khi score load xong — TopDesigners dùng rankMap gắn badge. */
  onLoaded?: (rows: PerformanceScoreRow[]) => void;
}

/**
 * Bảng xếp hạng hiệu suất designer theo kỳ lọc chung: badge hạng S-D + điểm
 * 0-100 + trend so kỳ trước + 5 bar thành phần (tooltip giải thích) + cột
 * Level chính thức (Admin set, có chip gợi ý từ rolling 60 ngày).
 */
export function DesignerPerformanceCard({ from, to, reloadToken, onLoaded }: DesignerPerformanceCardProps) {
  const { t } = useTranslation('dashboard');
  const { roleName } = usePermission();
  const canSetLevel = !!roleName && SET_LEVEL_ROLES.includes(roleName);
  const [rows, setRows] = useState<PerformanceScoreRow[]>([]);
  const [minDone, setMinDone] = useState(10);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [vizMode, setVizMode] = useState<'donut' | 'bars'>('donut');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await RepositoryRemote.designer.performanceScores({ from, to });
        const data = res.data?.data as { rows?: PerformanceScoreRow[]; minDone?: number } | undefined;
        const list = data?.rows || [];
        setRows(list);
        setMinDone(data?.minDone || 10);
        onLoaded?.(list);
      } catch (err) {
        handleAxiosError(err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, reloadToken]);

  const applyLevel = async (row: PerformanceScoreRow, level: DesignerRank | null) => {
    try {
      setSavingUserId(row.userId);
      await RepositoryRemote.designer.setDesignerLevel(row.userId, level);
      setRows((prev) => prev.map((r) => (r.userId === row.userId ? { ...r, designerLevel: level ?? undefined } : r)));
      toast.success(t('performance.levelSaved', { name: row.fullName, level: level ?? '—' }));
    } catch (err) {
      handleAxiosError(err);
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Award size={16} className="text-teal-500" />
          <span className="text-sm font-bold">{t('performance.title')}</span>
          <Hint
            forceRich
            content={
              <div className="max-w-xs text-xs">
                <p className="mb-1 font-semibold">{t('performance.formulaTitle')}</p>
                <p>{t('performance.formulaSpeed')}</p>
                <p>{t('performance.formulaQuality')}</p>
                <p>{t('performance.formulaThroughput')}</p>
                <p>{t('performance.formulaResponse')}</p>
                <p>{t('performance.formulaReliability')}</p>
                <p>{t('performance.formulaProactive')}</p>
                <p className="mt-1 italic">{t('performance.formulaNote', { minDone })}</p>
              </div>
            }
          >
            <Info size={13} className="cursor-help text-muted-foreground" />
          </Hint>
          <span className="hidden sm:inline text-xs text-muted-foreground">{t('performance.subtitle')}</span>
          <div className="ml-auto flex items-center gap-1">
            <div className="flex rounded-md border border-input p-0.5">
              <button
                type="button"
                onClick={() => setVizMode('donut')}
                aria-label={t('performance.vizDonut')}
                title={t('performance.vizDonut')}
                className={cn(
                  'rounded p-1 transition-colors',
                  vizMode === 'donut' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <PieChart size={13} />
              </button>
              <button
                type="button"
                onClick={() => setVizMode('bars')}
                aria-label={t('performance.vizBars')}
                title={t('performance.vizBars')}
                className={cn(
                  'rounded p-1 transition-colors',
                  vizMode === 'bars' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <BarChart3 size={13} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors',
                showGuide ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <BookOpen size={12} /> {t('performance.guide.button')}
            </button>
          </div>
        </div>

        <Dialog open={showGuide} onOpenChange={setShowGuide}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen size={18} className="text-teal-500" />
                {t('performance.guideDialog.title')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-slate-700 dark:text-slate-200">{t('performance.guideDialog.intro')}</p>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  {t('performance.guideDialog.ranksTitle')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['S', '85 - 100'],
                      ['A', '70 - 84'],
                      ['B', '55 - 69'],
                      ['C', '40 - 54'],
                      ['D', '0 - 39'],
                    ] as [DesignerRank, string][]
                  ).map(([rk, range]) => (
                    <div key={rk} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
                      <RankBadge rank={rk} size="sm" />
                      <div className="leading-tight">
                        <p className="text-xs font-semibold">{t(`performance.guideDialog.rankLabels.${rk}`)}</p>
                        <p className="text-[10px] tabular-nums text-muted-foreground">{range}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  {t('performance.guideDialog.partsTitle')}
                </p>
                <div className="space-y-2.5">
                  {COMPONENT_KEYS.map((k) => (
                    <div key={k} className="rounded-md border border-border p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: COMPONENT_HEX[k] }}
                        />
                        <span className="font-semibold">{t(`performance.guideDialog.parts.${k}.name`)}</span>
                        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums">
                          {t('performance.guideDialog.maxPts', { pts: Math.round(COMPONENT_WEIGHTS[k] * 100) })}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-medium text-slate-700 dark:text-slate-200">
                        {t(`performance.guideDialog.parts.${k}.q`)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t(`performance.guideDialog.parts.${k}.how`)}
                      </p>
                      <p className="mt-1.5 rounded bg-muted/60 px-2 py-1.5 text-xs">
                        <span className="font-semibold">{t('performance.guideDialog.exampleLabel')}</span>{' '}
                        {t(`performance.guideDialog.parts.${k}.ex`)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  {t('performance.guideDialog.notesTitle')}
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  <li>{t('performance.guideDialog.notes.scope')}</li>
                  <li>{t('performance.guideDialog.notes.minDone', { minDone })}</li>
                  <li>{t('performance.guideDialog.notes.trend')}</li>
                  <li>{t('performance.guideDialog.notes.level')}</li>
                </ul>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {loading && rows.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Spinner size={18} className="text-muted-foreground" />
          </div>
        )}
        {!loading && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('performance.empty')}</p>
        )}

        {rows.length > 0 && (
          <div className="max-h-[60vh] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">
                    <Hint forceRich content={t('performance.guide.designer')}>
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        {t('performance.colDesigner')}
                      </span>
                    </Hint>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    <Hint forceRich content={t('performance.guide.score')}>
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        {t('performance.colScore')}
                      </span>
                    </Hint>
                  </th>
                  <th className="px-3 py-2 text-center font-medium">
                    <Hint forceRich content={t('performance.guide.trend')}>
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        {t('performance.colTrend')}
                      </span>
                    </Hint>
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <Hint forceRich content={t('performance.guide.componentsCol')}>
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        {t('performance.colComponents')}
                      </span>
                    </Hint>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    <Hint forceRich content={t('performance.guide.done')}>
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        {t('performance.colDone')}
                      </span>
                    </Hint>
                  </th>
                  <th className="px-4 py-2 font-medium">
                    <Hint forceRich content={t('performance.guide.level')}>
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        {t('performance.colLevel')}
                      </span>
                    </Hint>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className="border-b border-border/60 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-2">
                        <Hint
                          forceRich
                          content={
                            r.insufficient
                              ? t('performance.insufficientTip', { minDone })
                              : t('performance.rankTip', { score: r.score })
                          }
                        >
                          <span>
                            <RankBadge rank={r.rank} muted={r.insufficient} />
                          </span>
                        </Hint>
                        <span
                          className={cn(
                            'font-medium',
                            r.insufficient ? 'text-muted-foreground' : 'text-slate-700 dark:text-slate-200',
                          )}
                        >
                          {r.fullName}
                        </span>
                        {r.insufficient && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {t('performance.insufficientBadge')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-base font-bold tabular-nums">
                      <span className={cn(r.insufficient && 'text-muted-foreground')}>{r.score}</span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {r.trend === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : r.trend >= 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <TrendingUp size={13} /> +{r.trend}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                          <TrendingDown size={13} /> {r.trend}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {vizMode === 'donut' ? (
                        <Hint
                          forceRich
                          content={
                            <div className="text-xs">
                              <p className="mb-1 font-semibold">{t('performance.donutTipTitle', { score: r.score })}</p>
                              {COMPONENT_KEYS.map((k) => (
                                <p key={k} className="flex items-center gap-1.5 tabular-nums">
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: COMPONENT_HEX[k] }}
                                  />
                                  {t(`performance.components.${k}`)}:{' '}
                                  {Math.round(r.components[k] * COMPONENT_WEIGHTS[k] * 100)}/
                                  {Math.round(COMPONENT_WEIGHTS[k] * 100)}
                                </p>
                              ))}
                            </div>
                          }
                        >
                          <span className="inline-block">
                            <ComponentDonut row={r} />
                          </span>
                        </Hint>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {COMPONENT_KEYS.map((k) => (
                            <Hint
                              key={k}
                              forceRich
                              content={
                                <div className="text-xs">
                                  <p className="font-semibold">{t(`performance.components.${k}`)}</p>
                                  <p>{t(`performance.componentTips.${k}`)}</p>
                                  <p className="mt-0.5 tabular-nums">
                                    {Math.round(r.components[k] * 100)}/100
                                    {k === 'speed' && ` · ${t('performance.rawWork', { value: r.avgWorkMin })}`}
                                    {k === 'quality' && ` · ${t('performance.rawRework', { count: r.reworkCount })}`}
                                    {k === 'response' &&
                                      ` · ${t('performance.rawResponse', { value: r.avgResponseMin })}`}
                                    {k === 'reliability' &&
                                      ` · ${t('performance.rawRejections', { count: r.rejections })}`}
                                    {k === 'proactive' && ` · ${t('performance.rawClaims', { count: r.claims })}`}
                                  </p>
                                </div>
                              }
                            >
                              <div className="h-6 w-8 cursor-help rounded bg-slate-100 dark:bg-slate-700/50 overflow-hidden flex items-end">
                                <div
                                  className={cn('w-full', COMPONENT_COLORS[k])}
                                  style={{ height: `${Math.max(8, Math.round(r.components[k] * 100))}%` }}
                                />
                              </div>
                            </Hint>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.done}
                      <span className="text-xs text-muted-foreground">/{r.totalTasks}</span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        {canSetLevel ? (
                          <select
                            value={r.designerLevel || ''}
                            disabled={savingUserId === r.userId}
                            onChange={(e) => applyLevel(r, (e.target.value || null) as DesignerRank | null)}
                            className="rounded-md border border-input bg-background px-1.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="">—</option>
                            {RANK_OPTIONS.map((lv) => (
                              <option key={lv} value={lv}>
                                {lv}
                              </option>
                            ))}
                          </select>
                        ) : r.designerLevel ? (
                          <RankBadge rank={r.designerLevel} size="sm" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {r.suggestedLevel && r.suggestedLevel !== r.designerLevel && (
                          <Hint forceRich content={t('performance.suggestTip')}>
                            {canSetLevel ? (
                              <button
                                type="button"
                                disabled={savingUserId === r.userId}
                                onClick={() => applyLevel(r, r.suggestedLevel)}
                                className="rounded-full border border-dashed border-teal-400 px-1.5 py-0.5 text-[10px] font-semibold text-teal-600 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-500/10"
                              >
                                {t('performance.suggestChip', { level: r.suggestedLevel })}
                              </button>
                            ) : (
                              <span className="rounded-full border border-dashed border-teal-400 px-1.5 py-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-300">
                                {t('performance.suggestChip', { level: r.suggestedLevel })}
                              </span>
                            )}
                          </Hint>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
