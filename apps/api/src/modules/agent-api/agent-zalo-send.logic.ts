import { ZaloGroupKind } from 'shared';

/**
 * Luật chặn cho đường GỬI Zalo của agent — hàm THUẦN, không đụng DB.
 *
 * Vì sao tách ra và vì sao có test riêng: mọi endpoint khác của Agent API là
 * CHỈ ĐỌC (BR-3) — sai thì cùng lắm trả nhầm số. Đường này nhắn ra ngoài, tới
 * người thật, và **không rút lại được**. Nó là chốt chặn duy nhất giữa một
 * agent và khách hàng của công ty, nên luật phải nằm ở chỗ đọc được và kiểm
 * được, không rải trong service.
 */

/**
 * Nhóm agent được phép gửi.
 *
 * `internal` (nhóm nội bộ) và `operation` (nhóm vận hành, có cả người ngoài
 * như forwarder/nhà cung cấp nhưng là quan hệ công việc). CẤM tuyệt đối
 * `seller` — nhóm khách hàng; và cấm `unreviewed` — chưa ai phân loại thì
 * không thể biết bên kia là ai.
 */
export const NHOM_DUOC_GUI: readonly string[] = [ZaloGroupKind.Internal, ZaloGroupKind.Operation];

export const LY_DO_CHAN = {
  khongThayNhom: 'Không tìm thấy nhóm Zalo với mã này.',
  nhomKhach: 'CẤM gửi vào nhóm khách hàng — đường này chỉ dành cho nhóm nội bộ và nhóm vận hành.',
  chuaXet: 'Nhóm chưa được phân loại — phải xét ở màn Nối nhóm Zalo trước khi agent gửi được.',
  khongCoHoiThoai: 'Nhóm chưa có hội thoại nào để gửi (chưa nick nào của công ty ở trong nhóm).',
  hoiThoaiLac: 'conversationId không thuộc nhóm này.',
  rong: 'Nội dung rỗng.',
} as const;

export interface NhomDeGui {
  kind?: string;
  conversationIds?: string[];
  title?: string;
}

export type KetQuaChon = { ok: true; conversationId: string } | { ok: false; lyDo: string };

/**
 * Quyết định gửi vào hội thoại nào, hoặc từ chối kèm lý do đọc được.
 *
 * `conversationId` do agent truyền vẫn phải THUỘC nhóm đã duyệt — nếu không thì
 * chốt phân loại nhóm vô nghĩa: chỉ cần biết một id hội thoại bất kỳ là nhắn
 * được vào nhóm khách.
 */
export function chonHoiThoai(nhom: NhomDeGui | null, conversationId?: string): KetQuaChon {
  if (!nhom) return { ok: false, lyDo: LY_DO_CHAN.khongThayNhom };
  if (nhom.kind === ZaloGroupKind.Seller) return { ok: false, lyDo: LY_DO_CHAN.nhomKhach };
  if (!NHOM_DUOC_GUI.includes(String(nhom.kind))) return { ok: false, lyDo: LY_DO_CHAN.chuaXet };

  const ds = nhom.conversationIds ?? [];
  if (ds.length === 0) return { ok: false, lyDo: LY_DO_CHAN.khongCoHoiThoai };

  if (conversationId) {
    return ds.includes(conversationId) ? { ok: true, conversationId } : { ok: false, lyDo: LY_DO_CHAN.hoiThoaiLac };
  }

  // Không chỉ định thì lấy hội thoại đầu — mỗi nick trong nhóm có một hội thoại
  // riêng, gửi bằng nick nào cũng vào đúng nhóm đó.
  return { ok: true, conversationId: ds[0] };
}

/** Cắt và kiểm nội dung trước khi gửi. */
export function kiemNoiDung(content: string | undefined, tranKyTu = 4000): { ok: true; content: string } | { ok: false; lyDo: string } {
  const c = (content ?? '').trim();
  if (!c) return { ok: false, lyDo: LY_DO_CHAN.rong };

  // Cắt thay vì từ chối: tin quá dài thường là agent dán nhầm cả báo cáo, cắt
  // vẫn gửi được phần đầu còn hơn im lặng không gửi gì.
  return { ok: true, content: c.length > tranKyTu ? `${c.slice(0, tranKyTu - 1)}…` : c };
}
