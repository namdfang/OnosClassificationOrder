import { applyOrderLogValuePolicy } from './order-log-value-policy';

/**
 * Giá trị cũ/mới trong nhật ký đơn (`API-1`, AC-17).
 *
 * Hai nhánh của AC: trường NGOÀI danh sách trắng thì bỏ giá trị, trường TRONG
 * danh sách thì trả về nguyên văn (`API-12` đã bỏ bước che theo mẫu).
 *
 * Danh sách trắng vẫn là chốt chặn duy nhất ở đây, nên các ca kiểm nó quan
 * trọng hơn trước: bỏ che nghĩa là không còn lớp thứ hai đỡ phía sau.
 */
describe('applyOrderLogValuePolicy — giá trị cũ/mới của nhật ký đơn', () => {
  it('trường TRONG danh sách trắng: trả về cả before và after', () => {
    expect(applyOrderLogValuePolicy('printStatus', 'pending', 'done')).toEqual({
      before: 'pending',
      after: 'done',
    });
  });

  it('trường NGOÀI danh sách trắng: bỏ giá trị, đánh dấu valueOmitted', () => {
    expect(applyOrderLogValuePolicy('toolResultNote', 'ghi chú cũ', 'ghi chú mới')).toEqual({
      valueOmitted: true,
    });
  });

  it('assignee bị bỏ giá trị — danh tính người làm không bao giờ ra ngoài (AC-16)', () => {
    expect(applyOrderLogValuePolicy('assignee', 'USER001', 'USER002')).toEqual({ valueOmitted: true });
  });

  it('field rỗng (log dạng import ghi nguyên payload): bỏ giá trị', () => {
    expect(applyOrderLogValuePolicy(undefined, undefined, { productionId: 'XQ-1' })).toEqual({
      valueOmitted: true,
    });
  });

  it('giá trị là object hoặc mảng: bỏ, vì không kiểm được nội dung lồng nhau theo tên trường', () => {
    expect(applyOrderLogValuePolicy('priority', null, { a: 1 })).toEqual({ valueOmitted: true });
    expect(applyOrderLogValuePolicy('priority', [1, 2], 3)).toEqual({ valueOmitted: true });
  });

  // `API-12`: hai trường văn bản gõ tay trong danh sách trắng (`cancelReason`,
  // `holdReason`) nay ra NGUYÊN VĂN. Trước đây chúng qua bộ che, và chính điều
  // đó tạo ra bất nhất mà agent không hiểu nổi: nội dung hiện tại của ghi chú
  // thì nguyên văn (`API-11`), còn lịch sử thay đổi của chính nó thì bị che.
  it('API-12: trường văn bản trong danh sách trắng ra NGUYÊN VĂN, không còn che', () => {
    expect(applyOrderLogValuePolicy('cancelReason', '', 'khách đổi ý, mail khach@example.com')).toEqual({
      before: '',
      after: 'khách đổi ý, mail khach@example.com',
    });
    expect(applyOrderLogValuePolicy('holdReason', undefined, 'chờ xác nhận 0912345678')).toEqual({
      after: 'chờ xác nhận 0912345678',
    });
  });

  it('giá trị null và số vẫn đi qua bình thường', () => {
    expect(applyOrderLogValuePolicy('quantity', 10, 12)).toEqual({ before: 10, after: 12 });
    expect(applyOrderLogValuePolicy('factoryId', null, 'FAC001')).toEqual({ before: null, after: 'FAC001' });
  });
});
