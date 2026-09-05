import {
  buildCarrierPatch,
  classifyTrackingStatus,
  extractStatusText,
  hasCarrierError,
  hasCarrierSignal,
  isCancelledStatusText,
} from './carrier-status';

/**
 * Response LỖI THẬT từ VNP khi cạn quota USPS Web Tools (gặp trên staging
 * 2026-09-05) — code 200 nhưng error lồng trong result, `error.status: 500`
 * từng bị digString nhặt nhầm làm text tracking → set scannedAt oan.
 */
const QUOTA_ERROR_RESPONSE = {
  code: 200,
  message: 'success!',
  request_id: '',
  totalRecords: 0,
  result: {
    error: {
      name: 'SYSTEM:SERVICE_PROVIDER_ERROR',
      message: 'Can not track shipment: Exceeded quota limit.',
      status: 500,
      log_id: 44972589,
    },
  },
  extra: null,
};

/**
 * Giữ luật tách trạng thái HÃNG khỏi trạng thái MUA (ShippingLabelPatterns.md
 * §3): scannedAt set đúng 1 lần và chỉ khi có tín hiệu thật; "no tracking
 * information" không phải tín hiệu; note của hãng được nhặt cho ops.
 */
describe('classifyTrackingStatus', () => {
  it('text rỗng / thiếu → undefined', () => {
    expect(classifyTrackingStatus(undefined)).toBeUndefined();
    expect(classifyTrackingStatus('  ')).toBeUndefined();
  });

  it('"no tracking information" là KHÔNG có tín hiệu, không phải in_transit', () => {
    expect(classifyTrackingStatus('No tracking information available')).toBeUndefined();
  });

  it('delivered nhận diện được, còn lại coi là in_transit (conservative)', () => {
    expect(classifyTrackingStatus('Delivered, Front Door')).toBe('delivered');
    expect(classifyTrackingStatus('In Transit to Next Facility')).toBe('in_transit');
    expect(classifyTrackingStatus('Arrived at USPS Facility')).toBe('in_transit');
  });
});

describe('response lỗi của hãng — không được đọc gì làm trạng thái', () => {
  it('hasCarrierError nhận diện error lồng sâu (code ngoài vẫn 200)', () => {
    expect(hasCarrierError(QUOTA_ERROR_RESPONSE)).toBe(true);
    expect(hasCarrierError({ code: 200, result: [{ status: 'In Transit' }] })).toBe(false);
  });

  it('extractStatusText KHÔNG nhặt số (error.status:500) và KHÔNG mò vào nhánh error', () => {
    expect(extractStatusText(QUOTA_ERROR_RESPONSE)).toBeUndefined();
    expect(extractStatusText({ result: { status: 42 } })).toBeUndefined();
    expect(extractStatusText({ result: { status: 'Delivered' } })).toBe('Delivered');
  });

  it('hasCarrierSignal = false với response lỗi quota (không phải "đã quét")', () => {
    expect(hasCarrierSignal(QUOTA_ERROR_RESPONSE)).toBe(false);
  });

  it('buildCarrierPatch với response lỗi → chỉ ghi mốc sync, KHÔNG scannedAt/status/event', () => {
    const now = new Date('2026-09-05T10:00:00Z');
    const patch = buildCarrierPatch(
      { lastTrackingStatus: undefined, scannedAt: undefined, status: 'created' },
      QUOTA_ERROR_RESPONSE,
      now,
    );
    expect(patch.changed).toBe(false);
    expect(patch.set).toEqual({ lastTrackingAt: now });
  });
});

describe('hasCarrierSignal — chốt ① của luồng hủy fail-closed (§4)', () => {
  it('có text trạng thái thật → true (đã quét → từ chối hủy)', () => {
    expect(hasCarrierSignal({ status: 'Accepted at USPS Origin Facility' })).toBe(true);
  });

  it('"no tracking information" / body không có status → false (chưa quét, hủy được)', () => {
    expect(hasCarrierSignal({ code: 400, message: 'No tracking information found' })).toBe(false);
    expect(hasCarrierSignal({ status: 'No tracking information available' })).toBe(false);
    expect(hasCarrierSignal(undefined)).toBe(false);
  });
});

describe('isCancelledStatusText — cron dọn record kẹt cancelling chốt sổ', () => {
  it('text xác nhận hủy → true', () => {
    expect(isCancelledStatusText('Shipment cancelled')).toBe(true);
    expect(isCancelledStatusText('Label voided')).toBe(true);
  });

  it('text khác / rỗng → false (không đoán bừa label đã chết)', () => {
    expect(isCancelledStatusText('In Transit')).toBe(false);
    expect(isCancelledStatusText(undefined)).toBe(false);
    expect(isCancelledStatusText('')).toBe(false);
  });
});

describe('buildCarrierPatch', () => {
  const now = new Date('2026-09-05T10:00:00Z');
  const base = { lastTrackingStatus: undefined, scannedAt: undefined, status: 'created' };

  it('tín hiệu đầu tiên → set scannedAt + lastTrackingStatus + đổi phase, changed=true', () => {
    const patch = buildCarrierPatch(base, { status: 'Accepted at USPS Origin Facility' }, now);
    expect(patch.changed).toBe(true);
    expect(patch.set).toMatchObject({
      lastTrackingAt: now,
      lastTrackingStatus: 'Accepted at USPS Origin Facility',
      status: 'in_transit',
      scannedAt: now,
    });
  });

  it('scannedAt KHÔNG set lại khi đã có (luật set-1-lần)', () => {
    const scanned = new Date('2026-09-01T00:00:00Z');
    const patch = buildCarrierPatch(
      { lastTrackingStatus: 'Accepted', scannedAt: scanned, status: 'in_transit' },
      { status: 'In Transit' },
      now,
    );
    expect(patch.set.scannedAt).toBeUndefined();
  });

  it('"no tracking information" → chỉ cập nhật mốc sync, KHÔNG scannedAt, KHÔNG đổi status', () => {
    const patch = buildCarrierPatch(base, { code: 400, status: 'No tracking information found' }, now);
    expect(patch.set.scannedAt).toBeUndefined();
    expect(patch.set.status).toBeUndefined();
  });

  it('response không có status text → chỉ lastTrackingAt (publicTrack 400 body {code,message})', () => {
    const patch = buildCarrierPatch(base, { code: 400, message: 'No tracking information...' }, now);
    expect(patch.changed).toBe(false);
    expect(patch.set).toEqual({ lastTrackingAt: now });
  });

  it('text không đổi so với lần trước → changed=false (không ghi event trùng)', () => {
    const patch = buildCarrierPatch(
      { lastTrackingStatus: 'In Transit', scannedAt: now, status: 'in_transit' },
      { status: 'In Transit' },
      now,
    );
    expect(patch.changed).toBe(false);
    expect(patch.set.status).toBeUndefined();
  });

  it('note/reason từ hãng được nhặt vào carrierNote cho ops', () => {
    const patch = buildCarrierPatch(base, { status: 'Alert', reason: 'Addressee unknown' }, now);
    expect(patch.set.carrierNote).toBe('Addressee unknown');
  });

  it('delivered → đề xuất status delivered', () => {
    const patch = buildCarrierPatch(
      { lastTrackingStatus: 'In Transit', scannedAt: now, status: 'in_transit' },
      { status: 'Delivered, In/At Mailbox' },
      now,
    );
    expect(patch.set.status).toBe('delivered');
    expect(patch.changed).toBe(true);
  });
});
