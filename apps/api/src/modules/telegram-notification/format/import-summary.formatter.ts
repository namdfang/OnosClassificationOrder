import type { ImportSummaryNotification } from '../types';
import { clamp, escapeMd, N } from './_helpers';

const MAX_FACTORY_ROWS = 20;

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec - min * 60);
  return `${min}m${rem}s`;
}

export function formatImportSummary(payload: ImportSummaryNotification): string {
  const { triggeredBy, totals, byFactory, unassignedFactoryCount, startedAt, finishedAt } = payload;
  const lines: string[] = [];

  lines.push(`📦 *Đã import xong*`);
  lines.push(
    `_${formatDateTime(finishedAt)} · ${formatDurationMs(finishedAt.getTime() - startedAt.getTime())}_`,
  );

  if (triggeredBy?.email || triggeredBy?.fullName) {
    const who = triggeredBy.fullName
      ? `${escapeMd(triggeredBy.fullName)}${triggeredBy.email ? ` (${escapeMd(triggeredBy.email)})` : ''}`
      : escapeMd(triggeredBy.email ?? '');
    lines.push(`👤 _${who}_`);
  }

  // Tổng quan inline 1 dòng
  lines.push('');
  const overview: string[] = [`Tạo mới ${N(totals.imported)}`, `Cập nhật ${N(totals.updated)}`];
  if (totals.skipped > 0) overview.push(`Bỏ qua ${N(totals.skipped)}`);
  lines.push(`📊 ${overview.join(' · ')}`);

  // Theo xưởng
  const sortedFactories = [...byFactory].sort((a, b) => b.count - a.count);
  if (sortedFactories.length > 0) {
    lines.push('');
    lines.push('🏭 *Theo xưởng*');
    const visible = sortedFactories.slice(0, MAX_FACTORY_ROWS);
    for (const f of visible) {
      lines.push(`   • ${escapeMd(f.name)}: ${N(f.count)}`);
    }
    if (sortedFactories.length > MAX_FACTORY_ROWS) {
      lines.push(`   _...và ${sortedFactories.length - MAX_FACTORY_ROWS} xưởng khác_`);
    }
  }

  if (unassignedFactoryCount > 0) {
    lines.push('');
    lines.push(`⚠️ *Chưa xác định xưởng: ${unassignedFactoryCount}*`);
  }

  return clamp(lines.join('\n'));
}
