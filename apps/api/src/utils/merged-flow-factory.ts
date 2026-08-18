import type { Connection } from 'mongoose';
import { FactoryFlowType } from 'shared';

/**
 * Cache process-wide danh sách `_id` các xưởng chạy LUỒNG RÚT GỌN
 * (`FactoryEntity.flowType === 'merged'` — xưởng gỗ: In xong → Ép tự xong,
 * May vào xong → May ra tự xong). Pattern y hệt `excluded-factory.ts`: các
 * điểm quyết định transition/rework là code sync hoặc hot-path nên đọc sync
 * từ cache, TTL hết hạn thì tự refresh nền.
 *
 * Await `loadMergedFlowFactoryIds` ở `OrderService.onModuleInit` để cache sẵn
 * sàng trước khi nhận traffic (FulfillmentModule phụ thuộc OrderModule nên
 * init sau). Admin đổi `flowType` giữa chừng → áp dụng chậm nhất sau TTL.
 */
const TTL_MS = 60_000;
let cache: { ids: Set<string>; at: number } = { ids: new Set(), at: 0 };
let refreshing = false;

export async function loadMergedFlowFactoryIds(db: Connection): Promise<Set<string>> {
  const docs = await db
    .collection('factories')
    .find({ flowType: FactoryFlowType.Merged, deletedAt: { $exists: false } })
    .project({ _id: 1 })
    .toArray();
  cache = { ids: new Set(docs.map((d) => String(d._id))), at: Date.now() };
  return cache.ids;
}

/** Đọc sync từ cache — quá TTL thì refresh nền, request hiện tại dùng giá trị cũ. */
export function isMergedFlowFactorySync(db: Connection, factoryId: string | null | undefined): boolean {
  if (Date.now() - cache.at > TTL_MS && !refreshing) {
    refreshing = true;
    void loadMergedFlowFactoryIds(db)
      .catch(() => undefined)
      .finally(() => {
        refreshing = false;
      });
  }
  return factoryId != null && cache.ids.has(String(factoryId));
}
