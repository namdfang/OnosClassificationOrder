import * as XLSX from 'xlsx';
import type {
  FactoryOverview,
  FactoryOverviewCell,
  WorkshopConfig,
  WorkshopConfigCategory,
} from 'shared';

/**
 * Shape we accept for export. Only fields used by `buildExportRow` matter —
 * unused ones are ignored so the typing stays permissive.
 */
export interface ExportableOrder {
  productionId: string;
  userSku?: string;
  size?: string;
  color?: string;
  type?: string;
  mockupUrl?: string;
  mockupOriginalUrl?: string;
  designs?: { front?: string };
  designsOriginal?: { front?: string };
  orderId?: string;
  inProductionAt?: string;
  fabricType?: string;

  printStatus?: string;
  printStatusNote?: string;
  toolResult?: string;
  toolResultNote?: string;
  errorFile?: string[];
  errorFileNote?: string;
  assignee?: string;
  assigneeNote?: string;

  factory?: { name?: string; shortName?: string };
  machineType?: { name?: string; shortName?: string };
  productConfig?: { fullName?: string };
}

export interface ExportContext {
  /** Resolve workshop_config (category, code) → display name. */
  resolve: (category: WorkshopConfigCategory, code?: string | null) => WorkshopConfig | undefined;
}

/** Detail-sheet headers — matches the order requested by ops. */
const DETAIL_HEADERS = [
  'Production ID',
  'User SKU',
  'Size',
  'Trạng thái in',
  'Note Trạng thái in',
  'Kết quả Tool',
  'Note kq Tool 1',
  'File sửa lỗi',
  'Ghi chú file lỗi',
  'Color',
  'Người thực hiện',
  'Note người thực hiện',
  'Type',
  'Mockup',
  'Design Front',
  'Order ID',
  'In Production At',
  'Type.1',
  'Nhà máy',
  'Phòng',
  'Loại vải',
] as const;

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildDetailRow(o: ExportableOrder, ctx: ExportContext): (string | number)[] {
  const resolveName = (cat: WorkshopConfigCategory, code?: string) =>
    code ? ctx.resolve(cat, code)?.name || code : '';
  /** Multi-code field (vd errorFile array) → join name bằng dấu phẩy. */
  const resolveNames = (cat: WorkshopConfigCategory, codes?: string[]) =>
    codes && codes.length > 0 ? codes.map((c) => resolveName(cat, c)).join(', ') : '';

  // Workshop_config category codes (string literal) — keep in sync with the
  // shared enum. Using literals avoids the additional import.
  const FABRIC = 'fabric_type' as WorkshopConfigCategory;
  const PRINT_STATUS = 'print_status' as WorkshopConfigCategory;
  const PRINT_STATUS_NOTE = 'print_status_note' as WorkshopConfigCategory;
  const TOOL_RESULT = 'tool_result' as WorkshopConfigCategory;
  const TOOL_RESULT_NOTE = 'tool_result_note' as WorkshopConfigCategory;
  const ERROR_FILE = 'error_file_type' as WorkshopConfigCategory;
  const ASSIGNEE = 'assignee' as WorkshopConfigCategory;
  const ASSIGNEE_NOTE = 'assignee_note' as WorkshopConfigCategory;

  return [
    o.productionId || '',
    o.userSku || '',
    o.size || '',
    resolveName(PRINT_STATUS, o.printStatus),
    resolveName(PRINT_STATUS_NOTE, o.printStatusNote),
    resolveName(TOOL_RESULT, o.toolResult),
    resolveName(TOOL_RESULT_NOTE, o.toolResultNote),
    resolveNames(ERROR_FILE, o.errorFile),
    o.errorFileNote || '',
    o.color || '',
    resolveName(ASSIGNEE, o.assignee),
    resolveName(ASSIGNEE_NOTE, o.assigneeNote),
    o.type || '',
    o.mockupOriginalUrl || o.mockupUrl || '',
    o.designsOriginal?.front || o.designs?.front || '',
    o.orderId || '',
    formatDate(o.inProductionAt),
    o.productConfig?.fullName || '',
    o.factory?.name || '',
    o.machineType?.name || '',
    resolveName(FABRIC, o.fabricType),
  ];
}

/** Truncate Excel sheet name (max 31 chars + no `:\/?*[]`). */
function sanitizeSheetName(s: string): string {
  const cleaned = s.replace(/[:\\/?*[\]]/g, '_').trim();
  return cleaned.slice(0, 31) || 'Sheet';
}

/**
 * Build the XLSX workbook:
 *  - Sheet 1 "Tổng quan" — totals + flow direction + per-factory mini stats.
 *  - Sheet 2 "Breakdown" — long-form (Xưởng, Loại, Giá trị, Số đơn) for every
 *    factory × dimension so users can pivot however they want.
 *  - Sheet 3 "Chi tiết đơn" — 21-col detail dump.
 *  - Sheet 4..N "[Xưởng X]" — one sheet per factory with just that factory's
 *    breakdowns laid out side-by-side.
 */
export function buildWorkbook(
  orders: ExportableOrder[],
  overview: FactoryOverview | null,
  ctx: ExportContext,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: Tổng quan ─────────────────────────────────────────────
  const overviewRows: (string | number)[][] = [];
  overviewRows.push(['TỔNG QUAN']);
  overviewRows.push([]);
  if (overview) {
    overviewRows.push(['Tổng đơn (cả 3 xưởng)', overview.totals.total]);
    overviewRows.push(['Đơn không chuyển xưởng', overview.totals.pure]);
    overviewRows.push(['Đơn đã chuyển xưởng', overview.totals.transferred]);
    overviewRows.push([]);
    overviewRows.push([
      'Xưởng',
      'Mã',
      'Tổng đơn',
      'Pure',
      'Nhận chuyển vào',
      'Chuyển đi',
      'Sản phẩm',
      'Loại vải',
      'Loại máy',
      'Có tool',
    ]);
    for (const f of overview.factories) {
      overviewRows.push([
        f.factoryName,
        f.factoryShortName || '',
        f.total,
        f.pure,
        f.transferredIn,
        f.transferredOut,
        f.productCount,
        f.fabricCount,
        f.machineCount,
        f.withToolCount,
      ]);
    }
    if (overview.flows.length > 0) {
      overviewRows.push([]);
      overviewRows.push(['LUỒNG CHUYỂN XƯỞNG']);
      overviewRows.push(['Từ xưởng', 'Đến xưởng', 'Số đơn', 'Tổng sản phẩm']);
      for (const fl of overview.flows) {
        overviewRows.push([
          `${fl.fromShortName || fl.fromName}`,
          `${fl.toShortName || fl.toName}`,
          fl.count,
          fl.totalQuantity,
        ]);
      }
    }
  } else {
    overviewRows.push(['Không có dữ liệu overview']);
  }
  const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
  wsOverview['!cols'] = [
    { wch: 30 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsOverview, 'Tổng quan');

  // ─── Sheet 2: Breakdown (long form) ─────────────────────────────────
  const bdRows: (string | number)[][] = [];
  bdRows.push(['Xưởng', 'Loại', 'Giá trị', 'Số đơn']);
  if (overview) {
    for (const f of overview.factories) {
      const factoryLabel = f.factoryShortName || f.factoryName;
      for (const p of f.breakdowns.products) bdRows.push([factoryLabel, 'Sản phẩm', p.label, p.count]);
      for (const x of f.breakdowns.fabrics) bdRows.push([factoryLabel, 'Loại vải', x.label, x.count]);
      for (const s of f.breakdowns.sizes) bdRows.push([factoryLabel, 'Size', s.label, s.count]);
      for (const t of f.breakdowns.toolResults) bdRows.push([factoryLabel, 'Kết quả Tool', t.label, t.count]);
    }
  }
  const wsBreakdown = XLSX.utils.aoa_to_sheet(bdRows);
  wsBreakdown['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 50 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsBreakdown, 'Breakdown');

  // ─── Sheet 3: Chi tiết đơn ──────────────────────────────────────────
  const detailRows: (string | number)[][] = [DETAIL_HEADERS as unknown as string[]];
  for (const o of orders) detailRows.push(buildDetailRow(o, ctx));
  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  // Auto-size — fixed widths tuned for the 21 columns.
  wsDetail['!cols'] = [
    { wch: 18 }, // Production ID
    { wch: 14 }, // User SKU
    { wch: 8 },  // Size
    { wch: 16 }, // Trạng thái in
    { wch: 16 }, // Note Trạng thái in
    { wch: 14 }, // Kết quả Tool
    { wch: 14 }, // Note kq Tool 1
    { wch: 14 }, // File sửa lỗi
    { wch: 20 }, // Ghi chú file lỗi
    { wch: 12 }, // Color
    { wch: 14 }, // Người thực hiện
    { wch: 16 }, // Note người thực hiện
    { wch: 36 }, // Type
    { wch: 36 }, // Mockup
    { wch: 36 }, // Design Front
    { wch: 16 }, // Order ID
    { wch: 18 }, // In Production At
    { wch: 36 }, // Type.1
    { wch: 18 }, // Nhà máy
    { wch: 16 }, // Phòng
    { wch: 18 }, // Loại vải
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Chi tiết đơn');

  // ─── Sheet 4..N: 1 sheet per factory (just that factory's breakdowns) ─
  if (overview) {
    for (const f of overview.factories) {
      const rows: (string | number)[][] = [];
      rows.push([`Xưởng: ${f.factoryName} (${f.factoryShortName || ''})`]);
      rows.push([
        'Tổng đơn',
        f.total,
        '',
        'Pure',
        f.pure,
        '',
        'Nhận vào',
        f.transferredIn,
        '',
        'Chuyển đi',
        f.transferredOut,
      ]);
      rows.push([]);
      rows.push(['Sản phẩm', 'Số đơn', '', 'Loại vải', 'Số đơn', '', 'Size', 'Số đơn', '', 'Kết quả Tool', 'Số đơn']);
      const maxLen = Math.max(
        f.breakdowns.products.length,
        f.breakdowns.fabrics.length,
        f.breakdowns.sizes.length,
        f.breakdowns.toolResults.length,
      );
      for (let i = 0; i < maxLen; i++) {
        const p = f.breakdowns.products[i];
        const x = f.breakdowns.fabrics[i];
        const s = f.breakdowns.sizes[i];
        const t = f.breakdowns.toolResults[i];
        rows.push([
          p?.label || '', p?.count ?? '',
          '',
          x?.label || '', x?.count ?? '',
          '',
          s?.label || '', s?.count ?? '',
          '',
          t?.label || '', t?.count ?? '',
        ]);
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 32 }, { wch: 8 }, { wch: 2 },
        { wch: 18 }, { wch: 8 }, { wch: 2 },
        { wch: 10 }, { wch: 8 }, { wch: 2 },
        { wch: 16 }, { wch: 8 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(f.factoryShortName || f.factoryName));
    }
  }

  return wb;
}

/** Trigger a browser download of the workbook as .xlsx. */
export function downloadWorkbook(filename: string, wb: XLSX.WorkBook) {
  XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
}
