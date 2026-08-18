import { Injectable } from '@nestjs/common';
import type { AgentRowsPayload, AgentTableSummary } from 'shared';

import { ApiConfigService } from '@/shared/services/api-config.service';

import { AgentApiRepository } from './agent-api.repository';
import { invalidQuery } from './agent-errors';
import { AgentQueryService } from './agent-query.service';
import { pickProjected } from './pick-projected';
import type { AgentTableSpec } from './registry';
import { AGENT_TABLE_REGISTRY } from './registry';

/**
 * Năng lực A của bộ API agent (`API-1`): liệt kê bảng và đọc dữ liệu thô theo
 * lô có giới hạn (AC-02, AC-03).
 */
@Injectable()
export class AgentReadService {
  constructor(
    private readonly queries: AgentQueryService,
    private readonly repository: AgentApiRepository,
    private readonly config: ApiConfigService,
  ) {}

  listTables(): AgentTableSummary[] {
    return Object.values(AGENT_TABLE_REGISTRY).map((spec) => ({
      key: spec.key,
      description: spec.description,
      fieldCount: Object.keys(spec.fields).length,
      readableFields: this.queries.readableFields(spec),
    }));
  }

  /**
   * Đọc thô, phân trang THEO CON TRỎ trên `_id` tăng dần. Không dùng `skip`:
   * bảng `orders` lớn, `skip` sâu vừa chậm vừa vi phạm BR-6.
   *
   * Hết dữ liệu thì `items` rỗng và KHÔNG có `nextCursor` — phân biệt được với
   * trường hợp bị từ chối (403), đúng luồng ngoại lệ của SRS mục 6.
   */
  async readRows(
    table: string,
    limit?: number,
    cursor?: string,
    fields?: string[],
    filterJson?: string,
  ): Promise<AgentRowsPayload> {
    const spec = this.queries.spec(table);
    const timeoutMs = this.config.agentApi.readTimeoutMs;
    const limitApplied = this.queries.clampLimit(limit);
    const projection = this.queries.buildProjection(spec, fields);

    const dbProjection =
      spec.key === 'orderLogs' ? { ...projection, before: 1 as const, after: 1 as const } : projection;

    // Lọc theo dữ liệu (`API-6`) dùng LẠI đúng cơ chế của `POST /query` — hai
    // đường lọc với hai bộ luật là cách chắc chắn để một ngày chúng lệch nhau,
    // và đường lỏng hơn sẽ thành lỗ hổng.
    const dataFilter = this.parseFilter(spec, filterJson);
    const cursorFilter = cursor ? { _id: { $gt: cursor } } : undefined;

    // `$and` chứ không trộn khoá: điều kiện của bên gọi có thể chạm `_id`, và
    // trộn nông sẽ để nó ĐÈ con trỏ phân trang — trang sau lặp lại trang trước.
    const filter = cursorFilter
      ? Object.keys(dataFilter).length
        ? { $and: [dataFilter, cursorFilter] }
        : cursorFilter
      : dataFilter;

    const raw = await this.queries.run(
      () =>
        this.repository.find({
          entityName: spec.entityName,
          filter,
          projection: dbProjection,
          sort: { _id: 1 },
          skip: 0,
          limit: limitApplied,
          maxTimeMS: timeoutMs,
        }),
      timeoutMs,
    );

    const rows = raw.map((r) => pickProjected(r, projection));
    const items = this.queries.maskRows(spec, rows, raw);

    // Còn trang sau khi lô đầy tới trần — lô vơi nghĩa là đã hết dữ liệu.
    const last = raw.at(-1);
    const nextCursor = items.length === limitApplied && last?._id ? String(last._id) : undefined;

    return { items, nextCursor, meta: { table: spec.key, returned: items.length, limitApplied } };
  }

  /**
   * `filter` tới đây dưới dạng chuỗi JSON vì GET không có thân yêu cầu, rồi đi
   * qua **đúng cùng một bộ dịch** với `POST /query` (`API-8`). Hai đường lọc với
   * hai bộ luật là cách chắc chắn để một ngày chúng lệch nhau, và đường lỏng hơn
   * thành lỗ hổng.
   *
   * KHÔNG còn gọi `assertNoOperatorKeys` ở đây: từ `API-8`, `$` trong `filter`
   * là cú pháp hợp lệ. Việc kiểm do danh sách trắng toán tử trong
   * `mongo-filter.ts` đảm nhiệm — chặt hơn hẳn phép quét `$`, vì nó còn kiểm cả
   * chính sách trường. Trường `filter: 'none'` vẫn không lọc được,
   * `filter: 'eq'` vẫn chỉ so bằng.
   */
  private parseFilter(spec: AgentTableSpec, filterJson?: string): Record<string, unknown> {
    if (!filterJson) return {};

    let parsed: unknown;
    try {
      parsed = JSON.parse(filterJson);
    } catch {
      throw invalidQuery('Query parameter `filter` must be valid JSON.');
    }

    return this.queries.buildFilter(spec, parsed);
  }
}
