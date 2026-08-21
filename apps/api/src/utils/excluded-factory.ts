import type { Connection } from 'mongoose';

/**
 * Xưởng "ngoài luồng sản xuất" — hiện hardcode shortName `US` (theo yêu cầu
 * 2026-07): đơn thuộc xưởng này bị loại khỏi thống kê / luồng sản xuất
 * (dashboard, vòng đời đơn, soát tool, auto-gán designer, fulfillment).
 *
 * **KHÔNG áp cho danh sách đơn nữa** (HF-2, 2026-08-21 — theo yêu cầu trực
 * tiếp của người dùng): `buildOrderListFilter` truyền `includeHiddenGroups` nên
 * bảng đơn / export / facets hiển thị TẤT CẢ đơn (kể cả đơn US, đơn chưa map
 * xưởng, đơn đã hủy). Xem `Orders.md §21.3`.
 */
export const EXCLUDED_PRODUCTION_FACTORY_SHORT_NAME = 'US';

const TTL_MS = 5 * 60_000;
// Cache process-wide (module scope) — order/designer-stats/fulfillment/designer-task
// service dùng chung 1 giá trị, khỏi mỗi service tự query.
let cache: { id: string | null; at: number } = { id: null, at: 0 };
let refreshing = false;

/** Load `_id` xưởng US từ collection `factories` và cập nhật cache. Await ở `OrderService.onModuleInit` để filter sẵn sàng trước khi nhận traffic. */
export async function loadExcludedFactoryId(db: Connection): Promise<string | null> {
  const doc = await db
    .collection('factories')
    .findOne({ shortName: EXCLUDED_PRODUCTION_FACTORY_SHORT_NAME, deletedAt: { $exists: false } });
  cache = { id: doc ? String(doc._id) : null, at: Date.now() };
  return cache.id;
}

/**
 * Đọc sync từ cache (các builder filter là hàm sync, không await được) — quá
 * TTL 5 phút thì tự refresh nền, request hiện tại vẫn dùng giá trị cũ.
 */
export function getExcludedFactoryIdSync(db: Connection): string | null {
  if (Date.now() - cache.at > TTL_MS && !refreshing) {
    refreshing = true;
    void loadExcludedFactoryId(db)
      .catch(() => undefined)
      .finally(() => {
        refreshing = false;
      });
  }
  return cache.id;
}

/**
 * Clause `factoryId` chuẩn "đơn thuộc luồng sản xuất": đã map xưởng VÀ không
 * thuộc xưởng US. Thay thế pattern cũ `{ $exists: true, $ne: null }` ở mọi
 * view/stats mặc định.
 */
export function productionFactoryClause(db: Connection): Record<string, unknown> {
  const excludedId = getExcludedFactoryIdSync(db);
  return excludedId ? { $exists: true, $nin: [null, excludedId] } : { $exists: true, $ne: null };
}
