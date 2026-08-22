import { AsyncLocalStorage } from 'async_hooks';

/**
 * Ngôn ngữ của REQUEST hiện tại, giữ trong AsyncLocalStorage để tầng service
 * ném lỗi được đúng thứ tiếng mà KHÔNG phải thêm tham số vào từng hàm (ORD-29).
 *
 * Vì sao không dùng thẳng `I18nContext.current()` của nestjs-i18n dù nó đã được
 * cấu hình sẵn:
 *   1. `FALLBACK_LANGUAGE` của dự án đang là `en_US`. Đi theo cơ chế fallback đó
 *      thì request KHÔNG khai ngôn ngữ sẽ rơi vào tiếng Anh — ngược hẳn ràng
 *      buộc cứng "không gửi gì thì trả tiếng Việt y như hôm nay".
 *   2. Ta còn cần biết request đến từ BỀ MẶT MÁY hay bề mặt người (xem dưới),
 *      mà `I18nContext` không mang thông tin đó.
 * Nên chỗ này tự quyết định, không mượn cơ chế fallback của thư viện.
 */
export type CustomerLang = 'vi' | 'en';

interface RequestLanguageStore {
  lang: CustomerLang;
  /** true = Public Order API. Xem `isMachineSurface()`. */
  machine: boolean;
}

const storage = new AsyncLocalStorage<RequestLanguageStore>();

/**
 * Đường dẫn của **bề mặt máy**: Public Order API (ORD-4) cho hệ thống của khách
 * gọi bằng `X-Api-Key`. Bên đó KHÔNG đọc câu chữ — họ chỉ có mỗi chuỗi message
 * để bám vào vì API chưa trả mã lỗi, nên đổi câu là làm gãy tích hợp đang chạy
 * MÀ KHÔNG AI BÁO.
 *
 * Ép tiếng Việt tại một chỗ duy nhất, thay vì tin rằng máy sẽ không bao giờ gửi
 * `Accept-Language: en`. Ràng buộc "không đụng message của Public Order API" là
 * ràng buộc cứng, nên nó phải được BẢO ĐẢM chứ không phải được hy vọng.
 */
const MACHINE_SURFACE = /\/open-api\//i;

/** `vi` nếu không khai gì, khai thứ tiếng lạ, hoặc request là bề mặt máy. */
export function resolveRequestLang(acceptLanguage: string | undefined, url: string): CustomerLang {
  if (MACHINE_SURFACE.test(url)) return 'vi';
  if (!acceptLanguage) return 'vi';
  // Chỉ cần biết thẻ ngôn ngữ ĐẦU TIÊN có phải tiếng Anh không. Không dựng bộ
  // phân giải q-value đầy đủ: hệ chỉ có 2 thứ tiếng, và mọi giá trị không hiểu
  // được đều phải rơi về tiếng Việt.
  const first = acceptLanguage.split(',')[0]?.trim().toLowerCase() ?? '';
  return /^en\b|^en-/.test(first) ? 'en' : 'vi';
}

/** Request có đến từ Public Order API không. */
export function isMachineSurfaceUrl(url: string): boolean {
  return MACHINE_SURFACE.test(url);
}

/** Chạy `fn` trong ngữ cảnh ngôn ngữ của request. */
export function runWithRequestLang<T>(lang: CustomerLang, fn: () => T, machine = false): T {
  return storage.run({ lang, machine }, fn);
}

/** Ngôn ngữ của request đang xử lý — ngoài request (cron, consumer) trả `vi`. */
export function currentLang(): CustomerLang {
  return storage.getStore()?.lang ?? 'vi';
}

/**
 * Request đang xử lý có phải bề mặt máy không.
 *
 * Ép tiếng Việt CHƯA ĐỦ để giữ nguyên câu cho Public Order API: nếu bản thân
 * câu tiếng Việt bị sửa thì bên tích hợp vẫn gãy. Hai câu "thiếu mockup" /
 * "thiếu design" đi CHUNG hàm `pushToProduction()` với portal, nên chúng phải
 * giữ được nguyên văn chuỗi cũ khi đi ra bề mặt máy — xem `machine` trong
 * `CUSTOMER_MESSAGES` (TEST bắt được ở ORD-29 vòng 1).
 */
export function currentIsMachine(): boolean {
  return storage.getStore()?.machine ?? false;
}
