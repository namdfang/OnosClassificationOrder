import type {
  FactoryReportData,
  ReportPeriod,
} from '@/modules/scheduled-reports/types';

import { formatVnDateTime } from '@/modules/scheduled-reports/build-period';
import { clamp, DIVIDER, escapeMd, N } from './_helpers';

interface FactoryRow {
  shortName: string;
  total: number;
  notPrinted: number;
  printed: number;
  error: number;
  transferredIn: number;
  transferredOut: number;
}

function renderRow(r: FactoryRow): string {
  const head = `▸ *${escapeMd(r.shortName)}* · ${N(r.total)} đơn`;
  if (r.total === 0) {
    return `${head} — _không có đơn_`;
  }
  const lines = [head];
  lines.push(`   Chưa in ${N(r.notPrinted)} · Đã xong ${N(r.printed)}`);
  // Chỉ hiển thị dòng phụ khi có dữ liệu (error/transfer)
  const tail: string[] = [];
  if (r.error > 0) tail.push(`⚠️ Lỗi ${N(r.error)}`);
  if (r.transferredIn > 0) tail.push(`Nhận ${N(r.transferredIn)}`);
  if (r.transferredOut > 0) tail.push(`Đi ${N(r.transferredOut)}`);
  if (tail.length > 0) lines.push(`   ${tail.join(' · ')}`);
  return lines.join('\n');
}

export function formatFactoryReport(payload: {
  period: ReportPeriod;
  data: FactoryReportData;
  generatedAt: Date;
}): string {
  const { period, data, generatedAt } = payload;
  const lines: string[] = [];

  lines.push(`🏭 *Báo cáo Xưởng*`);
  lines.push(`_${escapeMd(period.slotLabel)} · Snapshot ${formatVnDateTime(generatedAt)}_`);

  if (data.rows.length === 0) {
    lines.push('');
    lines.push('_Không có xưởng nào trong hệ thống._');
    return clamp(lines.join('\n'));
  }

  lines.push('');
  for (const r of data.rows) {
    lines.push(renderRow(r));
  }

  // Totals
  lines.push('');
  lines.push(DIVIDER);
  lines.push(`🎯 *Tổng (${data.rows.length} xưởng) · ${N(data.totals.total)} đơn*`);
  const t = data.totals;
  lines.push(`   Chưa in ${N(t.notPrinted)} · Đã xong ${N(t.printed)}`);
  const tail: string[] = [];
  if (t.error > 0) tail.push(`⚠️ Lỗi ${N(t.error)}`);
  if (t.transferredIn > 0) tail.push(`Nhận ${N(t.transferredIn)}`);
  if (t.transferredOut > 0) tail.push(`Đi ${N(t.transferredOut)}`);
  if (tail.length > 0) lines.push(`   ${tail.join(' · ')}`);

  if (data.unmapped > 0) {
    lines.push('');
    lines.push(`❓ *Chưa xác định xưởng: ${data.unmapped}*`);
  }

  return clamp(lines.join('\n'));
}
