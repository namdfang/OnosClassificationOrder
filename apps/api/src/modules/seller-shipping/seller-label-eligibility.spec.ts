import { computeChargeableWeightGram, parseSellerShipPriceCsv, resolveSellerShipPrice } from 'shared';

import { checkSellerLabelEligibility, sumStagingWeights } from './seller-label-eligibility';

const OWNER = 'customer1';
const baseStaging = () => ({
  customerId: OWNER,
  pushedAt: new Date('2026-09-01'),
  status: 'pending',
  items: [
    { shipMethod: 'cod' as const, productionId: 'AB-11111-11111' },
    { shipMethod: 'tiktok' as const, productionId: 'AB-11111-11112' },
  ],
});
const okProd = () => [{}, {}];

describe('checkSellerLabelEligibility', () => {
  it('đơn cod/tiktok đã push, sạch tracking → ok', () => {
    expect(checkSellerLabelEligibility(OWNER, baseStaging(), okProd())).toEqual({ ok: true });
  });

  it('sai chủ → not_eligible (không lộ đơn tồn tại)', () => {
    expect(checkSellerLabelEligibility('other', baseStaging(), okProd())).toEqual({
      ok: false,
      errorCode: 'not_eligible',
    });
  });

  it('chưa push → not_eligible', () => {
    expect(checkSellerLabelEligibility(OWNER, { ...baseStaging(), pushedAt: null }, okProd()).ok).toBe(false);
  });

  it('lẫn 1 item express_us → từ chối CẢ nhóm (ship đã nằm trong retailPrice)', () => {
    const staging = baseStaging();
    staging.items[1] = { shipMethod: 'express_us' as never, productionId: 'AB-11111-11112' };
    expect(checkSellerLabelEligibility(OWNER, staging, okProd())).toEqual({ ok: false, errorCode: 'not_eligible' });
  });

  it('item đã có tracking tự cấp → already_has_label', () => {
    const staging = baseStaging();
    staging.items[0] = { ...staging.items[0], tracking: { number: '9400ABC' } } as never;
    expect(checkSellerLabelEligibility(OWNER, staging, okProd())).toEqual({
      ok: false,
      errorCode: 'already_has_label',
    });
  });

  it('production có label VNP còn hiệu lực → already_has_label; đã hủy → ok', () => {
    expect(
      checkSellerLabelEligibility(OWNER, baseStaging(), [{ vnpShipment: { shipmentId: 'v1' } }, {}]),
    ).toEqual({ ok: false, errorCode: 'already_has_label' });
    expect(
      checkSellerLabelEligibility(OWNER, baseStaging(), [
        { vnpShipment: { shipmentId: 'v1', cancelledAt: new Date() } },
        {},
      ]),
    ).toEqual({ ok: true });
  });

  it('đơn production đang giữ / đã hủy → not_eligible', () => {
    expect(checkSellerLabelEligibility(OWNER, baseStaging(), [{ heldAt: new Date() }]).ok).toBe(false);
    expect(checkSellerLabelEligibility(OWNER, baseStaging(), [{ cancelledAt: new Date() }]).ok).toBe(false);
  });
});

describe('sumStagingWeights + tính cước', () => {
  it('cộng cân×qty và thể tích×qty cả nhóm', () => {
    const { prefillGram, totalVolumeCm3 } = sumStagingWeights([
      { quantity: 2, weight: 150, length: 10, width: 10, height: 3 },
      { quantity: 1, weight: 90 },
    ]);
    expect(prefillGram).toBe(390);
    expect(totalVolumeCm3).toBe(600);
  });

  it('cân quy đổi = thể_tích/6 làm tròn lên; cước lấy max', () => {
    // Thể tích 600cm³ → 100g quy đổi; cân thật 50g → tính theo 100g.
    const dimGram = Math.ceil(600 / 6);
    const { chargeableGram } = computeChargeableWeightGram({ actualGram: 50 });
    expect(Math.max(chargeableGram, dimGram)).toBe(100);
  });
});

describe('resolveSellerShipPrice (bảng Data/shipping_cost.csv)', () => {
  const table = { rows: parseSellerShipPriceCsv('WEIGHT, PRICE\n50,6.11\n100,6.55\n150,7.21\n10000,140.77') };

  it('đúng mốc → giá mốc; giữa 2 mốc → làm tròn LÊN mốc kế', () => {
    expect(resolveSellerShipPrice(50, table)).toEqual({ ok: true, tierGram: 50, price: 6.11 });
    expect(resolveSellerShipPrice(120, table)).toEqual({ ok: true, tierGram: 150, price: 7.21 });
  });

  it('quá 10.000g → over_max_weight (chặn mua)', () => {
    expect(resolveSellerShipPrice(10001, table)).toEqual({ ok: false, error: 'over_max_weight' });
    expect(resolveSellerShipPrice(10000, table)).toEqual({ ok: true, tierGram: 10000, price: 140.77 });
  });

  it('thiếu cân / thiếu bảng → mã lỗi tương ứng', () => {
    expect(resolveSellerShipPrice(0, table)).toEqual({ ok: false, error: 'missing_weight' });
    expect(resolveSellerShipPrice(100, null)).toEqual({ ok: false, error: 'no_price_table' });
  });

  it('parse CSV chặn mốc không tăng dần + dòng hỏng', () => {
    expect(() => parseSellerShipPriceCsv('100,5\n50,6')).toThrow(/tăng dần/);
    expect(() => parseSellerShipPriceCsv('abc\nxyz,1')).toThrow(/không hợp lệ/);
  });
});
