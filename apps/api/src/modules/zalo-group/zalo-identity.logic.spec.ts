import { ZALO_STAFF_MIN_GROUPS, ZaloIdentityKind } from 'shared';

import { doanPhanLoai } from './zalo-identity.logic';

/**
 * Test NỀN cho heuristic phân loại người gửi — ghi lại hành vi HIỆN TẠI trước
 * khi Đợt 1 mục 1.2d cho nó nhìn thêm loại nhóm.
 */
describe('doanPhanLoai — đoán từ số nhóm', () => {
  it('tài khoản công ty → trợ lý AI, bất kể số nhóm', () => {
    expect(doanPhanLoai(1, true)).toBe(ZaloIdentityKind.AiSupport);
  });

  it('đủ ngưỡng nhóm → nhân viên', () => {
    expect(doanPhanLoai(ZALO_STAFF_MIN_GROUPS, false)).toBe(ZaloIdentityKind.Staff);
  });

  it('đúng 1 nhóm → khách (hành vi hiện tại, KHÔNG nhìn loại nhóm)', () => {
    expect(doanPhanLoai(1)).toBe(ZaloIdentityKind.Customer);
  });

  it('2–4 nhóm → để người xét', () => {
    expect(doanPhanLoai(3)).toBe(ZaloIdentityKind.Unknown);
  });
});
