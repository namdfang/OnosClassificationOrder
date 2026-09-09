/**
 * Ví seller — hằng runtime nest-free cho app browser (`apps/seller` render
 * filter/badge loại giao dịch). Schema/DTO đầy đủ ở `dtos/customer-wallet.dto.ts`
 * (re-export lại từ đây).
 */
export const WALLET_TXN_KINDS = [
  /** Admin nạp tay (seller chuyển khoản ngoài hệ thống — phase 1). */
  'topup',
  /** Trừ tiền mua label (giá bảng seller, KHÔNG phải giá VNP). */
  'label',
  /** Hoàn tự động khi VNP mua lỗi, hoặc admin hoàn tay sau khi hủy label. */
  'label_refund',
  /** Tiền đơn hàng — CHƯA dùng, chừa cho lúc bật gate thu tiền push. */
  'order',
  /** Admin điều chỉnh tay (+/−, bắt buộc ghi chú). */
  'adjust',
] as const;
export type WalletTxnKind = (typeof WALLET_TXN_KINDS)[number];
