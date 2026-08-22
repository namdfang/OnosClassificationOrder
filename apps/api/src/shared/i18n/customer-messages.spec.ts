import { CUSTOMER_MESSAGES, customerMessage } from './customer-messages';
import { isMachineSurfaceUrl, resolveRequestLang, runWithRequestLang } from './request-language';

/**
 * `ORD-29` — thông báo cho khách theo ngôn ngữ họ chọn.
 *
 * Hai ràng buộc CỨNG của yêu cầu nằm hết ở đây, và cả hai đều là loại "hỏng thì
 * không ai báo":
 *   1. Không khai ngôn ngữ → tiếng Việt Y NHƯ HÔM NAY. Sai chỗ này là đổi thứ
 *      mọi khách Việt đang thấy.
 *   2. Public Order API (`/open-api/`) trả nguyên văn tiếng Việt bất kể khách
 *      khai gì. Bên đó là MÁY, chỉ có mỗi chuỗi message để bám vì API chưa trả
 *      mã lỗi — đổi câu là gãy tích hợp mà không ai báo lỗi cho ta.
 */
describe('ORD-29 — chọn ngôn ngữ cho thông báo khách', () => {
  describe('resolveRequestLang', () => {
    it('không khai gì thì tiếng Việt', () => {
      expect(resolveRequestLang(undefined, '/v1/customer/orders')).toBe('vi');
      expect(resolveRequestLang('', '/v1/customer/orders')).toBe('vi');
    });

    it('khai tiếng Anh thì tiếng Anh', () => {
      expect(resolveRequestLang('en', '/v1/customer/orders')).toBe('en');
      expect(resolveRequestLang('en-US,en;q=0.9', '/v1/customer/orders')).toBe('en');
      expect(resolveRequestLang('EN', '/v1/customer/orders')).toBe('en');
    });

    it('thứ tiếng lạ hoặc không hiểu được thì lùi về tiếng Việt, KHÔNG ném lỗi', () => {
      for (const raw of ['fr', 'xx', 'zz-ZZ', 'không-phải-ngôn-ngữ', ' ,,, ']) {
        expect(resolveRequestLang(raw, '/v1/customer/orders')).toBe('vi');
      }
    });

    it('BỀ MẶT MÁY ép tiếng Việt dù khai tiếng Anh — ràng buộc cứng', () => {
      expect(resolveRequestLang('en', '/v1/open-api/orders')).toBe('vi');
      expect(resolveRequestLang('en-US,en;q=0.9', '/api/v1/open-api/orders/push')).toBe('vi');
    });

    it('tiếng Việt khai tường minh vẫn là tiếng Việt', () => {
      expect(resolveRequestLang('vi', '/v1/customer/orders')).toBe('vi');
      expect(resolveRequestLang('vi-VN,vi;q=0.9', '/v1/customer/orders')).toBe('vi');
    });
  });

  describe('giữ nguyên văn câu cho Public Order API', () => {
    /**
     * TEST bắt được ở vòng 1: ép tiếng Việt giữ được NGÔN NGỮ nhưng KHÔNG giữ
     * được CÂU. Hai câu này đi chung `pushToProduction()` với portal, và chính
     * bản tiếng Việt của chúng đã đổi ở ORD-29 (bỏ nửa tiếng Anh chắp vá của
     * ORD-22). Bên tích hợp chỉ có mỗi chuỗi để bám vì API chưa trả mã lỗi.
     */
    const OLD_MOCKUP = 'Sản phẩm "Áo": thiếu ảnh mockup — Product "Áo": mockup image is required';

    it('bề mặt máy nhận ĐÚNG chuỗi như trước ORD-29', () => {
      runWithRequestLang('vi', () => {
        expect(customerMessage('missingMockup', 'Áo')).toBe(OLD_MOCKUP);
      }, true);
    });

    it('máy khai tiếng Anh cũng vẫn nhận chuỗi cũ, không dịch', () => {
      runWithRequestLang('en', () => {
        expect(customerMessage('missingMockup', 'Áo')).toBe(OLD_MOCKUP);
      }, true);
    });

    it('bề mặt NGƯỜI thì một thứ tiếng, không dính chuỗi cũ', () => {
      runWithRequestLang('vi', () => {
        expect(customerMessage('missingMockup', 'Áo')).toBe('Sản phẩm "Áo": thiếu ảnh mockup');
      });
      runWithRequestLang('en', () => {
        expect(customerMessage('missingMockup', 'Áo')).toBe('Product "Áo": mockup image is required');
      });
    });

    /**
     * Ghép ĐÚNG như middleware làm: phân giải ngôn ngữ từ header + URL rồi mới
     * mở ngữ cảnh. Không tự đặt tay tổ hợp (lang='en', máy) vì tổ hợp đó KHÔNG
     * THỂ xảy ra thật — `resolveRequestLang` đã ép `vi` cho mọi URL máy.
     */
    const asRequest = <T>(acceptLanguage: string | undefined, url: string, fn: () => T): T =>
      runWithRequestLang(resolveRequestLang(acceptLanguage, url), fn, isMachineSurfaceUrl(url));

    it('câu KHÔNG khai `machine`: bề mặt máy nhận tiếng Việt dù khai tiếng Anh', () => {
      asRequest('en', '/api/v1/open-api/orders/push', () => {
        expect(customerMessage('orderNotFound')).toBe(CUSTOMER_MESSAGES.orderNotFound.vi);
      });
    });

    it('đi qua đúng đường của middleware: máy khai tiếng Anh vẫn nhận chuỗi cũ', () => {
      asRequest('en-US,en;q=0.9', '/api/v1/open-api/orders/push', () => {
        expect(customerMessage('missingMockup', 'Áo')).toBe(OLD_MOCKUP);
      });
      asRequest('en', '/api/v1/customer/orders', () => {
        expect(customerMessage('missingMockup', 'Áo')).toBe('Product "Áo": mockup image is required');
      });
    });
  });

  describe('customerMessage', () => {
    it('ngoài ngữ cảnh request (cron, consumer) thì tiếng Việt', () => {
      expect(customerMessage('orderNotFound')).toBe(CUSTOMER_MESSAGES.orderNotFound.vi);
    });

    it('trả đúng thứ tiếng của request', () => {
      runWithRequestLang('en', () => {
        expect(customerMessage('orderNotFound')).toBe(CUSTOMER_MESSAGES.orderNotFound.en);
      });
      runWithRequestLang('vi', () => {
        expect(customerMessage('orderNotFound')).toBe(CUSTOMER_MESSAGES.orderNotFound.vi);
      });
    });

    it('câu có tham số ghép đúng ở cả hai thứ tiếng', () => {
      runWithRequestLang('vi', () => {
        expect(customerMessage('designFileTooLarge', 300)).toContain('300 MB');
        expect(customerMessage('missingMockup', 'Áo thử')).toContain('Áo thử');
      });
      runWithRequestLang('en', () => {
        expect(customerMessage('designFileTooLarge', 300)).toContain('300 MB');
        expect(customerMessage('missingMockup', 'Áo thử')).toContain('Áo thử');
      });
    });

    it('MỌI khoá đều có bản tiếng Anh, và không khoá nào lọt ra giao diện', () => {
      for (const [key, entry] of Object.entries(CUSTOMER_MESSAGES)) {
        const fn = entry as unknown as (...a: unknown[]) => { vi: string; en: string };
        const msg = typeof entry === 'function' ? fn('x', 'y') : (entry as { vi: string; en: string });
        expect(msg.vi.trim()).not.toBe('');
        expect(msg.en.trim()).not.toBe('');
        // Câu tiếng Anh không được là bản sao câu tiếng Việt (dấu hiệu quên dịch)
        expect(msg.en).not.toBe(msg.vi);
        // Không câu nào được là chính khoá — người dùng thấy khoá còn tệ hơn
        // thấy một câu tiếng Việt.
        expect(msg.vi).not.toBe(key);
        expect(msg.en).not.toBe(key);
      }
    });
  });
});
