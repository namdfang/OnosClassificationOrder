import { ZaloGroupKind } from 'shared';

import { NHOM_DUOC_GUI } from './agent-zalo-send.logic';

/**
 * Luật cho đường NGHE tin Zalo — hàm THUẦN, không đụng DB, không gọi engine.
 *
 * Hai thứ được quyết ở đây, và cả hai đều hỏng theo kiểu đắt tiền nếu sai:
 *
 * 1. **Nhóm nào được nghe.** Engine không biết khái niệm `kind`; nó đẩy mọi tin
 *    của mọi nhóm. Nếu không chặn ở đây thì nội dung nhóm KHÁCH HÀNG và nhóm cá
 *    nhân của nhân viên chảy ra ngoài hệ thống — phá đúng cái chốt riêng tư mà
 *    `kind=internal` sinh ra để giữ.
 *
 * 2. **Tin nào đáng đánh thức agent.** Đo thật 7 ngày trên nhóm nội bộ/vận hành:
 *    1.888 tin/ngày. Đánh thức mỗi tin ≈ 18–28 triệu token/ngày — không kham nổi,
 *    và đó là con số hệ cũ đã trả giá để biết. Lọc "có mention bất kỳ" giảm còn
 *    736/ngày, vẫn quá nhiều. Lọc đúng — Chủ tịch gửi HOẶC mention trúng nick của
 *    công ty — còn **165/ngày**.
 */

/** Vai người gửi, đủ để agent tự xét "việc của mình không". */
export const VAI = {
  chairman: 'chairman',
  staff: 'staff',
  aiSupport: 'ai-support',
  customer: 'customer',
  unknown: 'unknown',
} as const;
export type Vai = (typeof VAI)[keyof typeof VAI];

/**
 * Suy vai từ uid.
 *
 * Chủ tịch xét TRƯỚC mọi thứ: ông nhắn từ Zalo cá nhân, nên trong `zalo_identities`
 * rất có thể đang nằm ở `unknown` hoặc bị đoán nhầm thành khách. Không đặt uid Chủ
 * tịch lên đầu thì điều kiện kích hoạt (a) im lặng mà không ai biết vì sao.
 *
 * `ai-support` GIỮ RIÊNG chứ không gộp vào `staff`: đó là các nick AI của chính
 * mình, và agent phải phân biệt được để không đối thoại với chính nó.
 */
export function suyVai(zaloUid: string | undefined, chairmanUid: string | undefined, kindTheoUid: Map<string, string>): Vai {
  if (!zaloUid) return VAI.unknown;
  if (chairmanUid && zaloUid === chairmanUid) return VAI.chairman;

  const k = kindTheoUid.get(zaloUid);
  if (k === 'staff') return VAI.staff;
  if (k === 'ai-support') return VAI.aiSupport;
  if (k === 'customer') return VAI.customer;

  return VAI.unknown;
}

/** Nhóm có được nghe không — dùng chung đúng bộ luật với đường GỬI. */
export function nhomDuocNghe(kind: string | undefined): boolean {
  return kind !== ZaloGroupKind.Seller && NHOM_DUOC_GUI.includes(String(kind));
}

export interface TinDeXet {
  senderUid?: string;
  mentions?: Array<{ uid?: string }>;
}

export type LyDoKichHoat = 'chairman' | 'mention';

/**
 * Tin này có đáng đánh thức agent không, và vì lý do gì.
 *
 * `null` = không. Trả về LÝ DO chứ không phải boolean: bên nhận cần biết mình
 * được gọi vì Chủ tịch nói hay vì bị tag, hai việc xử lý khác nhau — và khi phải
 * dò vì sao agent im hoặc vì sao nó nổ, lý do là thứ đầu tiên người ta tìm.
 */
export function lyDoKichHoat(tin: TinDeXet, chairmanUid: string | undefined, uidNickCongTy: Set<string>): LyDoKichHoat | null {
  if (chairmanUid && tin.senderUid === chairmanUid) return 'chairman';

  // Tag người ngoài không tính: chỉ nổ khi ai đó gọi đúng một nick của công ty.
  // Đây chính là chỗ 736/ngày rút xuống còn 10/ngày.
  for (const m of tin.mentions ?? []) {
    if (m.uid && uidNickCongTy.has(m.uid)) return 'mention';
  }

  return null;
}

/**
 * Xác thực chữ ký webhook của engine: `x-webhook-signature` = HMAC-SHA256 hex
 * của **nguyên văn thân yêu cầu**.
 *
 * So bằng `timingSafeEqual` chứ không `===`: so chuỗi thường thoát ra ở byte đầu
 * khác nhau, và thời gian thoát đó đủ để dò dần chữ ký đúng.
 */
export function chuKyKhop(kyNhanDuoc: string | undefined, kyTinh: string): boolean {
  if (!kyNhanDuoc || kyNhanDuoc.length !== kyTinh.length) return false;

  let khac = 0;
  for (let i = 0; i < kyTinh.length; i++) khac |= kyNhanDuoc.charCodeAt(i) ^ kyTinh.charCodeAt(i);

  return khac === 0;
}
