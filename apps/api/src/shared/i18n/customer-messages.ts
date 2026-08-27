import { currentIsMachine, currentLang } from './request-language';

/**
 * Thông báo lỗi mà KHÁCH HÀNG đọc (ORD-29).
 *
 * Chỉ chứa câu của bốn bề mặt khách thật sự nhìn thấy: Customer Portal, ô tải
 * file design, và trang quản lý webhook trong portal. **Không** gom 124 câu của
 * nhân viên nội bộ vào đây — người đọc chúng là người Việt, dịch sang tiếng Anh
 * chỉ làm họ khó dùng hơn.
 *
 * Quy ước:
 *   - `vi` là câu ĐANG CHẠY hôm nay, chép nguyên văn từng chữ. Đổi chữ ở đây là
 *     đổi thứ khách Việt đang thấy — không làm kèm trong task dịch.
 *   - `en` nói CÙNG MỘT ĐIỀU, không dịch máy, không diễn giải rộng thêm.
 *   - Thiếu bản dịch thì lùi về `vi`, không bao giờ hiện khoá cho người dùng.
 */
type Message = {
  vi: string;
  en: string;
  /**
   * Chuỗi NGUYÊN VĂN trả cho Public Order API, khai khi và chỉ khi câu này
   * từng đi ra bề mặt máy TRƯỚC ORD-29 dưới dạng khác. Bên đó chỉ có mỗi chuỗi
   * message để bám vì API chưa trả mã lỗi — giữ nguyên văn là cách duy nhất
   * không làm gãy tích hợp đang chạy.
   */
  machine?: string;
};
type MessageFn<A extends unknown[]> = (...args: A) => Message;

export const CUSTOMER_MESSAGES = {
  // ── Customer Portal: catalog ────────────────────────────────────────────
  productNotFound: {
    vi: 'Không tìm thấy sản phẩm này.',
    en: 'This product could not be found.',
  },

  // ── Customer Portal: đơn hàng ───────────────────────────────────────────
  orderNotFound: {
    vi: 'Không tìm thấy đơn',
    en: 'Order not found',
  },
  orderNotFoundDot: {
    vi: 'Không tìm thấy đơn này.',
    en: 'This order could not be found.',
  },
  orderNotFoundByCode: {
    vi: 'Không tìm thấy đơn với mã này.',
    en: 'No order found with this code.',
  },
  productionIdEmpty: {
    vi: 'Production ID rỗng.',
    en: 'Production ID is empty.',
  },
  orderCancelled: {
    vi: 'Đơn đã hủy.',
    en: 'This order has been cancelled.',
  },
  orderCancelledCannotEdit: {
    vi: 'Đơn đã hủy, không thể chỉnh sửa.',
    en: 'This order has been cancelled and can no longer be edited.',
  },
  orderPushedEditLimited: {
    vi: 'Đơn đã đẩy sản xuất — chỉ sửa được mockup/design/địa chỉ qua trang chi tiết đơn.',
    en: 'This order is already in production — only the mockup, design and shipping address can still be changed, from the order detail page.',
  },
  importTooManyLines: {
    vi: 'Tối đa 500 dòng mỗi lần import.',
    en: 'At most 500 rows per import.',
  },
  paymentGateNotReady: {
    vi: 'Cổng thanh toán đang bật nhưng luồng xác nhận chưa mở — liên hệ hỗ trợ.',
    en: 'The payment gate is on but the confirmation flow is not open yet — please contact support.',
  },

  // ── Customer Portal: thiếu file thiết kế (ORD-22 / ORD-25) ──────────────
  missingMockup: ((product: string): Message => ({
    vi: `Sản phẩm "${product}": thiếu ảnh mockup`,
    en: `Product "${product}": mockup image is required`,
    // Nguyên văn chuỗi song ngữ của ORD-22 — `pushToProduction()` dùng CHUNG
    // cho portal và `POST /open-api/orders/push`, nên bề mặt máy phải nhận đúng
    // chuỗi cũ. Ép tiếng Việt không đủ: chính câu tiếng Việt đã đổi.
    machine: `Sản phẩm "${product}": thiếu ảnh mockup — Product "${product}": mockup image is required`,
  })) as MessageFn<[string]>,
  // Luật nới 27/08: chỉ cần 1 design ở 1 trong các vị trí liệt kê (thường là
  // "Mặt trước (front) hoặc Mặt sau (back)") — không còn đòi đủ mọi vị trí.
  missingDesign: ((product: string, areas: string): Message => ({
    vi: `Sản phẩm "${product}": thiếu file design — cần ít nhất 1 design ở vị trí ${areas}`,
    en: `Product "${product}": design file missing — need at least one design for ${areas}`,
    machine:
      `Sản phẩm "${product}": thiếu file design — cần ít nhất 1 design ở vị trí ${areas} — ` +
      `Product "${product}": design file missing — need at least one design for ${areas}`,
  })) as MessageFn<[string, string]>,

  // ── Ô tải file design (design-storage) ──────────────────────────────────
  designStoreNotConfigured: {
    vi: 'Kho design chưa được cấu hình — liên hệ hỗ trợ.',
    en: 'The design store is not configured yet — please contact support.',
  },
  designStoreNotConfiguredShort: {
    vi: 'Kho design chưa được cấu hình.',
    en: 'The design store is not configured yet.',
  },
  designStoreNotConfiguredEnv: {
    vi: 'Kho design chưa được cấu hình (R2_* env)',
    en: 'The design store is not configured (R2_* env)',
  },
  designFileTooLargePresign: ((sizeMb: string, maxMb: number): Message => ({
    vi: `File ${sizeMb} MB vượt giới hạn ${maxMb} MB`,
    en: `This file is ${sizeMb} MB, over the ${maxMb} MB limit`,
  })) as MessageFn<[string, number]>,
  designFileTooLarge: ((maxMb: number): Message => ({
    vi: `File vượt giới hạn ${maxMb} MB`,
    en: `This file is over the ${maxMb} MB limit`,
  })) as MessageFn<[number]>,
  designRecordFailed: {
    vi: 'Không tạo được record design — thử lại.',
    en: 'Could not create the design record — please try again.',
  },
  designTmpKeyInvalid: {
    vi: 'tmpKey không hợp lệ',
    en: 'Invalid tmpKey',
  },
  designUploadNotFound: {
    vi: 'Không tìm thấy file đã upload — thử upload lại.',
    en: 'The uploaded file could not be found — please upload it again.',
  },
  designUploadEmpty: {
    vi: 'File upload rỗng — thử lại.',
    en: 'The uploaded file is empty — please try again.',
  },
  designPresignMissing: {
    vi: 'Chưa có record presign cho sha này — gọi presign trước.',
    en: 'No presign record exists for this sha — call presign first.',
  },
  designNotFound: {
    vi: 'Design không tồn tại',
    en: 'This design does not exist',
  },
  designJobFailed: {
    vi: 'Không đẩy được job xử lý design — thử lại sau.',
    en: 'Could not queue the design processing job — please try again later.',
  },

  // ── Trang API/webhook trong portal (customer-webhook) ───────────────────
  webhookTooMany: ((max: number): Message => ({
    vi: `Tối đa ${max} webhook — xóa bớt URL cũ trước.`,
    en: `At most ${max} webhooks — remove an existing URL first.`,
  })) as MessageFn<[number]>,
  webhookUrlInvalid: {
    vi: 'URL webhook phải là http(s)',
    en: 'The webhook URL must be http(s)',
  },
  webhookNotFound: {
    vi: 'Không tìm thấy webhook',
    en: 'Webhook not found',
  },
} as const;

type Catalogue = typeof CUSTOMER_MESSAGES;

/**
 * Câu thông báo theo ngôn ngữ của request đang xử lý. Không có bản dịch cho
 * ngôn ngữ đó thì lùi về tiếng Việt — người dùng thấy một câu tiếng Việt vẫn
 * hơn thấy `error.order.notFound`.
 */
export function customerMessage<K extends keyof Catalogue>(
  key: K,
  ...args: Catalogue[K] extends MessageFn<infer A> ? A : []
): string {
  const entry = CUSTOMER_MESSAGES[key] as Message | MessageFn<unknown[]>;
  const msg = typeof entry === 'function' ? entry(...(args as unknown[])) : entry;
  // Bề mặt máy: trả nguyên văn chuỗi cũ nếu câu này có khai, KHÔNG dịch.
  if (currentIsMachine() && msg.machine) return msg.machine;
  return (currentLang() === 'en' ? msg.en : undefined) ?? msg.vi;
}
