/**
 * Phân loại một nhóm Zalo sau khi người vận hành xét.
 *
 * Vì sao cần `Unreviewed` là một giá trị THẬT chứ không phải để trống: nhóm đã
 * xét mà KHÔNG thuộc seller nào (nhóm vận hành, nhóm nội bộ) vẫn phải ghi lại
 * được. Không có nó thì danh sách chờ gắn không bao giờ cạn, và không phân biệt
 * nổi "chưa ai xét" với "đã xét rồi, không phải nhóm khách" — bài học lấy từ
 * `thghub` (migration `20260824_zalo_group_seller_map`).
 *
 * `Internal` là chốt RIÊNG TƯ, không phải nhãn cho đẹp. Dữ liệu Zalo kéo về lẫn
 * nhóm cá nhân của nhân viên (nhóm gia đình, nhóm lớp, nhóm tổ dân phố). Mọi
 * bước đọc nội dung chat để phân tích BẮT BUỘC lọc bỏ nhóm mang nhãn này —
 * đưa chúng vào mô hình là đọc đời tư nhân viên.
 */
export enum ZaloGroupKind {
  /** Mới đồng bộ về, chưa ai xét. Mặc định. */
  Unreviewed = 'unreviewed',
  /** Nhóm làm việc với một khách/seller — phải có `customerId`. */
  Seller = 'seller',
  /** Nhóm vận hành nội bộ theo chức năng (Vận Hành Sx TN/ML, Đóng hàng, ghép file…). */
  Operation = 'operation',
  /** Nhóm riêng tư / không liên quan công việc — LOẠI khỏi mọi phân tích. */
  Internal = 'internal',
}

export const ZALO_GROUP_KINDS = Object.values(ZaloGroupKind);

/** Nhãn tiếng Việt dùng ở BE (log/thông báo). FE có i18n riêng. */
export const ZALO_GROUP_KIND_LABELS: Record<ZaloGroupKind, string> = {
  [ZaloGroupKind.Unreviewed]: 'Chưa xét',
  [ZaloGroupKind.Seller]: 'Nhóm khách',
  [ZaloGroupKind.Operation]: 'Nhóm vận hành',
  [ZaloGroupKind.Internal]: 'Nội bộ / riêng tư',
};

/**
 * Nhóm được phép đưa nội dung chat vào phân tích. Dùng ở MỌI truy vấn đọc tin
 * nhắn — đừng viết lại điều kiện này ở từng chỗ, lệch một chỗ là rò đời tư.
 */
export const ZALO_GROUP_ANALYZABLE_KINDS: ZaloGroupKind[] = [ZaloGroupKind.Seller, ZaloGroupKind.Operation];
