import { interpretVnpLookup } from './purchase-reconcile';

/**
 * Giữ luật ShippingLabelPatterns.md §8 cho cron đối soát record kẹt
 * `purchasing`: 404 = hãng nói không có (kết luận được), 5xx/network = không
 * hỏi được (KHÔNG kết luận), 200 nội dung lạ = không kết luận. Chiều an toàn
 * là chiều không mất dấu tiền — nghi ngờ thì giữ nguyên purchasing.
 */
describe('interpretVnpLookup', () => {
  it('lỗi mạng → unknown (không kết luận, giữ purchasing)', () => {
    expect(interpretVnpLookup('network', undefined).kind).toBe('unknown');
  });

  it('5xx → unknown (VNP sập không có nghĩa là label không tồn tại)', () => {
    expect(interpretVnpLookup(500, { message: 'Internal error' }).kind).toBe('unknown');
    expect(interpretVnpLookup(503, undefined).kind).toBe('unknown');
  });

  it('404 → not_found (hãng nói rõ không có → được phép đánh failed)', () => {
    expect(interpretVnpLookup(404, { message: 'Not Found' }).kind).toBe('not_found');
  });

  it('4xx khác 404 không nói rõ not found → unknown (có thể lỗi request phía mình)', () => {
    expect(interpretVnpLookup(400, { code: 400, message: 'Bad request param' }).kind).toBe('unknown');
    expect(interpretVnpLookup(403, { message: 'Forbidden' }).kind).toBe('unknown');
  });

  it('4xx với message nói rõ not found → not_found', () => {
    expect(interpretVnpLookup(400, { code: 400, message: 'Shipment not found' }).kind).toBe('not_found');
  });

  it('200 format chuẩn có shipment → found + nhặt đủ id/tracking/label', () => {
    const outcome = interpretVnpLookup(200, {
      code: 200,
      result: [
        {
          id: 'uuid-123',
          shipmentResults: { tracking_code: '9400100000000000000000000000001', image_url: 'https://cdn/label.pdf' },
        },
      ],
    });
    expect(outcome).toEqual({
      kind: 'found',
      shipmentId: 'uuid-123',
      trackingCode: '9400100000000000000000000000001',
      labelUrl: 'https://cdn/label.pdf',
    });
  });

  it('200 với code lồng >=400 kiểu VNP → not_found khi nói rõ, unknown khi mù mờ', () => {
    expect(interpretVnpLookup(200, { code: 404, message: 'not found' }).kind).toBe('not_found');
    expect(interpretVnpLookup(200, { code: 500, message: 'carrier timeout' }).kind).toBe('unknown');
  });

  it('200 với result rỗng (format chuẩn {code, result}) → not_found', () => {
    expect(interpretVnpLookup(200, { code: 200, result: [] }).kind).toBe('not_found');
    expect(interpretVnpLookup(200, { code: 200, result: null }).kind).toBe('not_found');
  });

  it('200 nội dung lạ không dò ra gì → unknown ("đổi hợp đồng" — log chứ không đoán)', () => {
    expect(interpretVnpLookup(200, { hello: 'world' }).kind).toBe('unknown');
    expect(interpretVnpLookup(200, undefined).kind).toBe('unknown');
  });
});
