/**
 * Xuất danh sách SKU của catalog ra CSV — thứ seller cần để điền file import
 * (`sku` là cột BẮT BUỘC của template CSV; không tra được SKU thì không lên
 * đơn hàng loạt được, đúng phản hồi vận hành 08/09/2026).
 *
 * Kéo hết trang theo ĐÚNG bộ lọc đang xem (không chỉ trang hiện tại), trần
 * `MAX_PAGES` để không quét vô hạn khi catalog phình to.
 */

import type { CustomerCatalogItem } from 'shared';
import { apiFetch } from '@/hooks/use-api';
import type { ApiRes } from '@/lib/customer-orders';

const PAGE_SIZE = 100;
const MAX_PAGES = 30;

const HEADERS = ['sku', 'product', 'product_line', 'variation', 'price_usd', 'ship_cod_usd', 'tiktok_usd', 'weight_gram', 'package_cm'] as const;

/** Ô CSV: bọc nháy kép khi có dấu phẩy/nháy/xuống dòng — Excel đọc đúng cột. */
function cell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildSkuCsv(items: CustomerCatalogItem[]): string {
  const lines = [HEADERS.join(',')];
  for (const item of items) {
    for (const v of item.variations ?? []) {
      const dims = [v.height, v.length, v.width].every((n) => n != null) ? `${v.height}x${v.length}x${v.width}` : '';
      lines.push(
        [
          v.sku,
          item.fullName,
          item.productLine ?? '',
          (v.attributes ?? []).map((a) => `${a.label}: ${a.value}`).join(' / '),
          v.discountedPrice ?? v.retailPrice ?? '',
          v.shipCodPrice ?? '',
          v.tiktokPrice ?? '',
          v.weight ?? '',
          dims,
        ]
          .map(cell)
          .join(','),
      );
    }
  }
  return lines.join('\n');
}

/** Tải toàn bộ sản phẩm khớp `query` (chuỗi query của trang catalog, đã bỏ page/limit). */
export async function fetchAllCatalogItems(query: string): Promise<CustomerCatalogItem[]> {
  const base = new URLSearchParams(query);
  base.delete('page');
  base.delete('limit');
  const out: CustomerCatalogItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const p = new URLSearchParams(base);
    p.set('page', String(page));
    p.set('limit', String(PAGE_SIZE));
    const res = await apiFetch<ApiRes<CustomerCatalogItem[]>>(`/api/v1/customer/catalog?${p.toString()}`);
    const rows = res?.data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** Trình duyệt tải file — Blob + thẻ `a` tạm (không có API tải file phía server). */
export function saveCsv(csv: string, fileName: string): void {
  // BOM để Excel bản Việt mở không vỡ dấu.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadSkuCsv(query: string, fileName: string): Promise<void> {
  const items = await fetchAllCatalogItems(query);
  saveCsv(buildSkuCsv(items), fileName);
}
