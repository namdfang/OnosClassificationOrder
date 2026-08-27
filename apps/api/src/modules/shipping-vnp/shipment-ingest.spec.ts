import type { ExternalTrackingInput } from './shipment-ingest.service';
import { ShipmentIngestService } from './shipment-ingest.service';

/**
 * `ORD-26` — vận đơn khách tự cấp (CSV khách / CSV admin / Public Order API)
 * phải nằm trong ĐÚNG bảng vận đơn, và phải chịu được việc import lại.
 *
 * Hai luật dễ mất nhất khi ai đó sửa sau này:
 *  1. Import lại cùng file KHÔNG được đẻ record `shipments` thứ hai cho cùng
 *     một số tracking — nếu không, mỗi lần khách sửa file rồi tải lại là lịch
 *     sử vận đơn phình thêm một bản trùng, và trang tra theo tracking trả về
 *     nhiều kiện cho một cái label.
 *  2. Nhiều item cùng một số tracking là CÙNG một kiện vật lý → 1 pack, không
 *     phải mỗi item một pack (label dán lên kiện, không dán lên item).
 */
interface Doc extends Record<string, unknown> {
  _id: string;
}

interface IngestSurface {
  packageModel: { create: (doc: Record<string, unknown>) => Promise<Doc>; updateOne: unknown };
  shipmentModel: unknown;
  logger: unknown;
  recordExternalTracking(entries: ExternalTrackingInput[]): Promise<number>;
}

const buildService = (existingShipments: Doc[] = []) => {
  const packages: Doc[] = [];
  const shipments: Doc[] = [...existingShipments];
  const packageUpdates: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const shipmentUpdates: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }> = [];

  // Khai theo HÌNH DẠNG (không intersect với class) để khỏi đụng `private`.
  const svc = Object.create(ShipmentIngestService.prototype) as IngestSurface;
  svc.packageModel = {
    create: (doc: Record<string, unknown>) => {
      const created = { _id: `P${packages.length + 1}`, ...doc } as Doc;
      packages.push(created);
      return Promise.resolve(created);
    },
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      packageUpdates.push({ filter, update });
      return Promise.resolve({ modifiedCount: 1 });
    },
  };
  svc.shipmentModel = {
    create: (doc: Record<string, unknown>) => {
      const created = { _id: `S${shipments.length + 1}`, ...doc } as Doc;
      shipments.push(created);
      return Promise.resolve(created);
    },
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      shipmentUpdates.push({ filter, update });
      return Promise.resolve({ modifiedCount: 1 });
    },
    findOne: (filter: Record<string, unknown>) => ({
      lean: () =>
        Promise.resolve(
          shipments.find((s) => !filter.trackingCode || s.trackingCode === filter.trackingCode) ?? null,
        ),
    }),
  };
  svc.logger = { info: () => undefined, error: () => undefined };
  return { svc, packages, shipments, packageUpdates, shipmentUpdates };
};

const entry = (productionId: string, trackingNumber: string, sellerOrderId = 'SO-1') => ({
  orderId: `oid-${productionId}`,
  productionId,
  sellerOrderId,
  tracking: { number: trackingNumber, carrier: 'USPS', labelUrl: 'https://label/1.pdf' },
});

describe('ORD-26 — nhận vận đơn khách tự cấp vào module vận đơn', () => {
  it('ghi 1 kiện + 1 record shipment provider `customer`', async () => {
    const { svc, packages, shipments } = buildService();
    const created = await svc.recordExternalTracking([entry('AA-00001-00001', '9400111')]);

    expect(created).toBe(1);
    expect(packages).toHaveLength(1);
    expect(shipments).toHaveLength(1);
    // Provider là thứ phân biệt label khách mang tới với label hệ thống mua —
    // ghi nhầm 'vnp-eglobal' là bảo hệ thống rằng nó có quyền hủy label đó.
    expect(shipments[0].provider).toBe('customer');
    expect(shipments[0].trackingCode).toBe('9400111');
    expect(shipments[0].carrier).toBe('USPS');
    expect(packages[0].productionIds).toEqual(['AA-00001-00001']);
  });

  it('nhiều item cùng số tracking = 1 kiện, không phải mỗi item 1 kiện', async () => {
    const { svc, packages, shipments } = buildService();
    await svc.recordExternalTracking([entry('AA-00001-00001', '9400111'), entry('AA-00001-00002', '9400111')]);

    expect(packages).toHaveLength(1);
    expect(shipments).toHaveLength(1);
    expect(packages[0].productionIds).toEqual(['AA-00001-00001', 'AA-00001-00002']);
  });

  it('import lại cùng vận đơn KHÔNG đẻ record thứ hai, chỉ gộp item vào kiện cũ', async () => {
    const { svc, shipments, packageUpdates } = buildService([
      { _id: 'S1', packageId: 'P1', provider: 'customer', trackingCode: '9400111' },
    ]);
    const created = await svc.recordExternalTracking([entry('AA-00001-00003', '9400111')]);

    expect(created).toBe(0);
    expect(shipments).toHaveLength(1);
    expect(packageUpdates).toHaveLength(1);
    expect(packageUpdates[0].filter._id).toBe('P1');
    const addToSet = packageUpdates[0].update.$addToSet as { productionIds: { $each: string[] } };
    expect(addToSet.productionIds.$each).toEqual(['AA-00001-00003']);
  });

  it('đơn không có tracking lẫn label thì bỏ qua — không đẻ kiện rỗng', async () => {
    const { svc, packages, shipments } = buildService();
    const created = await svc.recordExternalTracking([
      { orderId: 'oid-1', productionId: 'AA-00001-00004', tracking: { carrier: 'USPS' } },
    ]);

    expect(created).toBe(0);
    expect(packages).toHaveLength(0);
    expect(shipments).toHaveLength(0);
  });

  it('lỗi ghi vận đơn KHÔNG được ném ngược ra luồng lên đơn', async () => {
    const { svc } = buildService();
    svc.packageModel.create = () => Promise.reject(new Error('mongo down'));

    await expect(svc.recordExternalTracking([entry('AA-00001-00005', '9400999')])).resolves.toBe(0);
  });
});
