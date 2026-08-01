import { OrderPriority } from 'shared';

import { formatVnDateTime, REPORT_DAY_COUNT } from '../../scheduled-reports/build-period';
import type { ReportDayStats } from '../../scheduled-reports/types';
import type { DailyOrdersReportNotification } from '../types';
import { clamp, escapeMd } from './_helpers';

const PRIORITY_EMOJI: Record<OrderPriority, string> = {
  [OrderPriority.High]: '🔴',
  [OrderPriority.Normal]: '🟠',
  [OrderPriority.Low]: '🔵',
};

/** Mức cao → thấp, khớp sort của `getPriorityCustomers()`. */
const PRIORITY_ORDER: OrderPriority[] = [OrderPriority.High, OrderPriority.Normal, OrderPriority.Low];

/**
 * Phễu vòng đời đơn **xoay ngang** (chặng = HÀNG, ngày = CỘT) → bảng gọn
 * (Chặng + N ngày), vừa 1 dòng trên điện thoại, không bị wrap. Đọc dọc:
 * Tổng → Soát → Thiết kế → In/Ép/QC → May → Đóng → Hoàn thành. Nhãn hàng đầy đủ
 * nên không cần legend. Tồn 6 chặng cộng lại = Tổng.
 */
const FUNNEL_ROWS: { label: string; get: (d: ReportDayStats) => number | string }[] = [
  { label: 'Tổng', get: (d) => d.total },
  { label: 'Soát', get: (d) => d.soat },
  { label: 'Thiết kế', get: (d) => d.design },
  { label: 'In/Ép/QC', get: (d) => d.inPressQc },
  { label: 'May vào/ra', get: (d) => d.sew },
  { label: 'Đóng hàng', get: (d) => d.pack },
  { label: 'Hoàn thành', get: (d) => d.stockOut },
  { label: '% ≤2 ngày', get: (d) => (d.total > 0 ? `${Math.round((d.completedWithin2d / d.total) * 100)}%` : '-') },
];

/** Bảng phễu xoay ngang cho 1 tập ngày (view chính = N ngày; khách = ngày có đơn). */
function funnelTable(days: ReportDayStats[]): string[] {
  const header = ['Chặng', ...days.map((d) => d.label)];
  const rows = FUNNEL_ROWS.map((r) => [r.label, ...days.map((d) => r.get(d))]);

  return table(header, rows);
}

/** Nhãn môi trường đầu message — phân biệt báo cáo từ dev hay production. */
function envBanner(isProduction: boolean): string {
  return isProduction ? '🟢 *PROD*' : '🧪 *DEV*';
}

/**
 * Bảng canh cột monospace (```code```): cột đầu canh trái, các cột số canh
 * phải → số thẳng hàng dọc, dễ soi. Telegram cuộn ngang trong block nếu rộng
 * (KHÔNG vỡ dòng như text thường — bài học Phase 2.1).
 *
 * `RIGHT_PAD` = 3 space đuôi mỗi dòng: chừa chỗ cho nút `</>` mà Telegram vẽ
 * đè góc phải-trên code block, khỏi che mất tiêu đề cột cuối ("Tồn").
 */
function table(header: string[], rows: (string | number)[][], leftCols = 1): string[] {
  const RIGHT_PAD = '   ';
  // Số 0 → "-" cho đỡ nhiễu mắt (chỉ ô số; ô nhãn giữ nguyên).
  const cellStr = (v: string | number) => (typeof v === 'number' && v === 0 ? '-' : String(v));
  const cells = [header, ...rows.map((r) => r.map(cellStr))];
  const widths = header.map((_, c) => Math.max(...cells.map((row) => (row[c] ?? '').length)));
  const fmt = (row: string[]) =>
    row.map((cell, c) => (c < leftCols ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join(' ') + RIGHT_PAD;

  return ['```', ...cells.map(fmt), '```'];
}

/** Cắt gọn + bỏ ký tự phá code block (`` ` ``/newline) cho ô tên trong bảng. */
function fit(s: string, n: number): string {
  const clean = (s || '').replace(/[`\n]/g, '');

  return clean.length <= n ? clean : `${clean.slice(0, n - 1)}…`;
}

/**
 * View chính — phễu tổng quan. `factoryName` có = phễu LỌC theo 1 xưởng (nút
 * "🏭 <tên>"): header hiện tên xưởng + BỎ section khách ưu tiên (chỉ ở view all).
 */
export function formatDailyOrdersReport(payload: DailyOrdersReportNotification, factoryName?: string): string {
  const { data, generatedAt } = payload;
  const lines: string[] = [];

  lines.push(envBanner(payload.isProduction));
  const title = factoryName ? `🏭 *XƯỞNG ${escapeMd(factoryName)}` : '📊 *BÁO CÁO ĐƠN';
  lines.push(`${title} · ${REPORT_DAY_COUNT} NGÀY* · 🕐 _${formatVnDateTime(generatedAt)}_`);
  lines.push(...funnelTable(data.days));

  // Khách ưu tiên chỉ hiện ở view tổng (không lọc xưởng).
  if (!factoryName) {
    for (const level of PRIORITY_ORDER) {
      for (const r of data.priorityRows.filter((c) => c.priority === level)) {
        const sku = escapeMd(r.userSku || r.userEmail || '?');
        const activeDays = r.days.filter((d) => d.total > 0);
        if (activeDays.length === 0) {
          lines.push(`${PRIORITY_EMOJI[level]} *${sku}* — _không có đơn_`);
          continue;
        }
        lines.push(`${PRIORITY_EMOJI[level]} *${sku}*`);
        lines.push(...funnelTable(activeDays));
      }
    }
  }

  return clamp(lines.join('\n'));
}

/** View "Theo designer" — mỗi ngày 1 bảng (tên viết tắt canh trái + 4 trạng thái). */
export function formatDesignerViewReport(payload: DailyOrdersReportNotification): string {
  const { data, generatedAt } = payload;
  const lines: string[] = [];

  lines.push(envBanner(payload.isProduction));
  lines.push(`👤 *BÁO CÁO DESIGNER · ${REPORT_DAY_COUNT} NGÀY* · 🕐 _${formatVnDateTime(generatedAt)}_`);

  for (const day of data.designerDays) {
    const suffix = day.unassignedNeed > 0 ? ` · 🚨 chưa gán *${day.unassignedNeed}*` : '';
    lines.push(`📅 *${day.label}*${suffix}`);
    if (day.rows.length === 0) {
      lines.push('_không có task_');
    } else {
      const sum = (k: 'errorCount' | 'done' | 'inProgress' | 'rework' | 'needAction') =>
        day.rows.reduce((s, r) => s + r[k], 0);
      const rows = day.rows.map((r) => [
        fit(r.fullName, 12),
        r.errorCount,
        r.done,
        r.inProgress,
        r.rework,
        r.needAction,
      ]);
      rows.push(['Tổng', sum('errorCount'), sum('done'), sum('inProgress'), sum('rework'), sum('needAction')]);
      lines.push(...table(['Designer', 'Lỗi', 'Xong', 'ĐL', 'LL', 'CL'], rows));
    }
  }

  lines.push('_Lỗi=đơn từng soát lỗi · Xong=TK xong · ĐL=đang làm · LL=làm lại · CL=cần làm_');

  return clamp(lines.join('\n'));
}

/** Các hàng bảng Soát tool (xoay ngang: chỉ số = hàng, ngày = cột) — mirror "Tổng quan theo ngày" tab Soát tool. */
const TOOLCHECK_ROWS: {
  label: string;
  get: (d: DailyOrdersReportNotification['data']['toolCheckDays'][number]) => number;
}[] = [
  { label: 'Tổng đơn', get: (d) => d.total },
  { label: 'Chưa soát', get: (d) => d.unreviewed },
  { label: 'Đã soát', get: (d) => d.reviewed },
  { label: 'Note ko ok', get: (d) => d.noteNotOk },
  { label: 'Soát OK', get: (d) => d.reviewedOk },
  { label: 'Cần làm lại', get: (d) => d.rework },
];

/** View "Soát tool" — xoay ngang, chỉ số soát tool theo từng ngày. */
export function formatToolCheckReport(payload: DailyOrdersReportNotification): string {
  const { data, generatedAt } = payload;
  const lines: string[] = [];

  lines.push(envBanner(payload.isProduction));
  lines.push(`🔍 *BÁO CÁO SOÁT TOOL · ${REPORT_DAY_COUNT} NGÀY* · 🕐 _${formatVnDateTime(generatedAt)}_`);

  const header = ['Chỉ số', ...data.toolCheckDays.map((d) => d.label)];
  const rows = TOOLCHECK_ROWS.map((r) => [r.label, ...data.toolCheckDays.map((d) => r.get(d))]);
  lines.push(...table(header, rows));

  return clamp(lines.join('\n'));
}
