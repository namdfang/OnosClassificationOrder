import { PublicTrackService } from './public-track.service';

/**
 * Tra cứu đơn CÔNG KHAI (`GET /public/track/:code`).
 *
 * Endpoint này không có ai để xác thực: cửa vào là chính mã đơn. Hai thứ phải
 * đứng vững, và cả hai đều dễ vỡ trong im lặng khi ai đó thêm field cho tiện:
 *
 *  1. **Không rò dữ liệu nội bộ.** Giá, tên nhân viên, nguyên văn ghi chú giữ
 *     đơn, xưởng, địa chỉ ship đầy đủ — không thứ nào được lọt ra. Bộ ca này
 *     soi TOÀN BỘ payload (đệ quy) chứ không chỉ vài field, nên field mới rò rỉ
 *     sẽ bị bắt ngay cả khi test không nhắc tên nó. File thiết kế là ngoại lệ
 *     CÓ CHỦ ĐÍCH (người cầm mã đơn cần đối chiếu file đang vào sản xuất) —
 *     xem `PublicOrderTrackZod`.
 *  2. **Không thành máy dò mã đơn.** Mã sai định dạng, mã không tồn tại đều
 *     phải ném cùng một 404, và mã sai định dạng thì không được chạm DB.
 */
interface TrackSurface {
  getTrack(code: string): Promise<{ data: Record<string, unknown> }>;
  [k: string]: unknown;
}

const ORDER = {
  productionId: 'RA-05217-56631',
  externalId: '576461234567890123',
  orderId: 'ONOS-99',
  type: 'CAMO SHIRT',
  color: 'Black',
  size: 'L',
  quantity: 2,
  mockupUrl: 'https://cdn.example/mockup.png',
  printMethod: 'DTG',
  orderAt: new Date('2026-08-20T03:00:00.000Z'),
  inProductionAt: new Date('2026-08-21T03:00:00.000Z'),
  currentFulfillmentStage: 'print',
  heldAt: new Date('2026-08-22T03:00:00.000Z'),
  holdReason: 'Đợi khách sửa design',
  shippingAddress: {
    firstName: 'Chí',
    lastName: 'Nguyễn',
    phone: '0900000000',
    email: 'buyer@example.com',
    address1: '12 Đông Văn',
    city: 'Miami',
    state: 'FL',
    country: 'US',
  },
  productConfigId: 'PC1',
  // Link Drive dạng `open?id=…` — dạng phổ biến nhất khách dán vào, và là dạng
  // KHÔNG đặt thẳng vào `<img>` được (trang tra cứu tự đổi sang link thumbnail).
  designs: {
    front: 'https://drive.google.com/open?id=1A-b-d-Gjrz_KF-gp3SfGym1fmoUKqacF&usp=drive_copy',
    // Vị trí KHÔNG có trong `printArea` của sản phẩm — vẫn phải hiện.
    hood: 'https://drive.google.com/file/d/1zzz-hood-file-id-000000/view',
  },
  // Những field này CÓ trên document thật nhưng không được ra ngoài.
  factoryId: 'F-TNW',
  assignee: 'U-designer-1',
  productionErrorNote: 'Lỗi canh file, designer làm lại',
  baseCost: 12.5,
};

const STAGING = {
  _id: 'S1',
  orderId: 'ONOS-99',
  identifier: 'A',
  orderName: 'August drop',
  pushedAt: new Date('2026-08-21T03:00:00.000Z'),
  createdAt: new Date('2026-08-20T03:00:00.000Z'),
  status: 'pending',
  shippingAddress: ORDER.shippingAddress,
  items: [
    {
      productionId: 'RA-05217-56631',
      sku: 'CAMO-BLK-L',
      merchantSku: 'MY-SKU-1',
      type: 'CAMO SHIRT',
      quantity: 2,
      tracking: { number: '1Z999', carrier: 'UPS', url: 'https://ups.com/1Z999', labelUrl: 'https://label.pdf' },
      priceSnapshot: { unitPrice: 19.9, lineTotal: 39.8, shipMethod: 'cod' },
    },
    { productionId: 'RA-05217-56632', type: 'HOODIE', quantity: 1 },
  ],
};

/** Model giả: `findOne(...).select(...).lean()` trả về `doc`. */
const findOneChain = (doc: unknown) => ({ select: () => ({ lean: () => Promise.resolve(doc) }) });

const buildService = (opts: { order?: unknown; staging?: unknown; printArea?: unknown } = {}) => {
  const queries: unknown[] = [];
  const svc = Object.create(PublicTrackService.prototype) as TrackSurface;

  svc.orderModel = {
    findOne: (filter: unknown) => {
      queries.push(filter);
      return findOneChain(opts.order ?? null);
    },
    find: () => ({ select: () => ({ lean: () => Promise.resolve([]) }) }),
  };
  svc.customerOrderModel = {
    findOne: (filter: unknown) => {
      queries.push(filter);
      return findOneChain(opts.staging ?? null);
    },
  };
  svc.productConfigModel = {
    findById: () => ({
      select: () => ({
        lean: () =>
          Promise.resolve(
            opts.printArea === null
              ? null
              : {
                  printArea: opts.printArea ?? [
                    { key: 'front', widthPx: 4000, heightPx: 5000, isRequired: true },
                    { key: 'back', isRequired: false },
                  ],
                },
          ),
      }),
    }),
  };
  svc.systemConfigService = { get: () => Promise.resolve(14) };
  svc.orderService = {
    getLifecycleTrack: () =>
      Promise.resolve({
        success: true,
        data: {
          productionId: ORDER.productionId,
          // `getLifecycleTrack` trả kèm `userSku` — nhánh public phải bỏ qua.
          userSku: 'TIKTOKSHOPUS',
          stages: [
            { key: 'tool-check', label: 'Soát tool', status: 'done', at: new Date('2026-08-21T03:00:00.000Z') },
            { key: 'print', label: 'In', status: 'current', at: new Date('2026-08-22T03:00:00.000Z') },
          ],
        },
      }),
  };

  return { svc, queries };
};

/** Gom mọi chuỗi trong payload (mọi độ sâu) để soi rò rỉ theo GIÁ TRỊ. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

/** Gom mọi tên field trong payload (mọi độ sâu) để soi rò rỉ theo TÊN. */
function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allKeys(v, out);
    }
  }
  return out;
}

describe('tra cứu đơn công khai — dữ liệu trả ra', () => {
  it('trả đúng mã sản xuất + mã sàn (thứ người tra cần nhất)', async () => {
    const { svc } = buildService({ order: ORDER, staging: STAGING });
    const { data } = await svc.getTrack('ra-05217-56631'); // gõ thường vẫn ra đơn

    expect(data.productionId).toBe('RA-05217-56631');
    expect(data.externalId).toBe('576461234567890123');
    expect(data.orderId).toBe('ONOS-99');
    expect(data.identifier).toBe('A');
    expect(data.pushed).toBe(true);
  });

  it('KHÔNG rò giá, tên nhân viên, ghi chú lỗi nội bộ hay địa chỉ đầy đủ', async () => {
    const { svc } = buildService({ order: ORDER, staging: STAGING });
    const { data } = await svc.getTrack('RA-05217-56631');

    const strings = allStrings(data).join('|');
    for (const leak of [
      'U-designer-1', // nhân sự
      'F-TNW', // xưởng
      'Lỗi canh file', // ghi chú lỗi nội bộ
      'Đợi khách sửa design', // nguyên văn lý do giữ (chỉ được ra dạng holdKind)
      '12 Đông Văn', // địa chỉ đường
      '0900000000', // số điện thoại người nhận
      'buyer@example.com', // email người nhận
      'label.pdf', // file nhãn in được
    ]) {
      expect(strings).not.toContain(leak);
    }

    const keys = allKeys(data);
    for (const key of ['priceSnapshot', 'holdReason', 'assignee', 'factoryId', 'baseCost', 'userSku']) {
      expect(keys).not.toContain(key);
    }

    // Lý do giữ chỉ ra ngoài dưới dạng nhóm an toàn.
    expect(data.onHold).toBe(true);
    expect(data.holdKind).toBe('waiting-design');
    // Điểm đến rút gọn tới mức thành phố — đủ để khách nhận ra đơn của mình.
    expect(data.destination).toEqual({ city: 'Miami', state: 'FL', country: 'US' });
  });

  it('vận đơn chỉ gồm số/hãng/link tra, không kèm file nhãn', async () => {
    const { svc } = buildService({ order: ORDER, staging: STAGING });
    const { data } = await svc.getTrack('RA-05217-56631');

    expect(data.tracking).toEqual({ number: '1Z999', carrier: 'UPS', url: 'https://ups.com/1Z999' });
  });

  it('liệt kê item còn lại cùng đơn, mỗi item 1 mã tra tiếp', async () => {
    const { svc } = buildService({ order: ORDER, staging: STAGING });
    const { data } = await svc.getTrack('RA-05217-56631');

    const siblings = data.siblings as Array<{ productionId: string }>;
    expect(siblings).toHaveLength(1);
    expect(siblings[0].productionId).toBe('RA-05217-56632');
  });

  it('vị trí in: theo thứ tự sản phẩm khai, nhãn đã resolve, URL giữ NGUYÊN dạng gốc', async () => {
    const { svc } = buildService({ order: ORDER, staging: STAGING });
    const { data } = await svc.getTrack('RA-05217-56631');

    const designs = data.designs as Array<{ key: string; label: string; url?: string; isRequired?: boolean }>;
    // front + back (sản phẩm khai) rồi mới tới hood (đơn có file, sản phẩm không khai).
    expect(designs.map((d) => d.key)).toEqual(['front', 'back', 'hood']);
    expect(designs[0].label).toBe('Mặt trước');
    expect(designs[2].label).toBe('Mũ trùm');
    // KHÔNG tự đổi link ở máy chủ: trang tra cứu đổi sang thumbnail bằng
    // `driveThumbUrl`, dựng thêm một bản đổi link ở đây là mở đường cho hai bản
    // trôi khỏi nhau.
    expect(designs[0].url).toBe('https://drive.google.com/open?id=1A-b-d-Gjrz_KF-gp3SfGym1fmoUKqacF&usp=drive_copy');
    // Vị trí sản phẩm có khai mà đơn chưa nộp file → vẫn liệt kê, url trống.
    expect(designs[1].url).toBeUndefined();
    expect(designs[1].isRequired).toBe(false);
  });

  it('sản phẩm chưa cấu hình vị trí in → vẫn liệt kê đủ file đơn đang có', async () => {
    const { svc } = buildService({ order: ORDER, staging: STAGING, printArea: [] });
    const { data } = await svc.getTrack('RA-05217-56631');

    const designs = data.designs as Array<{ key: string; url?: string }>;
    // Giấu file đang thực sự đi vào sản xuất là làm người tra đối chiếu thiếu.
    expect(designs.map((d) => d.key).sort()).toEqual(['front', 'hood']);
    expect(designs.every((d) => !!d.url)).toBe(true);
  });

  it('đơn CHƯA đẩy sản xuất — trạng thái pending, không bịa ra chặng nào', async () => {
    const { svc } = buildService({ staging: STAGING });
    const { data } = await svc.getTrack('RA-05217-56631');

    expect(data.pushed).toBe(false);
    expect(data.status).toBe('pending');
    expect(data.stages).toEqual([]);
    // Vẫn nhận ra được đơn: mã đã cấp từ lúc tạo, không đợi tới lúc đẩy.
    expect(data.productionId).toBe('RA-05217-56631');
  });
});

describe('tra cứu đơn công khai — chống dò mã', () => {
  it('mã sai định dạng bị chặn ngay, KHÔNG chạm DB', async () => {
    const { svc, queries } = buildService({ order: ORDER });
    await expect(svc.getTrack('../../etc/passwd')).rejects.toThrow();
    await expect(svc.getTrack('')).rejects.toThrow();
    await expect(svc.getTrack('RA 05217')).rejects.toThrow();
    expect(queries).toHaveLength(0);
  });

  it('mã không tồn tại và mã sai định dạng ném CÙNG một thông báo', async () => {
    const { svc } = buildService();
    const missing = await svc.getTrack('RA-00000-00000').catch((e: Error) => e.message);
    const malformed = await svc.getTrack('!!!').catch((e: Error) => e.message);

    // Khác thông báo là đủ để dò ra mã nào có thật.
    expect(missing).toBe(malformed);
  });
});
