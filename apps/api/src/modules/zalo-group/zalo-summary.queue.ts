import type { ZaloMessageInput } from 'shared';

/**
 * Tên hàng đợi + kiểu dữ liệu job, tách riêng khỏi cả service lẫn processor.
 *
 * Để chúng trong `zalo-summary.processor.ts` tạo VÒNG IMPORT: processor cần
 * service để chạy job, mà service cần tên hàng đợi để đẩy job. Vòng đó không
 * lộ ra lúc biên dịch — TypeScript qua bình thường — mà nổ lúc chạy với
 * "Cannot access 'ZaloSummaryService' before initialization", và API không
 * khởi động được.
 */
export const ZALO_SUMMARY_QUEUE = 'zalo-summary';

export interface ZaloSummaryJobData {
  groupGlobalId: string;
  messages: ZaloMessageInput[];
  docLaiTuDau?: boolean;
}
