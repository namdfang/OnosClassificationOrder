import type { CustomerCatalogVariation } from 'shared';

/** Nhóm attributes của mọi biến thể theo `label` (giữ thứ tự xuất hiện đầu tiên) — mỗi label -> danh sách value duy nhất. */
export function groupAttributeOptions(variations: CustomerCatalogVariation[]): { label: string; values: string[] }[] {
  const order: string[] = [];
  const map = new Map<string, string[]>();
  for (const v of variations) {
    for (const attr of v.attributes || []) {
      if (!map.has(attr.label)) {
        map.set(attr.label, []);
        order.push(attr.label);
      }
      const values = map.get(attr.label)!;
      if (!values.includes(attr.value)) values.push(attr.value);
    }
  }
  return order.map((label) => ({ label, values: map.get(label)! }));
}

export function findMatchingVariation(
  variations: CustomerCatalogVariation[],
  selected: Record<string, string>,
): CustomerCatalogVariation | undefined {
  return variations.find((v) =>
    Object.entries(selected).every(([label, value]) => (v.attributes || []).some((a) => a.label === label && a.value === value)),
  );
}

/** Đoán attribute nào là "màu"/"size" theo tên label (free-text do admin/nguồn dữ liệu tự đặt) để prefill form đặt đơn. */
export function pickColorSize(selected: Record<string, string>): { color?: string; size?: string } {
  let color: string | undefined;
  let size: string | undefined;
  for (const [label, value] of Object.entries(selected)) {
    const l = label.toLowerCase();
    if (!size && (l.includes('size') || l.includes('cỡ'))) size = value;
    else if (!color && (l.includes('color') || l.includes('colour') || l.includes('màu'))) color = value;
  }
  return { color, size };
}
