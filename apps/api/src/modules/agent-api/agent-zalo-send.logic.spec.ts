import { ZaloGroupKind } from 'shared';

import { chonHoiThoai, kiemNguoiNhanDm, kiemNoiDung, LY_DO_CHAN, nickRotKetNoi } from './agent-zalo-send.logic';

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
    // Trả CẢ danh sách: nick đầu có thể đang rớt kết nối, bên gọi thử tiếp nick sau.
    expect(chonHoiThoai({ kind: ZaloGroupKind.Internal, conversationIds: ds })).toEqual({ ok: true, ungVien: ['c1', 'c2'] });
    expect(chonHoiThoai({ kind: ZaloGroupKind.Operation, conversationIds: ds })).toEqual({ ok: true, ungVien: ['c1', 'c2'] });
  });

  it('conversationId phải THUỘC nhóm đã duyệt', () => {
    // Không có luật này thì chốt phân loại vô nghĩa: biết một id bất kỳ là
    // nhắn được vào nhóm khách.
    const r = chonHoiThoai({ kind: ZaloGroupKind.Internal, conversationIds: ds }, 'id-cua-nhom-khac');
    expect(r).toEqual({ ok: false, lyDo: LY_DO_CHAN.hoiThoaiLac });

    // Chỉ định hợp lệ thì KHÔNG mở rộng sang nick khác — agent đang cố ý chọn nick.
    expect(chonHoiThoai({ kind: ZaloGroupKind.Internal, conversationIds: ds }, 'c2')).toEqual({ ok: true, ungVien: ['c2'] });
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

describe('nickRotKetNoi — khi nào được thử nick tiếp theo', () => {
  it('nhận ra lỗi TRƯỚC lúc gửi', () => {
    expect(nickRotKetNoi('{"error":"account_not_connected","message":"Tài khoản Zalo chưa kết nối"}')).toBe(true);
  });

  it('KHÔNG thử lại với lỗi khác — tin có thể đã đi rồi mới hỏng, thử tiếp là nhắn hai lần', () => {
    expect(nickRotKetNoi('{"error":"internal_error"}')).toBe(false);
    expect(nickRotKetNoi('')).toBe(false);
  });
});

describe('kiemNguoiNhanDm — ai được nhận tin RIÊNG từ agent', () => {
  it('cho chủ tịch và nhân viên', () => {
    expect(kiemNguoiNhanDm('chairman').ok).toBe(true);
    expect(kiemNguoiNhanDm('staff').ok).toBe(true);
  });

  it('CẤM khách hàng', () => {
    expect(kiemNguoiNhanDm('customer')).toEqual({ ok: false, lyDo: LY_DO_CHAN.dmKhach });
  });

  it('CẤM cả người chưa xét — "chưa ai xét" khác "đã xét và thấy an toàn"', () => {
    // 53/61 người đang có hội thoại riêng rơi vào diện này (đo prod 12/09).
    // Mặc định cho phép ở đây là agent nhắn riêng cho 53 người không rõ là ai.
    expect(kiemNguoiNhanDm('unknown').ok).toBe(false);
    expect(kiemNguoiNhanDm(undefined).ok).toBe(false);
  });

  it('CẤM nick AI khác — hai con máy nói chuyện với nhau thì không ai dừng', () => {
    expect(kiemNguoiNhanDm('ai-support').ok).toBe(false);
  });
});
