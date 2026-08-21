import { BadRequestException } from '@nestjs/common';
import { PRODUCT_PRINT_AREA_LABEL_MAP } from 'shared';

import { CustomerOrderService } from './customer-order.service';

/**
 * `ORD-22` — máy chủ phải đòi mockup + design ở mọi vị trí in BẮT BUỘC.
 *
 * Giao diện `new.tsx` đã chặn, nhưng giao diện không phải hàng rào: chỉ cần một
 * lần sửa điều kiện chặn ở đó là đơn rỗng lọt vào, đi tiếp sang sản xuất, và
 * tới tận xưởng mới lộ ra là không có gì để in.
 *
 * Luật phải TRÙNG với giao diện: `isRequired !== false`. Hai bên lệch nhau còn
 * tệ hơn không kiểm — khách bị chặn ở một nơi và lọt ở nơi khác.
 */
interface ArtworkSurface {
  assertArtworkComplete(
    items: Array<Record<string, unknown>>,
    quotes: Array<{ productConfigId?: string; type?: string }>,
    ctx: { byId: Map<string, { printArea?: Array<{ key: string; isRequired?: boolean }> }> },
  ): void;
}

const CONFIG_ID = 'cfg-1';
const svc = Object.create(CustomerOrderService.prototype) as ArtworkSurface;

const ctxWith = (printArea?: Array<{ key: string; isRequired?: boolean }>) => ({
  byId: new Map([[CONFIG_ID, { printArea }]]),
});

const place = (item: Record<string, unknown>, printArea?: Array<{ key: string; isRequired?: boolean }>) =>
  svc.assertArtworkComplete([item], [{ productConfigId: CONFIG_ID, type: 'Áo thử' }], ctxWith(printArea));

const FRONT_REQUIRED = [{ key: 'front' }];
const GOOD_DESIGNS = { front: 'https://cdn.example/a.png' };
const MOCKUP = 'https://cdn.example/m.png';

describe('ORD-22 — máy chủ kiểm mockup + design khi đặt đơn trực tiếp', () => {
  it('từ chối khi thiếu mockup, nêu rõ thiếu mockup', () => {
    expect(() => place({ designs: GOOD_DESIGNS }, FRONT_REQUIRED)).toThrow(/mockup/i);
  });

  it('từ chối khi thiếu design ở vị trí bắt buộc, nêu ĐÚNG TÊN vị trí', () => {
    expect(() => place({ mockupUrl: MOCKUP }, FRONT_REQUIRED)).toThrow(PRODUCT_PRINT_AREA_LABEL_MAP.front);
  });

  it('thông báo có CẢ tiếng Việt lẫn tiếng Anh', () => {
    expect(() => place({ designs: GOOD_DESIGNS }, FRONT_REQUIRED)).toThrow(/thiếu ảnh mockup/);
    expect(() => place({ designs: GOOD_DESIGNS }, FRONT_REQUIRED)).toThrow(/mockup image is required/);
    expect(() => place({ mockupUrl: MOCKUP }, FRONT_REQUIRED)).toThrow(/thiếu file design/);
    expect(() => place({ mockupUrl: MOCKUP }, FRONT_REQUIRED)).toThrow(/design file missing/);
  });

  it('nhận khi đủ mockup + đủ design', () => {
    expect(() => place({ mockupUrl: MOCKUP, designs: GOOD_DESIGNS }, FRONT_REQUIRED)).not.toThrow();
  });

  it('vị trí KHÔNG bắt buộc để trống thì vẫn nhận', () => {
    expect(() =>
      place({ mockupUrl: MOCKUP }, [{ key: 'front', isRequired: false }, { key: 'back', isRequired: false }]),
    ).not.toThrow();
  });

  it('vị trí không set cờ coi như BẮT BUỘC — trùng luật `isRequired !== false` của giao diện', () => {
    expect(() => place({ mockupUrl: MOCKUP }, [{ key: 'back' }])).toThrow(/design/i);
  });

  it('sản phẩm chưa cấu hình vị trí in nào thì chỉ cần mockup', () => {
    expect(() => place({ mockupUrl: MOCKUP }, [])).not.toThrow();
    expect(() => place({ mockupUrl: MOCKUP }, undefined)).not.toThrow();
  });

  it('chuỗi toàn khoảng trắng KHÔNG tính là có file', () => {
    expect(() => place({ mockupUrl: '   ', designs: GOOD_DESIGNS }, FRONT_REQUIRED)).toThrow(/mockup/i);
    expect(() => place({ mockupUrl: MOCKUP, designs: { front: '  ' } }, FRONT_REQUIRED)).toThrow(/design/i);
  });

  it('kiểm TỪNG item — item thứ hai thiếu thì cả đơn bị từ chối', () => {
    const ctx = ctxWith(FRONT_REQUIRED);
    const quotes = [
      { productConfigId: CONFIG_ID, type: 'Áo thử' },
      { productConfigId: CONFIG_ID, type: 'Áo thử 2' },
    ];
    expect(() =>
      svc.assertArtworkComplete(
        [{ mockupUrl: MOCKUP, designs: GOOD_DESIGNS }, { mockupUrl: MOCKUP }],
        quotes,
        ctx,
      ),
    ).toThrow(/Áo thử 2/);
  });

  it('gộp mọi vị trí còn thiếu vào một thông báo', () => {
    expect(() => place({ mockupUrl: MOCKUP }, [{ key: 'front' }, { key: 'back' }])).toThrow(
      new RegExp(`${PRODUCT_PRINT_AREA_LABEL_MAP.front}.*${PRODUCT_PRINT_AREA_LABEL_MAP.back}`),
    );
  });
});


/**
 * `ORD-25` — cùng hàm này là CỬA CUỐI ở bước đẩy sản xuất. Ở đó nó được gọi
 * trong `try/catch` để một đơn hỏng chỉ hỏng riêng nó, lô vẫn đẩy tiếp. Hai
 * điều dưới đây là mắt xích của cơ chế đó, dễ vỡ mà không ai để ý.
 */
describe('ORD-25 — giao kèo để bước đẩy sản xuất bắt được lỗi theo TỪNG đơn', () => {
  it('ném BadRequestException — push bắt bằng `instanceof` để lấy đúng lý do', () => {
    let caught: unknown;
    try {
      place({ mockupUrl: MOCKUP }, FRONT_REQUIRED);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    // Đổi sang Error trần thì push rơi vào nhánh dự phòng và khách mất thông
    // tin vị trí in nào còn thiếu.
    expect((caught as BadRequestException).message).toContain(PRODUCT_PRINT_AREA_LABEL_MAP.front);
  });

  it('nhận item dạng STAGING (không có trường bắt buộc của form) — một luật, một hàm', () => {
    // Item staging mang thêm productionId/priceSnapshot và `type` là optional.
    const stagingItem = {
      productionId: 'AB-12345-67890',
      type: 'Áo thử',
      quantity: 1,
      mockupUrl: MOCKUP,
      designs: GOOD_DESIGNS,
      priceSnapshot: { lineTotal: 10 },
    };
    expect(() =>
      svc.assertArtworkComplete([stagingItem], [{ productConfigId: CONFIG_ID, type: 'Áo thử' }], ctxWith(FRONT_REQUIRED)),
    ).not.toThrow();
  });
});
