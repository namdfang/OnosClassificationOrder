import type { CustomerCatalogItem } from 'shared';

/** Giá niêm yết thấp nhất trong các biến thể — dùng cho nhãn "Từ …" trên thẻ sản phẩm. */
export function lowestRetailPrice(item: CustomerCatalogItem): number | undefined {
  const prices = item.variations.map((v) => v.retailPrice).filter((p): p is number => p != null);
  return prices.length ? Math.min(...prices) : undefined;
}
