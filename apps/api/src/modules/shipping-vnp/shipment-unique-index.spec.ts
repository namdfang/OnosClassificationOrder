import { ShipmentSchema } from './shipment.entity';

/**
 * Giữ luật ShippingLabelPatterns.md §2: chống mua trùng bằng RÀNG BUỘC DUY
 * NHẤT ở tầng DB, không bằng đọc-rồi-ghi. Ai gỡ/sửa 2 unique partial index
 * này là mở lại cửa đua cho double-click và job retry — spec này sẽ vỡ trước.
 */
describe('shipments unique indexes (§2)', () => {
  const indexes = ShipmentSchema.indexes() as [Record<string, unknown>, Record<string, unknown>][];
  const byName = (name: string) => indexes.find(([, opts]) => opts.name === name);

  it('unique_vnp_group_active — 1 nhóm đơn seller chỉ 1 record đang mở', () => {
    const found = byName('unique_vnp_group_active');
    expect(found).toBeDefined();
    const [keys, opts] = found!;
    expect(keys).toEqual({ provider: 1, groupKey: 1 });
    expect(opts.unique).toBe(true);
    expect(opts.partialFilterExpression).toEqual({
      groupKey: { $exists: true },
      status: { $in: ['purchasing', 'created', 'in_transit', 'delivered', 'cancelling'] },
    });
  });

  it('unique_vnp_purchase_key — cùng requestId không bao giờ đẻ nhãn thứ hai', () => {
    const found = byName('unique_vnp_purchase_key');
    expect(found).toBeDefined();
    const [keys, opts] = found!;
    expect(keys).toEqual({ provider: 1, purchaseKey: 1 });
    expect(opts.unique).toBe(true);
    expect(opts.partialFilterExpression).toEqual({
      purchaseKey: { $exists: true },
      status: { $in: ['purchasing', 'created', 'in_transit', 'delivered', 'cancelling'] },
    });
  });

  it('cancelled/failed thoát partial filter — hủy xong/mua hỏng được phép mua lại', () => {
    for (const name of ['unique_vnp_group_active', 'unique_vnp_purchase_key']) {
      const [, opts] = byName(name)!;
      const statuses = (opts.partialFilterExpression as { status: { $in: string[] } }).status.$in;
      expect(statuses).not.toContain('cancelled');
      expect(statuses).not.toContain('failed');
    }
  });
});
