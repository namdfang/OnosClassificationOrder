import { autoPurchaseRequestId, autoPurchaseSkipReason } from './auto-purchase.logic';

const done = new Date('2026-09-07T10:00:00Z');
const item = (over: Partial<Parameters<typeof autoPurchaseSkipReason>[0]['group'][number]> = {}) => ({
  productionId: 'CS-11111-22222',
  hasTracking: false,
  hasActiveShipment: false,
  completedAt: done,
  ...over,
});

describe('autoPurchaseSkipReason — phạm vi chốt 2026-09-07', () => {
  it('toggle tắt → disabled', () => {
    expect(autoPurchaseSkipReason({ enabled: false, shipMethod: 'express_us', group: [item()] })).toBe('disabled');
  });

  it('đơn không qua portal (không có shipMethod trong staging) → bỏ qua', () => {
    expect(autoPurchaseSkipReason({ enabled: true, group: [item()] })).toBe('not-portal-order');
  });

  it('chỉ express_us/economy_us được mua — cod/tiktok (khách tự lo label) bỏ qua', () => {
    expect(autoPurchaseSkipReason({ enabled: true, shipMethod: 'express_us', group: [item()] })).toBeNull();
    expect(autoPurchaseSkipReason({ enabled: true, shipMethod: 'economy_us', group: [item()] })).toBeNull();
    expect(autoPurchaseSkipReason({ enabled: true, shipMethod: 'tiktok', group: [item()] })).toBe('ship-method:tiktok');
    expect(autoPurchaseSkipReason({ enabled: true, shipMethod: 'cod', group: [item()] })).toBe('ship-method:cod');
  });

  it('nhóm có item mang tracking khách tự cấp (ORD-26) → bỏ cả nhóm', () => {
    expect(
      autoPurchaseSkipReason({
        enabled: true,
        shipMethod: 'express_us',
        group: [item(), item({ productionId: 'CS-11111-22223', hasTracking: true })],
      }),
    ).toBe('has-tracking:CS-11111-22223');
  });

  it('nhóm đã có vận đơn active → không mua thêm (1 đơn 1 label)', () => {
    expect(
      autoPurchaseSkipReason({
        enabled: true,
        shipMethod: 'express_us',
        group: [item({ hasActiveShipment: true })],
      }),
    ).toBe('has-shipment:CS-11111-22222');
  });

  it('nhóm còn item CHƯA đóng hàng xong → chờ (item cuối pack sẽ kích lại)', () => {
    expect(
      autoPurchaseSkipReason({
        enabled: true,
        shipMethod: 'express_us',
        group: [item(), item({ productionId: 'CS-11111-22224', completedAt: null })],
      }),
    ).toBe('group-incomplete:CS-11111-22224');
  });
});

describe('autoPurchaseRequestId — idempotency cố định theo nhóm', () => {
  it('deterministic + ≥8 ký tự (min của CreateVnpShipmentZod.requestId)', () => {
    expect(autoPurchaseRequestId('LB-68214-41023')).toBe('auto:pack:LB-68214-41023');
    expect(autoPurchaseRequestId('x').length).toBeGreaterThanOrEqual(8);
    expect(autoPurchaseRequestId('x')).toBe(autoPurchaseRequestId('x'));
  });
});
