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

describe('AC-02 — TÁM trường tiền bị cấm ở CẢ BỐN vị trí', () => {
  // `API-17` dàn đủ tám tên BA chốt đích danh, thay vì ba tên mẫu như trước.
  // `tiktokShipCost` là tên thứ tám, BA bổ sung ở note #41.
  const costFields = [
    'variations.cost',
    'variations.nonShipCost',
    'variations.wholesalePrice',
    'variations.tiktokPrice',
    'variations.expUsShipCost',
    'variations.tiktokShipCost',
  ];

  it.each(costFields)('%s không đọc được', (field) => {
    expect(codeOf(() => service.buildProjection(products, [field]))).toBe('FIELD_NOT_ALLOWED');
  });

  it.each(costFields)('%s không lọc được — cho lọc là dựng sẵn máy đoán nhị phân', (field) => {
    expect(codeOf(() => service.buildFilter(products, { [field]: { $gt: 10 } }))).toBe(
      'FIELD_NOT_ALLOWED',
    );
  });

  it.each(costFields)('%s không sắp xếp được', (field) => {
    expect(codeOf(() => service.buildSort(products, [{ field, dir: 'desc' }]))).toBe('FIELD_NOT_ALLOWED');
  });

  it.each(['baseCost', 'shipCost'])('orders.%s bị cấm ở cả ba vị trí', (field) => {
    expect(codeOf(() => service.buildProjection(orders, [field]))).toBe('FIELD_NOT_ALLOWED');
    expect(codeOf(() => service.buildFilter(orders, { [field]: { $gt: 10 } }))).toBe('FIELD_NOT_ALLOWED');
    expect(codeOf(() => service.buildSort(orders, [{ field, dir: 'desc' }]))).toBe('FIELD_NOT_ALLOWED');
  });

  it('tám tên tiền cũng không tổng hợp được — vị trí thứ tư', () => {
    expect(codeOf(() => service.buildProjection(products, ['variations.tiktokShipCost']))).toBe(
      'FIELD_NOT_ALLOWED',
    );
    expect(codeOf(() => service.buildFilter(orders, { shipCost: 1 }))).toBe('FIELD_NOT_ALLOWED');
  });

  it('giá niêm yết thì đọc được bình thường', () => {
    expect(service.buildProjection(products, ['variations.retailPrice'])).toEqual({
      'variations.retailPrice': 1,
    });
  });
});

describe('AC-07/AC-11 (API-17) — liên hệ khách: ĐỌC được, lọc bằng đúng giá trị', () => {
  it('lọc bằng đúng email tìm ra đơn', () => {
    expect(service.buildFilter(orders, { userEmail: 'a@b.com' })).toEqual({
      userEmail: 'a@b.com',
    });
  });

  it('AC-07: xin đọc email — NAY ĐƯỢC', () => {
    expect(service.buildProjection(orders, ['userEmail']).userEmail).toBe(1);
  });

  it('AC-07: email CÓ trong projection mặc định', () => {
    expect(service.buildProjection(orders).userEmail).toBe(1);
  });

  it('AC-05: startsWith trên email VẪN bị chặn — đó là dò dần từng ký tự, mở ĐỌC không kéo theo mở LỌC', () => {
    expect(codeOf(() => service.buildFilter(orders, { userEmail: { $startsWith: 'a' } }))).toBe(
      'FIELD_NOT_ALLOWED',
    );
  });

  it('AC-05: sắp xếp theo email VẪN bị chặn — thứ tự cũng để lộ quan hệ so sánh', () => {
    expect(codeOf(() => service.buildSort(orders, [{ field: 'userEmail', dir: 'asc' }]))).toBe(
      'FIELD_NOT_ALLOWED',
    );
  });

  it('AC-05: khối địa chỉ giao ĐỌC được nhưng VẪN không lọc được', () => {
    expect(service.buildProjection(orders, ['shippingAddress']).shippingAddress).toBe(1);
    for (const field of ['shippingAddress', 'shippingAddress.country', 'shippingAddress.email']) {
      expect(codeOf(() => service.buildFilter(orders, { [field]: 'VN' }))).toBe(
        'FIELD_NOT_ALLOWED',
      );
    }
  });
});

describe('AC-01/AC-05 (API-17) — danh tính người thao tác: ĐỌC được, không lọc/sắp xếp được', () => {
  it.each(['assignee', 'designerRejections', 'fulfillmentTimeline'])('orders.%s', (field) => {
    expect(service.buildProjection(orders, [field])[field]).toBe(1);
    expect(codeOf(() => service.buildFilter(orders, { [field]: 'x' }))).toBe(
      'FIELD_NOT_ALLOWED',
    );
    expect(codeOf(() => service.buildSort(orders, [{ field, dir: 'asc' }]))).toBe('FIELD_NOT_ALLOWED');
  });

  it.each(['userName', 'userEmail', 'impersonatorName'])('orderLogs.%s đọc được', (field) => {
    const logs = AGENT_TABLE_REGISTRY.orderLogs;
    expect(service.buildProjection(logs, [field])[field]).toBe(1);
  });

  it.each(['ip', 'userAgent'])('AC-03: orderLogs.%s VẪN bị chặn — bí mật kỹ thuật', (field) => {
    const logs = AGENT_TABLE_REGISTRY.orderLogs;
    expect(codeOf(() => service.buildProjection(logs, [field]))).toBe('FIELD_NOT_ALLOWED');
    expect(codeOf(() => service.buildFilter(logs, { [field]: 'x' }))).toBe('FIELD_NOT_ALLOWED');
  });
});

describe('AC-07 — lọc, sắp xếp, tổng hợp hợp lệ vẫn chạy được', () => {
  it('dựng được điều kiện lồng and/or', () => {
    const filter = service.buildFilter(orders, {
      $and: [{ userSku: 'ABC' }, { $or: [{ designerStatus: 'done' }, { quantity: { $gte: 5 } }] }],
    });
    expect(filter).toEqual({
      $and: [{ userSku: 'ABC' }, { $or: [{ designerStatus: 'done' }, { quantity: { $gte: 5 } }] }],
    });
  });

  it('chuỗi ISO trên trường ngày được đổi thành Date, không so sánh chuỗi', () => {
    // `API-8` bỏ `between` vì MongoDB không có nó. Khoảng giá trị nay viết bằng
    // hai toán tử trên cùng một trường — mất cú pháp, KHÔNG mất năng lực.
    const filter = service.buildFilter(orders, {
      inProductionAt: { $gte: '2026-08-01', $lte: '2026-08-18' },
    }) as { inProductionAt: { $gte: unknown; $lte: unknown } };
    expect(filter.inProductionAt.$gte).toBeInstanceOf(Date);
    expect(filter.inProductionAt.$lte).toBeInstanceOf(Date);
  });

  it('ngày sai định dạng bị từ chối thay vì lọc ra kết quả rỗng âm thầm', () => {
    expect(
      codeOf(() => service.buildFilter(orders, { inProductionAt: { $gt: 'hôm qua' } })),
    ).toBe('INVALID_QUERY');
  });

  it('startsWith escape ký tự đặc biệt — giá trị không trở thành cú pháp regex', () => {
    const filter = service.buildFilter(orders, {
      productionId: { $startsWith: 'XQ.(1' },
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

describe('AC-14 sau `API-17` — nhật ký gọi API', () => {
  it('giá trị lọc trên email nay ghi nguyên văn — email đã là dữ liệu đọc được', () => {
    expect(service.digest(orders, { userEmail: 'khach@example.com' })).toEqual({
      userEmail: 'khach@example.com',
    });
  });

  it('giá trị lọc trên trường đọc được vẫn ghi nguyên', () => {
    expect(service.digest(orders, { userSku: 'ABC' })).toEqual({ userSku: 'ABC' });
  });

  it('cây điều kiện lồng nhau giữ nguyên hình dạng', () => {
    expect(
      service.digest(orders, {
        $and: [{ userEmail: 'khach@example.com' }, { quantity: { $gt: 1 } }],
      }),
    ).toEqual({
      $and: [{ userEmail: 'khach@example.com' }, { quantity: { $gt: 1 } }],
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
      codeOf(() => service.buildFilter(orders, { toolResultNote: { $startsWith: 'a' } })),
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
