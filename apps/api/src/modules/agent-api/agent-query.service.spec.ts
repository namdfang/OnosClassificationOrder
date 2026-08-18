import { AgentQueryService } from './agent-query.service';
import { AGENT_TABLE_REGISTRY } from './registry';

/**
 * DSL truy vấn có kiểm soát (`API-1`, AC-06/07/08/09/10/11/16).
 *
 * Đây là ma trận probe 6 hướng ở mức unit: chọn trực tiếp · đổi tên đầu ra ·
 * khoá nhóm · khoá sắp xếp · điều kiện lọc · kết quả tổng hợp. Test qua API
 * thật vẫn cần (TESTER lo), nhưng chốt chặn nằm ở đây.
 */
const service = new AgentQueryService(
  // Không lời gọi nào trong các ca dưới đây chạm tới DB — mọi thứ bị chặn ở
  // tầng kiểm, trước khi có pipeline nào được gửi đi.
  { find: jest.fn(), aggregate: jest.fn(), insertLog: jest.fn(), ensureLogTtlIndex: jest.fn() } as never,
  { agentApi: { maxLimit: 200, readTimeoutMs: 3000, queryTimeoutMs: 8000 } } as never,
);

const orders = AGENT_TABLE_REGISTRY.orders;
const products = AGENT_TABLE_REGISTRY.productConfigs;

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return 'NO_ERROR';
  } catch (error) {
    return String((error as { response?: { code?: string } })?.response?.code ?? 'UNKNOWN');
  }
};

describe('AC-04/05 — bảng ngoài danh sách trắng bị từ chối TƯỜNG MINH', () => {
  it.each(['users', 'userLogs', 'system_configs', 'roles', 'permissions', 'customRoles', 'departments'])(
    'bảng cấm %s → TABLE_NOT_ALLOWED, KHÔNG phải mảng rỗng',
    (table) => {
      expect(codeOf(() => service.spec(table))).toBe('TABLE_NOT_ALLOWED');
    },
  );

  it('bảng không tồn tại nhận CÙNG một lỗi — API không phải công cụ dò collection', () => {
    expect(codeOf(() => service.spec('zz_qa_probe'))).toBe('TABLE_NOT_ALLOWED');
  });
});

describe('AC-06 — chặn ghi và chạy mã tuỳ ý', () => {
  it.each([
    ['$where', { table: 'orders', filter: { $where: '1==1' } }],
    ['$function', { table: 'orders', $function: { body: 'x' } }],
    ['$merge', { table: 'orders', $merge: 'other' }],
    ['$out', { table: 'orders', $out: 'stolen' }],
    ['$accumulator lồng sâu', { table: 'orders', select: { fields: [{ $accumulator: {} }] } }],
    ['khoá chứa dấu chấm', { table: 'orders', 'a.b': 1 }],
  ])('%s → INVALID_QUERY', (_name, payload) => {
    expect(codeOf(() => service.assertNoOperatorKeys(payload))).toBe('INVALID_QUERY');
  });

  it('payload sạch đi qua được', () => {
    expect(codeOf(() => service.assertNoOperatorKeys({ table: 'orders', select: { limit: 10 } }))).toBe(
      'NO_ERROR',
    );
  });
});

describe('AC-09 — giá vốn bị cấm ở CẢ BỐN vị trí (BR-4a §2)', () => {
  const costFields = ['variations.cost', 'variations.nonShipCost', 'variations.wholesalePrice'];

  it.each(costFields)('%s không đọc được', (field) => {
    expect(codeOf(() => service.buildProjection(products, [field]))).toBe('FIELD_NOT_ALLOWED');
  });

  it.each(costFields)('%s không lọc được — cho lọc là dựng sẵn máy đoán nhị phân', (field) => {
    expect(codeOf(() => service.buildFilter(products, { field, op: 'gt', value: 10 }))).toBe(
      'FIELD_NOT_ALLOWED',
    );
  });

  it.each(costFields)('%s không sắp xếp được', (field) => {
    expect(codeOf(() => service.buildSort(products, [{ field, dir: 'desc' }]))).toBe('FIELD_NOT_ALLOWED');
  });

  it('giá niêm yết thì đọc được bình thường', () => {
    expect(service.buildProjection(products, ['variations.retailPrice'])).toEqual({
      'variations.retailPrice': 1,
    });
  });
});

describe('AC-10/11 — liên hệ khách: LỌC được, KHÔNG đọc được', () => {
  it('lọc bằng đúng email tìm ra đơn (AC-11)', () => {
    expect(service.buildFilter(orders, { field: 'userEmail', op: 'eq', value: 'a@b.com' })).toEqual({
      userEmail: 'a@b.com',
    });
  });

  it('xin đọc email → FIELD_NOT_ALLOWED', () => {
    expect(codeOf(() => service.buildProjection(orders, ['userEmail']))).toBe('FIELD_NOT_ALLOWED');
  });

  it('email KHÔNG có trong projection mặc định', () => {
    expect(service.buildProjection(orders).userEmail).toBeUndefined();
  });

  it('startsWith trên email bị chặn — đó là dò dần từng ký tự, không phải tra cứu', () => {
    expect(codeOf(() => service.buildFilter(orders, { field: 'userEmail', op: 'startsWith', value: 'a' }))).toBe(
      'FIELD_NOT_ALLOWED',
    );
  });

  it('sắp xếp theo email bị chặn — thứ tự cũng để lộ quan hệ so sánh', () => {
    expect(codeOf(() => service.buildSort(orders, [{ field: 'userEmail', dir: 'asc' }]))).toBe(
      'FIELD_NOT_ALLOWED',
    );
  });

  it('khối địa chỉ giao KHÔNG lọc được, kể cả từng trường con (BA xác nhận ở design_review)', () => {
    for (const field of ['shippingAddress', 'shippingAddress.country', 'shippingAddress.email']) {
      expect(codeOf(() => service.buildFilter(orders, { field, op: 'eq', value: 'VN' }))).toBe(
        'FIELD_NOT_ALLOWED',
      );
    }
  });
});

describe('AC-16 — danh tính người thao tác không dùng được ở bất kỳ vị trí nào', () => {
  it.each(['assignee', 'designerRejections', 'fulfillmentTimeline'])('orders.%s bị chặn mọi hướng', (field) => {
    expect(codeOf(() => service.buildProjection(orders, [field]))).toBe('FIELD_NOT_ALLOWED');
    expect(codeOf(() => service.buildFilter(orders, { field, op: 'eq', value: 'x' }))).toBe(
      'FIELD_NOT_ALLOWED',
    );
    expect(codeOf(() => service.buildSort(orders, [{ field, dir: 'asc' }]))).toBe('FIELD_NOT_ALLOWED');
  });

  it.each(['userName', 'userEmail', 'ip', 'userAgent', 'impersonatorName'])(
    'orderLogs.%s bị chặn',
    (field) => {
      const logs = AGENT_TABLE_REGISTRY.orderLogs;
      expect(codeOf(() => service.buildProjection(logs, [field]))).toBe('FIELD_NOT_ALLOWED');
    },
  );
});

describe('AC-07 — lọc, sắp xếp, tổng hợp hợp lệ vẫn chạy được', () => {
  it('dựng được điều kiện lồng and/or', () => {
    const filter = service.buildFilter(orders, {
      and: [
        { field: 'userSku', op: 'eq', value: 'ABC' },
        { or: [{ field: 'designerStatus', op: 'eq', value: 'done' }, { field: 'quantity', op: 'gte', value: 5 }] },
      ],
    });
    expect(filter).toEqual({
      $and: [{ userSku: 'ABC' }, { $or: [{ designerStatus: 'done' }, { quantity: { $gte: 5 } }] }],
    });
  });

  it('chuỗi ISO trên trường ngày được đổi thành Date, không so sánh chuỗi', () => {
    const filter = service.buildFilter(orders, {
      field: 'inProductionAt',
      op: 'between',
      value: ['2026-08-01', '2026-08-18'],
    }) as { inProductionAt: { $gte: unknown; $lte: unknown } };
    expect(filter.inProductionAt.$gte).toBeInstanceOf(Date);
    expect(filter.inProductionAt.$lte).toBeInstanceOf(Date);
  });

  it('ngày sai định dạng bị từ chối thay vì lọc ra kết quả rỗng âm thầm', () => {
    expect(
      codeOf(() => service.buildFilter(orders, { field: 'inProductionAt', op: 'gt', value: 'hôm qua' })),
    ).toBe('INVALID_QUERY');
  });

  it('startsWith escape ký tự đặc biệt — giá trị không trở thành cú pháp regex', () => {
    const filter = service.buildFilter(orders, {
      field: 'productionId',
      op: 'startsWith',
      value: 'XQ.(1',
    }) as { productionId: { $regex: string } };
    expect(filter.productionId.$regex).toBe('^XQ\\.\\(1');
  });
});

describe('AC-03 — trần lô', () => {
  it('không truyền limit → mặc định 50', () => {
    expect(service.clampLimit(undefined)).toBe(50);
  });

  it('limit cực lớn bị KẸP xuống trần, không báo lỗi', () => {
    expect(service.clampLimit(100_000)).toBe(200);
  });

  it('limit hợp lệ giữ nguyên', () => {
    expect(service.clampLimit(25)).toBe(25);
  });
});

describe('AC-14 — nhật ký không chứa dữ liệu bị che', () => {
  it('giá trị lọc trên trường không đọc được bị thay bằng <redacted>', () => {
    expect(service.digest(orders, { field: 'userEmail', op: 'eq', value: 'khach@example.com' })).toEqual({
      field: 'userEmail',
      op: 'eq',
      value: '<redacted>',
    });
  });

  it('giá trị lọc trên trường đọc được vẫn ghi nguyên — nó không thuộc nhóm bị che', () => {
    expect(service.digest(orders, { field: 'userSku', op: 'eq', value: 'ABC' })).toEqual({
      field: 'userSku',
      op: 'eq',
      value: 'ABC',
    });
  });

  it('che cả khi email nằm sâu trong cây điều kiện', () => {
    expect(
      service.digest(orders, {
        and: [
          { field: 'userEmail', op: 'eq', value: 'khach@example.com' },
          { field: 'quantity', op: 'gt', value: 1 },
        ],
      }),
    ).toEqual({
      and: [
        { field: 'userEmail', op: 'eq', value: '<redacted>' },
        { field: 'quantity', op: 'gt', value: 1 },
      ],
    });
  });
});

describe('văn bản tự do: ĐỌC được nguyên văn nhưng KHÔNG lọc được (API-11)', () => {
  it('ghi chú có trong projection mặc định', () => {
    expect(service.buildProjection(orders).toolResultNote).toBe(1);
  });

  // Ranh giới của `API-11`: bỏ che là cho ĐỌC, không phải cho TÌM. Cho lọc trên
  // văn bản tự do là cho quét toàn bộ dữ liệu theo một mảnh thông tin liên hệ —
  // dò dần từng ký tự cho tới khi ra đơn của một người cụ thể. Người dùng đã bác
  // việc nới mức lọc ở `API-6`, và bỏ che KHÔNG kéo theo điều đó.
  it('lọc trên ghi chú vẫn bị chặn — cho lọc là cho quét dữ liệu theo thông tin liên hệ', () => {
    expect(
      codeOf(() => service.buildFilter(orders, { field: 'toolResultNote', op: 'startsWith', value: 'a' })),
    ).toBe('FIELD_NOT_ALLOWED');
  });

  it('nhóm theo ghi chú bị chặn', () => {
    expect(codeOf(() => service.buildSort(orders, [{ field: 'holdReason', dir: 'asc' }]))).toBe(
      'FIELD_NOT_ALLOWED',
    );
  });

  it('API-11: ghi chú trả về NGUYÊN VĂN, không còn che email/điện thoại', () => {
    const raw = 'liên hệ khach@example.com hoặc 0912345678';
    const [row] = service.maskRows(orders, [{ toolResultNote: raw }]);

    expect(row.toolResultNote).toBe(raw);
  });
});
