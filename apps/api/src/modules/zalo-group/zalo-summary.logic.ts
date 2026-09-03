import type { ZaloSummaryTask } from 'shared';
import { FULFILLMENT_STAGE_LABELS, ZaloSummaryLevel } from 'shared';

/**
 * Các hàm THUẦN của tóm tắt nhóm Zalo — tách khỏi `ZaloSummaryService` để
 * kiểm thử được mà không cần Mongo/BullMQ/SDK.
 *
 * Quy ước: hàm ở đây không đọc env, không gọi mạng, không dùng `Date.now()`
 * ngầm — mốc thời gian luôn được truyền vào, để test chạy ổn định.
 */

/** Hình dạng JSON mà mô hình phải trả về. */
export interface KetQua {
  tieuDe: string;
  khachQuanTam: string;
  salePhanHoi: string;
  tonDong: string;
  checklist: string[];
  nghiNgo: string[];
  mucDo: string;
}

/**
 * Gộp danh sách việc mới với danh sách cũ, GIỮ trạng thái tick của việc trùng
 * nội dung. Không có bước này thì mỗi lượt tóm tắt lại xoá sạch những gì người
 * vận hành đã tick, và cái nút tick thành vô nghĩa.
 */
export function gopChecklist(moi: string[], cu: ZaloSummaryTask[], bayGio: Date): ZaloSummaryTask[] {
  const cuTheoViec = new Map(cu.map((c) => [c.viec.trim().toLowerCase(), c]));

  return moi.map((viec) => {
    const truoc = cuTheoViec.get(viec.trim().toLowerCase());

    return {
      viec,
      xong: truoc?.xong ?? false,
      taoLuc: truoc?.taoLuc ?? bayGio.toISOString(),
      xongLuc: truoc?.xongLuc ?? null,
    };
  });
}

/** Ép kết quả về đúng kiểu — structured output đã ràng buộc, đây là lưới cuối. */
export function chuanHoa(o: unknown): KetQua {
  const r = (o ?? {}) as Record<string, unknown>;
  const chuoi = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const mangChuoi = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  const mucDo = chuoi(r.mucDo);

  return {
    tieuDe: chuoi(r.tieuDe),
    khachQuanTam: chuoi(r.khachQuanTam),
    salePhanHoi: chuoi(r.salePhanHoi),
    tonDong: chuoi(r.tonDong),
    checklist: mangChuoi(r.checklist),
    nghiNgo: mangChuoi(r.nghiNgo),
    mucDo: ([ZaloSummaryLevel.BinhThuong, ZaloSummaryLevel.CanChuY, ZaloSummaryLevel.Gap] as string[]).includes(
      mucDo,
    )
      ? mucDo
      : ZaloSummaryLevel.BinhThuong,
  };
}

/**
 * `DD/MM HH:MM` theo giờ Việt Nam — khuôn mà lời nhắc yêu cầu mô hình trích lại.
 * Cộng cứng +7h rồi đọc bằng `getUTC*`: KHÔNG phụ thuộc múi giờ của máy chạy
 * worker, nên máy đặt UTC hay +07 đều ra cùng một kết quả.
 */
export function dinhDangLuc(d: Date): string {
  const vn = new Date(d.getTime() + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');

  return `${p(vn.getUTCDate())}/${p(vn.getUTCMonth() + 1)} ${p(vn.getUTCHours())}:${p(vn.getUTCMinutes())}`;
}

/** Nhãn công đoạn tiếng Việt; đơn chưa vào xưởng thì nói rõ đang ở đâu. */
export function nhanChang(stage?: string): string {
  if (!stage) return 'chưa vào công đoạn xưởng';

  return FULFILLMENT_STAGE_LABELS[stage as keyof typeof FULFILLMENT_STAGE_LABELS] ?? stage;
}

/**
 * Một dòng mô tả trạng thái đơn cho mô hình đọc.
 *
 * Thứ tự kiểm QUAN TRỌNG và giống `OrderJourney.md §2`: hủy → giữ → xong →
 * công đoạn. Đơn bị giữ vẫn còn nguyên công đoạn cũ trong dữ liệu, đọc sai thứ
 * tự là báo nhầm "đang chạy" cho một đơn đứng im.
 *
 * `bayGio` mặc định là lúc gọi — giữ nguyên hành vi cũ; test truyền mốc cố định.
 */
export function moTaDon(d: Record<string, unknown>, bayGio: Date = new Date()): string {
  const ngayTu = (moc: unknown) => Math.floor((bayGio.getTime() - new Date(moc as Date).getTime()) / 86_400_000);

  if (d.cancelledAt) return 'ĐÃ HỦY';
  if (d.heldAt) {
    return `ĐANG BỊ GIỮ ${ngayTu(d.heldAt)} ngày${d.holdReason ? ` (lý do: ${String(d.holdReason)})` : ''}`;
  }
  if (d.fulfillmentCompletedAt) {
    return `đã xong sản xuất ${ngayTu(d.fulfillmentCompletedAt)} ngày trước`;
  }

  const phan: string[] = [nhanChang(d.currentFulfillmentStage as string | undefined)];
  if (d.productionError) {
    phan.push(`ĐANG CÓ LỖI: ${String(d.productionError)}${d.productionErrorNote ? ` — ${String(d.productionErrorNote)}` : ''}`);
  }
  if (d.inProductionAt) {
    phan.push(`vào sản xuất ${ngayTu(d.inProductionAt)} ngày trước`);
  }

  return phan.join(', ');
}

const DUOI_ANH = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp']);
const DUOI_VIDEO = new Set(['mp4', 'mov', 'm4v', 'avi']);
const DUOI_TEP = new Set([
  'pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv', 'zip', 'rar', '7z', 'ai', 'psd', 'cdr', 'eps', 'svg', 'txt', 'pptx',
]);

const duoiCua = (s: string): string => {
  const m = /\.([a-z0-9]{1,5})$/i.exec(s.split('?')[0].split('#')[0]);

  return m ? m[1].toLowerCase() : '';
};

const tenTepTu = (href: string): string => {
  try {
    const p = new URL(href).pathname;

    return decodeURIComponent(p.slice(p.lastIndexOf('/') + 1));
  } catch {
    return '';
  }
};

const hostCua = (href: string): string => {
  try {
    return new URL(href).hostname;
  } catch {
    return '';
  }
};

/**
 * Đổi tin ĐÍNH KÈM (engine lưu dạng JSON thô) thành một dòng chữ mô hình đọc được.
 *
 * Vì sao: 20% tin trong 30 ngày là `{"title":"x.pdf","href":...}` (tệp),
 * `{"title":"","href":"...photo..."}` (ảnh) hay `{"id":..,"catId":..,"type":3}`
 * (sticker). Để nguyên thì mô hình phải tự đoán từ JSON — và đã đoán sai: một
 * PDF báo cáo được gửi lúc 31/08 17:50 mà tóm tắt kết luận "hẹn gửi nhưng chưa
 * xác nhận đã gửi". Dòng `[TỆP: tên]` là bằng chứng ĐÃ GỬI, prompt sẽ nói rõ.
 *
 * KHÔNG in URL: tốn token, không mang tín hiệu. Tin không phải JSON giữ nguyên.
 */
export function moTaDinhKem(noiDung: string): string {
  const t = noiDung.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return noiDung;

  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(t);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return noiDung;
    o = parsed as Record<string, unknown>;
  } catch {
    return noiDung;
  }

  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const desc = typeof o.description === 'string' ? o.description.trim() : '';
  const href = typeof o.href === 'string' ? o.href : '';
  const ext = duoiCua(title) || (href ? duoiCua(tenTepTu(href)) : '');

  if (!href) {
    const laSticker = 'catId' in o || o.type === 3 || ('id' in o && Object.keys(o).length <= 3);

    return laSticker ? '[STICKER]' : '[ĐÍNH KÈM]';
  }

  if (DUOI_ANH.has(ext) || /photo-|\/photo\//i.test(href)) return `[ẢNH]${title ? ` ${title}` : ''}`;
  if (DUOI_VIDEO.has(ext)) return `[VIDEO]${title ? ` ${title}` : ''}`;
  if (DUOI_TEP.has(ext)) return `[TỆP: ${title || tenTepTu(href)}]${desc ? ` — ${desc}` : ''}`;

  return `[LIÊN KẾT: ${title || hostCua(href) || 'không rõ'}]${desc ? ` — ${desc.slice(0, 120)}` : ''}`;
}
