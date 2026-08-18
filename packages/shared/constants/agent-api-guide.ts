import { AGENT_ERROR_CODES, type AgentErrorCode } from '../dtos/agent-api.dto';

/**
 * Văn bản hướng dẫn của bộ API agent — NGUỒN KHAI BÁO DUY NHẤT (`API-16`).
 *
 * Vì sao file này tồn tại: cùng một nội dung đang được nói ở hai nơi — trang
 * quản trị `/adm/settings/agent-api` và trang tài liệu `/documentation`. Chép
 * tay thì hai bản lệch nhau ngay lần sửa đầu tiên; điều đó **đã xảy ra** ở
 * `API-14`, nơi trang còn dạy cú pháp lọc cũ sau khi `API-8` đổi cú pháp.
 *
 * Vì sao đặt ở `packages/shared` chứ không ở `apps/api`: đây là gói duy nhất cả
 * hai app import được. Hôm nay backend đọc nó để dựng mô tả Swagger, còn
 * frontend vẫn giữ chuỗi trong file i18n của mình vì đổi trang nằm ngoài phạm
 * vi `API-16` (§4 change note). Ngày phạm vi được mở, frontend chỉ việc bỏ key
 * i18n và đọc thẳng từ đây — **không phải đụng backend lần nữa**.
 *
 * Trong lúc chờ ngày đó, thứ giữ hai bên không lệch là
 * `apps/api/src/modules/agent-api/agent-guide-sync.spec.ts`: nó so từng chuỗi
 * dưới đây với `apps/web/src/i18n/locales/vi/agentApi.json`, sai một ký tự là
 * test đỏ.
 *
 * NGÔN NGỮ: tiếng Việt, khớp locale mặc định của repo. Bản `en` của frontend là
 * bản dịch, không so chuỗi được — test chỉ kiểm nó có **đúng bộ khoá**.
 */

/** Năm năng lực của bộ API agent, theo đúng thứ tự hiển thị trên trang quản trị. */
export const AGENT_CAPABILITY_KEYS = ['listTables', 'readRows', 'query', 'listDocs', 'getDoc'] as const;
export type AgentCapabilityKey = (typeof AGENT_CAPABILITY_KEYS)[number];

/**
 * Nhãn ngắn của từng năng lực — **phải khớp từng ký tự** với key `capabilities.*`
 * trong file i18n của trang quản trị.
 */
export const AGENT_CAPABILITY_SUMMARY: Record<AgentCapabilityKey, string> = {
  listTables: 'Liệt kê bảng đọc được',
  readRows: 'Đọc thô theo lô, phân trang bằng con trỏ',
  query: 'Truy vấn có kiểm soát: lọc, sắp xếp, đếm, nhóm, tổng hợp',
  listDocs: 'Danh mục tài liệu nghiệp vụ',
  getDoc: 'Nội dung markdown của một tài liệu',
};

/**
 * Nghĩa của 8 mã lỗi — **phải khớp từng ký tự** với key `errors.*` trong file
 * i18n của trang quản trị.
 */
export const AGENT_ERROR_MEANING: Record<AgentErrorCode, string> = {
  [AGENT_ERROR_CODES.unauthorized]:
    'Thiếu hoặc sai khoá ở header X-Agent-Api-Key. Cũng trả về khi máy chủ chưa cấu hình khoá.',
  [AGENT_ERROR_CODES.tableNotAllowed]:
    'Bảng này không nằm trong danh sách trắng. Xem tab Bảng dữ liệu để biết bảng nào đọc được.',
  [AGENT_ERROR_CODES.fieldNotAllowed]:
    'Trường này không đọc/lọc/nhóm được theo chính sách. Xem cột Lọc và Nhóm của bảng trường.',
  [AGENT_ERROR_CODES.writeNotSupported]: 'Bộ API chỉ đọc. Không có thao tác ghi nào được hỗ trợ.',
  [AGENT_ERROR_CODES.invalidQuery]: 'Truy vấn sai cú pháp hoặc dùng toán tử không được phép.',
  [AGENT_ERROR_CODES.queryTimeout]:
    'Truy vấn chạy quá lâu và đã bị dừng. Thu hẹp điều kiện lọc hoặc giảm số dòng rồi thử lại.',
  [AGENT_ERROR_CODES.docNotFound]: 'Không có tài liệu nào mang mã này. Xem danh mục ở tab Tài liệu.',
  [AGENT_ERROR_CODES.docsUnavailable]: 'Máy chủ chưa tìm thấy thư mục tài liệu.',
};

/**
 * Mã HTTP tương ứng từng mã lỗi.
 *
 * Trang quản trị giữ bảng riêng ở `apps/web/src/components/settings/agent-api/types.ts`
 * (`ERROR_HTTP`) và bảng đó từng được đối chiếu **bằng tay** — chính chỗ đã sinh
 * ra bug `API-3-B1`.
 *
 * Bảng ở đây KHÔNG phải bản chép thứ ba: test đối chiếu nó với **mã trạng thái
 * thật** mà từng hàm dựng lỗi trong `apps/api/src/modules/agent-api/agent-errors.ts`
 * ném ra, chứ không so với bảng nào khác. Cả bảng này lẫn bảng của frontend đều
 * bị neo vào cùng một sự thật chạy được.
 *
 * Đây không phải lo xa: khi viết bảng này lần đầu tôi đã đoán sai **ba trên
 * tám** dòng (403, 400, 408 bị viết thành 400, 405, 504) và chỉ phát hiện vì mở
 * mã nguồn ra đọc. Test tồn tại đúng để lần sau không phải trông cậy vào việc
 * ai đó nhớ mở file.
 */
export const AGENT_ERROR_HTTP: Record<AgentErrorCode, number> = {
  [AGENT_ERROR_CODES.unauthorized]: 401,
  [AGENT_ERROR_CODES.tableNotAllowed]: 403,
  [AGENT_ERROR_CODES.fieldNotAllowed]: 400,
  [AGENT_ERROR_CODES.writeNotSupported]: 400,
  [AGENT_ERROR_CODES.invalidQuery]: 400,
  [AGENT_ERROR_CODES.queryTimeout]: 408,
  [AGENT_ERROR_CODES.docNotFound]: 404,
  [AGENT_ERROR_CODES.docsUnavailable]: 503,
};

/**
 * Ví dụ **chạy được** cho từng năng lực (`API-16-AC-01`).
 *
 * Đây là chuỗi lệnh curl thật, không phải mẫu minh hoạ: dán vào terminal sau khi
 * thay `$AGENT_API_KEY` là chạy. Cùng khuôn với khối curl mà tab "Thử gọi" của
 * trang quản trị in ra, để người đọc chuyển qua lại giữa hai nơi không phải học
 * lại cách viết.
 */
export const AGENT_CAPABILITY_EXAMPLE: Record<AgentCapabilityKey, string> = {
  listTables: `curl -H "X-Agent-Api-Key: $AGENT_API_KEY" \\
  "$HOST/api/v1/agent/tables"`,
  readRows: `curl -H "X-Agent-Api-Key: $AGENT_API_KEY" \\
  "$HOST/api/v1/agent/tables/orders/rows?limit=20&fields=productionId&fields=status"`,
  query: `curl -X POST -H "X-Agent-Api-Key: $AGENT_API_KEY" -H "Content-Type: application/json" \\
  -d '{"table":"orders","filter":{"quantity":{"$gte":1,"$lte":9}},"aggregate":{"metrics":[{"op":"count","as":"n"}]}}' \\
  "$HOST/api/v1/agent/query"`,
  listDocs: `curl -H "X-Agent-Api-Key: $AGENT_API_KEY" \\
  "$HOST/api/v1/agent/docs"`,
  getDoc: `curl -H "X-Agent-Api-Key: $AGENT_API_KEY" \\
  "$HOST/api/v1/agent/docs/how-to-filter"`,
};
