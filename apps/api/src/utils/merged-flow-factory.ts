import type { Connection } from 'mongoose';
import { FactoryFlowType } from 'shared';

/**
 * Cache process-wide `flowType` của các xưởng chạy LUỒNG RÚT GỌN
 * (`FactoryEntity.flowType !== 'standard'`): `merged` (xưởng gỗ — In+Ép,
 * May vào+May ra) và `no-sew` (Mê Linh — QC xong bỏ qua 2 công đoạn may).
 * Pattern y hệt `excluded-factory.ts`: các điểm quyết định transition/rework
 * là code sync hoặc hot-path nên đọc sync từ cache, TTL hết hạn thì tự
 * refresh nền.
 *
 * Await `loadFactoryFlowTypes` ở `OrderService.onModuleInit` để cache sẵn
 * sàng trước khi nhận traffic (FulfillmentModule phụ thuộc OrderModule nên
 * init sau). Admin đổi `flowType` giữa chừng → áp dụng chậm nhất sau TTL.
 */
const TTL_MS = 60_000;
let cache: { flows: Map<string, FactoryFlowType>; at: number } = { flows: new Map(), at: 0 };
let refreshing = false;

export async function loadFactoryFlowTypes(db: Connection): Promise<Map<string, FactoryFlowType>> {
  const docs = await db
    .collection('factories')
    .find({
      flowType: { $exists: true, $ne: FactoryFlowType.Standard },
      deletedAt: { $exists: false },
    })
    .project({ _id: 1, flowType: 1 })
    .toArray();
  cache = {
    flows: new Map(docs.map((d) => [String(d._id), d.flowType as FactoryFlowType])),
    at: Date.now(),
  };
  return cache.flows;
}

/** Đọc sync từ cache — quá TTL thì refresh nền, request hiện tại dùng giá trị cũ. */
export function getFactoryFlowTypeSync(db: Connection, factoryId: string | null | undefined): FactoryFlowType {
  if (Date.now() - cache.at > TTL_MS && !refreshing) {
    refreshing = true;
    void loadFactoryFlowTypes(db)
      .catch(() => undefined)
      .finally(() => {
        refreshing = false;
      });
  }
  if (factoryId == null) return FactoryFlowType.Standard;
  return cache.flows.get(String(factoryId)) ?? FactoryFlowType.Standard;
}
