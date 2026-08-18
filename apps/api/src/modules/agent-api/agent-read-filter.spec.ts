import { AgentQueryService } from './agent-query.service';
import { AgentReadService } from './agent-read.service';

/**
 * `API-6` — endpoint đọc bảng lọc được, **dùng lại** cơ chế của `POST /query`.
 *
 * Trọng tâm không phải "lọc có chạy không" mà là **chính sách trường không bị
 * nới ở đường mới**: hai đường lọc với hai bộ luật là cách chắc chắn để một
 * ngày chúng lệch nhau, và đường lỏng hơn sẽ thành lỗ hổng. Người dùng đã bác
 * việc nới mức lọc, nên các ca từ chối dưới đây là phần đáng giá nhất của file.
 */
const calls: { filter: Record<string, unknown> }[] = [];
const repository = {
  find: jest.fn((args: { filter: Record<string, unknown> }) => {
    calls.push({ filter: args.filter });
    return Promise.resolve([]);
  }),
  aggregate: jest.fn(),
  insertLog: jest.fn(),
  ensureLogTtlIndex: jest.fn(),
};

const config = { agentApi: { maxLimit: 200, readTimeoutMs: 3000, queryTimeoutMs: 8000 } };
const queries = new AgentQueryService(repository as never, config as never);
const service = new AgentReadService(queries, repository as never, config as never);

const codeOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
    return 'NO_ERROR';
  } catch (error) {
    return String((error as { response?: { code?: string } })?.response?.code ?? 'UNKNOWN');
  }
};

beforeEach(() => {
  calls.length = 0;
});

describe('AC-01: lọc theo trường có mức lọc đầy đủ', () => {
  it('điều kiện đơn được dựng đúng và gửi xuống DB', async () => {
    await service.readRows('orders', 10, undefined, ['productionId'], JSON.stringify({ type: 'Hoodie' }));

    expect(calls[0].filter).toEqual({ type: 'Hoodie' });
  });

  it('cây điều kiện and/or vẫn dùng chung bộ dựng của POST /query', async () => {
    await service.readRows(
      'orders',
      10,
      undefined,
      undefined,
      JSON.stringify({ $and: [{ type: 'Hoodie' }, { quantity: { $gte: 5 } }] }),
    );

    expect(calls[0].filter).toEqual({ $and: [{ type: 'Hoodie' }, { quantity: { $gte: 5 } }] });
  });
});

describe('AC-02: chính sách trường KHÔNG bị nới ở đường mới', () => {
  it('trường văn bản tự do (filter: none) vẫn không lọc được', async () => {
    expect(
      await codeOf(() =>
        service.readRows('orders', 10, undefined, undefined, JSON.stringify({ note: 'x' })),
      ),
    ).toBe('FIELD_NOT_ALLOWED');
  });

  it('trường liên hệ khách vẫn CHỈ so bằng — toán tử quét bị từ chối', async () => {
    expect(
      await codeOf(() =>
        service.readRows(
          'customers',
          10,
          undefined,
          undefined,
          JSON.stringify({ userEmail: { $startsWith: 'a' } }),
        ),
      ),
    ).toBe('FIELD_NOT_ALLOWED');
  });

  it('trường ngoài danh sách trắng vẫn bị từ chối', async () => {
    expect(
      await codeOf(() =>
        service.readRows(
          'productConfigs',
          10,
          undefined,
          undefined,
          JSON.stringify({ 'variations.cost': { $gt: 1 } }),
        ),
      ),
    ).toBe('FIELD_NOT_ALLOWED');
  });

  it('không lời gọi DB nào khi điều kiện bị từ chối', async () => {
    await codeOf(() =>
      service.readRows('orders', 10, undefined, undefined, JSON.stringify({ note: 'x' })),
    );

    expect(calls).toEqual([]);
  });
});

describe('chặn ghi và chạy mã ở đường mới, y như POST /query', () => {
  it.each([
    ['toán tử chạy mã', JSON.stringify({ $where: '1 == 1' })],
    ['toán tử ngoài danh sách trắng', JSON.stringify({ productionId: { $regex: '.*' } })],
    ['JSON hỏng', '{khong-phai-json'],
    ['cú pháp CŨ', JSON.stringify({ field: 'type', op: 'eq', value: 'Hoodie' })],
  ])('%s bị từ chối bằng INVALID_QUERY, không phải 422 của tầng validate', async (_label, raw) => {
    expect(await codeOf(() => service.readRows('orders', 10, undefined, undefined, raw))).toBe('INVALID_QUERY');
  });

  // `API-8` đổi MÃ LỖI của hai ca này, và mã mới chính xác hơn. Trước đây khoá
  // có dấu chấm bị chặn thẳng vì DSL cũ không có trường lồng nào; nay
  // `variations.sku` là tên trường hợp lệ, nên dấu chấm không còn là dấu hiệu
  // tấn công — `a.b` chỉ đơn giản là một trường KHÔNG TỒN TẠI. Cùng lẽ đó,
  // `{bừa: true}` nay là điều kiện trên một trường không có thật.
  //
  // Cả hai vẫn bị TỪ CHỐI; chỉ có lời giải thích gửi cho bên gọi là đúng hơn.
  it.each([
    ['khoá có dấu chấm không phải trường thật', JSON.stringify({ 'a.b': 1 })],
    ['tên trường không tồn tại', JSON.stringify({ bừa: true })],
  ])('%s bị từ chối bằng FIELD_NOT_ALLOWED', async (_label, raw) => {
    expect(await codeOf(() => service.readRows('orders', 10, undefined, undefined, raw))).toBe(
      'FIELD_NOT_ALLOWED',
    );
  });
});

describe('AC-03: phân trang theo con trỏ vẫn đúng khi có lọc', () => {
  it('điều kiện của bên gọi KHÔNG đè con trỏ — hai vế nằm trong $and', async () => {
    await service.readRows(
      'orders',
      10,
      '000000000000000000000001',
      undefined,
      JSON.stringify({ type: 'Hoodie' }),
    );

    expect(calls[0].filter).toEqual({
      $and: [{ type: 'Hoodie' }, { _id: { $gt: '000000000000000000000001' } }],
    });
  });

  it('điều kiện chạm _id cũng không nuốt mất con trỏ', async () => {
    await service.readRows(
      'orders',
      10,
      '000000000000000000000005',
      undefined,
      JSON.stringify({ _id: { $ne: '000000000000000000000009' } }),
    );

    expect(calls[0].filter).toEqual({
      $and: [{ _id: { $ne: '000000000000000000000009' } }, { _id: { $gt: '000000000000000000000005' } }],
    });
  });

  it('không lọc thì pipeline giữ nguyên hình dạng cũ — chỉ con trỏ', async () => {
    await service.readRows('orders', 10, '000000000000000000000001');

    expect(calls[0].filter).toEqual({ _id: { $gt: '000000000000000000000001' } });
  });

  it('không lọc, không con trỏ → điều kiện rỗng như trước khi có API-6', async () => {
    await service.readRows('orders', 10);

    expect(calls[0].filter).toEqual({});
  });
});
