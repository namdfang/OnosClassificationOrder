import { Injectable } from '@nestjs/common';
import type { PipelineStage } from 'mongoose';
import type { AgentAggregate, AgentCondition, AgentFilterNode, AgentSelect, AgentSort } from 'shared';
import { AGENT_FILTER_MAX_DEPTH } from 'shared';

import { ApiConfigService } from '@/shared/services/api-config.service';

import { AgentApiRepository } from './agent-api.repository';
import { fieldNotAllowed, invalidQuery, isMongoTimeout, queryTimeout, tableNotAllowed } from './agent-errors';
import { applyOrderLogValuePolicy } from './order-log-value-policy';
import { pickProjected } from './pick-projected';
import type { AgentFieldPolicy, AgentTableSpec } from './registry';
import { AGENT_TABLE_REGISTRY } from './registry';

type Row = Record<string, unknown>;

const EQ_ONLY_OPS = new Set(['eq', 'ne', 'in', 'nin']);

/**
 * Lõi của bộ API agent (`API-1`): tra bảng, dựng pipeline, che dữ liệu.
 *
 * Ba điều giữ cho lớp che không thủng, xem `.devtasks/design/API-1.md` §7.1:
 *  1. `$project` LUÔN dựng từ registry, không bao giờ từ tham số bên gọi —
 *     trường bị che không được đọc lên khỏi DB, chứ không phải lấy lên rồi xoá.
 *  2. Tên trường của bên gọi luôn phải đi qua registry trước khi chạm mongo.
 *  3. Giá trị của bên gọi chỉ nằm ở VỊ TRÍ GIÁ TRỊ, không bao giờ ở vị trí
 *     toán tử hay tên trường.
 */
@Injectable()
export class AgentQueryService {
  constructor(
    private readonly repository: AgentApiRepository,
    private readonly config: ApiConfigService,
  ) {}

  // ─── Tra bang / truong ────────────────────────────────────────────────

  /**
   * Bảng không có khoá trong registry là KHÔNG TỒN TẠI đối với bộ API. Dùng
   * cùng một thân lỗi cho bảng-có-thật-nhưng-cấm (`users`) và bảng-không-tồn-
   * tại (`zz_qa_probe`) — vừa thoả AC-04/AC-05, vừa không biến API thành công
   * cụ dò xem collection nào đang tồn tại (AC-04).
   */
  spec(table: string): AgentTableSpec {
    const found = AGENT_TABLE_REGISTRY[table];
    if (!found) throw tableNotAllowed(table);
    return found;
  }

  private policy(spec: AgentTableSpec, field: string): AgentFieldPolicy {
    const p = spec.fields[field];
    if (!p) throw fieldNotAllowed(field, `is not available on table '${spec.key}'.`);
    return p;
  }

  /** Các trường được phép có mặt trong dữ liệu trả về. */
  readableFields(spec: AgentTableSpec): string[] {
    return Object.entries(spec.fields)
      .filter(([, p]) => p.read)
      .map(([name]) => name);
  }

  /**
   * `$project` của server. `requested` (nếu có) chỉ được THU HẸP tập này —
   * trường ngoài danh sách trắng bị từ chối tường minh, không im lặng bỏ qua:
   * bên gọi phải biết mình xin sai để tự sửa.
   */
  buildProjection(spec: AgentTableSpec, requested?: string[]): Record<string, 1> {
    let fields = this.readableFields(spec);
    if (requested?.length) {
      for (const f of requested) {
        const p = spec.fields[f];
        if (!p) throw fieldNotAllowed(f, `is not available on table '${spec.key}'.`);
        if (!p.read) throw fieldNotAllowed(f, 'exists but is never returned by this API.');
      }
      fields = requested;
    }
    return Object.fromEntries(fields.map((f) => [f, 1 as const]));
  }

  // ─── Chan ghi va chay ma ──────────────────────────────────────────────

  /**
   * Lớp chặn THỨ NHẤT của AC-06, chạy trước cả Zod: bất kỳ KHOÁ nào của object
   * bắt đầu bằng `$` hoặc chứa dấu chấm đều bị từ chối. Chặn `$where`,
   * `$function`, `$accumulator`, `$merge`, `$out`, và cả injection toán tử qua
   * giá trị lồng nhau.
   */
  assertNoOperatorKeys(payload: unknown, depth = 0): void {
    if (depth > 12) throw invalidQuery('Payload lồng quá sâu.');
    if (Array.isArray(payload)) {
      payload.forEach((v) => this.assertNoOperatorKeys(v, depth + 1));
      return;
    }
    if (typeof payload !== 'object' || payload === null) return;
    for (const [key, value] of Object.entries(payload)) {
      if (key.startsWith('$') || key.includes('.')) {
        throw invalidQuery(
          `Key '${key}' is not allowed. This API accepts only its own query language, not raw database operators.`,
        );
      }
      this.assertNoOperatorKeys(value, depth + 1);
    }
  }

  // ─── Dieu kien loc ────────────────────────────────────────────────────

  private condition(spec: AgentTableSpec, c: AgentCondition): Record<string, unknown> {
    const p = this.policy(spec, c.field);
    if (p.filter === 'none') {
      throw fieldNotAllowed(
        c.field,
        p.freeText
          ? // `API-11` bỏ che văn bản tự do, nên thông điệp cũ ("che chỉ chạy ở
            // đầu ra") nay sai sự thật — và bên đọc nó là agent, thứ sẽ tin
            // nguyên văn những gì ta viết. Lý do thật của lệnh cấm là phạm vi:
            // đọc một ghi chú đã cầm trên tay khác hẳn việc TÌM ra đơn nào chứa
            // một số điện thoại.
            'is free text and can be read but not filtered: filtering it would allow scanning the whole table for a contact detail. Filter by an identifier instead.'
          : 'cannot be used as a filter condition.',
      );
    }
    if (p.filter === 'eq' && !EQ_ONLY_OPS.has(c.op)) {
      throw fieldNotAllowed(
        c.field,
        `only supports exact-match filtering (eq, ne, in, nin). Operator '${c.op}' would allow probing its value.`,
      );
    }

    const v = c.value;
    switch (c.op) {
      case 'eq':
        return { [c.field]: v };
      case 'ne':
        return { [c.field]: { $ne: v } };
      case 'in':
      case 'nin': {
        if (!Array.isArray(v)) throw invalidQuery(`Operator '${c.op}' requires an array value.`);
        return { [c.field]: c.op === 'in' ? { $in: v } : { $nin: v } };
      }
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        if (Array.isArray(v)) throw invalidQuery(`Operator '${c.op}' requires a single value.`);
        return { [c.field]: { [`$${c.op}`]: this.coerce(p, v) } };
      }
      case 'between': {
        if (!Array.isArray(v) || v.length !== 2) {
          throw invalidQuery("Operator 'between' requires an array of exactly two values.");
        }
        return { [c.field]: { $gte: this.coerce(p, v[0]), $lte: this.coerce(p, v[1]) } };
      }
      case 'exists':
        return { [c.field]: { $exists: v !== false } };
      case 'startsWith': {
        if (typeof v !== 'string') throw invalidQuery("Operator 'startsWith' requires a string value.");
        // Escape trước khi dựng `^...` — giá trị của bên gọi không được trở
        // thành cú pháp biểu thức chính quy.
        return { [c.field]: { $regex: `^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } };
      }
      default:
        throw invalidQuery(`Unsupported operator '${String(c.op)}'.`);
    }
  }

  /** Chuỗi ISO trên trường ngày phải thành `Date`, nếu không so sánh khoảng sẽ sai âm thầm. */
  private coerce(p: AgentFieldPolicy, value: unknown): unknown {
    if (p.type === 'date' && typeof value === 'string') {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw invalidQuery(`Value '${value}' is not a valid date.`);
      return d;
    }
    return value;
  }

  buildFilter(spec: AgentTableSpec, node?: AgentFilterNode, depth = 0): Record<string, unknown> {
    if (!node) return {};
    if (depth > AGENT_FILTER_MAX_DEPTH) {
      throw invalidQuery(`Filter is nested deeper than ${AGENT_FILTER_MAX_DEPTH} levels.`);
    }
    if ('and' in node) return { $and: node.and.map((n) => this.buildFilter(spec, n, depth + 1)) };
    if ('or' in node) return { $or: node.or.map((n) => this.buildFilter(spec, n, depth + 1)) };
    if ('not' in node) return { $nor: [this.buildFilter(spec, node.not, depth + 1)] };
    return this.condition(spec, node);
  }

  // ─── Sap xep ──────────────────────────────────────────────────────────

  buildSort(spec: AgentTableSpec, sort: AgentSort[] | undefined, allowed?: Set<string>): Record<string, 1 | -1> {
    if (!sort?.length) return {};
    const out: Record<string, 1 | -1> = {};
    for (const s of sort) {
      // Trong nhánh tổng hợp, tên cột kết quả (metric / khoá nhóm) là hợp lệ.
      if (allowed?.has(s.field)) {
        out[s.field] = s.dir === 'desc' ? -1 : 1;
        continue;
      }
      const p = this.policy(spec, s.field);
      // `sortable ⇒ read`: sắp xếp theo trường không đọc được vẫn để lộ quan hệ
      // so sánh giữa các bản ghi.
      if (!p.sortable) throw fieldNotAllowed(s.field, 'cannot be used for sorting.');
      out[s.field] = s.dir === 'desc' ? -1 : 1;
    }
    return out;
  }

  // ─── Che du lieu dau ra ───────────────────────────────────────────────

  /**
   * Ghép `before`/`after` có kiểm soát cho `orderLogs` (AC-17).
   *
   * KHÔNG còn che email/điện thoại trong trường văn bản tự do (`API-11`):
   * người dùng yêu cầu agent đọc **nguyên văn** ghi chú, vì văn bản bị cắt xén
   * làm agent trả lời khách dựa trên một bản đã mất ngữ cảnh.
   *
   * Rủi ro đã nêu rõ và người dùng vẫn quyết: agent đang chăm sóc khách A có
   * thể đọc được email hoặc số điện thoại của khách B nằm trong ghi chú của một
   * đơn khác. Đây là rò rỉ **chéo giữa các khách hàng**, không phải rò ra ngoài
   * công ty — bộ API vẫn nằm sau khoá và vẫn chỉ đọc. Không phải bug mới phát
   * hiện; siết lại là change request.
   *
   * Bỏ che **không** kéo theo cho lọc: trường văn bản tự do vẫn `filter: 'none'`
   * (xem `condition()`). Cho lọc là cho **quét toàn bộ dữ liệu** theo một mảnh
   * thông tin liên hệ — nặng hơn hẳn việc đọc, và người dùng đã bác việc nới
   * mức lọc ở `API-6`.
   */
  maskRows(spec: AgentTableSpec, rows: Row[], raw?: Row[]): Row[] {
    return rows.map((row, i) => {
      const out: Row = { ...row };
      if (spec.key === 'orderLogs') {
        const source = raw?.[i] ?? {};
        Object.assign(out, applyOrderLogValuePolicy(out.field, source.before, source.after));
      }
      return out;
    });
  }

  // ─── Chay truy van ────────────────────────────────────────────────────

  clampLimit(requested: number | undefined, fallback = 50): number {
    const max = this.config.agentApi.maxLimit;
    if (!requested || requested < 1) return Math.min(fallback, max);
    return Math.min(requested, max);
  }

  /**
   * Bọc mọi lời gọi DB. `maxTimeMS` phải có ở MỌI `find()`/`aggregate()` của
   * module — sót một chỗ là AC-15 hổng đúng ở chỗ đó.
   */
  async run<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isMongoTimeout(error)) throw queryTimeout(timeoutMs);
      throw error;
    }
  }

  async selectRows(
    spec: AgentTableSpec,
    filter: Record<string, unknown>,
    select: AgentSelect | undefined,
  ): Promise<{ items: Row[]; limitApplied: number }> {
    const limit = this.clampLimit(select?.limit);
    const timeoutMs = this.config.agentApi.queryTimeoutMs;
    const projection = this.buildProjection(spec, select?.fields);
    const sort = this.buildSort(spec, select?.sort);
    const offset = select?.offset ?? 0;
    if (offset > 10_000) throw invalidQuery('Offset above 10000 is not supported. Narrow the filter instead.');

    // `orderLogs` cần đọc thêm `before`/`after` để chính sách AC-17 quyết định
    // — chúng KHÔNG có trong registry nên phải xin riêng ở đây, và không bao
    // giờ ra ngoài mà chưa qua `applyOrderLogValuePolicy`.
    const dbProjection =
      spec.key === 'orderLogs' ? { ...projection, before: 1 as const, after: 1 as const } : projection;

    const raw = await this.run(
      () =>
        this.repository.find({
          entityName: spec.entityName,
          filter,
          projection: dbProjection,
          sort: Object.keys(sort).length ? sort : { [spec.defaultSort]: 1 },
          skip: offset,
          limit,
          maxTimeMS: timeoutMs,
        }),
      timeoutMs,
    );

    const rows = raw.map((r) => pickProjected(r, projection));
    return { items: this.maskRows(spec, rows, raw), limitApplied: limit };
  }

  async aggregate(
    spec: AgentTableSpec,
    filter: Record<string, unknown>,
    agg: AgentAggregate,
  ): Promise<{ items: Row[]; limitApplied: number }> {
    const timeoutMs = this.config.agentApi.queryTimeoutMs;
    const limit = Math.min(agg.limit ?? 200, 1000);

    const groupBy = agg.groupBy ?? [];
    for (const g of groupBy) {
      const p = this.policy(spec, g);
      // `groupable ⇒ read`: khoá nhóm hiện nguyên ở kết quả, nên nhóm theo
      // trường không đọc được chính là đọc nó dưới một cái tên khác.
      if (!p.groupable) throw fieldNotAllowed(g, 'cannot be used for grouping.');
    }

    const groupId =
      groupBy.length === 0 ? null : Object.fromEntries(groupBy.map((g) => [g.replace(/\./g, '__'), `$${g}`]));

    const groupStage: Record<string, unknown> = { _id: groupId };
    for (const m of agg.metrics) {
      if (m.op === 'count') {
        groupStage[m.as] = { $sum: 1 };
        continue;
      }
      if (!m.field) throw invalidQuery(`Metric '${m.op}' requires a field.`);
      const p = this.policy(spec, m.field);
      // Bất biến I5: `min`/`max` trên trường không đọc được chính là đọc giá trị.
      if (!p.aggregatable || !p.read) {
        throw fieldNotAllowed(m.field, `cannot be used with metric '${m.op}'.`);
      }
      groupStage[m.as] = { [`$${m.op}`]: `$${m.field}` };
    }

    const resultKeys = new Set<string>([
      ...agg.metrics.map((m) => m.as),
      ...groupBy.map((g) => g.replace(/\./g, '__')),
    ]);
    const sort = this.buildSort(spec, agg.sort, resultKeys);

    // `variations.retailPrice` nằm trong MẢNG subdoc, nên `$group` nhận cả mảng
    // thay vì từng giá trị: `$sum` ra 0, `$avg` ra null, `$min`/`$max` trả về
    // chính cái mảng, và nhóm theo `variations.sku` gom theo BẢN GHI chứ không
    // theo sku. Tất cả đều HTTP 200 nên bên gọi không biết câu trả lời đã sai
    // (`QA-3`). Trải mảng ra trước khi nhóm là điều kiện để phép tính có nghĩa.
    //
    // Chỉ thêm `$unwind` khi thật sự có đường dẫn lồng: truy vấn trên trường
    // phẳng giữ nguyên pipeline cũ, từng bước một.
    const unwindRoots = new Set<string>();
    for (const path of [...groupBy, ...agg.metrics.map((m) => m.field ?? '')]) {
      if (path.includes('.')) unwindRoots.add(path.split('.')[0]);
    }

    const pipeline: PipelineStage[] = [{ $match: filter }];
    for (const root of unwindRoots) {
      // Không `preserveNullAndEmptyArrays`: bản ghi không có biến thể nào thì
      // không có giá nào để cộng — giữ lại chỉ tạo ra nhóm rỗng giả.
      pipeline.push({ $unwind: `$${root}` });
    }
    pipeline.push({ $group: groupStage as PipelineStage.Group['$group'] });
    // Trải khoá nhóm ra cấp trên cho dễ đọc; tên đã được chuẩn hoá ở `groupId`.
    if (groupBy.length) {
      const projectStage: Record<string, unknown> = { _id: 0 };
      for (const g of groupBy) {
        const alias = g.replace(/\./g, '__');
        projectStage[alias] = `$_id.${alias}`;
      }
      for (const m of agg.metrics) projectStage[m.as] = 1;
      pipeline.push({ $project: projectStage });
    } else {
      const projectStage: Record<string, unknown> = { _id: 0 };
      for (const m of agg.metrics) projectStage[m.as] = 1;
      pipeline.push({ $project: projectStage });
    }
    if (Object.keys(sort).length) pipeline.push({ $sort: sort });
    pipeline.push({ $limit: limit });

    const items = await this.run(
      () => this.repository.aggregate({ entityName: spec.entityName, pipeline, maxTimeMS: timeoutMs }),
      timeoutMs,
    );

    return { items, limitApplied: limit };
  }

  /**
   * Bản DSL đã chuẩn hoá để ghi nhật ký (BR-7, AC-14). Điều kiện lọc trên
   * trường `read:false` chỉ giữ `{field, op}` — email khách dùng làm điều kiện
   * lọc LÀ dữ liệu BR-4, ghi nguyên vào nhật ký là tự tạo ra một kho email thứ
   * hai ngay trong hệ thống.
   */
  digest(spec: AgentTableSpec, node?: AgentFilterNode): unknown {
    if (!node) return undefined;
    if ('and' in node) return { and: node.and.map((n) => this.digest(spec, n)) };
    if ('or' in node) return { or: node.or.map((n) => this.digest(spec, n)) };
    if ('not' in node) return { not: this.digest(spec, node.not) };
    const p = spec.fields[node.field];
    if (p && !p.read) return { field: node.field, op: node.op, value: '<redacted>' };
    return { field: node.field, op: node.op, value: node.value };
  }
}
