import { FULFILLMENT_STAGE_LABELS, FulfillmentStage, ZaloSummaryLevel } from 'shared';

import { chuanHoa, dinhDangLuc, gopChecklist, moTaDon, nhanChang } from './zalo-summary.logic';

/**
 * Test NỀN cho các hàm thuần của tóm tắt Zalo — viết TRƯỚC khi đổi hành vi, để
 * mọi thay đổi sau đó đo được là "vẫn giữ" hay "cố ý đổi".
 *
 * Mốc thời gian luôn cố định: đây là nơi từng suýt báo nhầm lỗi múi giờ vì so
 * một giá trị UTC với giờ máy.
 */
const NOW = new Date('2026-09-03T02:00:00.000Z'); // 09:00 VN

const ngayTruoc = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('dinhDangLuc — DD/MM HH:MM theo giờ Việt Nam, không phụ thuộc TZ máy', () => {
  it('cộng đúng +7 giờ', () => {
    expect(dinhDangLuc(new Date('2026-08-31T09:33:00.000Z'))).toBe('31/08 16:33');
  });

  it('qua ngày khi giờ UTC muộn', () => {
    expect(dinhDangLuc(new Date('2026-08-31T17:30:00.000Z'))).toBe('01/09 00:30');
  });
});

describe('nhanChang — nhãn công đoạn', () => {
  it('không có công đoạn → nói rõ chưa vào xưởng', () => {
    expect(nhanChang(undefined)).toBe('chưa vào công đoạn xưởng');
  });

  it('công đoạn hợp lệ → nhãn tiếng Việt', () => {
    expect(nhanChang(FulfillmentStage.Print)).toBe(FULFILLMENT_STAGE_LABELS[FulfillmentStage.Print]);
  });

  it('công đoạn lạ → trả nguyên chuỗi, không nổ', () => {
    expect(nhanChang('bogus')).toBe('bogus');
  });
});

describe('moTaDon — thứ tự hủy → giữ → xong → công đoạn', () => {
  it('hủy thắng giữ', () => {
    expect(moTaDon({ cancelledAt: ngayTruoc(1), heldAt: ngayTruoc(2) }, NOW)).toBe('ĐÃ HỦY');
  });

  it('đang giữ: số ngày + lý do', () => {
    expect(moTaDon({ heldAt: ngayTruoc(3), holdReason: 'thiếu file' }, NOW)).toBe(
      'ĐANG BỊ GIỮ 3 ngày (lý do: thiếu file)',
    );
  });

  it('đã xong sản xuất', () => {
    expect(moTaDon({ fulfillmentCompletedAt: ngayTruoc(2) }, NOW)).toBe('đã xong sản xuất 2 ngày trước');
  });

  it('đang chạy có lỗi: công đoạn + lỗi + ghi chú + số ngày vào sản xuất', () => {
    expect(
      moTaDon(
        {
          currentFulfillmentStage: FulfillmentStage.Print,
          productionError: 'lệch màu',
          productionErrorNote: 'in lại',
          inProductionAt: ngayTruoc(5),
        },
        NOW,
      ),
    ).toBe(`${FULFILLMENT_STAGE_LABELS[FulfillmentStage.Print]}, ĐANG CÓ LỖI: lệch màu — in lại, vào sản xuất 5 ngày trước`);
  });
});

describe('chuanHoa — lưới cuối cho JSON của mô hình', () => {
  it('rỗng → chuỗi rỗng, mảng rỗng, mức bình thường', () => {
    expect(chuanHoa({})).toEqual({
      tieuDe: '',
      khachQuanTam: '',
      salePhanHoi: '',
      tonDong: '',
      checklist: [],
      nghiNgo: [],
      mucDo: ZaloSummaryLevel.BinhThuong,
    });
  });

  it('mức độ sai hoa thường → về bình thường; checklist lọc phần tử không phải chuỗi/rỗng, KHÔNG trim', () => {
    const r = chuanHoa({ mucDo: 'GAP', checklist: ['a', '', 3, ' b '] });

    expect(r.mucDo).toBe(ZaloSummaryLevel.BinhThuong);
    expect(r.checklist).toEqual(['a', ' b ']);
  });

  it('mức độ hợp lệ giữ nguyên', () => {
    expect(chuanHoa({ mucDo: 'gap' }).mucDo).toBe(ZaloSummaryLevel.Gap);
  });
});

describe('gopChecklist — giữ tick của việc trùng nội dung (hành vi HIỆN TẠI)', () => {
  const T0 = '2026-09-01T00:00:00.000Z';
  const T1 = '2026-09-02T00:00:00.000Z';

  it('trùng y nguyên (không phân biệt hoa thường/khoảng trắng đầu cuối) → giữ tick + mốc cũ', () => {
    const r = gopChecklist(['Gửi báo giá cho anh Nam'], [{ viec: ' gửi báo giá cho anh nam ', xong: true, taoLuc: T0, xongLuc: T1 }], NOW);

    expect(r).toEqual([{ viec: 'Gửi báo giá cho anh Nam', xong: true, taoLuc: T0, xongLuc: T1 }]);
  });

  it('việc mới → chưa tick, taoLuc = bây giờ', () => {
    expect(gopChecklist(['Chốt mẫu vải'], [], NOW)).toEqual([
      { viec: 'Chốt mẫu vải', xong: false, taoLuc: NOW.toISOString(), xongLuc: null },
    ]);
  });

  it('đổi chữ dù nhỏ → hiện tại MẤT tick (đây là lỗi sẽ sửa ở Đợt 2-A)', () => {
    const r = gopChecklist(['Gửi lại báo giá cho anh Nam'], [{ viec: 'Gửi báo giá cho anh Nam', xong: true, taoLuc: T0, xongLuc: T1 }], NOW);

    expect(r[0].xong).toBe(false);
  });
});
