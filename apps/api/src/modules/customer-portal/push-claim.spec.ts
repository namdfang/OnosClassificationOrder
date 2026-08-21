import { CustomerOrderService } from './customer-order.service';

/**
 * `ORD-20` — đẩy đơn hai lần phải báo "đã đẩy", không được vỡ ở unique index
 * `productionId`. Điều giữ cho việc đó đúng nằm ở **hình dạng bộ lọc** của
 * lệnh giữ chỗ, chứ không ở chỗ nào khác — nên bộ ca này soi thẳng bộ lọc.
 *
 * Ai sau này rút `pushedAt: null` khỏi bộ lọc (vì "đọc lúc đầu đã kiểm rồi")
 * thì mở lại đúng chỗ hở cũ: khoảng giữa đọc và ghi. Test này chặn việc đó.
 */
type MongoFilter = Record<string, unknown>;
type MongoUpdate = { $set: Record<string, unknown> };
type Captured = { filter: MongoFilter; update: MongoUpdate };

/** Chỉ 3 phương thức cần soi — khai theo hình dạng để khỏi đụng `private` của class. */
interface PushClaimSurface {
  customerOrderModel: unknown;
  claimPush(stagingId: string, customerId: string): Promise<boolean>;
  releasePushClaims(stagingIds: string[]): Promise<void>;
  describeLostClaim(stagingId: string): Promise<string>;
}

const buildService = (opts: { modifiedCount?: number; pushedAt?: Date | null } = {}) => {
  const calls: { updateOne: Captured[]; updateMany: Captured[] } = { updateOne: [], updateMany: [] };
  const svc = Object.create(CustomerOrderService.prototype) as PushClaimSurface;
  svc.customerOrderModel = {
    updateOne: (filter: MongoFilter, update: MongoUpdate) => {
      calls.updateOne.push({ filter, update });
      return Promise.resolve({ modifiedCount: opts.modifiedCount ?? 1 });
    },
    updateMany: (filter: MongoFilter, update: MongoUpdate) => {
      calls.updateMany.push({ filter, update });
      return Promise.resolve({ modifiedCount: 1 });
    },
    findById: () => ({ select: () => ({ lean: () => Promise.resolve({ pushedAt: opts.pushedAt ?? null }) }) }),
  };
  return { svc, calls };
};

describe('ORD-20 — giữ chỗ khi đẩy đơn sản xuất', () => {
  it('lệnh giữ chỗ ĐÒI đơn còn chưa đẩy', async () => {
    const { svc, calls } = buildService();
    await svc.claimPush('S1', 'C1');
    const { filter, update } = calls.updateOne[0];
    expect(filter._id).toBe('S1');
    // Phạm vi khách: đơn của khách khác không giành được.
    expect(filter.customerId).toBe('C1');
    // ĐIỀU KIỆN CỐT LÕI — mất dòng này là mất luôn tác dụng chống trùng.
    expect(filter.pushedAt).toBeNull();
    expect(update.$set.pushingAt).toBeInstanceOf(Date);
  });

  it('chấp nhận chỗ giữ quá hạn để tiến trình chết không khoá đơn vĩnh viễn', async () => {
    const { svc, calls } = buildService();
    await svc.claimPush('S1', 'C1');
    const or = calls.updateOne[0].filter.$or as Array<{ pushingAt?: null | { $lt?: Date; $exists?: boolean } }>;
    const stale = or.map((c) => c.pushingAt).find((v) => v && typeof v === 'object' && v.$lt instanceof Date);
    expect(stale).toBeDefined();
    // Ngưỡng phải rộng hơn một lượt push thật (tính bằng giây), nếu không lượt
    // đang chạy chậm sẽ bị lượt khác cướp chỗ giữa chừng.
    const cutoff = (stale as { $lt: Date }).$lt;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(60_000);
    expect(or.some((c) => c.pushingAt === null)).toBe(true);
  });

  it('giành được chỗ khi có document đổi, mất chỗ khi không', async () => {
    expect(await buildService({ modifiedCount: 1 }).svc.claimPush('S1', 'C1')).toBe(true);
    expect(await buildService({ modifiedCount: 0 }).svc.claimPush('S1', 'C1')).toBe(false);
  });

  it('nói đúng chuyện gì xảy ra với lượt thua', async () => {
    expect(await buildService({ pushedAt: new Date() }).svc.describeLostClaim('S1')).toContain('đã đẩy');
    expect(await buildService({ pushedAt: null }).svc.describeLostClaim('S1')).toContain('đang được đẩy');
  });

  it('nhả chỗ KHÔNG được đụng đơn đã đẩy xong', async () => {
    const { svc, calls } = buildService();
    await svc.releasePushClaims(['S1', 'S2']);
    const { filter, update } = calls.updateMany[0];
    expect(filter.pushedAt).toBeNull();
    expect(update.$set.pushingAt).toBeNull();
    expect(update.$set.pushedAt).toBeUndefined();
  });

  it('không gọi gì khi danh sách nhả chỗ rỗng', async () => {
    const { svc, calls } = buildService();
    await svc.releasePushClaims([]);
    expect(calls.updateMany).toHaveLength(0);
  });
});
