import type { ImportProductionOrderRow, ImportReworkOrderRow, ProductionOrderTracking } from 'shared';

const COLUMN_INDEX = {
  productionId: 0,
  userSku: 1,
  userEmail: 2,
  type: 3,
  color: 4,
  size: 5,
  mockupUrl: 6,
  printMethod: 7,
  weight: 8,
  width: 9,
  height: 10,
  length: 11,
  quantity: 12,
  baseCost: 13,
  shipCost: 14,
  designFront: 15,
  designBack: 16,
  designSleeve: 17,
  designHood: 18,
  designFolder: 19,
  designPlacket: 20,
  designChestLeft: 21,
  designChestRight: 22,
  designLeft: 23,
  designRight: 24,
  designSleeveLeft: 25,
  designSleeveRight: 26,
  designLeftUpperSleeve: 27,
  designRightUpperSleeve: 28,
  designLeftCuff: 29,
  designRightCuff: 30,
  designFrontEmbroidery: 31,
  designBackEmbroidery: 32,
  status: 33,
  orderId: 34,
  externalId: 35,
  referent: 36,
  orderAt: 37,
  inProductionAt: 38,
};

/**
 * Cột vận đơn KHÁCH TỰ CẤP — tra theo TÊN HEADER, không theo vị trí như 39 cột
 * còn lại: sheet đang chạy ở xưởng chưa có mấy cột này, mà file mỗi nơi xuất ra
 * lại đặt chúng ở chỗ khác nhau. Dò theo tên thì sheet cũ (không có cột) vẫn
 * parse y như trước, sheet mới thêm cột ở đâu cũng nhận đúng.
 */
const TRACKING_HEADER_ALIASES: Record<keyof ProductionOrderTracking, string[]> = {
  number: ['tracking number', 'tracking_number', 'tracking id', 'tracking_id', 'tracking code', 'tracking_code'],
  carrier: ['tracking carrier', 'tracking_carrier', 'carrier'],
  url: ['tracking url', 'tracking_url', 'tracking link', 'tracking_link'],
  labelUrl: ['shipping label', 'shipping_label', 'label url', 'label_url'],
};

const normalizeHeader = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, ' ');

/** Vị trí các cột vận đơn trong header (không có cột nào thì map rỗng). */
function findTrackingColumns(headerCols: string[]): Partial<Record<keyof ProductionOrderTracking, number>> {
  const found: Partial<Record<keyof ProductionOrderTracking, number>> = {};
  headerCols.forEach((col, index) => {
    const name = normalizeHeader(col);
    if (!name) return;
    for (const [field, aliases] of Object.entries(TRACKING_HEADER_ALIASES) as [keyof ProductionOrderTracking, string[]][]) {
      if (found[field] === undefined && aliases.includes(name)) found[field] = index;
    }
  });
  return found;
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  // Giá / kích thước trong sheet luôn < 1000 nên không có thousand separator.
  // Decimal có thể là "," (VN/Google Sheet) hoặc "." (SheetJS xlsx export).
  // Chỉ cần normalize "," → "." rồi parse.
  const cleaned = raw.trim().replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Vận đơn của 1 dòng — trả `undefined` khi mọi ô đều trống để BE KHÔNG ghi đè
 * vận đơn đã nhận trước đó bằng object rỗng lúc import lại.
 */
function buildTracking(
  columns: Partial<Record<keyof ProductionOrderTracking, number>>,
  get: (i: number) => string | undefined,
): ProductionOrderTracking | undefined {
  const tracking: ProductionOrderTracking = {
    number: columns.number === undefined ? undefined : get(columns.number),
    carrier: columns.carrier === undefined ? undefined : get(columns.carrier),
    url: columns.url === undefined ? undefined : get(columns.url),
    labelUrl: columns.labelUrl === undefined ? undefined : get(columns.labelUrl),
  };
  return Object.values(tracking).some(Boolean) ? tracking : undefined;
}

export function parseOrderRows(raw: string): ImportProductionOrderRow[] {
  const lines = raw.split(/\r?\n/);
  const rows: ImportProductionOrderRow[] = [];
  let pastHeader = false;
  let trackingColumns: Partial<Record<keyof ProductionOrderTracking, number>> = {};

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');

    // Detect header row (first cell exactly "Production ID")
    const first = cols[0]?.trim();
    if (!pastHeader) {
      if (first === 'Production ID') {
        pastHeader = true;
        trackingColumns = findTrackingColumns(cols);
        continue;
      }
      // Skip pre-header lines (title row etc.)
      continue;
    }

    if (!first) continue;

    const get = (i: number) => cols[i]?.trim() || undefined;

    rows.push({
      productionId: first,
      userSku: get(COLUMN_INDEX.userSku),
      userEmail: get(COLUMN_INDEX.userEmail),
      type: get(COLUMN_INDEX.type),
      color: get(COLUMN_INDEX.color),
      size: get(COLUMN_INDEX.size),
      mockupUrl: get(COLUMN_INDEX.mockupUrl),
      printMethod: get(COLUMN_INDEX.printMethod),
      weight: parseNumber(get(COLUMN_INDEX.weight)),
      width: parseNumber(get(COLUMN_INDEX.width)),
      height: parseNumber(get(COLUMN_INDEX.height)),
      length: parseNumber(get(COLUMN_INDEX.length)),
      quantity: parseNumber(get(COLUMN_INDEX.quantity)),
      baseCost: parseNumber(get(COLUMN_INDEX.baseCost)),
      shipCost: parseNumber(get(COLUMN_INDEX.shipCost)),
      designs: {
        front: get(COLUMN_INDEX.designFront),
        back: get(COLUMN_INDEX.designBack),
        sleeve: get(COLUMN_INDEX.designSleeve),
        hood: get(COLUMN_INDEX.designHood),
        folder: get(COLUMN_INDEX.designFolder),
        placket: get(COLUMN_INDEX.designPlacket),
        chestLeft: get(COLUMN_INDEX.designChestLeft),
        chestRight: get(COLUMN_INDEX.designChestRight),
        left: get(COLUMN_INDEX.designLeft),
        right: get(COLUMN_INDEX.designRight),
        sleeveLeft: get(COLUMN_INDEX.designSleeveLeft),
        sleeveRight: get(COLUMN_INDEX.designSleeveRight),
        leftUpperSleeve: get(COLUMN_INDEX.designLeftUpperSleeve),
        rightUpperSleeve: get(COLUMN_INDEX.designRightUpperSleeve),
        leftCuff: get(COLUMN_INDEX.designLeftCuff),
        rightCuff: get(COLUMN_INDEX.designRightCuff),
        frontEmbroidery: get(COLUMN_INDEX.designFrontEmbroidery),
        backEmbroidery: get(COLUMN_INDEX.designBackEmbroidery),
      },
      status: get(COLUMN_INDEX.status),
      orderId: get(COLUMN_INDEX.orderId),
      externalId: get(COLUMN_INDEX.externalId),
      referent: get(COLUMN_INDEX.referent),
      orderAt: get(COLUMN_INDEX.orderAt),
      inProductionAt: get(COLUMN_INDEX.inProductionAt),
      tracking: buildTracking(trackingColumns, get),
    });
  }

  return rows;
}

/**
 * Parser cho mode "Import file soát". Header sheet:
 *   Production ID | User SKU | Size | Trang_thai_in | Note_trang_thai_in |
 *   ket_qua_tool | Note_kq_Tool | File_sua_loi | Ghi_chu_file_loi |
 *   Nguoi_thuc_hien | Note_nguoi_thuc_hien | Type | Color | Mockup |
 *   Design Front | Order ID | In Production At | Type.1 | Nhà máy | Phòng
 *
 * Chỉ extract 5 cột BE cần (productionId + 4 field QC). Các cột khác bỏ qua.
 */
const REWORK_COLUMN_INDEX = {
  productionId: 0,
  toolResultNote: 6,
  errorFile: 7,
  errorFileNote: 8,
  assignee: 9,
};

export function parseReworkOrderRows(raw: string): ImportReworkOrderRow[] {
  const lines = raw.split(/\r?\n/);
  const rows: ImportReworkOrderRow[] = [];
  let pastHeader = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const first = cols[0]?.trim();
    if (!pastHeader) {
      if (first === 'Production ID') {
        pastHeader = true;
        continue;
      }
      continue;
    }
    if (!first) continue;
    const get = (i: number) => cols[i]?.trim() || undefined;

    rows.push({
      productionId: first,
      toolResultNote: get(REWORK_COLUMN_INDEX.toolResultNote),
      errorFile: get(REWORK_COLUMN_INDEX.errorFile),
      errorFileNote: get(REWORK_COLUMN_INDEX.errorFileNote),
      assignee: get(REWORK_COLUMN_INDEX.assignee),
    });
  }

  return rows;
}
