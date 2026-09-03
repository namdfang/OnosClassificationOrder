import { FULFILLMENT_STAGE_LABELS, FulfillmentStage, ZaloSummaryLevel } from 'shared';

import {
  chuanHoa,
  dinhDangLuc,
  gopChecklist,
  maKhongCoTrongNguon,
  moTaDinhKem,
  moTaDon,
  nhanChang,
  SUMMARY_JSON_SCHEMA,
  tachJson,
} from './zalo-summary.logic';

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

describe('moTaDinhKem — tin đính kèm dạng JSON thô → một dòng chữ, không in URL', () => {
  it('tệp PDF có tên (ca lỗi đã gặp: báo cáo được gửi mà tóm tắt nói "chưa gửi")', () => {
    const raw =
      '{"title":"2026年-墨水海运运输危险性鉴定书.pdf","description":"","href":"https://fg41.dlfl.vn/b29ad01d4be3ebbdb2f2/abc.pdf?x=1"}';

    expect(moTaDinhKem(raw)).toBe('[TỆP: 2026年-墨水海运运输危险性鉴定书.pdf]');
  });

  it('ảnh Zalo (title rỗng, href photo-*)', () => {
    expect(moTaDinhKem('{"title":"","description":"","href":"https://photo-stal-29.zdn.vn/gr/jpg/590994b1/2aOboQ"}')).toBe(
      '[ẢNH]',
    );
  });

  it('sticker (không href, có catId/type)', () => {
    expect(moTaDinhKem('{"id":98936,"catId":61900,"type":3}')).toBe('[STICKER]');
  });

  it('liên kết có tiêu đề + mô tả (mô tả cắt 120 ký tự)', () => {
    const r = moTaDinhKem(`{"title":"Bảng giá 2D US","description":"${'x'.repeat(200)}","href":"https://docs.google.com/spreadsheets/d/abc"}`);

    expect(r.startsWith('[LIÊN KẾT: Bảng giá 2D US] — ')).toBe(true);
    expect(r.length).toBe('[LIÊN KẾT: Bảng giá 2D US] — '.length + 120);
    expect(r).not.toContain('https://');
  });

  it('video theo đuôi', () => {
    expect(moTaDinhKem('{"title":"","href":"https://video-stal-48.dlmd.me/gr/2cd6/clip.mp4"}')).toBe('[VIDEO]');
  });

  it('chữ thường giữ nguyên, kể cả khi bắt đầu bằng { nhưng không phải JSON', () => {
    expect(moTaDinhKem('@Đặng Nam hệ thống lỗi k vào đc em ơi')).toBe('@Đặng Nam hệ thống lỗi k vào đc em ơi');
    expect(moTaDinhKem('{không phải json}')).toBe('{không phải json}');
    expect(moTaDinhKem('[1,2]')).toBe('[1,2]');
  });
});

describe('maKhongCoTrongNguon — mã trong đầu ra không có trong chat/khối đơn (chỉ để log)', () => {
  const kq = (o: Partial<Parameters<typeof maKhongCoTrongNguon>[0]>) => ({
    tieuDe: '', khachQuanTam: '', salePhanHoi: '', tonDong: '', checklist: [], nghiNgo: [], mucDo: 'binh-thuong', ...o,
  });

  it('mã chép sai (ca thật: FBCRTOPTIM thay cho FBCROPTOPVNECK) → báo', () => {
    expect(maKhongCoTrongNguon(kq({ tonDong: 'tool FBCRTOPTIM chưa xong' }), 'file FBCROPTOPVNECK ok')).toEqual(['FBCRTOPTIM']);
  });

  it('mã có trong nguồn (kể cả trong khối đơn, khác hoa thường) → không báo', () => {
    expect(maKhongCoTrongNguon(kq({ checklist: ['Giục đơn JP-88300-76764'] }), 'đơn jp-88300-76764: ĐANG BỊ GIỮ')).toEqual([]);
  });

  it('mã CẮT CỤT của mã có thật → không báo (ồn mà không chỉ ra chuyện bịa)', () => {
    expect(maKhongCoTrongNguon(kq({ tonDong: 'đơn AS-02077 đang kẹt' }), 'đơn AS-02077-17505: ĐANG BỊ GIỮ')).toEqual([]);
  });

  it('mã lấy từ BẢN TÓM TẮT LẦN TRƯỚC (có trong nguồn) → không báo', () => {
    expect(maKhongCoTrongNguon(kq({ tonDong: 'vẫn chờ JP-88300-76764' }), 'tin mới không nhắc mã\nTồn đọng trước: JP-88300-76764 kẹt')).toEqual([]);
  });

  it('từ tiếng Việt viết hoa có dấu và từ ngắn không bị coi là mã', () => {
    expect(maKhongCoTrongNguon(kq({ tonDong: 'ĐANG CHỜ MSDS và ISF' }), 'không có gì')).toEqual([]);
  });
});

describe('tachJson — tách JSON kết quả khỏi văn bản tự do', () => {
  const KQ = '{"tieuDe":"A","mucDo":"gap","checklist":[]}';

  it('cả chuỗi là JSON', () => {
    expect(tachJson(KQ)).toEqual({ tieuDe: 'A', mucDo: 'gap', checklist: [] });
  });

  it('có chữ quanh khối ```json', () => {
    expect(tachJson(`Đây là kết quả:\n\`\`\`json\n${KQ}\n\`\`\`\nHết.`)?.mucDo).toBe('gap');
  });

  it('hai object liên tiếp → lấy đúng object có mucDo/tieuDe', () => {
    expect(tachJson(`{"ghiChu":"x"} rồi ${KQ}`)?.tieuDe).toBe('A');
  });

  it('dấu } nằm trong chuỗi không làm hỏng việc đếm ngoặc', () => {
    const o = tachJson('Kết quả {"tieuDe":"a } b","mucDo":"gap","tonDong":"x \\" y"} xong');

    expect(o?.tieuDe).toBe('a } b');
  });

  it('không có JSON → null; JSON hỏng → null', () => {
    expect(tachJson('không có gì cả')).toBeNull();
    expect(tachJson('{"tieuDe": "A", "mucDo": ')).toBeNull();
  });

  it('schema: 7 khoá bắt buộc, không cho khoá lạ, checklist tối đa 5', () => {
    expect(SUMMARY_JSON_SCHEMA.required).toHaveLength(7);
    expect(SUMMARY_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(SUMMARY_JSON_SCHEMA.properties.checklist.maxItems).toBe(5);
  });
});
