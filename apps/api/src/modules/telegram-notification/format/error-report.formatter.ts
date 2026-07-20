import { formatVnDateTime } from '@/modules/scheduled-reports/build-period';
import type { ErrorReportData, ReportPeriod } from '@/modules/scheduled-reports/types';

import { clamp, DIVIDER, escapeMd, N } from './_helpers';

export function formatErrorReport(payload: { period: ReportPeriod; data: ErrorReportData; generatedAt: Date }): string {
  const { period, data, generatedAt } = payload;
  const lines: string[] = [];

  lines.push(`⚠️ *Báo cáo Đơn lỗi*`);
  lines.push(`_${escapeMd(period.slotLabel)} · Snapshot ${formatVnDateTime(generatedAt)}_`);
  lines.push('');

  if (data.total === 0) {
    lines.push('✅ _Không có đơn lỗi nào đang mở._');
    return clamp(lines.join('\n'));
  }

  // Tổng quan
  lines.push(`📊 *Tổng đơn lỗi: ${data.total}*`);
  const sourceParts: string[] = [];
  if (data.bySource.factory > 0) sourceParts.push(`Do xưởng ${N(data.bySource.factory)}`);
  if (data.bySource.designer > 0) sourceParts.push(`Do designer ${N(data.bySource.designer)}`);
  if (data.bySource.unknown > 0) sourceParts.push(`Chưa rõ ${N(data.bySource.unknown)}`);
  if (sourceParts.length > 0) {
    lines.push(`   ${sourceParts.join(' · ')}`);
  }

  // Mức độ — chỉ render dòng có data > 0
  const urgencyRows: Array<[string, string, number]> = [
    ['🟢', 'Mới (< 1 ngày)', data.urgency.new],
    ['🟡', 'Cần làm (1–2 ngày)', data.urgency.attention],
    ['🟠', 'Gấp (2–3 ngày)', data.urgency.urgent],
    ['🔴', 'Khẩn cấp (≥ 3 ngày)', data.urgency.critical],
  ];
  const visibleUrgency = urgencyRows.filter(([, , n]) => n > 0);
  if (visibleUrgency.length > 0) {
    lines.push('');
    lines.push(`*Theo mức độ ưu tiên*`);
    for (const [emoji, label, n] of visibleUrgency) {
      lines.push(`   ${emoji} ${label}: ${N(n)}`);
    }
  }

  // Top mã lỗi — chỉ những lỗi có count > 0
  const visibleCodes = data.topCodes.filter((c) => c.count > 0);
  if (visibleCodes.length > 0) {
    lines.push('');
    lines.push(`*Top mã lỗi*`);
    for (const c of visibleCodes) {
      lines.push(`   • ${escapeMd(c.name)}: ${N(c.count)}`);
    }
  }

  // Critical alert nếu có khẩn cấp
  if (data.urgency.critical > 0) {
    lines.push('');
    lines.push(DIVIDER);
    lines.push(`🚨 *${data.urgency.critical} đơn khẩn cấp cần xử lý ngay (≥ 3 ngày)*`);
  }

  return clamp(lines.join('\n'));
}
