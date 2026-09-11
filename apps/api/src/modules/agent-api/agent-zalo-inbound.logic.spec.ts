import { ZaloGroupKind } from 'shared';

import { chuKyKhop, lyDoKichHoat, nhomDuocNghe, suyVai, VAI } from './agent-zalo-inbound.logic';

/**
 * Hai thứ được canh ở đây. Một: nội dung nhóm khách hàng KHÔNG được rời hệ thống.
 * Hai: agent không bị đánh thức trên mọi tin — hệ cũ đã trả giá 18–28 triệu
 * token/ngày để biết điều đó.
 */
describe('nhomDuocNghe — nhóm nào được đẩy tin ra ngoài', () => {
  it('CHỈ nhóm nội bộ và nhóm vận hành', () => {
    expect(nhomDuocNghe(ZaloGroupKind.Internal)).toBe(true);
    expect(nhomDuocNghe(ZaloGroupKind.Operation)).toBe(true);
  });

  it('CẤM nhóm khách và nhóm chưa phân loại — engine đẩy hết, chốt nằm ở đây', () => {
    expect(nhomDuocNghe(ZaloGroupKind.Seller)).toBe(false);
    expect(nhomDuocNghe(ZaloGroupKind.Unreviewed)).toBe(false);
    expect(nhomDuocNghe(undefined)).toBe(false);
  });
});

describe('suyVai', () => {
  const kinds = new Map([
    ['u-staff', 'staff'],
    ['u-ai', 'ai-support'],
    ['u-khach', 'customer'],
  ]);

  it('Chủ tịch xét TRƯỚC bảng danh tính', () => {
    // Ông nhắn từ Zalo cá nhân nên rất dễ đang nằm ở `customer`/`unknown`.
    const kindsSai = new Map([['u-ct', 'customer']]);
    expect(suyVai('u-ct', 'u-ct', kindsSai)).toBe(VAI.chairman);
  });

  it('giữ riêng ai-support để agent không đối thoại với chính nó', () => {
    expect(suyVai('u-ai', 'u-ct', kinds)).toBe(VAI.aiSupport);
    expect(suyVai('u-staff', 'u-ct', kinds)).toBe(VAI.staff);
    expect(suyVai('u-khach', 'u-ct', kinds)).toBe(VAI.customer);
  });

  it('chưa phân loại thì nói thẳng là chưa biết', () => {
    expect(suyVai('u-la', 'u-ct', kinds)).toBe(VAI.unknown);
    expect(suyVai(undefined, 'u-ct', kinds)).toBe(VAI.unknown);
  });
});

describe('lyDoKichHoat — chỗ cắt 1.888 tin/ngày xuống 165', () => {
  const nick = new Set(['nick-ai', 'nick-sup']);

  it('Chủ tịch nói là nổ', () => {
    expect(lyDoKichHoat({ senderUid: 'u-ct' }, 'u-ct', nick)).toBe('chairman');
  });

  it('tag trúng nick công ty là nổ', () => {
    expect(lyDoKichHoat({ senderUid: 'x', mentions: [{ uid: 'nick-sup' }] }, 'u-ct', nick)).toBe('mention');
  });

  it('tag người ngoài thì KHÔNG — đây là chỗ 736/ngày rút còn 10/ngày', () => {
    expect(lyDoKichHoat({ senderUid: 'x', mentions: [{ uid: 'nguoi-la' }] }, 'u-ct', nick)).toBeNull();
  });

  it('tin thường không đánh thức ai', () => {
    expect(lyDoKichHoat({ senderUid: 'x' }, 'u-ct', nick)).toBeNull();
    expect(lyDoKichHoat({ senderUid: 'x', mentions: [] }, 'u-ct', nick)).toBeNull();
  });

  it('chưa khai uid Chủ tịch thì nhánh đó im, KHÔNG nổ bừa', () => {
    expect(lyDoKichHoat({ senderUid: 'u-ct' }, undefined, nick)).toBeNull();
  });
});

describe('chuKyKhop', () => {
  it('khớp đúng, lệch là trượt', () => {
    expect(chuKyKhop('abc123', 'abc123')).toBe(true);
    expect(chuKyKhop('abc124', 'abc123')).toBe(false);
    expect(chuKyKhop(undefined, 'abc123')).toBe(false);
    expect(chuKyKhop('abc', 'abc123')).toBe(false);
  });
});
