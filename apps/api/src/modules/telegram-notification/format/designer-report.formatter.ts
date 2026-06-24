import type {
  DesignerReportData,
  ReportPeriod,
} from '@/modules/scheduled-reports/types';

import { formatVnDateTime, formatVnHourMinute } from '@/modules/scheduled-reports/build-period';
import { clamp, DIVIDER, escapeMd, N } from './_helpers';

interface DesignerRow {
  fullName: string;
  totalInShift: number;
  doneInShift: number;
  assignedNow: number;
  inProgressNow: number;
  reworkNow: number;
}

function isIdle(r: DesignerRow): boolean {
  return (
    r.totalInShift === 0 &&
    r.doneInShift === 0 &&
    r.assignedNow === 0 &&
    r.inProgressNow === 0 &&
    r.reworkNow === 0
  );
}

function renderRow(r: DesignerRow, indexLabel: string): string {
  const name = `${indexLabel}*${escapeMd(r.fullName)}*`;
  if (isIdle(r)) {
    return `${name} — _chưa có hoạt động_`;
  }
  const line1 = `   Trong ca ${N(r.totalInShift)} · Xong ${N(r.doneInShift)} · Đang làm ${N(r.inProgressNow)}`;
  const line2Parts: string[] = [];
  if (r.assignedNow > 0) line2Parts.push(`Gán ${N(r.assignedNow)}`);
  if (r.reworkNow > 0) line2Parts.push(`⚠️ Lỗi ${N(r.reworkNow)}`);
  const line2 = line2Parts.length > 0 ? `\n   ${line2Parts.join(' · ')}` : '';
  return `${name}\n${line1}${line2}`;
}

export function formatDesignerReport(payload: {
  period: ReportPeriod;
  data: DesignerReportData;
  generatedAt: Date;
}): string {
  const { period, data, generatedAt } = payload;
  const lines: string[] = [];

  lines.push(`🎨 *Báo cáo Designer*`);
  lines.push(
    `_${escapeMd(period.slotLabel)} · ${formatVnHourMinute(period.from)} → ${formatVnHourMinute(period.to)}_`,
  );
  lines.push(`_Snapshot ${formatVnDateTime(generatedAt)}_`);

  if (data.rows.length === 0) {
    lines.push('');
    lines.push('_Chưa có designer nào trong hệ thống._');
    return clamp(lines.join('\n'));
  }

  lines.push('');
  data.rows.forEach((r) => {
    lines.push(`▸ ${renderRow(r, '')}`);
  });

  // Totals
  lines.push('');
  lines.push(DIVIDER);
  lines.push(`🎯 *Tổng (${data.rows.length} designer)*`);
  const t = data.totals;
  lines.push(
    `   Trong ca ${N(t.totalInShift)} · Xong ${N(t.doneInShift)} · Đang làm ${N(t.inProgressNow)}`,
  );
  const tail: string[] = [];
  if (t.assignedNow > 0) tail.push(`Gán ${N(t.assignedNow)}`);
  if (t.reworkNow > 0) tail.push(`⚠️ Lỗi ${N(t.reworkNow)}`);
  if (tail.length > 0) lines.push(`   ${tail.join(' · ')}`);

  if (data.unassignedNow > 0) {
    lines.push('');
    lines.push(`🚨 *Đơn chưa gán cho ai: ${data.unassignedNow}*`);
  }

  return clamp(lines.join('\n'));
}
