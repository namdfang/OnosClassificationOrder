import { fieldNotAllowed, invalidQuery } from './agent-errors';
import type { AgentFieldPolicy, AgentTableSpec } from './registry';

type Node = Record<string, unknown>;

/** Toán tử so sánh: ánh xạ 1-1 với năng lực đang có, không thêm gì. */
const COMPARE_OPS = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte']);
const SET_OPS = new Set(['$in', '$nin']);

/** Toán tử dùng được trên trường chỉ cho so bằng (`filter: 'eq'`). */
const EQ_ONLY_OPS = new Set(['$eq', '$ne', '$in', '$nin']);

/** Ghép cây điều kiện. `$not` nhận MỘT node, ba cái kia nhận mảng. */
const LOGICAL_ARRAY_OPS = new Set(['$and', '$or', '$nor']);

/**
 * Tên KHÔNG tồn tại trong MongoDB, và đó là chủ ý (`API-8`, BA chốt ở SRS §11).
 *
 * Bên gọi truyền **chuỗi thường**; server escape rồi tự neo `^`. Không có đường
 * nào để một mẫu biểu thức đi vào, nên không có ReDoS.
 *
 * Vì sao không mượn tên `$regex` cho năng lực này: một toán tử mang tên chuẩn
 * MongoDB nhưng ngữ nghĩa khác là **bẫy im lặng** — agent quen Mongo sẽ gửi
 * `".*abc.*"` rồi nhận kết quả rỗng mà không hiểu vì sao. Tên lạ buộc nó tra
 * tài liệu. `$regex` bị từ chối như mọi toán tử ngoài danh sách trắng.
 */
const STARTS_WITH_OP = '$startsWith';

const ALLOWED_FIELD_OPS = new Set([...COMPARE_OPS, ...SET_OPS, '$exists', STARTS_WITH_OP]);

const isPlainObject = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);

const isPrimitive = (v: unknown): boolean =>
  v === null || ['string', 'number', 'boolean'].includes(typeof v);

/** Giá trị của bên gọi không bao giờ được trở thành cú pháp biểu thức. */
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Dịch điều kiện lọc **cú pháp MongoDB** sang điều kiện mongo thật (`API-8`).
 *
 * NGUYÊN TẮC CHI PHỐI TOÀN BỘ FILE NÀY — `.devtasks/design/API-8.md` §2:
 * **parse → kiểm → DỰNG LẠI.** Object gửi xuống mongo luôn là object do hàm
 * này tạo mới; không `{...node}`, không `Object.assign` lên đầu vào, không
 * truyền tiếp một nhánh con nào của bên gọi.
 *
 * Lý do không phải cẩn thận thừa: DSL cũ nhận `{field, op, value}` — cả ba nằm
 * ở vị trí GIÁ TRỊ nên không thể là toán tử. Cú pháp Mongo đặt tên trường và
 * toán tử vào vị trí KHOÁ, nên "validate rồi truyền thẳng" là cách một khoá lọt
 * qua bộ kiểm đi thẳng vào máy chủ dữ liệu. Đây là khác biệt giữa danh sách
 * trắng và danh sách đen, và danh sách đen luôn thiếu một mục.
 */
export function buildMongoFilter(
  spec: AgentTableSpec,
  node: unknown,
  maxDepth: number,
  policyOf: (spec: AgentTableSpec, field: string) => AgentFieldPolicy,
  coerce: (policy: AgentFieldPolicy, value: unknown) => unknown,
  depth = 0,
): Record<string, unknown> {
  if (node === undefined || node === null) return {};
  if (depth > maxDepth) throw invalidQuery(`Filter is nested deeper than ${maxDepth} levels.`);
  if (!isPlainObject(node)) throw invalidQuery('Filter must be an object.');

  assertNotLegacySyntax(node);

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node)) {
    if (LOGICAL_ARRAY_OPS.has(key)) {
      if (!Array.isArray(value) || value.length === 0) {
        throw invalidQuery(`Operator '${key}' requires a non-empty array of conditions.`);
      }
      out[key] = value.map((child) => buildMongoFilter(spec, child, maxDepth, policyOf, coerce, depth + 1));
      continue;
    }

    if (key === '$not') {
      // Mongo `$not` chỉ dùng được ở cấp TRƯỜNG. Ở cấp ngoài, phủ định một cây
      // điều kiện là `$nor` với đúng một phần tử — cùng cách DSL cũ đã dựng.
      out.$nor = [buildMongoFilter(spec, value, maxDepth, policyOf, coerce, depth + 1)];
      continue;
    }

    if (key.startsWith('$')) {
      // Cùng một thông điệp cho toán tử ngoài danh sách trắng VÀ toán tử cấm
      // (`$where`, `$expr`, `$function`, `$text`, toán tử địa lý...): phân biệt
      // là chỉ cho người dò biết cái nào "tồn tại nhưng bị cấm".
      throw invalidQuery(`Operator '${key}' is not supported by this API.`);
    }

    out[key] = buildFieldCondition(spec, key, value, policyOf, coerce);
  }

  return out;
}

/**
 * Một trường, ba dạng đầu vào — sót dạng nào là dạng đó thành cửa sau:
 *   `{ status: 'active' }`               rút gọn, ngầm hiểu `$eq`
 *   `{ id: { $eq: 'x' } }`               một toán tử
 *   `{ qty: { $gte: 1, $lte: 9 } }`      nhiều toán tử trên cùng trường
 */
function buildFieldCondition(
  spec: AgentTableSpec,
  field: string,
  value: unknown,
  policyOf: (spec: AgentTableSpec, field: string) => AgentFieldPolicy,
  coerce: (policy: AgentFieldPolicy, value: unknown) => unknown,
): unknown {
  const policy = policyOf(spec, field);

  if (policy.filter === 'none') {
    throw fieldNotAllowed(
      field,
      policy.freeText
        ? 'is free text and can be read but not filtered: filtering it would allow scanning the whole table for a contact detail. Filter by an identifier instead.'
        : 'cannot be used as a filter condition.',
    );
  }

  // Dạng rút gọn tính là `$eq` TRƯỚC khi kiểm mức lọc, nếu không
  // `{ userEmail: 'a@b.c' }` sẽ bị từ chối oan trên trường chỉ-so-bằng.
  if (!isPlainObject(value)) {
    assertFilterableValue(field, value);
    assertOperatorAllowed(field, policy, '$eq');
    return coerce(policy, value);
  }

  const built: Record<string, unknown> = {};

  for (const [op, operand] of Object.entries(value)) {
    if (!ALLOWED_FIELD_OPS.has(op)) {
      throw invalidQuery(`Operator '${op}' is not supported by this API.`);
    }
    assertOperatorAllowed(field, policy, op);

    if (SET_OPS.has(op)) {
      if (!Array.isArray(operand) || operand.length === 0) {
        throw invalidQuery(`Operator '${op}' on '${field}' requires a non-empty array.`);
      }
      operand.forEach((item) => assertFilterableValue(field, item));
      built[op] = operand.map((item) => coerce(policy, item));
      continue;
    }

    if (op === '$exists') {
      if (typeof operand !== 'boolean') {
        throw invalidQuery(`Operator '$exists' on '${field}' requires true or false.`);
      }
      built.$exists = operand;
      continue;
    }

    if (op === STARTS_WITH_OP) {
      if (typeof operand !== 'string' || operand.length === 0) {
        throw invalidQuery(`Operator '${STARTS_WITH_OP}' on '${field}' requires a non-empty string.`);
      }
      // Server dựng mẫu, bên gọi chỉ đưa chuỗi thường — không có đường vào cho
      // một mẫu phức tạp, nên không có ReDoS.
      built.$regex = `^${escapeRegex(operand)}`;
      continue;
    }

    assertFilterableValue(field, operand);
    built[op] = coerce(policy, operand);
  }

  if (Object.keys(built).length === 0) {
    throw invalidQuery(`Condition on '${field}' has no operator.`);
  }

  // `{ field: { $eq: v } }` rút về `{ field: v }` cho khớp hình dạng DSL cũ
  // sinh ra — hai đường phải cho ra cùng một điều kiện mongo.
  if (Object.keys(built).length === 1 && '$eq' in built) return built.$eq;

  return built;
}

/** BR-4: giá trị chỉ nhận nguyên thuỷ. Object lồng là đường đưa toán tử lạ vào. */
function assertFilterableValue(field: string, value: unknown): void {
  if (!isPrimitive(value)) {
    throw invalidQuery(`Value for '${field}' must be a string, number, boolean or null.`);
  }
}

function assertOperatorAllowed(field: string, policy: AgentFieldPolicy, op: string): void {
  if (policy.filter === 'eq' && !EQ_ONLY_OPS.has(op)) {
    throw fieldNotAllowed(
      field,
      `only supports exact-match filtering ($eq, $ne, $in, $nin). Operator '${op}' would allow probing its value.`,
    );
  }
}

/**
 * Cú pháp CŨ bị từ chối kèm thông điệp nêu rõ (`API-8` AC-08).
 *
 * Im lặng trả kết quả sai là điều tệ nhất có thể xảy ra ở đây: `{field, op,
 * value}` gửi vào bộ dịch mới sẽ được hiểu là ba trường tên `field`/`op`/`value`
 * — không trường nào tồn tại, nên nó sẽ báo lỗi trường không hợp lệ và bên gọi
 * đi sửa nhầm chỗ. Nhận diện tường minh để chỉ đúng nguyên nhân.
 */
function assertNotLegacySyntax(node: Node): void {
  const legacy =
    ('field' in node && 'op' in node) ||
    Array.isArray((node as { and?: unknown }).and) ||
    Array.isArray((node as { or?: unknown }).or) ||
    isPlainObject((node as { not?: unknown }).not);

  if (legacy) {
    throw invalidQuery(
      'The old filter syntax ({field, op, value} / {and: [...]}) is no longer supported. ' +
        'Use MongoDB-style conditions instead, for example {"productionId": {"$eq": "SQ-01964-03971"}} ' +
        'or {"$and": [{"type": "Hoodie"}, {"quantity": {"$gte": 5}}]}.',
    );
  }
}
