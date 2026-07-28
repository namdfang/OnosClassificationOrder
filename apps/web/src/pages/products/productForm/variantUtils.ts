import type { ProductItemSpecific, ProductVariation } from 'shared';
import { Status } from 'shared';

/** 1 nhóm option đang chỉnh trong form (VD name='Color', options=['Red','Blue']) — CHỈ tồn tại phía FE, suy ra/ghi về `variations[].attributes` (KHÔNG có field riêng trong schema). */
export interface VariationGroup {
  name: string;
  options: string[];
}

/** Giới hạn UI khi sinh tổ hợp — schema chỉ ràng `variations.max(200)`. */
export const VARIANT_GROUP_MAX = 3;
export const VARIANTS_MAX = 200;

/**
 * Làm sạch nhóm option cho MỌI tính toán (bảng, orphan, batch edit, sinh tổ
 * hợp): trim tên + BỎ option rỗng (dòng thêm nhưng chưa điền) + bỏ hẳn nhóm
 * chưa có tên hoặc chưa có option nào — nhóm đang soạn dở không ảnh hưởng
 * bảng và KHÔNG làm dòng nào bị tính là mồ côi.
 */
export function cleanGroups(groups: VariationGroup[]): VariationGroup[] {
  return groups
    .map((g) => ({ name: g.name.trim(), options: g.options.map((o) => o.trim()).filter(Boolean) }))
    .filter((g) => g.name && g.options.length > 0);
}

/** Variant có khớp bộ chọn Batch Edit không (Set rỗng = khớp mọi giá trị nhóm đó). */
export function matchesSelection(v: ProductVariation, groups: VariationGroup[], selected: Array<Set<string>>): boolean {
  return groups.every((g, i) => {
    const sel = selected[i];
    if (!sel || sel.size === 0) return true;
    const val = getAttrValue(v, g.name);
    return val != null && sel.has(val);
  });
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Giá trị thuộc tính của variant theo tên nhóm (case-insensitive). */
export const getAttrValue = (v: ProductVariation, label: string): string | undefined =>
  v.attributes?.find((a) => norm(a.label) === norm(label))?.value;

/** Bỏ dấu tiếng Việt + uppercase + chỉ giữ A-Z0-9 — SKU biến thể luôn "không dấu". */
export const removeDiacritics = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');

/**
 * SKU biến thể LUÔN theo quy ước `{SKU sản phẩm}-{giá trị thuộc tính 1}-{giá trị thuộc tính 2}…`
 * — chỉ dùng RENDER preview/lưu cho biến thể MỚI chưa có sku; biến thể đã có sku DB giữ nguyên
 * (admin muốn khác quy ước thì sửa trực tiếp trong database).
 */
export const computeVariationSku = (productSku: string, attributes: ProductItemSpecific[]): string => {
  const base = removeDiacritics(productSku);
  const parts = attributes.filter((a) => a.value.trim()).map((a) => removeDiacritics(a.value));
  return [base, ...parts].filter(Boolean).join('-');
};

/** Khóa so khớp tổ hợp thuộc tính — sort theo label nên KHÔNG phụ thuộc thứ tự lưu. */
const attrKey = (attributes: ProductItemSpecific[]): string =>
  attributes
    .map((a) => `${norm(a.label)}=${norm(a.value)}`)
    .sort()
    .join('|');

/**
 * Tổ hợp cartesian các option theo ĐÚNG thứ tự nhóm — caller phải validate mọi
 * nhóm có tên + ≥1 option trước khi gọi (nhóm rỗng → trả [] để không sinh lệch).
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
 * giá/SKU đã nhập (attributes được canonical hóa lại theo thứ tự nhóm), tổ hợp
 * mới thêm dòng `sku=''` (tự sinh theo `computeVariationSku` lúc lưu), variants
 * mồ côi KHÔNG tự xóa mà giữ lại cuối bảng để user quyết định.
 */
export function generateVariants(groups: VariationGroup[], existing: ProductVariation[]): GenerateResult {
  const combos = buildCombos(groups);
  const byKey = new Map<string, ProductVariation>();
  for (const v of existing) {
    if (v.attributes?.length) byKey.set(attrKey(v.attributes), v);
  }

  const matchedKeys = new Set<string>();
  const next: ProductVariation[] = [];
  let created = 0;
  let kept = 0;

  for (const combo of combos) {
    const attributes = groups.map((g, i) => ({ label: g.name.trim(), value: combo[i] }));
    const key = attrKey(attributes);
    const found = byKey.get(key);
    if (found) {
      matchedKeys.add(key);
      kept++;
      next.push({ ...found, attributes });
      continue;
    }
    created++;
    next.push({ sku: '', attributes, status: Status.Active });
  }

  const orphanList = existing.filter((v) => !v.attributes?.length || !matchedKeys.has(attrKey(v.attributes)));
  next.push(...orphanList);

  return { variants: next, created, kept, orphans: orphanList.length };
}

/** Variant có phải mồ côi so với bộ nhóm option hiện tại không (để tô cảnh báo). */
export function isOrphanVariant(v: ProductVariation, groups: VariationGroup[]): boolean {
  if (groups.length === 0) return false;
  if ((v.attributes?.length || 0) !== groups.length) return true;
  return groups.some((g) => {
    const val = getAttrValue(v, g.name);
    return !val || !g.options.some((o) => norm(o) === norm(val));
  });
}

/**
 * Suy nhóm option từ variants đã lưu: union label theo thứ tự xuất hiện + union
 * giá trị mỗi label — data cũ nhập tay/heterogeneous vẫn hiện được (dòng thiếu
 * label sẽ bị đánh dấu mồ côi).
 */
export function deriveGroups(variations: ProductVariation[]): VariationGroup[] {
  const groups: VariationGroup[] = [];
  for (const v of variations) {
    for (const a of v.attributes || []) {
      const label = a.label.trim();
      if (!label) continue;
      let group = groups.find((g) => norm(g.name) === norm(label));
      if (!group) {
        group = { name: label, options: [] };
        groups.push(group);
      }
      const val = a.value.trim();
      if (val && !group.options.some((x) => norm(x) === norm(val))) group.options.push(val);
    }
  }
  return groups;
}
