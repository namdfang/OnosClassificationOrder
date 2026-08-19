/**
 * Chính sách của MỘT trường trong từ điển của bộ API agent (`API-1`, mở hết ở
 * `API-19`).
 *
 * ⚠️ **NGUYÊN TẮC ĐÃ ĐẢO** ở `API-19`. Trước đây: *cấm là mặc định* — trường
 * không khai ở đây thì không tồn tại đối với bộ API. Nay: **mở là mặc định** —
 * người dùng chốt agent đọc/lọc/sắp xếp/nhóm được mọi thứ, chốt chặn duy nhất
 * còn lại là bốn tên bí mật kỹ thuật ở `AGENT_DENY_FIELD_NAMES`.
 *
 * Hệ quả: file này KHÔNG còn là cổng. Trường không khai ở đây vẫn đọc được với
 * `OPEN_POLICY`; những gì khai ở đây chỉ để **mô tả** (kiểu dữ liệu để ép ngày,
 * và `note` nghiệp vụ hiện trên `GET /agent/tables` + trang quản trị).
 *
 * Ba khoá `filter`/`sortable`/`groupable` GIỮ LẠI trong kiểu dữ liệu dù mọi
 * chỗ dựng đều đặt mức mở: chúng là đường lui của một change request siết lại
 * — `mongo-filter.ts` vẫn đọc `filter`, nên chỉ cần đổi giá trị ở đây là siết
 * được mà không phải viết lại lớp lọc.
 */
export type AgentFieldPolicy = {
  /**
   * `object` — trường là KHỐI dữ liệu, trả ra nguyên khối.
   * `any` — CHƯA BIẾT kiểu: trường không khai trong từ điển (`API-19`). Ép kiểu
   * ngày lúc lọc chuyển sang phỏng đoán theo mẫu ISO, xem `AgentQueryService.coerce`.
   */
  type: 'string' | 'number' | 'date' | 'bool' | 'objectId' | 'enum' | 'object' | 'any';
  /** Được xuất hiện trong dữ liệu trả về. */
  read: boolean;
  /**
   * `none` — không lọc được.
   * `eq`   — chỉ $eq/$ne/$in/$nin.
   * `full` — mọi toán tử. Mức DUY NHẤT đang dùng sau `API-19`.
   */
  filter: 'none' | 'eq' | 'full';
  sortable: boolean;
  groupable: boolean;
  /** Cho phép sum/avg/min/max. */
  aggregatable?: boolean;
  /**
   * Văn bản do người dùng gõ tay. Sau `API-11` (thôi che) và `API-19` (thôi
   * chặn lọc) đây chỉ còn là **nhãn mô tả**: nó nói cho agent biết nội dung
   * trường là câu chữ tự do, không phải mã tra cứu.
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
  /** Tên entity, chỉ để hiển thị. Bảng không có mô tả thì rỗng (`API-19`). */
  entityName: string;
  defaultSort: string;
  /**
   * Trường CÓ MÔ TẢ. Không còn là danh sách trắng: trường vắng mặt ở đây vẫn
   * đọc và lọc được (`OPEN_POLICY`), chỉ là agent không có sẵn ghi chú nghiệp
   * vụ cho nó.
   */
  fields: Record<string, AgentFieldPolicy>;
  /**
   * Đường dẫn trường CÓ THẬT trên entity nhưng cố ý không mô tả. Sau `API-19`
   * danh sách này chỉ còn chứa bốn tên bí mật kỹ thuật — bất biến I4 vẫn đối
   * chiếu `fields ∪ deliberatelyExcluded` với schema thật, nên thêm field mới
   * vào entity mà không quyết định gì thì test vẫn đỏ.
   */
  deliberatelyExcluded: string[];
};


/**
 * Chính sách MẶC ĐỊNH của `API-19` — áp cho mọi trường không có mô tả, ở mọi
 * collection kể cả collection ngoài từ điển.
 *
 * `aggregatable: true` là có chủ ý dù trường có thể là chuỗi: MongoDB `$sum`
 * trên chuỗi trả 0, `$avg` trả null. Người dùng chốt không chặn — nên nhận số
 * 0 vô nghĩa là kết quả đúng theo chính sách, còn chặn trước mới là sai chính
 * sách.
 */
export const OPEN_POLICY: AgentFieldPolicy = {
  type: 'any',
  read: true,
  filter: 'full',
  sortable: true,
  groupable: true,
  aggregatable: true,
};

/** Trường có mô tả: mở đủ quyền, kiểu dữ liệu dùng để ép giá trị lúc lọc. */
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

/** Số — thêm nhãn `aggregatable` cho rõ, quyền thì `plain` đã mở đủ. */
export const numeric = (note?: string): AgentFieldPolicy => plain('number', note, { aggregatable: true });

/** Văn bản gõ tay. Quyền y hệt `plain`; cờ `freeText` chỉ để mô tả (`API-19`). */
export const freeText = (note?: string): AgentFieldPolicy => plain('string', note, { freeText: true });
