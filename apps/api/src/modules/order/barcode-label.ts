/**
 * Suy "SKU sản phẩm" in trên tem barcode xưởng (Orders.md §16.7) từ danh sách
 * variation SKU của Product Config + size của đơn.
 *
 * `OrderEntity` KHÔNG lưu SKU (đơn import CSV OnosPod chỉ có `type`/`size`),
 * còn variation SKU thì nhét biến thể vào đuôi (`AOP-CUS-SHAPE-TIE-10.6X62.2`).
 * Tem cần mã SKU GỐC của sản phẩm — thứ công nhân đối chiếu nhanh với kệ hàng —
 * nên phải gọt đuôi biến thể ra khỏi variation khớp với size của đơn.
 *
 * Hàm thuần, tách file riêng để test được không cần Nest context.
 */

/** Bỏ ký tự phân tách để so khớp size lỏng tay: `10.6x62.2` == `10.6X62.2`. */
function norm(s: string): string {
  return s.replace(/[\s_-]+/g, '').toUpperCase();
}

/**
 * Trả SKU gốc của sản phẩm:
 * 1. Có variation mà SKU kết thúc đúng bằng size của đơn → cắt đuôi đó (kèm
 *    dấu `-`/`_` nối) và trả phần còn lại — ca chuẩn, đúng như ảnh mẫu.
 * 2. Không khớp size (đơn thiếu size / variation đặt tên tự do) → lấy TIỀN TỐ
 *    CHUNG dài nhất của mọi variation SKU, gọt dấu nối thừa. Tiền tố quá ngắn
 *    (<3 ký tự — các SKU chẳng liên quan gì nhau) thì coi như không có.
 * 3. Chỉ có 1 variation và không khớp gì → trả nguyên SKU đó: tem thừa đuôi
 *    size còn hơn trống mã.
 */
export function resolveBarcodeSkuBase(variationSkus: string[], size?: string): string | undefined {
  const skus = variationSkus.map((s) => s?.trim()).filter(Boolean);
  if (skus.length === 0) return undefined;

  if (size?.trim()) {
    const target = norm(size);
    for (const sku of skus) {
      if (!norm(sku).endsWith(target)) continue;
      // Cắt từ CUỐI về: đi lùi đủ số ký tự "có nghĩa" của size (bỏ qua các dấu
      // nối lẫn trong đuôi), rồi gọt tiếp dấu nối sát mép cắt.
      let need = target.length;
      let cut = sku.length;
      while (cut > 0 && need > 0) {
        cut -= 1;
        if (!/[\s_-]/.test(sku[cut])) need -= 1;
      }
      const base = sku.slice(0, cut).replace(/[\s_-]+$/, '');
      if (base) return base;
    }
  }

  if (skus.length === 1) return skus[0];

  let prefix = skus[0];
  for (const sku of skus.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < sku.length && prefix[i] === sku[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  prefix = prefix.replace(/[\s_-]+$/, '');
  return prefix.length >= 3 ? prefix : skus[0];
}
