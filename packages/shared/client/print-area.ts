/**
 * Các vị trí in mà 1 design là ĐỦ cho item của sản phẩm này — luật design của
 * Customer Portal (nới 27/08): KHÔNG đòi đủ mọi vị trí bắt buộc, chỉ cần 1
 * design ở MẶT TRƯỚC hoặc MẶT SAU; sản phẩm không có front/back trong cấu hình
 * → cần 1 design ở bất kỳ vị trí bắt buộc nào; không có vị trí bắt buộc nào
 * (hoặc `isRequired: false` hết) → rỗng, không đòi design (chỉ đòi mockup).
 *
 * NGUỒN LUẬT DUY NHẤT — dùng chung: BE `assertArtworkComplete` (gate đặt đơn
 * ORD-22 + push ORD-25) + `resolveImportSkus`, FE form đặt đơn (`apps/web` + `apps/seller`)
 * + cảnh báo preview import. Sửa luật thì sửa Ở ĐÂY. Nest-free (xem `client/design-fields.ts`).
 */
export function designAcceptKeys(areas: { key: string; isRequired?: boolean }[] | undefined): string[] {
  const list = areas ?? [];
  const required = list.filter((a) => a.isRequired !== false);
  if (required.length === 0) return [];
  const frontBack = ['front', 'back'].filter((k) => list.some((a) => a.key === k));
  return frontBack.length > 0 ? frontBack : required.map((a) => a.key);
}
