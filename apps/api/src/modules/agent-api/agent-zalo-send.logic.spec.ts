import { ZaloGroupKind } from 'shared';

import { chonHoiThoai, kiemNoiDung, LY_DO_CHAN } from './agent-zalo-send.logic';

/**
 * Đây là chốt chặn duy nhất giữa một agent và khách hàng của công ty. Mọi
 * endpoint khác của Agent API chỉ đọc — sai thì trả nhầm số; đường này nhắn ra
 * ngoài tới người thật và không rút lại được.
 */
describe('chonHoiThoai — ai được nhận tin từ agent', () => {
  const ds = ['c1', 'c2'];

  it('CẤM nhóm khách, dù có truyền đúng conversationId', () => {
    const r = chonHoiThoai({ kind: ZaloGroupKind.Seller, conversationIds: ds }, 'c1');
    expect(r).toEqual({ ok: false, lyDo: LY_DO_CHAN.nhomKhach });
  });

  it('CẤM nhóm chưa phân loại — chưa ai biết bên kia là ai', () => {
    expect(chonHoiThoai({ kind: ZaloGroupKind.Unreviewed, conversationIds: ds }).ok).toBe(false);
    expect(chonHoiThoai({ kind: undefined, conversationIds: ds }).ok).toBe(false);
  });

  it('cho nhóm nội bộ và nhóm vận hành', () => {
    expect(chonHoiThoai({ kind: ZaloGroupKind.Internal, conversationIds: ds })).toEqual({ ok: true, conversationId: 'c1' });
    expect(chonHoiThoai({ kind: ZaloGroupKind.Operation, conversationIds: ds })).toEqual({ ok: true, conversationId: 'c1' });
  });

  it('conversationId phải THUỘC nhóm đã duyệt', () => {
    // Không có luật này thì chốt phân loại vô nghĩa: biết một id bất kỳ là
    // nhắn được vào nhóm khách.
    const r = chonHoiThoai({ kind: ZaloGroupKind.Internal, conversationIds: ds }, 'id-cua-nhom-khac');
    expect(r).toEqual({ ok: false, lyDo: LY_DO_CHAN.hoiThoaiLac });
  });

  it('nhóm không tồn tại hoặc chưa có hội thoại → từ chối kèm lý do rõ', () => {
    expect(chonHoiThoai(null)).toEqual({ ok: false, lyDo: LY_DO_CHAN.khongThayNhom });
    expect(chonHoiThoai({ kind: ZaloGroupKind.Internal, conversationIds: [] })).toEqual({
      ok: false,
      lyDo: LY_DO_CHAN.khongCoHoiThoai,
    });
  });
});

describe('kiemNoiDung', () => {
  it('từ chối tin rỗng', () => {
    expect(kiemNoiDung('   ').ok).toBe(false);
    expect(kiemNoiDung(undefined).ok).toBe(false);
  });

  it('cắt tin quá dài thay vì bỏ gửi', () => {
    const r = kiemNoiDung('x'.repeat(5000));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content.length).toBe(4000);
      expect(r.content.endsWith('…')).toBe(true);
    }
  });

  it('giữ nguyên tin bình thường, bỏ khoảng trắng thừa', () => {
    expect(kiemNoiDung('  chào nhóm  ')).toEqual({ ok: true, content: 'chào nhóm' });
  });
});
