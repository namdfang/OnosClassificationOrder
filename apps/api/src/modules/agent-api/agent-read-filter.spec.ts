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
    await service.readRows('orders', 10, undefined, ['productionId'], JSON.stringify({ field: 'type', op: 'eq', value: 'Hoodie' }));

    expect(calls[0].filter).toEqual({ type: 'Hoodie' });
  });

  it('cây điều kiện and/or vẫn dùng chung bộ dựng của POST /query', async () => {
    await service.readRows(
      'orders',
      10,
      undefined,
      undefined,
      JSON.stringify({ and: [{ field: 'type', op: 'eq', value: 'Hoodie' }, { field: 'quantity', op: 'gte', value: 5 }] }),
    );

    expect(calls[0].filter).toEqual({ $and: [{ type: 'Hoodie' }, { quantity: { $gte: 5 } }] });
  });
});

describe('AC-02: chính sách trường KHÔNG bị nới ở đường mới', () => {
  it('trường văn bản tự do (filter: none) vẫn không lọc được', async () => {
    expect(
      await codeOf(() =>
        service.readRows('orders', 10, undefined, undefined, JSON.stringify({ field: 'note', op: 'eq', value: 'x' })),
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
          JSON.stringify({ field: 'userEmail', op: 'startsWith', value: 'a' }),
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
          JSON.stringify({ field: 'variations.cost', op: 'gt', value: 1 }),
        ),
      ),
    ).toBe('FIELD_NOT_ALLOWED');
  });

  it('không lời gọi DB nào khi điều kiện bị từ chối', async () => {
    await codeOf(() =>
      service.readRows('orders', 10, undefined, undefined, JSON.stringify({ field: 'note', op: 'eq', value: 'x' })),
    );

    expect(calls).toEqual([]);
  });
});

describe('chặn ghi và chạy mã ở đường mới, y như POST /query', () => {
  it.each([
    ['khoá toán tử', JSON.stringify({ $where: '1 == 1' })],
    ['khoá có dấu chấm', JSON.stringify({ 'a.b': 1 })],
    ['JSON hỏng', '{khong-phai-json'],
    ['hình dạng không phải cây điều kiện', JSON.stringify({ bừa: true })],
  ])('%s bị từ chối bằng INVALID_QUERY, không phải 422 của tầng validate', async (_label, raw) => {
    expect(await codeOf(() => service.readRows('orders', 10, undefined, undefined, raw))).toBe('INVALID_QUERY');
  });
});

describe('AC-03: phân trang theo con trỏ vẫn đúng khi có lọc', () => {
  it('điều kiện của bên gọi KHÔNG đè con trỏ — hai vế nằm trong $and', async () => {
    await service.readRows(
      'orders',
      10,
      '000000000000000000000001',
      undefined,
      JSON.stringify({ field: 'type', op: 'eq', value: 'Hoodie' }),
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
      JSON.stringify({ field: '_id', op: 'ne', value: '000000000000000000000009' }),
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
