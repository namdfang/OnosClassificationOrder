import { AGENT_API_RATE_LIMIT_PER_MIN, AGENT_API_RATE_LIMIT_TTL_MS } from './agent-api.constants';
import { AgentApiController } from './agent-api.controller';

/**
 * `API-4` — hạn mức phải có đúng MỘT nguồn.
 *
 * Test đọc metadata mà `@Throttle` gắn lên từng handler, nên nó bắt được cả
 * trường hợp ai đó thêm endpoint mới rồi chép lại con số thay vì dùng hằng số
 * — đúng cách con số 60 đã kịp nhân thành năm bản trước khi có task này.
 *
 * `@nestjs/throttler` gắn metadata theo khoá `'THROTTLER:LIMIT' + <tên
 * throttler>` (xem `throttler.decorator.js` → `setThrottlerMetadata`), nên
 * throttler `default` cho khoá `'THROTTLER:LIMITdefault'`. Đó là chi tiết nội
 * bộ của thư viện: nếu bản mới đổi, các case dưới đây đỏ chứ không im lặng đi
 * qua — một test không đọc được gì mà vẫn xanh thì chỉ còn là trang trí.
 */
const LIMIT_KEY = 'THROTTLER:LIMITdefault';
const TTL_KEY = 'THROTTLER:TTLdefault';
const HANDLERS = ['listTables', 'readRows', 'query', 'listDocs', 'getDoc'] as const;

describe('hạn mức Agent API', () => {
  it('hạn mức là 600 lời gọi/phút (API-9 nâng từ 60)', () => {
    expect(AGENT_API_RATE_LIMIT_PER_MIN).toBe(600);
    expect(AGENT_API_RATE_LIMIT_TTL_MS).toBe(60_000);
  });

  it('mọi endpoint agent throttle bằng ĐÚNG hằng số, không phải số chép tay', () => {
    const prototype = AgentApiController.prototype as unknown as Record<string, () => unknown>;

    const actual = HANDLERS.map((name) => {
      const handler = prototype[name];
      expect(handler).toBeDefined();
      return {
        name,
        limit: Reflect.getMetadata(LIMIT_KEY, handler) as unknown,
        ttl: Reflect.getMetadata(TTL_KEY, handler) as unknown,
      };
    });

    expect(actual).toEqual(
      HANDLERS.map((name) => ({
        name,
        limit: AGENT_API_RATE_LIMIT_PER_MIN,
        ttl: AGENT_API_RATE_LIMIT_TTL_MS,
      })),
    );
  });
});
