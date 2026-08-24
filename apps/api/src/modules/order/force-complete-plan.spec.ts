import { DesignerStatus, FactoryFlowType, FulfillmentStage } from 'shared';

import { planForceComplete } from './force-complete-plan';

/**
 * "Chuyển hoàn thành" (SuperAdmin) — cách chia mốc thời gian cho các khâu chưa
 * xong. Đây là thao tác SỬA DỮ LIỆU nên cái giá của việc sai là dữ liệu bịa nằm
 * vĩnh viễn trong báo cáo: mốc chạy ngược, mốc rơi ra ngoài khoảng
 * `[vào sản xuất → lúc bấm]`, hoặc khâu đã làm thật bị ghi đè.
 */
const IN_PRODUCTION = new Date('2026-08-24T00:00:00.000Z');
const NOW = new Date('2026-08-24T08:00:00.000Z'); // đúng 8 tiếng sau

const base = {
  now: NOW,
  inProductionAt: IN_PRODUCTION,
  flowType: FactoryFlowType.Standard,
};

const byKey = (steps: Array<{ key: string }>) => steps.map((s) => s.key);

describe('chuyển hoàn thành — chia đều mốc cho khâu chưa xong', () => {
  it('đơn chưa làm gì: đủ 8 khâu, chia đều, khâu cuối đóng ĐÚNG lúc bấm', () => {
    const plan = planForceComplete(base);

    expect(byKey(plan.steps)).toEqual([
      'tool-check',
      'designer',
      FulfillmentStage.Print,
      FulfillmentStage.Press,
      FulfillmentStage.QCPostPress,
      FulfillmentStage.SewIn,
      FulfillmentStage.SewOut,
      FulfillmentStage.Pack,
    ]);
    expect(plan.start).toEqual(IN_PRODUCTION);
    // 8 tiếng / 8 khâu = 1 tiếng mỗi khâu.
    expect(plan.steps[0].from).toEqual(IN_PRODUCTION);
    expect(plan.steps[0].to).toEqual(new Date('2026-08-24T01:00:00.000Z'));
    expect(plan.steps[3].to).toEqual(new Date('2026-08-24T04:00:00.000Z'));
    // Mốc cuối phải TRÙNG `now`, không được lệch vài ms do chia lẻ.
    expect(plan.steps[7].to).toEqual(NOW);
  });

  it('mốc liền mạch: khâu sau bắt đầu đúng lúc khâu trước xong', () => {
    const plan = planForceComplete(base);

    for (let i = 1; i < plan.steps.length; i += 1) {
      expect(plan.steps[i].from).toEqual(plan.steps[i - 1].to);
    }
    // Không mốc nào rơi ra ngoài khoảng đã hứa với người bấm.
    for (const s of plan.steps) {
      expect(s.from.getTime()).toBeGreaterThanOrEqual(IN_PRODUCTION.getTime());
      expect(s.to.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('KHÔNG đụng khâu đã làm thật, và bắt đầu chia từ mốc thật cuối cùng', () => {
    const realPrintDone = new Date('2026-08-24T05:00:00.000Z');
    const plan = planForceComplete({
      ...base,
      toolCheckedAt: new Date('2026-08-24T00:30:00.000Z'),
      toolResultNote: 'ok',
      designerStatus: DesignerStatus.Done,
      designerCompletedAt: new Date('2026-08-24T02:00:00.000Z'),
      fulfillmentStages: { [FulfillmentStage.Print]: { completedAt: realPrintDone } },
    });

    // Khâu đã xong không nằm trong kế hoạch → service không ghi gì lên chúng.
    expect(byKey(plan.steps)).toEqual([
      FulfillmentStage.Press,
      FulfillmentStage.QCPostPress,
      FulfillmentStage.SewIn,
      FulfillmentStage.SewOut,
      FulfillmentStage.Pack,
    ]);
    // Chia từ mốc thật cuối cùng (In xong 05:00), KHÔNG từ lúc vào sản xuất —
    // nếu không, "Ép" sẽ xong trước cả khi "In" xong.
    expect(plan.start).toEqual(realPrintDone);
    expect(plan.steps[0].from).toEqual(realPrintDone);
    expect(plan.steps[4].to).toEqual(NOW);
  });

  it('luồng rút gọn: khâu tự-hoàn-thành không chiếm lát, đóng cùng mốc khâu trước', () => {
    const plan = planForceComplete({ ...base, flowType: FactoryFlowType.Merged });

    const at = Object.fromEntries(plan.steps.map((s) => [s.key, s]));
    // Xưởng gỗ: Ép dính vào In, May ra dính vào May vào.
    expect(at[FulfillmentStage.Press].auto).toBe(true);
    expect(at[FulfillmentStage.Press].to).toEqual(at[FulfillmentStage.Print].to);
    expect(at[FulfillmentStage.SewOut].to).toEqual(at[FulfillmentStage.SewIn].to);
    // 6 khâu thật (8 trừ 2 khâu tự động) → mỗi khâu 80 phút.
    expect(at['tool-check'].to).toEqual(new Date('2026-08-24T01:20:00.000Z'));
    expect(at[FulfillmentStage.Pack].to).toEqual(NOW);
  });

  it('xưởng no-sew: May vào + May ra dồn vào mốc QC sau ép', () => {
    const plan = planForceComplete({ ...base, flowType: FactoryFlowType.NoSew });
    const at = Object.fromEntries(plan.steps.map((s) => [s.key, s]));

    expect(at[FulfillmentStage.SewIn].auto).toBe(true);
    expect(at[FulfillmentStage.SewOut].auto).toBe(true);
    expect(at[FulfillmentStage.SewIn].to).toEqual(at[FulfillmentStage.QCPostPress].to);
    expect(at[FulfillmentStage.SewOut].to).toEqual(at[FulfillmentStage.QCPostPress].to);
    expect(at[FulfillmentStage.Pack].to).toEqual(NOW);
  });

  it('đơn thiếu `inProductionAt` lùi về `orderAt` rồi `createdAt`', () => {
    const orderAt = new Date('2026-08-24T03:00:00.000Z');
    expect(planForceComplete({ ...base, inProductionAt: null, orderAt }).start).toEqual(orderAt);

    const createdAt = new Date('2026-08-24T06:00:00.000Z');
    expect(planForceComplete({ ...base, inProductionAt: null, createdAt }).start).toEqual(createdAt);

    // Không còn mốc nào → dồn hết về lúc bấm, không bịa ra quá khứ.
    const bare = planForceComplete({ ...base, inProductionAt: null });
    expect(bare.start).toEqual(NOW);
    expect(bare.steps.every((s) => s.from.getTime() === NOW.getTime() && s.to.getTime() === NOW.getTime())).toBe(true);
  });

  it('mốc bắt đầu ở TƯƠNG LAI (dữ liệu lệch) vẫn không sinh mốc sau lúc bấm', () => {
    const plan = planForceComplete({ ...base, inProductionAt: new Date('2026-08-25T00:00:00.000Z') });

    expect(plan.start).toEqual(NOW);
    for (const s of plan.steps) {
      expect(s.to.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('soát tool đã có mốc nhưng chưa có kết quả → vẫn phải điền lại', () => {
    const plan = planForceComplete({
      ...base,
      toolCheckedAt: new Date('2026-08-24T00:30:00.000Z'),
      toolResultNote: '   ',
    });

    // Mốc có mà kết quả trống thì đơn vẫn kẹt ở hàng đợi "chưa soát".
    expect(byKey(plan.steps)[0]).toBe('tool-check');
  });
});
