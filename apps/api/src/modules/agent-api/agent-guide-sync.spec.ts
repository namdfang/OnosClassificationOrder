import fs from 'fs';
import path from 'path';
import { AGENT_CAPABILITY_SUMMARY, AGENT_ERROR_CODES, AGENT_ERROR_HTTP, AGENT_ERROR_MEANING } from 'shared';

import { docNotFound, docsUnavailable, fieldNotAllowed, invalidQuery, queryTimeout, tableNotAllowed, writeNotSupported } from './agent-errors';
import { AGENT_SWAGGER_DESCRIPTION } from './agent-swagger-guide';

/**
 * Giữ hướng dẫn ở BA NƠI không lệch nhau (`API-16`, AC-03).
 *
 * Ba nơi đó là: trang quản trị `/adm/settings/agent-api` (chuẩn, theo yêu cầu
 * người dùng), trang tài liệu `/documentation`, và hằng số khai báo ở
 * `packages/shared`. Cách đúng nhất là cả ba cùng đọc một nguồn, nhưng đổi trang
 * quản trị nằm ngoài phạm vi task (§4 change note) — nên trong lúc chờ, test này
 * là thứ giữ chúng khớp. Đây chính là đường lui mà AC-03 cho phép.
 *
 * VÌ SAO TEST BACKEND LẠI ĐỌC FILE CỦA FRONTEND — đừng xoá vì tưởng là nhầm:
 * repo chỉ `apps/api` có Jest, `apps/web` không có bộ chạy test nào. Muốn có một
 * chỗ tự động đối chiếu hai app thì đây là chỗ duy nhất đặt được. Test **chỉ
 * đọc**, không sửa gì bên `apps/web`.
 *
 * Không phải lo xa: khi viết bảng `AGENT_ERROR_HTTP` lần đầu, tôi đoán sai ba
 * trên tám dòng. Ba bản chép mà không có gì đối chiếu thì sai kiểu đó sống rất
 * lâu, và nó chỉ lộ ra khi có người thật đọc tài liệu rồi làm theo.
 */

const webI18nDir = path.resolve(__dirname, '../../../../web/src/i18n/locales');

const readLocale = (locale: string): Record<string, Record<string, string>> =>
  JSON.parse(fs.readFileSync(path.join(webI18nDir, locale, 'agentApi.json'), 'utf8'));

describe('API-16 — hướng dẫn Agent API không lệch giữa trang quản trị và Swagger', () => {
  it('file i18n của trang quản trị phải tìm thấy — đường dẫn tương đối hỏng là test đỏ, không phải test bị bỏ qua', () => {
    expect(fs.existsSync(path.join(webI18nDir, 'vi', 'agentApi.json'))).toBe(true);
    expect(fs.existsSync(path.join(webI18nDir, 'en', 'agentApi.json'))).toBe(true);
  });

  describe('nhãn năng lực', () => {
    const vi = readLocale('vi');

    it.each(Object.keys(AGENT_CAPABILITY_SUMMARY))('%s khớp từng ký tự với trang quản trị', (key) => {
      expect(vi.capabilities[key]).toBe(AGENT_CAPABILITY_SUMMARY[key as keyof typeof AGENT_CAPABILITY_SUMMARY]);
    });

    it('không thừa không thiếu năng lực nào so với trang', () => {
      expect(Object.keys(vi.capabilities).sort()).toEqual(Object.keys(AGENT_CAPABILITY_SUMMARY).sort());
    });

    it('bản dịch tiếng Anh có đúng bộ khoá — chuỗi khác nhau là đúng, thiếu khoá thì không', () => {
      expect(Object.keys(readLocale('en').capabilities).sort()).toEqual(Object.keys(AGENT_CAPABILITY_SUMMARY).sort());
    });
  });

  describe('nghĩa mã lỗi', () => {
    const vi = readLocale('vi');

    it.each(Object.keys(AGENT_ERROR_MEANING))('%s khớp từng ký tự với trang quản trị', (code) => {
      expect(vi.errors[code]).toBe(AGENT_ERROR_MEANING[code as keyof typeof AGENT_ERROR_MEANING]);
    });

    it('phủ đúng 8 mã đã công bố, không thừa không thiếu', () => {
      expect(Object.keys(AGENT_ERROR_MEANING).sort()).toEqual(Object.values(AGENT_ERROR_CODES).sort());
      expect(Object.keys(vi.errors).sort()).toEqual(Object.values(AGENT_ERROR_CODES).sort());
    });

    it('bản dịch tiếng Anh có đúng bộ khoá', () => {
      expect(Object.keys(readLocale('en').errors).sort()).toEqual(Object.values(AGENT_ERROR_CODES).sort());
    });
  });

  /**
   * Đây là phần đáng giá nhất của file: bảng mã HTTP được so với **mã trạng thái
   * thật** mà từng hàm dựng lỗi ném ra, chứ không so hai bảng với nhau. Hai bảng
   * cùng sai thì so nhau vẫn xanh.
   */
  describe('mã HTTP khớp với mã trạng thái thật của từng hàm dựng lỗi', () => {
    const thrown: Record<string, number> = {
      [AGENT_ERROR_CODES.tableNotAllowed]: tableNotAllowed('x').getStatus(),
      [AGENT_ERROR_CODES.fieldNotAllowed]: fieldNotAllowed('x', 'y').getStatus(),
      [AGENT_ERROR_CODES.invalidQuery]: invalidQuery('x').getStatus(),
      [AGENT_ERROR_CODES.writeNotSupported]: writeNotSupported().getStatus(),
      [AGENT_ERROR_CODES.queryTimeout]: queryTimeout(1).getStatus(),
      [AGENT_ERROR_CODES.docNotFound]: docNotFound('x', []).getStatus(),
      [AGENT_ERROR_CODES.docsUnavailable]: docsUnavailable().getStatus(),
    };

    it.each(Object.keys(thrown))('%s', (code) => {
      expect(AGENT_ERROR_HTTP[code as keyof typeof AGENT_ERROR_HTTP]).toBe(thrown[code]);
    });

    /**
     * `UNAUTHORIZED` không có hàm dựng ở `agent-errors.ts`: guard ném
     * `UnauthorizedException` trần để thân phản hồi giống hệt nhau ở cả ba
     * trường hợp thiếu/sai/rỗng khoá. Nên chỉ chốt cứng con số ở đây.
     */
    it('UNAUTHORIZED là 401', () => {
      expect(AGENT_ERROR_HTTP[AGENT_ERROR_CODES.unauthorized]).toBe(401);
    });

    it('bảng của trang quản trị cũng khớp cùng sự thật đó', () => {
      const feTypes = fs.readFileSync(
        path.resolve(__dirname, '../../../../web/src/components/settings/agent-api/types.ts'),
        'utf8',
      );
      const block = feTypes.slice(feTypes.indexOf('ERROR_HTTP'));
      for (const [code, status] of Object.entries(AGENT_ERROR_HTTP)) {
        // Khớp `CODE: 401` bất kể có chú thích phía sau.
        expect(block).toMatch(new RegExp(`${code}:\\s*${status}\\b`));
      }
    });
  });

  describe('mô tả Swagger đạt mức hướng dẫn của trang (AC-01)', () => {
    it.each(Object.keys(AGENT_SWAGGER_DESCRIPTION))('%s có ví dụ chạy được và bảng mã lỗi', (key) => {
      const text = AGENT_SWAGGER_DESCRIPTION[key as keyof typeof AGENT_SWAGGER_DESCRIPTION];
      expect(text).toContain('Ví dụ chạy được');
      expect(text).toContain('curl');
      expect(text).toContain('X-Agent-Api-Key');
      // Bảng mã lỗi dựng từ hằng số dùng chung, nên mọi mã phải có mặt.
      for (const code of Object.values(AGENT_ERROR_CODES)) expect(text).toContain(code);
    });

    it('mô tả liệt kê bảng dữ liệu lấy từ registry, không viết tay', () => {
      // Sửa registry là mô tả tự đổi — đây là chỗ AC-03 đạt bằng nguồn chung
      // thật sự, không phải bằng test.
      expect(AGENT_SWAGGER_DESCRIPTION.listTables).toContain('`orders`');
      expect(AGENT_SWAGGER_DESCRIPTION.listTables).toContain('`workshopConfigs`');
    });
  });
});
