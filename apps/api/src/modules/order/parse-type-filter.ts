/** Token lọc "đơn CHƯA XÁC ĐỊNH loại sản phẩm" — mirror `__none__` của toolResult/assignee. */
export const TYPE_NONE_TOKEN = '__none__';

/**
 * Parse tham số lọc `type` (tên loại sản phẩm) — dùng chung để 2 điểm đọc
 * (`buildOrderListFilter` và facet của `getWorkshopAvailableFilters`) không lệch nhau.
 *
 * `?type=A&type=B` → mảng · `?type=A` → chuỗi = ĐÚNG MỘT tên, lấy nguyên văn.
 *
 * **KHÔNG tách bằng dấu phẩy**, khác các facet CSV còn lại (`userSku`, `fabricType`,
 * `errorFile`…). Những facet kia mang mã/id nên dấu phẩy không bao giờ nằm trong giá
 * trị; `type` mang tên sản phẩm **tự do nhập từ file import** nên dấu phẩy là ký tự
 * DỮ LIỆU hợp lệ, không phải ký tự phân tách — tách ra sẽ lọc SAI ÂM THẦM (không báo
 * lỗi) với tên kiểu `"Tee, Long Sleeve"`.
 *
 * Encode cũng không cứu được: `URLSearchParams` mã hoá `,` thành `%2C` nhưng tầng parse
 * query giải mã ngược về `,` TRƯỚC khi `split(',')` chạy. Xem `.devtasks/design/ORD-1.md`
 * §9 D1. Đừng "dọn cho nhất quán" bằng cách trả lại `.split(',')`.
 *
 * Nằm ở file riêng thay vì trong `order.service.ts` để unit test import được nó mà
 * không kéo theo toàn bộ đồ thị phụ thuộc của Nest.
 */
export function parseTypeFilter(raw: string | string[]): { names: string[]; hasNone: boolean } {
  const values = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);

  return {
    names: values.filter((v) => v !== TYPE_NONE_TOKEN),
    hasNone: values.includes(TYPE_NONE_TOKEN),
  };
}
