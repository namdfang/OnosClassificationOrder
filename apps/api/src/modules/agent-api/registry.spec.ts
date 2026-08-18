import { ORDER_LOG_VALUE_WHITELIST } from './order-log-value-policy';
import { AGENT_ALLOWED_TABLE_KEYS, AGENT_DENY_FIELD_NAMES, AGENT_TABLE_REGISTRY } from './registry';

/**
 * Bảy bất biến của danh sách trắng (`API-1`, thiết kế §7.4).
 *
 * Đây là phần THỰC SỰ bảo đảm AC-08/09/10/16, không phải lời hứa trong tài
 * liệu: AC dạng "không bao giờ xuất hiện" không thể chứng minh bằng một bộ test
 * hữu hạn chạy qua API, nên chốt chặn phải nằm ở cấu trúc dữ liệu và được khoá
 * lại ở đây.
 */

/** BR-2 — đúng 11 bảng, khoá cứng để bảng mới không lặng lẽ lọt vào (AC-05). */
const EXPECTED_TABLES = [
  'orders',
  'orderLogs',
  'customers',
  'productConfigs',
  'productCategories',
  'collections',
  'promotions',
  'factories',
  'machineTypes',
  'workshopConfigs',
  'customer_notifications',
];

const allFields = () =>
  Object.values(AGENT_TABLE_REGISTRY).flatMap((spec) =>
    Object.entries(spec.fields).map(([name, policy]) => ({ table: spec.key, name, policy })),
  );

describe('AGENT_TABLE_REGISTRY — bất biến của danh sách trắng', () => {
  it('I2: danh sách bảng khớp CHÍNH XÁC 11 tên của BR-2', () => {
    expect([...AGENT_ALLOWED_TABLE_KEYS].sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  it('I2: khoá của registry trùng với `spec.key` — tên bảng ở API phải là tên collection thật', () => {
    for (const [key, spec] of Object.entries(AGENT_TABLE_REGISTRY)) {
      expect(spec.key).toBe(key);
    }
  });

  it('I1: sortable => read (sắp xếp theo trường không đọc được vẫn lộ quan hệ so sánh)', () => {
    const bad = allFields().filter((f) => f.policy.sortable && !f.policy.read);
    expect(bad.map((f) => `${f.table}.${f.name}`)).toEqual([]);
  });

  it('I1: groupable => read (khoá nhóm hiện nguyên ở kết quả tổng hợp)', () => {
    const bad = allFields().filter((f) => f.policy.groupable && !f.policy.read);
    expect(bad.map((f) => `${f.table}.${f.name}`)).toEqual([]);
  });

  it('I5: aggregatable => read (min của email là rò giá trị)', () => {
    const bad = allFields().filter((f) => f.policy.aggregatable && !f.policy.read);
    expect(bad.map((f) => `${f.table}.${f.name}`)).toEqual([]);
  });

  // `API-11` bỏ che email/điện thoại trong văn bản tự do, nên LÝ DO của bất
  // biến này đã đổi — nhưng bất biến thì GIỮ NGUYÊN, và nay nó nặng hơn trước.
  //
  // Trước: không cho lọc vì che chạy ở đầu ra còn lọc chạy trên giá trị thô,
  // nên lọc được là đọc được bản chưa che.
  // Nay:   không cho lọc vì cho lọc trên văn bản tự do là cho QUÉT TOÀN BỘ dữ
  //        liệu theo một mảnh thông tin liên hệ — dò dần từng ký tự cho tới khi
  //        ra đơn của một người cụ thể. Đọc được nguyên văn một ghi chú đã cầm
  //        trên tay là một chuyện; tìm ra đơn nào chứa một số điện thoại là
  //        chuyện nặng hơn hẳn, và người dùng đã bác việc nới mức lọc ở `API-6`.
  it('I6: văn bản tự do KHÔNG lọc/sắp xếp/nhóm được — cho lọc là cho quét toàn bộ dữ liệu', () => {
    const bad = allFields().filter(
      (f) => f.policy.freeText && (f.policy.filter !== 'none' || f.policy.sortable || f.policy.groupable),
    );
    expect(bad.map((f) => `${f.table}.${f.name}`)).toEqual([]);
  });

  // I6b (QA-1) đã GỠ ở `API-11`: nó chặn `freeText` nằm ở đường dẫn lồng vì
  // `maskRows` chỉ che được trường cấp một. Nay `maskRows` không che nữa nên
  // bất biến đó mất lý do tồn tại. **Nếu sau này có change request khôi phục
  // việc che, phải khôi phục cả I6b** — không thì lỗ hổng cũ quay lại im lặng.

  it('I3: không tên trường bị cấm nào xuất hiện với read:true (lưới an toàn thứ hai)', () => {
    const denied = new Set(AGENT_DENY_FIELD_NAMES);
    const bad = allFields().filter((f) => {
      if (!f.policy.read) return false;
      const leaf = f.name.split('.').at(-1) ?? f.name;
      return denied.has(f.name) || denied.has(leaf);
    });
    expect(bad.map((f) => `${f.table}.${f.name}`)).toEqual([]);
  });

  it('I3: không tên trường bị cấm nào lọt vào registry dù ở dạng chỉ-lọc', () => {
    const denied = new Set(AGENT_DENY_FIELD_NAMES);
    const bad = allFields().filter((f) => {
      const leaf = f.name.split('.').at(-1) ?? f.name;
      return denied.has(f.name) || denied.has(leaf);
    });
    expect(bad.map((f) => `${f.table}.${f.name}`)).toEqual([]);
  });

  it('I4: fields và deliberatelyExcluded không được giao nhau', () => {
    for (const spec of Object.values(AGENT_TABLE_REGISTRY)) {
      const overlap = spec.deliberatelyExcluded.filter((f) => f in spec.fields);
      expect({ table: spec.key, overlap }).toEqual({ table: spec.key, overlap: [] });
    }
  });

  it('mọi bảng có mô tả khác rỗng — AC-02 đòi mô tả loại câu hỏi bảng đó trả lời', () => {
    for (const spec of Object.values(AGENT_TABLE_REGISTRY)) {
      expect(spec.description.length).toBeGreaterThan(20);
    }
  });

  it('API-17: liên hệ khách NAY ĐỌC ĐƯỢC, mức lọc giữ nguyên `eq` (AC-05, AC-07)', () => {
    const contact = [
      ['orders', 'userEmail'],
      ['customers', 'userEmail'],
      ['customers', 'phone'],
    ] as const;
    for (const [table, field] of contact) {
      const p = AGENT_TABLE_REGISTRY[table].fields[field];
      expect({ table, field, ...p }).toMatchObject({
        read: true,
        // `eq` chứ không phải `full`: lọc bằng giá trị đã biết, không dò dần.
        filter: 'eq',
        sortable: false,
        groupable: false,
      });
    }
  });

  it('mã định danh khách VẪN đọc được — agent cần để gọi đúng tên khách (BR-4a §3)', () => {
    expect(AGENT_TABLE_REGISTRY.customers.fields.userSku.read).toBe(true);
    expect(AGENT_TABLE_REGISTRY.customers.fields.fullName.read).toBe(true);
  });

  it('giá niêm yết đọc được, TÁM trường tiền KHÔNG có trong registry (AC-02)', () => {
    const money: [string, string][] = [
      ['productConfigs', 'variations.cost'],
      ['productConfigs', 'variations.nonShipCost'],
      ['productConfigs', 'variations.wholesalePrice'],
      ['productConfigs', 'variations.tiktokPrice'],
      ['productConfigs', 'variations.expUsShipCost'],
      ['productConfigs', 'variations.tiktokShipCost'],
      ['orders', 'baseCost'],
      ['orders', 'shipCost'],
    ];
    expect(AGENT_TABLE_REGISTRY.productConfigs.fields['variations.retailPrice'].read).toBe(true);
    for (const [table, field] of money) {
      expect({ table, field, present: AGENT_TABLE_REGISTRY[table].fields[field] !== undefined }).toEqual({
        table,
        field,
        present: false,
      });
    }
  });

  it('AC-03: BỐN bí mật kỹ thuật KHÔNG có trong registry', () => {
    const secrets: [string, string][] = [
      ['customers', 'password'],
      ['customers', 'passwordSource'],
      ['orderLogs', 'ip'],
      ['orderLogs', 'userAgent'],
    ];
    for (const [table, field] of secrets) {
      expect({ table, field, present: AGENT_TABLE_REGISTRY[table].fields[field] !== undefined }).toEqual({
        table,
        field,
        present: false,
      });
    }
  });

  /**
   * `API-17` — ca quan trọng nhất của task: vế "MỌI THỨ KHÁC ĐỀU MỞ ĐỌC" của
   * AC-03. Bỏ sót một trường giữa ~79 trường chuyển sang danh sách trắng sẽ đi qua
   * MỌI ca khác mà không ai biết — chỉ ca này bắt được.
   */
  it('AC-01/AC-03: ngoài 12 tên bị chặn, KHÔNG trường nào còn bị loại trừ', () => {
    /** Hai ngoại lệ KHÔNG phải "bị chặn", lý do ghi tại chỗ trong registry. */
    const NOT_BLOCKED_BUT_EXCLUDED: Record<string, string[]> = {
      // Ghép lại có kiểm soát ở tầng service qua danh sách trắng tên trường.
      orderLogs: ['before', 'after'],
      // Trường ĐỘNG, không có trên schema — không có gì để phơi.
      customers: ['impersonatedBy'],
    };
    const leftovers = Object.entries(AGENT_TABLE_REGISTRY).flatMap(([table, spec]) =>
      spec.deliberatelyExcluded
        .filter((f) => !(NOT_BLOCKED_BUT_EXCLUDED[table] ?? []).includes(f))
        .filter((f) => !AGENT_DENY_FIELD_NAMES.includes(f.split('.').at(-1) ?? f))
        .map((f) => `${table}.${f}`),
    );
    expect(leftovers).toEqual([]);
  });

  it('AC-05: trường mở đọc theo API-17 KHÔNG kèm quyền lọc/sắp xếp/nhóm', () => {
    const opened: [string, string][] = [
      ['orders', 'shippingAddress'],
      ['orders', 'assignee'],
      ['orders', 'fulfillmentTimeline'],
      ['orders', 'deletedAt'],
      ['orderLogs', 'userName'],
      ['orderLogs', 'impersonatorName'],
      ['customer_notifications', 'createdByName'],
      ['productConfigs', 'itemSpecifics'],
    ];
    for (const [table, field] of opened) {
      const p = AGENT_TABLE_REGISTRY[table].fields[field];
      expect({ table, field, ...p }).toMatchObject({
        read: true,
        filter: 'none',
        sortable: false,
        groupable: false,
      });
      expect(p.aggregatable).toBeUndefined();
    }
  });

  it('AC-06: không mô tả bảng nào còn phủ nhận thứ nay đọc được', () => {
    const LIES = [/KHÔNG chứa địa chỉ giao/i, /KHÔNG trả email/i, /KHÔNG kèm danh tính/i, /KHÔNG kèm tên nhân viên/i];
    for (const [table, spec] of Object.entries(AGENT_TABLE_REGISTRY)) {
      for (const lie of LIES) {
        expect({ table, lie: lie.source, hit: lie.test(spec.description) }).toEqual({
          table,
          lie: lie.source,
          hit: false,
        });
      }
    }
  });
});

describe('ORDER_LOG_VALUE_WHITELIST — nới ở `API-17` bằng cách SUY RA, không chép tay', () => {
  it('I7: khớp CHÍNH XÁC tập tên trường đọc được của `orders`', () => {
    const readable = Object.entries(AGENT_TABLE_REGISTRY.orders.fields)
      .filter(([, p]) => p.read)
      .map(([name]) => name);
    expect([...ORDER_LOG_VALUE_WHITELIST].sort()).toEqual(readable.sort());
  });

  it('I7: không tên nào trong danh sách là trường tiền hay bí mật kỹ thuật', () => {
    for (const name of ORDER_LOG_VALUE_WHITELIST) {
      expect({ name, denied: AGENT_DENY_FIELD_NAMES.includes(name.split('.').at(-1) ?? name) }).toEqual({
        name,
        denied: false,
      });
    }
  });

  it('danh sách không rỗng — suỷ ra từ registry mà ra rỗng nghĩa là đường suy đã hỏng', () => {
    expect(ORDER_LOG_VALUE_WHITELIST.length).toBeGreaterThan(10);
  });
});
