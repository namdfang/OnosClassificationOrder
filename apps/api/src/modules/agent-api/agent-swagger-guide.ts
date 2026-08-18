import {
  AGENT_CAPABILITY_EXAMPLE,
  AGENT_CAPABILITY_SUMMARY,
  AGENT_ERROR_HTTP,
  AGENT_ERROR_MEANING,
  type AgentCapabilityKey,
} from 'shared';

import { AGENT_API_RATE_LIMIT_PER_MIN } from './agent-api.constants';
import { AGENT_TABLE_REGISTRY } from './registry';

/**
 * Mô tả hiển thị trên trang tài liệu API (`API-16`).
 *
 * Yêu cầu nghiệp vụ của task này không phải "viết mô tả cho hay" mà là **hai
 * nơi không được lệch nhau**: trang quản trị `/adm/settings/agent-api` là chuẩn,
 * trang tài liệu phải nói cùng một thứ. Nên mọi chữ dưới đây đến từ một trong
 * hai nguồn, không có chữ nào gõ tay lần thứ hai:
 *
 *  1. **Registry** (`AGENT_TABLE_REGISTRY`) — danh sách bảng và mô tả từng bảng.
 *     Đây đúng là nguồn mà trang quản trị đang đọc qua `GET /agent-admin/overview`.
 *     Sửa `description` của một bảng trong registry là **cả hai nơi cùng đổi**,
 *     không phải sửa hai chỗ.
 *  2. **Hằng số dùng chung** (`packages/shared/constants/agent-api-guide.ts`) —
 *     phần văn bản tự do mà registry không có: nhãn năng lực, nghĩa mã lỗi, ví
 *     dụ curl. Frontend hiện vẫn giữ bản i18n riêng của mình vì đổi trang nằm
 *     ngoài phạm vi task; `agent-guide-sync.spec.ts` giữ hai bên khớp.
 *
 * Hằng số hạn mức cũng lấy thẳng từ nơi `@Throttle` đang dùng, nên con số trên
 * tài liệu không thể lệch với con số máy chủ thật sự áp.
 */

const bullet = (lines: string[]): string => lines.map((line) => `- ${line}`).join('\n');

const example = (key: AgentCapabilityKey): string =>
  ['**Ví dụ chạy được**', '', '```bash', AGENT_CAPABILITY_EXAMPLE[key], '```'].join('\n');

/** Danh sách bảng, dựng từ registry — thêm bảng vào registry là tài liệu tự có. */
const tableList = (): string =>
  bullet(Object.values(AGENT_TABLE_REGISTRY).map((spec) => `\`${spec.key}\` — ${spec.description}`));

/** Bảng 8 mã lỗi kèm mã HTTP, dựng từ hằng số dùng chung. */
const errorTable = (): string =>
  [
    '| Mã lỗi | HTTP | Nghĩa |',
    '|---|---|---|',
    ...Object.keys(AGENT_ERROR_MEANING).map(
      (code) => `| \`${code}\` | ${AGENT_ERROR_HTTP[code as keyof typeof AGENT_ERROR_HTTP]} | ${AGENT_ERROR_MEANING[code as keyof typeof AGENT_ERROR_MEANING]} |`,
    ),
  ].join('\n');

const commonFooter = (): string =>
  [
    '',
    '---',
    '',
    `**Xác thực:** header \`X-Agent-Api-Key\`. **Hạn mức:** ${AGENT_API_RATE_LIMIT_PER_MIN} lời gọi mỗi phút cho mỗi địa chỉ gọi.`,
    '',
    '**Mã lỗi có thể gặp**',
    '',
    errorTable(),
  ].join('\n');

export const agentSummary = (key: AgentCapabilityKey): string => AGENT_CAPABILITY_SUMMARY[key];

export const AGENT_SWAGGER_DESCRIPTION: Record<AgentCapabilityKey, string> = {
  listTables: [
    'Trả về **cấu trúc dữ liệu** mà bộ API này cho đọc: mỗi bảng kèm mô tả dùng để trả lời loại câu hỏi gì, tên entity, thứ tự sắp xếp mặc định, và chính sách của từng trường (đọc được không, lọc ở mức nào, sắp xếp/nhóm/tổng hợp được không).',
    '',
    'Gọi endpoint này **trước tiên**: nó cho biết bảng nào và trường nào tồn tại đối với bạn. Bảng không có trong danh sách là không tồn tại — gọi tới sẽ nhận `TABLE_NOT_ALLOWED`.',
    '',
    '**Không có tham số.**',
    '',
    `**${Object.keys(AGENT_TABLE_REGISTRY).length} bảng hiện có**`,
    '',
    tableList(),
    '',
    example('listTables'),
    commonFooter(),
  ].join('\n'),

  readRows: [
    'Đọc **dữ liệu thô** của một bảng theo lô, dùng khi bạn cần chính các dòng chứ không phải con số tổng hợp.',
    '',
    '**Tham số**',
    '',
    bullet([
      '`table` (đường dẫn) — tên bảng, lấy từ `GET /agent/tables`.',
      '`limit` — số dòng tối đa một lô. Vượt trần thì bị **kẹp xuống, không báo lỗi**; `meta.limitApplied` cho biết trần thực tế đã áp. Trần là cấu hình của máy chủ, xem con số hiện hành ở trang hướng dẫn trong `/adm` — cố ý không viết cứng vào đây để tài liệu không lệch khi cấu hình đổi.',
      '`cursor` — con trỏ phân trang lấy từ `nextCursor` của lô trước. Không có nghĩa là lô đầu tiên.',
      '`fields` — chỉ lấy những trường này. **Lặp lại tham số** cho nhiều trường (`fields=a&fields=b`), KHÔNG viết `fields=a,b` — chuỗi có dấu phẩy bị hiểu là một tên trường và nhận `FIELD_NOT_ALLOWED`.',
      '`filter` — điều kiện lọc, **cú pháp MongoDB**, dạng chuỗi JSON. Cùng bộ toán tử với `POST /agent/query`.',
    ]),
    '',
    'Trường không xin thì không trả; trường không được đọc thì **không bao giờ** trả, dù có xin.',
    '',
    example('readRows'),
    commonFooter(),
  ].join('\n'),

  query: [
    'Truy vấn có kiểm soát trên một bảng: lọc, sắp xếp, chọn trường, hoặc **nhóm và tổng hợp**. Dùng khi câu hỏi cần một con số hoặc một bảng đã gộp, thay vì danh sách dòng thô.',
    '',
    '**Thân yêu cầu**',
    '',
    bullet([
      '`table` — tên bảng.',
      '`filter` — điều kiện lọc theo **cú pháp MongoDB**. Toán tử dùng được: `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` `$exists` `$startsWith`, ghép bằng `$and` `$or` `$nor` `$not`. Toán tử ngoài danh sách — kể cả toán tử MongoDB có thật như `$regex`, `$where`, `$expr` — bị từ chối bằng `INVALID_QUERY`.',
      '`select` — `{ fields, sort, limit }` khi muốn lấy dòng.',
      '`aggregate` — `{ groupBy, metrics }` khi muốn gộp. **Loại trừ nhau với `select`**: gửi cả hai sẽ nhận `INVALID_QUERY`.',
    ]),
    '',
    'Không có `$regex`: muốn tìm theo phần đầu chuỗi thì dùng `$startsWith` và truyền **chuỗi thường**, hệ thống tự escape và tự neo đầu. Đó là lý do một mẫu phức tạp không thể làm nghẽn máy chủ dữ liệu.',
    '',
    'Hướng dẫn đầy đủ kèm ví dụ theo câu hỏi thật của khách: `GET /agent/docs/how-to-filter`.',
    '',
    example('query'),
    commonFooter(),
  ].join('\n'),

  listDocs: [
    'Danh mục **tài liệu nghiệp vụ** đi kèm bộ API: mỗi mục có mã (`slug`), tiêu đề và mô tả ngắn.',
    '',
    'Tài liệu ở đây trả lời những thứ dữ liệu thô không nói được — quy tắc loại trừ ngầm khiến số đếm lệch, ý nghĩa từng giá trị trạng thái, thứ bạn không được phép thấy và cách trả lời khách khi gặp chúng. Đọc trước khi nói bất kỳ con số nào với khách.',
    '',
    '**Không có tham số.**',
    '',
    example('listDocs'),
    commonFooter(),
  ].join('\n'),

  getDoc: [
    'Trả về **nội dung markdown** của một tài liệu nghiệp vụ.',
    '',
    '**Tham số**',
    '',
    bullet([
      '`slug` (đường dẫn) — mã tài liệu, lấy từ `GET /agent/docs`. Mã không có thì nhận `DOC_NOT_FOUND`, kèm danh sách mã đang có trong trường `available`.',
    ]),
    '',
    example('getDoc'),
    commonFooter(),
  ].join('\n'),
};
