import { AgentQueryService } from './agent-query.service';
import { AGENT_TABLE_REGISTRY } from './registry';

/**
 * `API-8` — bộ dịch cú pháp MongoDB, **kiểm theo hướng đối kháng**.
 *
 * Bài học `QA-2` áp thẳng vào đây: 162 test xanh trong khi trường `code` bị nuốt
 * sạch, vì test dừng ở tầng sai. Nên mỗi ca chặn dưới đây khẳng định **hai**
 * điều, không phải một: có lỗi đúng mã, **và không có lời gọi DB nào xảy ra**.
 *
 * Điều kiện thứ hai mới là điều đáng giá. Một bộ kiểm ném lỗi *sau khi* đã gửi
 * truy vấn đi thì vẫn đủ để test "có lỗi" xanh, mà dữ liệu thì đã rời khỏi máy
 * chủ rồi.
 */
const dbCalls: unknown[] = [];
const repository = {
  find: jest.fn((args: unknown) => {
    dbCalls.push(args);
    return Promise.resolve([]);
  }),
  aggregate: jest.fn((args: unknown) => {
    dbCalls.push(args);
    return Promise.resolve([]);
  }),
  insertLog: jest.fn(),
  ensureLogTtlIndex: jest.fn(),
};

const service = new AgentQueryService(repository as never, {
  agentApi: { maxLimit: 200, readTimeoutMs: 3000, queryTimeoutMs: 8000 },
} as never);

const orders = AGENT_TABLE_REGISTRY.orders;
const products = AGENT_TABLE_REGISTRY.productConfigs;
const customers = AGENT_TABLE_REGISTRY.customers;

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return 'NO_ERROR';
  } catch (error) {
    return String((error as { response?: { code?: string } })?.response?.code ?? 'UNKNOWN');
  }
};

beforeEach(() => {
  dbCalls.length = 0;
});

describe('AC-04 — toán tử chạy biểu thức hoặc mã: chặn, và KHÔNG chạm DB', () => {
  it.each([
    ['$where', { $where: 'this.quantity > 0' }],
    ['$expr', { $expr: { $gt: ['$quantity', 0] } }],
    ['$function', { $function: { body: 'function(){}', args: [], lang: 'js' } }],
    ['$accumulator', { $accumulator: { init: 'function(){}' } }],
    ['$jsonSchema', { $jsonSchema: { required: ['x'] } }],
    ['$text', { $text: { $search: 'abc' } }],
    ['$near (địa lý)', { $near: { $geometry: { type: 'Point', coordinates: [0, 0] } } }],
    ['$geoWithin (địa lý)', { $geoWithin: { $box: [[0, 0], [1, 1]] } }],
    ['$regex ở cấp ngoài', { $regex: '.*' }],
    ['$merge', { $merge: 'other' }],
    ['$out', { $out: 'stolen' }],
  ])('%s bị từ chối', (_label, filter) => {
    expect(codeOf(() => service.buildFilter(orders, filter))).toBe('INVALID_QUERY');
    expect(dbCalls).toEqual([]);
  });

  it.each([
    ['$where ở cấp trường', { quantity: { $where: 'x' } }],
    ['$expr ở cấp trường', { quantity: { $expr: 1 } }],
    ['$regex ở cấp trường', { productionId: { $regex: '^(a+)+$' } }],
    ['$options đi kèm regex', { productionId: { $options: 'i' } }],
    // Dùng trường CÓ trong registry: nếu chọn một trường bị loại trừ thì lớp
    // kiểm trường bắt trước và ca này không còn kiểm được lớp toán tử nữa.
    ['$elemMatch', { type: { $elemMatch: { x: 1 } } }],
  ])('%s bị từ chối', (_label, filter) => {
    expect(codeOf(() => service.buildFilter(orders, filter))).toBe('INVALID_QUERY');
    expect(dbCalls).toEqual([]);
  });

  it('toán tử cấm nằm SÂU trong cây $and vẫn bị bắt', () => {
    expect(
      codeOf(() =>
        service.buildFilter(orders, {
          $and: [{ type: 'Hoodie' }, { $or: [{ quantity: { $gte: 1 } }, { $where: 'x' }] }],
        }),
      ),
    ).toBe('INVALID_QUERY');
    expect(dbCalls).toEqual([]);
  });
});

describe('BR-4 — giá trị chỉ nhận nguyên thuỷ', () => {
  it.each([
    ['object lồng trong giá trị', { type: { hack: 1 } }],
    ['object trong toán tử', { quantity: { $gt: { $where: 'x' } } }],
    ['object trong mảng $in', { type: { $in: [{ $where: 'x' }] } }],
    ['mảng ở dạng rút gọn', { type: ['a', 'b'] }],
  ])('%s bị từ chối', (_label, filter) => {
    expect(codeOf(() => service.buildFilter(orders, filter))).toBe('INVALID_QUERY');
    expect(dbCalls).toEqual([]);
  });
});

describe('AC-05 — chính sách trường: cú pháp đổi, QUYỀN KHÔNG ĐỔI', () => {
  // Ca đắt nhất nếu sai: hai câu chỉ khác nhau MỘT LỚP OBJECT, và một câu phải
  // qua còn câu kia phải chặn.
  it('dạng rút gọn trên trường chỉ-so-bằng ĐƯỢC PHÉP (nó là $eq)', () => {
    expect(service.buildFilter(orders, { userEmail: 'a@b.c' })).toEqual({ userEmail: 'a@b.c' });
  });

  it('$gt trên chính trường đó bị TỪ CHỐI — đó là dò dần giá trị', () => {
    expect(codeOf(() => service.buildFilter(orders, { userEmail: { $gt: 'a' } }))).toBe('FIELD_NOT_ALLOWED');
    expect(dbCalls).toEqual([]);
  });

  it.each([
    ['$ne', { userEmail: { $ne: 'a@b.c' } }],
    ['$in', { userEmail: { $in: ['a@b.c'] } }],
    ['$nin', { userEmail: { $nin: ['a@b.c'] } }],
  ])('%s vẫn được phép trên trường chỉ-so-bằng', (_label, filter) => {
    expect(codeOf(() => service.buildFilter(customers, filter))).toBe('NO_ERROR');
  });

  it.each([
    ['$lt', { userEmail: { $lt: 'z' } }],
    ['$startsWith', { userEmail: { $startsWith: 'a' } }],
  ])('%s bị từ chối trên trường chỉ-so-bằng', (_label, filter) => {
    expect(codeOf(() => service.buildFilter(customers, filter))).toBe('FIELD_NOT_ALLOWED');
  });

  it('văn bản tự do không lọc được, kể cả dạng rút gọn', () => {
    expect(codeOf(() => service.buildFilter(orders, { toolResultNote: 'x' }))).toBe('FIELD_NOT_ALLOWED');
    expect(codeOf(() => service.buildFilter(orders, { toolResultNote: { $eq: 'x' } }))).toBe('FIELD_NOT_ALLOWED');
  });

  it('giá vốn vẫn không lọc được ở mọi dạng', () => {
    for (const filter of [
      { 'variations.cost': 1 },
      { 'variations.cost': { $gt: 1 } },
      { $and: [{ 'variations.cost': { $lt: 99 } }] },
    ]) {
      expect(codeOf(() => service.buildFilter(products, filter))).toBe('FIELD_NOT_ALLOWED');
    }
    expect(dbCalls).toEqual([]);
  });
});

describe('AC-01 — ba dạng đầu vào đều dựng đúng', () => {
  it('rút gọn', () => {
    expect(service.buildFilter(orders, { type: 'Hoodie' })).toEqual({ type: 'Hoodie' });
  });

  it('một toán tử — $eq rút về dạng phẳng cho khớp DSL cũ sinh ra', () => {
    expect(service.buildFilter(orders, { type: { $eq: 'Hoodie' } })).toEqual({ type: 'Hoodie' });
  });

  it('nhiều toán tử trên cùng một trường', () => {
    expect(service.buildFilter(orders, { quantity: { $gte: 1, $lte: 9 } })).toEqual({
      quantity: { $gte: 1, $lte: 9 },
    });
  });

  it('$nor và $not ở cấp ngoài', () => {
    expect(service.buildFilter(orders, { $nor: [{ type: 'Hoodie' }] })).toEqual({ $nor: [{ type: 'Hoodie' }] });
    expect(service.buildFilter(orders, { $not: { type: 'Hoodie' } })).toEqual({ $nor: [{ type: 'Hoodie' }] });
  });

  it('$exists chỉ nhận boolean', () => {
    expect(service.buildFilter(orders, { cancelledAt: { $exists: false } })).toEqual({
      cancelledAt: { $exists: false },
    });
    expect(codeOf(() => service.buildFilter(orders, { cancelledAt: { $exists: 'no' } }))).toBe('INVALID_QUERY');
  });

  it('trường lồng hợp lệ lọc được — dấu chấm không còn là dấu hiệu tấn công', () => {
    expect(service.buildFilter(products, { 'variations.sku': 'H-M' })).toEqual({ 'variations.sku': 'H-M' });
  });
});

describe('AC-08 — cú pháp CŨ bị từ chối kèm chỉ dẫn, không im lặng trả sai', () => {
  it.each([
    ['nút lá cũ', { field: 'type', op: 'eq', value: 'Hoodie' }],
    ['cây and cũ', { and: [{ field: 'type', op: 'eq', value: 'Hoodie' }] }],
    ['cây or cũ', { or: [{ field: 'type', op: 'eq', value: 'Hoodie' }] }],
    ['cây not cũ', { not: { field: 'type', op: 'eq', value: 'Hoodie' } }],
  ])('%s → INVALID_QUERY', (_label, filter) => {
    expect(codeOf(() => service.buildFilter(orders, filter))).toBe('INVALID_QUERY');
    expect(dbCalls).toEqual([]);
  });

  it('thông điệp nói rõ cú pháp cũ không còn được hỗ trợ và chỉ sang dạng mới', () => {
    try {
      service.buildFilter(orders, { field: 'type', op: 'eq', value: 'Hoodie' });
      throw new Error('đáng lẽ phải ném lỗi');
    } catch (error) {
      const message = String((error as { response?: { message?: string } })?.response?.message ?? '');
      expect(message).toContain('no longer supported');
      expect(message).toContain('$eq');
    }
  });
});

describe('AC-09 — $startsWith an toàn, $regex không mở', () => {
  it('server tự escape và tự neo đầu chuỗi', () => {
    expect(service.buildFilter(orders, { productionId: { $startsWith: 'XQ.(1' } })).toEqual({
      productionId: { $regex: '^XQ\\.\\(1' },
    });
  });

  it('mẫu gây nghẽn được escape thành chuỗi thường, không còn là biểu thức', () => {
    const filter = service.buildFilter(orders, { productionId: { $startsWith: '(a+)+$' } }) as {
      productionId: { $regex: string };
    };
    expect(filter.productionId.$regex).toBe('^\\(a\\+\\)\\+\\$');
  });

  it('chuỗi rỗng bị từ chối', () => {
    expect(codeOf(() => service.buildFilter(orders, { productionId: { $startsWith: '' } }))).toBe('INVALID_QUERY');
  });

  it('giá trị không phải chuỗi bị từ chối', () => {
    expect(codeOf(() => service.buildFilter(orders, { productionId: { $startsWith: 5 } }))).toBe('INVALID_QUERY');
  });
});

describe('AC-06 — độ sâu và hình dạng', () => {
  it('cây sâu quá giới hạn bị từ chối, nêu rõ giới hạn', () => {
    let deep: Record<string, unknown> = { type: 'Hoodie' };
    for (let i = 0; i < 8; i += 1) deep = { $and: [deep] };

    expect(codeOf(() => service.buildFilter(orders, deep))).toBe('INVALID_QUERY');
    expect(dbCalls).toEqual([]);
  });

  it('$and rỗng bị từ chối', () => {
    expect(codeOf(() => service.buildFilter(orders, { $and: [] }))).toBe('INVALID_QUERY');
  });

  it('filter rỗng hoặc thiếu là điều kiện rỗng, không phải lỗi', () => {
    expect(service.buildFilter(orders, undefined)).toEqual({});
    expect(service.buildFilter(orders, {})).toEqual({});
  });
});

describe('AC-14 — nhật ký vẫn không chứa giá trị của trường bị che', () => {
  it('giá trị lọc trên trường không đọc được bị lược, tên toán tử thì giữ', () => {
    expect(service.digest(orders, { userEmail: { $in: ['a@b.c', 'c@d.e'] } })).toEqual({
      userEmail: { $in: '<redacted>' },
    });
  });

  it('che cả khi nằm sâu trong cây', () => {
    expect(service.digest(orders, { $and: [{ userEmail: 'a@b.c' }, { quantity: { $gt: 1 } }] })).toEqual({
      $and: [{ userEmail: '<redacted>' }, { quantity: { $gt: 1 } }],
    });
  });
});
