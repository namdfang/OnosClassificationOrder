import type { PipelineStage } from 'mongoose';

import { AgentQueryService } from './agent-query.service';
import { AGENT_TABLE_REGISTRY } from './registry';

/**
 * `QA-3` — tổng hợp và nhóm trên trường LỒNG.
 *
 * `variations.retailPrice` nằm trong mảng subdoc, nên nếu `$group` chạy thẳng
 * trên bản ghi thì nó nhận cả mảng: `$sum` ra 0, `$avg` ra null, `$min`/`$max`
 * trả về chính cái mảng, và nhóm theo `variations.sku` gom theo bản ghi. Tất cả
 * đều HTTP 200 — bên gọi không có tín hiệu nào để biết câu trả lời đã sai.
 *
 * Các ca dưới đây soi **pipeline thật sự được gửi xuống mongo**, vì đó là nơi
 * lỗi sống. Kiểm giá trị trả về trên dữ liệu thật là việc của kiểm thử tích hợp.
 */
const captured: PipelineStage[][] = [];
const repository = {
  find: jest.fn(),
  aggregate: jest.fn((args: { pipeline: PipelineStage[] }) => {
    captured.push(args.pipeline);
    return Promise.resolve([]);
  }),
  insertLog: jest.fn(),
  ensureLogTtlIndex: jest.fn(),
};

const service = new AgentQueryService(repository as never, {
  agentApi: { maxLimit: 200, readTimeoutMs: 3000, queryTimeoutMs: 8000 },
} as never);

const products = AGENT_TABLE_REGISTRY.productConfigs;
const orders = AGENT_TABLE_REGISTRY.orders;

const stagesOf = (pipeline: PipelineStage[]): string[] => pipeline.map((stage) => Object.keys(stage)[0]);

beforeEach(() => {
  captured.length = 0;
});

const codeOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
    return 'NO_ERROR';
  } catch (error) {
    return String((error as { response?: { code?: string } })?.response?.code ?? 'UNKNOWN');
  }
};

describe('AC-01: metric trên trường lồng phải trải mảng trước khi nhóm', () => {
  it.each(['sum', 'avg', 'min', 'max'] as const)('%s trên variations.retailPrice có $unwind', async (op) => {
    await service.aggregate(products, {}, { metrics: [{ op, field: 'variations.retailPrice', as: 'v' }] });

    const [pipeline] = captured;
    expect(stagesOf(pipeline)).toEqual(['$match', '$unwind', '$group', '$project', '$limit']);
    expect(pipeline[1]).toEqual({ $unwind: '$variations' });
  });
});

describe('AC-02: nhóm theo trường lồng phải nhóm theo GIÁ TRỊ, không theo bản ghi', () => {
  it('groupBy variations.sku có $unwind trước $group', async () => {
    await service.aggregate(products, {}, { groupBy: ['variations.sku'], metrics: [{ op: 'count', as: 'n' }] });

    const [pipeline] = captured;
    expect(stagesOf(pipeline)).toEqual(['$match', '$unwind', '$group', '$project', '$limit']);
    expect(pipeline[1]).toEqual({ $unwind: '$variations' });
  });

  it('nhóm và metric cùng một mảng chỉ trải MỘT lần', async () => {
    await service.aggregate(
      products,
      {},
      { groupBy: ['variations.sku'], metrics: [{ op: 'sum', field: 'variations.retailPrice', as: 'v' }] },
    );

    expect(stagesOf(captured[0]).filter((stage) => stage === '$unwind')).toEqual(['$unwind']);
  });
});

describe('AC-04: trường phẳng KHÔNG đổi hành vi', () => {
  it('metric trên trường phẳng giữ nguyên pipeline cũ, không có $unwind', async () => {
    await service.aggregate(orders, {}, { metrics: [{ op: 'sum', field: 'quantity', as: 'v' }] });

    expect(stagesOf(captured[0])).toEqual(['$match', '$group', '$project', '$limit']);
  });

  it('groupBy trường phẳng cũng không có $unwind', async () => {
    await service.aggregate(orders, {}, { groupBy: ['type'], metrics: [{ op: 'count', as: 'n' }] });

    expect(stagesOf(captured[0])).toEqual(['$match', '$group', '$project', '$limit']);
  });
});

describe('AC-03: làm đúng phép tổng hợp KHÔNG mở thêm trường nào', () => {
  it('giá vốn vẫn bị từ chối ở metric', async () => {
    expect(
      await codeOf(() =>
        service.aggregate(products, {}, { metrics: [{ op: 'sum', field: 'variations.cost', as: 'v' }] }),
      ),
    ).toBe('FIELD_NOT_ALLOWED');
  });

  it('giá vốn vẫn bị từ chối ở groupBy', async () => {
    expect(
      await codeOf(() =>
        service.aggregate(products, {}, { groupBy: ['variations.cost'], metrics: [{ op: 'count', as: 'n' }] }),
      ),
    ).toBe('FIELD_NOT_ALLOWED');
  });

  it('trường bị từ chối KHÔNG kịp sinh ra $unwind — không lời gọi DB nào', async () => {
    await codeOf(() => service.aggregate(products, {}, { groupBy: ['variations.cost'], metrics: [{ op: 'count', as: 'n' }] }));

    expect(captured).toEqual([]);
  });
});
