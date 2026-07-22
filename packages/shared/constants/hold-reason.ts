/**
 * Lý do giữ đơn "chờ khách cập nhật" — giá trị chính xác được set khi giữ đơn
 * (`HoldOrderDialog.tsx`/`BulkEditToolbar.tsx`) và match CHÍNH XÁC (không phải
 * substring) bởi cron tự động lấy ngược design/địa chỉ ship từ OnosPod
 * (`OrderService.getHeldOrdersForRecovery`). Đổi text ở đây là đổi luôn cả 2
 * chỗ — KHÔNG sửa lẻ ở FE.
 */
export const HOLD_REASON_WAITING_DESIGN = 'Đợi khách sửa design';
export const HOLD_REASON_WAITING_ADDRESS = 'Đợi khách sửa địa chỉ';
