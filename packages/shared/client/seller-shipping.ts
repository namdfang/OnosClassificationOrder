import { z } from 'zod';

/**
 * Seller tự mua label VNP — hàm thuần tính cước dùng CHUNG FE/BE (nest-free,
 * xem `client/index.ts`). FE preview giá ngay khi seller gõ cân nặng, BE tính
 * LẠI cùng công thức trước khi trừ ví (không tin số FE gửi lên).
 * Plan: `documents/Plans/SellerWallet-LabelPurchase.md`.
 *
 * Quy tắc đã chốt với user (09/09/2026):
 * - Cân tính cước = max(cân seller điền, cân quy đổi (dài×rộng×cao)/6 cm→gram).
 * - Cân lẻ giữa 2 mốc → làm tròn LÊN mốc kế tiếp.
 * - Quá mốc cuối bảng (10.000g) → CHẶN mua, seller liên hệ hỗ trợ.
 */

/** 1 mốc bảng giá: cân trần của mốc (gram) + giá bán cho seller (USD). */
export const SellerShipPriceRowZod = z.object({
  weightGram: z.number().int().positive(),
  price: z.number().positive(),
});
export type SellerShipPriceRow = z.infer<typeof SellerShipPriceRowZod>;

/**
 * Bảng giá seller (blob `system_configs`, key `seller_shipping_price_config`).
 * 1 bảng chung mọi seller; chừa chỗ giá theo tier sau này (thêm field
 * `tierPrices` vào row, KHÔNG đập schema).
 */
export const SellerShipPriceTableZod = z.object({
  /** Mốc PHẢI tăng dần theo weightGram — validate lúc admin import. */
  rows: SellerShipPriceRowZod.array().min(1).max(500),
  /** Công tắc tổng cho seller tự mua — false: quote/buy trả `service_unavailable`. Mặc định true. */
  enabled: z.boolean().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type SellerShipPriceTable = z.infer<typeof SellerShipPriceTableZod>;

/** Hệ số cân quy đổi thể tích: (dài×rộng×cao cm)/6 → gram. */
export const DIM_WEIGHT_DIVISOR = 6;

/**
 * Cân quy đổi thể tích (gram, làm tròn lên). Thiếu bất kỳ chiều nào → 0
 * (không đoán — khi đó cước chỉ dựa cân thật).
 */
export function computeDimWeightGram(lengthCm?: number, wideCm?: number, heightCm?: number): number {
  if (!lengthCm || !wideCm || !heightCm || lengthCm <= 0 || wideCm <= 0 || heightCm <= 0) return 0;
  return Math.ceil((lengthCm * wideCm * heightCm) / DIM_WEIGHT_DIVISOR);
}

/** Cân tính cước = max(cân thật seller điền, cân quy đổi). */
export function computeChargeableWeightGram(input: {
  actualGram?: number;
  lengthCm?: number;
  wideCm?: number;
  heightCm?: number;
}): { actualGram: number; dimGram: number; chargeableGram: number } {
  const actualGram = input.actualGram && input.actualGram > 0 ? Math.ceil(input.actualGram) : 0;
  const dimGram = computeDimWeightGram(input.lengthCm, input.wideCm, input.heightCm);
  return { actualGram, dimGram, chargeableGram: Math.max(actualGram, dimGram) };
}

export type SellerShipPriceResult =
  | { ok: true; tierGram: number; price: number }
  | { ok: false; error: 'missing_weight' | 'over_max_weight' | 'no_price_table' };

/**
 * Tra bảng giá: mốc ĐẦU TIÊN có weightGram >= cân tính cước (làm tròn lên).
 * Quá mốc cuối → `over_max_weight` (chặn mua). Bảng không cần sort sẵn —
 * sort lại phòng admin import lộn thứ tự.
 */
export function resolveSellerShipPrice(chargeableGram: number, table?: SellerShipPriceTable | null): SellerShipPriceResult {
  if (!table || table.rows.length === 0) return { ok: false, error: 'no_price_table' };
  if (!chargeableGram || chargeableGram <= 0) return { ok: false, error: 'missing_weight' };
  const rows = [...table.rows].sort((a, b) => a.weightGram - b.weightGram);
  const tier = rows.find((r) => r.weightGram >= chargeableGram);
  if (!tier) return { ok: false, error: 'over_max_weight' };
  return { ok: true, tierGram: tier.weightGram, price: tier.price };
}

/**
 * Mã lỗi AN TOÀN trả cho seller khi quote/mua label — BE gom MỌI lỗi nội bộ
 * (VNP sập, hết ví công ty, sai config, địa chỉ lỗi...) về `service_unavailable`;
 * chi tiết thật chỉ nằm ở log + record `shipments` cho admin. TUYỆT ĐỐI không
 * trả raw VNP response/địa chỉ gửi/số dư ví công ty ra phía seller.
 */
export const SELLER_SHIP_ERROR_CODES = [
  'missing_weight',
  'over_max_weight',
  'not_eligible',
  'already_has_label',
  'insufficient_funds',
  'service_unavailable',
] as const;
export type SellerShipErrorCode = (typeof SELLER_SHIP_ERROR_CODES)[number];

/**
 * Parse nội dung CSV bảng giá (`WEIGHT, PRICE` — `Data/shipping_cost.csv`).
 * Trả rows đã validate tăng dần; dòng hỏng → throw message chỉ rõ dòng.
 */
export function parseSellerShipPriceCsv(text: string): SellerShipPriceRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const rows: SellerShipPriceRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const [w, p] = lines[i].split(',').map((s) => s.trim());
    // Header (`WEIGHT, PRICE`) — chỉ chấp nhận ở dòng đầu.
    if (i === 0 && (Number.isNaN(Number(w)) || Number.isNaN(Number(p)))) continue;
    const weightGram = Number(w);
    const price = Number(p);
    if (!Number.isInteger(weightGram) || weightGram <= 0 || !(price > 0)) {
      throw new Error(`Dòng ${i + 1} không hợp lệ: "${lines[i]}" (cần "gram,giá" — gram nguyên dương, giá > 0)`);
    }
    rows.push({ weightGram, price });
  }
  if (rows.length === 0) throw new Error('File không có dòng giá nào.');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].weightGram <= rows[i - 1].weightGram) {
      throw new Error(`Mốc cân phải tăng dần: ${rows[i].weightGram}g (dòng ${i + 1}) <= ${rows[i - 1].weightGram}g`);
    }
  }
  return rows;
}
