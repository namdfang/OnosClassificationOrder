import type { Model } from 'mongoose';

/**
 * Chính sách của MỘT trường trong danh sách trắng của bộ API agent (`API-1`).
 *
 * Nguyên tắc: **cấm là mặc định**. Trường không có mặt ở đây thì không tồn tại
 * đối với bộ API — không đọc được, không lọc được, không nhóm được, không sắp
 * xếp được. Xem `.devtasks/design/API-1.md` §4.
 */
export type AgentFieldPolicy = {
  /** `object` — trường là KHỐI dữ liệu, trả ra nguyên khối (`API-17`). */
  type: 'string' | 'number' | 'date' | 'bool' | 'objectId' | 'enum' | 'object';
  /** Được xuất hiện trong dữ liệu trả về. */
  read: boolean;
  /**
   * `none` — không lọc được.
   * `eq`   — chỉ eq/ne/in/nin. Dành cho thông tin liên hệ khách (BR-5): agent
   *          lọc bằng giá trị nó ĐÃ BIẾT, không phải dò dần từng ký tự.
   * `full` — mọi toán tử.
   */
  filter: 'none' | 'eq' | 'full';
  sortable: boolean;
  groupable: boolean;
  /** Cho phép sum/avg/min/max. Ngụ ý `type: 'number'` và `read: true`. */
  aggregatable?: boolean;
  /**
   * Văn bản do người dùng gõ tay. BR-4a §5b buộc che theo mẫu email/điện thoại
   * trước khi trả ra; `filter` của trường này BẮT BUỘC là `none` vì che chỉ
   * chạy ở đầu ra còn lọc chạy trên giá trị thô trong DB.
   */
  freeText?: boolean;
  /** Nghĩa nghiệp vụ — nguồn để viết từ điển dữ liệu cho agent. */
  note?: string;
};

export type AgentTableSpec = {
  /** Tên dùng ở API, TRÙNG tên collection thật. */
  key: string;
  /** AC-02: bảng này dùng để trả lời loại câu hỏi gì. */
  description: string;
  /** Tên entity để lấy model qua `getModelToken`. */
  entityName: string;
  defaultSort: string;
  fields: Record<string, AgentFieldPolicy>;
  /**
   * Đường dẫn trường CÓ THẬT trên entity nhưng cố ý KHÔNG đưa vào danh sách
   * trắng. Bất biến I4 đối chiếu `fields ∪ deliberatelyExcluded` với schema
   * thật: thêm field mới vào entity mà không quyết định gì thì test đỏ.
   */
  deliberatelyExcluded: string[];
};

export type AgentTableSpecWithModel = AgentTableSpec & { model: Model<unknown> };

/** Lối tắt cho trường chỉ đọc, lọc/sắp xếp/nhóm được đầy đủ. */
export const plain = (
  type: AgentFieldPolicy['type'],
  note?: string,
  extra?: Partial<AgentFieldPolicy>,
): AgentFieldPolicy => ({
  type,
  read: true,
  filter: 'full',
  sortable: true,
  groupable: true,
  note,
  ...extra,
});

/** Số đọc được và cộng/trung bình được. */
export const numeric = (note?: string): AgentFieldPolicy => plain('number', note, { aggregatable: true });

/**
 * Văn bản gõ tay: đọc được (đã che theo mẫu) nhưng KHÔNG lọc/sắp xếp/nhóm —
 * xem `.devtasks/design/API-1.md` §7.3.
 */
export const freeText = (note?: string): AgentFieldPolicy => ({
  type: 'string',
  read: true,
  filter: 'none',
  sortable: false,
  groupable: false,
  freeText: true,
  note,
});

/**
 * Trường **mở đọc theo `API-17`**: đọc được, nhưng KHÔNG lọc/sắp xếp/nhóm.
 *
 * Vì sao đây là khuôn riêng chứ không dùng `plain`: `API-17` mở đọc ~79 trường
 * vốn nằm ngoài danh sách trắng, và AC-05 buộc **mức lọc giữ nguyên như trước**
 * — trước đó chúng không có mặt trong registry nên mức lọc của chúng là *không
 * lọc được*. Mở đọc KHÔNG kéo theo mở lọc; muốn lọc một trường trong nhóm này
 * thì đó là một quyết định riêng, đổi sang `plain` và có người chịu trách nhiệm.
 *
 * `plain` vẫn dành cho trường đã được cân nhắc mở đủ quyền.
 */
export const readOnly = (type: AgentFieldPolicy['type'], note?: string): AgentFieldPolicy => ({
  type,
  read: true,
  filter: 'none',
  sortable: false,
  groupable: false,
  note,
});

/**
 * Thông tin liên hệ khách: LỌC bằng đúng giá trị đã biết, và **nay đọc được**.
 *
 * `API-17` mở đọc ba trường liên hệ (`orders.userEmail`, `customers.userEmail`,
 * `customers.phone`) theo quyết định của người dùng — nhất quán với `API-11`
 * (thôi che email/điện thoại trong văn bản tự do): giữ kín ở trường có cấu trúc
 * trong khi đã mở ở văn bản tự do là bảo vệ nửa vời.
 *
 * Mức lọc **giữ nguyên `eq`** (AC-05): lọc bằng giá trị đã biết, không dò dần
 * từng ký tự — nên vẫn không `startsWith`, không sắp xếp, không nhóm.
 */
export const contactField = (note?: string): AgentFieldPolicy => ({
  type: 'string',
  read: true,
  filter: 'eq',
  sortable: false,
  groupable: false,
  note,
});
