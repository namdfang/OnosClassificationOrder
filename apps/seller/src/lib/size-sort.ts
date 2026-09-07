/**
 * Size-aware sorting helpers for product variants.
 *
 * Garment sizes follow the canonical XS → S → M → L → XL → 2XL... order.
 * Numeric sizes (US shoe, kids ages, etc.) sort numerically AFTER garment sizes.
 * Anything else falls back to alphabetical order.
 */

const SIZE_ORDER = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
  "7XL",
  "8XL",
  "OSFA",
  "ONE SIZE",
];

function normalizeSize(upper: string): string {
  // Strip dashes/underscores/double spaces for comparison
  const compact = upper.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  // "Free Size", "FREESIZE", "ONESIZE", "ONE-SIZE", "OS" → "ONE SIZE"
  if (
    compact === "OS" ||
    compact === "FREESIZE" ||
    compact === "FREE SIZE" ||
    compact === "ONESIZE" ||
    compact === "ONE SIZE" ||
    compact === "ONE-SIZE"
  ) {
    return "ONE SIZE";
  }
  // "OSFA" stays as is — already in canonical list
  // X-prefix forms: "XXXL" → "3XL", "XXXXL" → "4XL", etc.
  const xMatch = compact.match(/^(X{2,})L$/);
  if (xMatch) return `${xMatch[1].length}XL`;
  // "2X" → "2XL", "3X" → "3XL"
  const nxMatch = compact.match(/^(\d+)X$/);
  if (nxMatch) return `${nxMatch[1]}XL`;
  return compact;
}

export function sizeRank(raw: string | null | undefined): number {
  if (!raw) return 9999;
  const upper = String(raw).toUpperCase().trim();
  // Direct match in canonical list
  const idxDirect = SIZE_ORDER.indexOf(upper);
  if (idxDirect !== -1) return idxDirect;
  // Try normalized synonym match
  const normalized = normalizeSize(upper);
  const idx = SIZE_ORDER.indexOf(normalized);
  if (idx !== -1) return idx;
  // Numeric sizes (e.g. "10", "10.5", "EU 42")
  const num = parseFloat(upper);
  if (!isNaN(num)) return 100 + num;
  // Fallback alphabetical (use full string for stable ordering, not just first char)
  // Hash to ensure full-string comparison without exceeding number range
  let hash = 200;
  for (let i = 0; i < upper.length && i < 8; i++) {
    hash += upper.charCodeAt(i) * Math.pow(0.1, i);
  }
  return hash;
}

export function compareVariantSize<T extends { variant?: string | null; supplierSku?: string }>(
  a: T,
  b: T,
): number {
  const diff = sizeRank(a.variant) - sizeRank(b.variant);
  if (diff !== 0) return diff;
  return (a.supplierSku || "").localeCompare(b.supplierSku || "");
}

export function sortVariantsBySize<T extends { variant?: string | null; supplierSku?: string }>(
  variants: T[],
): T[] {
  return [...variants].sort(compareVariantSize);
}
