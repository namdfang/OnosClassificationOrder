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

  it('thông tin liên hệ khách: lọc được bằng đúng giá trị, KHÔNG đọc được (BR-5, AC-11)', () => {
    const contact = [
      ['orders', 'userEmail'],
      ['customers', 'userEmail'],
      ['customers', 'phone'],
    ] as const;
    for (const [table, field] of contact) {
      const p = AGENT_TABLE_REGISTRY[table].fields[field];
      expect({ table, field, ...p }).toMatchObject({
        read: false,
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

  it('giá niêm yết đọc được, mọi trường giá khác của biến thể KHÔNG có trong registry (AC-09)', () => {
    const fields = AGENT_TABLE_REGISTRY.productConfigs.fields;
    expect(fields['variations.retailPrice'].read).toBe(true);
    for (const banned of [
      'variations.cost',
      'variations.nonShipCost',
      'variations.wholesalePrice',
      'variations.tiktokPrice',
      'variations.expUsShipCost',
      'variations.tiktokShipCost',
    ]) {
      expect(fields[banned]).toBeUndefined();
    }
  });

  it('orders: khối địa chỉ, tiền và danh tính người thao tác đều KHÔNG có trong registry', () => {
    const fields = AGENT_TABLE_REGISTRY.orders.fields;
    for (const banned of [
      'shippingAddress',
      'baseCost',
      'shipCost',
      'assignee',
      'designerRejections',
      'fulfillmentTimeline',
      'fulfillmentStages',
    ]) {
      expect(fields[banned]).toBeUndefined();
    }
  });

  it('orderLogs: 8 trường danh tính đều KHÔNG có trong registry (AC-16)', () => {
    const fields = AGENT_TABLE_REGISTRY.orderLogs.fields;
    for (const banned of [
      'userId',
      'userName',
      'userEmail',
      'roleCode',
      'impersonatorId',
      'impersonatorName',
      'ip',
      'userAgent',
    ]) {
      expect(fields[banned]).toBeUndefined();
    }
    // Phần còn giữ lại và đủ dùng theo BR-4a §4
    for (const kept of ['orderId', 'action', 'field', 'createdAt']) {
      expect(fields[kept].read).toBe(true);
    }
  });

  it('customer_notifications: danh tính nhân viên gửi bị che (AC-16, BA bổ sung 2026-08-18)', () => {
    const fields = AGENT_TABLE_REGISTRY.customer_notifications.fields;
    expect(fields.createdByUserId).toBeUndefined();
    expect(fields.createdByName).toBeUndefined();
    expect(fields.title.read).toBe(true);
    expect(fields.body.read).toBe(true);
  });
});

describe('ORDER_LOG_VALUE_WHITELIST — danh sách BA chốt ở BR-4a §5a', () => {
  it('I7: khớp CHÍNH XÁC 17 tên trường BA chốt, không thêm không bớt', () => {
    expect([...ORDER_LOG_VALUE_WHITELIST]).toEqual([
      'printStatus',
      'toolResult',
      'errorFile',
      'fabricType',
      'machineNumber',
      'productionError',
      'productionErrorSource',
      'priority',
      'type',
      'color',
      'size',
      'quantity',
      'factoryId',
      'cancelledAt',
      'cancelReason',
      'heldAt',
      'holdReason',
    ]);
    expect(ORDER_LOG_VALUE_WHITELIST).toHaveLength(17);
  });

  it('không tên nào trong danh sách là id người dùng', () => {
    const names = ORDER_LOG_VALUE_WHITELIST as readonly string[];
    expect(names).not.toContain('assignee');
    expect(names).not.toContain('userId');
  });
});
