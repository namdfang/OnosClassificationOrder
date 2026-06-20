import type { ImportSummaryNotification } from '../types';

const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;
const MAX_FACTORY_ROWS = 20;

function escapeMarkdown(input: string): string {
  return input.replace(/([_*`\[\]])/g, '\\$1');
}

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
  lines.push(`📦 *Import đơn — ${formatDateTime(finishedAt)}*`);

  if (triggeredBy?.email || triggeredBy?.fullName) {
    const who = triggeredBy.fullName
      ? `${escapeMarkdown(triggeredBy.fullName)}${triggeredBy.email ? ` (${escapeMarkdown(triggeredBy.email)})` : ''}`
      : escapeMarkdown(triggeredBy.email ?? '');
    lines.push('');
    lines.push(`👤 Bởi: ${who}`);
  }

  lines.push('');
  lines.push('📊 *Tổng quan*');
  lines.push(`   • Tạo mới: *${totals.imported}*`);
  lines.push(`   • Cập nhật: *${totals.updated}*`);
  if (totals.skipped > 0) {
    lines.push(`   • Bỏ qua: *${totals.skipped}*`);
  }

  const sortedFactories = [...byFactory].sort((a, b) => b.count - a.count);
  if (sortedFactories.length > 0) {
    lines.push('');
    lines.push('🏭 *Theo xưởng*');
    const visible = sortedFactories.slice(0, MAX_FACTORY_ROWS);
    for (const f of visible) {
      lines.push(`   • ${escapeMarkdown(f.name)}: *${f.count}*`);
    }
    if (sortedFactories.length > MAX_FACTORY_ROWS) {
      lines.push(`   • _...và ${sortedFactories.length - MAX_FACTORY_ROWS} xưởng khác_`);
    }
  }

  if (unassignedFactoryCount > 0) {
    lines.push('');
    lines.push(`⚠️ *Chưa xác định xưởng:* ${unassignedFactoryCount}`);
  }

  lines.push('');
  lines.push(`⏱ Thời gian: ${formatDurationMs(finishedAt.getTime() - startedAt.getTime())}`);

  const message = lines.join('\n');
  if (message.length <= MAX_TELEGRAM_MESSAGE_LENGTH) return message;

  return message.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 20) + '\n... _(cắt bớt)_';
}
