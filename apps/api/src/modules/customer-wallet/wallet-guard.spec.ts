import { checkWalletGuard, round2 } from './wallet-guard';

describe('checkWalletGuard', () => {
  it('trừ tiền trong số dư → ok, before/after đúng', () => {
    expect(checkWalletGuard(100, 0, -20.31)).toEqual({ ok: true, balanceBefore: 100, balanceAfter: 79.69 });
  });

  it('trừ quá số dư, không hạn mức → chặn', () => {
    expect(checkWalletGuard(10, 0, -10.01).ok).toBe(false);
  });

  it('trừ đúng bằng số dư → ok (về 0)', () => {
    expect(checkWalletGuard(10, 0, -10)).toEqual({ ok: true, balanceBefore: 10, balanceAfter: 0 });
  });

  it('hạn mức nợ cho xuống tới -creditLimit', () => {
    expect(checkWalletGuard(0, 50, -50).ok).toBe(true);
    expect(checkWalletGuard(0, 50, -50.01).ok).toBe(false);
  });

  it('cộng tiền LUÔN cho, kể cả đang âm quá hạn mức (hoàn/topup phải vào được)', () => {
    expect(checkWalletGuard(-100, 0, 30)).toEqual({ ok: true, balanceBefore: -100, balanceAfter: -70 });
  });

  it('balance undefined coi như 0', () => {
    expect(checkWalletGuard(undefined, undefined, -1).ok).toBe(false);
    expect(checkWalletGuard(undefined, undefined, 5)).toEqual({ ok: true, balanceBefore: 0, balanceAfter: 5 });
  });

  it('round2 dọn rác floating point', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    // Sổ cái cộng dồn nhiều giao dịch lẻ không được trôi số.
    expect(checkWalletGuard(6.11, 0, -6.11)).toEqual({ ok: true, balanceBefore: 6.11, balanceAfter: 0 });
  });
});
