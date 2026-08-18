import { Injectable } from '@nestjs/common';
import type { AgentRowsPayload, AgentTableSummary } from 'shared';

import { ApiConfigService } from '@/shared/services/api-config.service';

import { AgentApiRepository } from './agent-api.repository';
import { AgentQueryService } from './agent-query.service';
import { AGENT_TABLE_REGISTRY } from './registry';

type Row = Record<string, unknown>;

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
  async readRows(table: string, limit?: number, cursor?: string, fields?: string[]): Promise<AgentRowsPayload> {
    const spec = this.queries.spec(table);
    const timeoutMs = this.config.agentApi.readTimeoutMs;
    const limitApplied = this.queries.clampLimit(limit);
    const projection = this.queries.buildProjection(spec, fields);

    const dbProjection =
      spec.key === 'orderLogs' ? { ...projection, before: 1 as const, after: 1 as const } : projection;

    const filter = cursor ? { _id: { $gt: cursor } } : {};

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

    const rows = raw.map((r) => {
      const out: Row = {};
      for (const key of Object.keys(projection)) if (r[key] !== undefined) out[key] = r[key];
      return out;
    });
    const items = this.queries.maskRows(spec, rows, raw);

    // Còn trang sau khi lô đầy tới trần — lô vơi nghĩa là đã hết dữ liệu.
    const last = raw.at(-1);
    const nextCursor = items.length === limitApplied && last?._id ? String(last._id) : undefined;

    return { items, nextCursor, meta: { table: spec.key, returned: items.length, limitApplied } };
  }
}
