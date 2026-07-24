import type { ProductVariation } from 'shared';
import { Status } from 'shared';

/** 1 nhóm option đang chỉnh trong form (VD name='Color', options=['Red','Blue']). */
export interface VariationGroup {
  name: string;
  options: string[];
}

/** Khóa so khớp tổ hợp option (case-insensitive). */
export const comboKey = (options: string[]): string => options.map((o) => o.trim().toLowerCase()).join('|');

/** Chuẩn hóa 1 giá trị option thành mảnh SKU: "As Design" → "AS-DESIGN". */
const skuPart = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * Tổ hợp cartesian các option theo ĐÚNG thứ tự nhóm — caller phải validate mọi
 * nhóm có tên + ≥1 option trước khi gọi (nhóm rỗng → trả [] để không sinh lệch index).
 */
export function buildCombos(groups: VariationGroup[]): string[][] {
  if (groups.length === 0 || groups.some((g) => g.options.length === 0)) return [];
  return groups.reduce<string[][]>((acc, g) => acc.flatMap((combo) => g.options.map((o) => [...combo, o])), [[]]);
}

export interface GenerateResult {
  variants: ProductVariation[];
  created: number;
  kept: number;
  /** Variants cũ KHÔNG khớp tổ hợp nào nữa (option đã bị xóa) — giữ lại, đánh dấu để user tự xóa. */
  orphans: number;
}

/**
 * Sinh bảng variants từ tổ hợp option — DIFF-PRESERVE: tổ hợp đã có giữ nguyên
 * giá/SKU đã nhập, tổ hợp mới thêm dòng trống, variants mồ côi (option bị xóa)
 * KHÔNG tự xóa mà giữ lại cuối bảng để user quyết định.
 */
export function generateVariants(groups: VariationGroup[], existing: ProductVariation[], skuPrefix: string): GenerateResult {
  const combos = buildCombos(groups);
  const byCombo = new Map<string, ProductVariation>();
  for (const v of existing) {
    if (v.options?.length) byCombo.set(comboKey(v.options), v);
  }

  const usedSkus = new Set(existing.map((v) => v.sku.trim().toUpperCase()).filter(Boolean));
  const matchedKeys = new Set<string>();
  const next: ProductVariation[] = [];
  let created = 0;
  let kept = 0;

  for (const combo of combos) {
    const key = comboKey(combo);
    const found = byCombo.get(key);
    if (found) {
      matchedKeys.add(key);
      kept++;
      next.push({ ...found, options: combo });
      continue;
    }
    // Auto SKU: {prefix}-{OPT1}-{OPT2}, chống trùng bằng hậu tố -2, -3...
    const base = [skuPrefix, ...combo.map(skuPart)].filter(Boolean).join('-');
    let sku = base;
    let n = 2;
    while (usedSkus.has(sku)) sku = `${base}-${n++}`;
    usedSkus.add(sku);
    created++;
    next.push({ sku, options: combo, status: Status.Active });
  }

  // Mồ côi: có options nhưng không khớp tổ hợp hiện tại (hoặc không có options).
  const orphanList = existing.filter((v) => !v.options?.length || !matchedKeys.has(comboKey(v.options)));
  next.push(...orphanList);

  return { variants: next, created, kept, orphans: orphanList.length };
}

/** Variant có phải mồ côi so với bộ nhóm option hiện tại không (để tô cảnh báo). */
export function isOrphanVariant(v: ProductVariation, groups: VariationGroup[]): boolean {
  if (groups.length === 0) return false;
  if (!v.options || v.options.length !== groups.length) return true;
  return v.options.some((o, i) => !groups[i].options.some((x) => x.trim().toLowerCase() === o.trim().toLowerCase()));
}

/**
 * Suy nhóm option ban đầu từ data đã lưu: ưu tiên optionNames + variants.options;
 * fallback legacy (variants còn color/size rời, DB chưa chạy migration BE).
 */
export function deriveGroups(optionNames: string[] | undefined, variations: ProductVariation[]): {
  groups: VariationGroup[];
  variants: ProductVariation[];
} {
  const uniq = (values: Array<string | undefined>): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
      const t = (v || '').trim();
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      out.push(t);
    }
    return out;
  };

  if (optionNames?.length) {
    return {
      groups: optionNames.map((name, i) => ({ name, options: uniq(variations.map((v) => v.options?.[i])) })),
      variants: variations,
    };
  }

  if (variations.length && variations.some((v) => !v.options?.length)) {
    // Legacy color/size → chuẩn hóa tại chỗ (BE migration cũng làm điều tương tự).
    const variants = variations.map((v) => ({
      ...v,
      options: v.options?.length ? v.options : [v.color || 'As Design', v.size || 'One Size'],
    }));
    return {
      groups: [
        { name: 'Color', options: uniq(variants.map((v) => v.options?.[0])) },
        { name: 'Size', options: uniq(variants.map((v) => v.options?.[1])) },
      ],
      variants,
    };
  }

  return { groups: [], variants: variations };
}
