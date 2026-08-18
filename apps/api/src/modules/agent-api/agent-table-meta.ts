import type { AgentFieldMeta, AgentTableSummary } from 'shared';

import type { AgentTableSpec } from './registry';

/**
 * Dựng metadata của một bảng từ registry — **nơi duy nhất** làm việc này
 * (`API-18`).
 *
 * Trước task này có hai nơi đọc registry rồi tự dựng mô tả: `AgentAdminService`
 * cho trang quản trị (đủ sáu thuộc tính mỗi trường) và `AgentReadService` cho
 * bề mặt agent (chỉ tên trường). Yêu cầu mới là hai nơi phải nói **cùng một
 * thứ** về cùng một trường, và AC-03 kiểm đúng điều đó.
 *
 * Cách chắc chắn nhất để hai bản không lệch là **không có bản thứ hai**. Hàm
 * này trả bản đầy đủ; bề mặt quản trị lấy nó rồi bỏ hai khoá nó không cần, chứ
 * không dựng lại từ registry.
 *
 * CHỈ ĐỌC HẰNG SỐ TRONG BỘ NHỚ. Hàm này không chạm collection nào, nên "lộ giá
 * trị bản ghi" không phải điều nó có thể làm — kể cả khi trả ra tên những
 * trường bị che (AC-02).
 */
export const buildTableMeta = (spec: AgentTableSpec): AgentTableSummary => {
  const fields: AgentFieldMeta[] = Object.entries(spec.fields).map(([name, policy]) => ({
    name,
    type: policy.type,
    read: policy.read,
    filter: policy.filter,
    sortable: policy.sortable,
    groupable: policy.groupable,
    aggregatable: policy.aggregatable,
    freeText: policy.freeText,
    note: policy.note,
  }));

  return {
    key: spec.key,
    description: spec.description,
    entityName: spec.entityName,
    defaultSort: spec.defaultSort,
    fieldCount: fields.length,
    // Suy từ chính `fields` ở trên, không tính lại bằng đường khác: hai cách
    // đếm cùng một thứ là hai cách để lệch nhau.
    readableFields: fields.filter((field) => field.read).map((field) => field.name),
    fields,
    // Chỉ TÊN trường, không bao giờ giá trị.
    excludedFields: [...spec.deliberatelyExcluded],
  };
};
