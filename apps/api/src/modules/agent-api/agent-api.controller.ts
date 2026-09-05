import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AgentQueryPayload } from 'shared';
import {
  AgentQueryDto,
  AgentQueryResDto,
  GetAgentDocResDto,
  GetAgentSellerSupportResDto,
  ListAgentDocsResDto,
  ListAgentTablesResDto,
  ReadAgentTableQueryDto,
  ReadAgentTableResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';
import { SWAGGER_AGENT_KEY_SECURITY } from '@/setup-swagger';

import { AGENT_API_RATE_LIMIT_PER_MIN, AGENT_API_RATE_LIMIT_TTL_MS } from './agent-api.constants';
import { AgentApiKeyGuard } from './agent-api-key.guard';
import { AgentAuditService } from './agent-audit.service';
import { AgentDocsService } from './agent-docs.service';
import { AgentExceptionFilter } from './agent-exception.filter';
import { AgentQueryService } from './agent-query.service';
import { AgentReadService } from './agent-read.service';
import { AgentSellerSupportService } from './agent-seller-support.service';
import { AGENT_SWAGGER_DESCRIPTION, agentSummary } from './agent-swagger-guide';

/**
 * Bộ API nội bộ cho AI agent (`API-1`) — xem
 * `documents/FunctionDescription/AgentApi.md`.
 *
 * CHỈ ĐỌC, không có ngoại lệ (BR-3). Xác thực bằng khoá riêng ở header
 * `X-Agent-Api-Key`; `@Auth(..., { public: true })` chỉ để bỏ qua JWT, còn
 * `AgentApiKeyGuard` mới là cửa thật và nó chạy TRƯỚC mọi validate tham số
 * (AC-01).
 */
/** Trần độ dài mỗi mảnh vết — nhật ký là VẾT, không phải bản sao yêu cầu. */
const DIGEST_MAX = 2000;

/**
 * Vết của một lượt `read_rows`: bộ lọc, cột và trần lô bên gọi đã dùng.
 *
 * Vì sao thêm: đường `query` ghi `queryDigest` ngay từ đầu, còn `read_rows` chỉ
 * ghi mỗi tên bảng — đo trên production 05/09: **0/10.203 lượt trong 24 giờ có
 * vết bộ lọc**, trong khi chính đường này kéo về 1,68 triệu dòng mỗi ngày. Số
 * bên agent báo ra mà vênh với hệ thì không truy được họ đã hỏi gì.
 *
 * `filter` tới dưới dạng chuỗi JSON (GET không có thân yêu cầu): parse được thì
 * lưu dạng object cho dễ đọc và truy vấn lại; không parse được thì giữ nguyên
 * văn — chính chuỗi hỏng đó mới là thứ cần nhìn khi bên kia gửi sai.
 *
 * KHÔNG cần che trường cấm ở đây: bộ lọc chứa trường cấm đã bị chặn từ vòng
 * phân tích (`isDeniedFieldPath`), nên thứ tới được đây vốn đã hợp lệ.
 */
function readDigest(query: ReadAgentTableQueryDto): Record<string, unknown> | undefined {
  const { filter, fields, limit } = query;
  if (!filter && !fields && limit === undefined) return undefined;

  let loc: unknown;
  if (filter) {
    try {
      loc = JSON.parse(filter.slice(0, DIGEST_MAX));
    } catch {
      loc = filter.slice(0, DIGEST_MAX);
    }
  }

  return {
    ...(loc === undefined ? {} : { filter: loc }),
    ...(fields ? { fields: fields.slice(0, DIGEST_MAX) } : {}),
    ...(limit === undefined ? {} : { limit }),
  };
}

@Controller('agent')
@ApiTags('agent-api')
@UseGuards(AgentApiKeyGuard)
// Thân lỗi của nhánh này mang `code` theo bảng 8 mã đã công bố — filter chung
// của repo dựng lại thân từ đầu nên nuốt mất (`QA-2`). Chỉ gắn ở đây, không
// đụng nhánh nào khác của app.
@UseFilters(AgentExceptionFilter)
@ApiSecurity(SWAGGER_AGENT_KEY_SECURITY)
export class AgentApiController {
  constructor(
    private readonly read: AgentReadService,
    private readonly queries: AgentQueryService,
    private readonly docs: AgentDocsService,
    private readonly sellerSupport: AgentSellerSupportService,
    private readonly audit: AgentAuditService,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  /**
   * Log theo quy ước repo. KHÔNG log giá trị điều kiện lọc — email khách dùng
   * làm điều kiện lọc là dữ liệu BR-4, và file log không phải nơi cất nó.
   */
  private log(method: string, url: string, extra?: Record<string, unknown>): void {
    this.logger.info({ message: JSON.stringify({ method, url, ...extra }) });
  }

  @Get('tables')
  @Auth([], [], { public: true })
  @Throttle({ default: { limit: AGENT_API_RATE_LIMIT_PER_MIN, ttl: AGENT_API_RATE_LIMIT_TTL_MS } })
  @ApiOperation({ summary: agentSummary('listTables'), description: AGENT_SWAGGER_DESCRIPTION.listTables })
  @HttpCode(HttpStatus.OK)
  async listTables(): Promise<ListAgentTablesResDto> {
    const startedAt = Date.now();
    this.log('GET', '/agent/tables');
    const data = await this.read.listTables();
    this.audit.write({
      capability: 'list_tables',
      returned: data.length,
      durationMs: Date.now() - startedAt,
      outcome: 'ok',
    });
    return { success: true, data };
  }

  @Get('tables/:table/rows')
  @Auth([], [], { public: true })
  @Throttle({ default: { limit: AGENT_API_RATE_LIMIT_PER_MIN, ttl: AGENT_API_RATE_LIMIT_TTL_MS } })
  @ApiOperation({ summary: agentSummary('readRows'), description: AGENT_SWAGGER_DESCRIPTION.readRows })
  @HttpCode(HttpStatus.OK)
  async readRows(
    @Param('table') table: string,
    @Query() query: ReadAgentTableQueryDto,
  ): Promise<ReadAgentTableResDto> {
    const startedAt = Date.now();
    this.log('GET', '/agent/tables/:table/rows', { table });
    try {
      const data = await this.read.readRows(table, query.limit, query.cursor, query.fields, query.filter);
      this.audit.write({
        capability: 'read_rows',
        table,
        queryDigest: readDigest(query),
        returned: data.items.length,
        durationMs: Date.now() - startedAt,
        outcome: 'ok',
      });
      return { success: true, data };
    } catch (error) {
      this.audit.write({
        capability: 'read_rows',
        table,
        queryDigest: readDigest(query),
        durationMs: Date.now() - startedAt,
        ...this.outcomeOf(error),
      });
      throw error;
    }
  }

  @Post('query')
  @Auth([], [], { public: true })
  @Throttle({ default: { limit: AGENT_API_RATE_LIMIT_PER_MIN, ttl: AGENT_API_RATE_LIMIT_TTL_MS } })
  @ApiOperation({ summary: agentSummary('query'), description: AGENT_SWAGGER_DESCRIPTION.query })
  @HttpCode(HttpStatus.OK)
  async query(@Body() body: AgentQueryDto): Promise<AgentQueryResDto> {
    const startedAt = Date.now();
    this.log('POST', '/agent/query', { table: body.table, mode: body.aggregate ? 'aggregate' : 'rows' });
    let digest: unknown;
    try {
      // Lớp chặn thứ nhất của AC-06 — chạy trước cả khi tra bảng.
      this.queries.assertNoOperatorKeysOutsideFilter(body);

      const spec = this.queries.spec(body.table);
      digest = this.queries.digest(spec, body.filter);
      const filter = this.queries.buildFilter(spec, body.filter);

      const result = body.aggregate
        ? await this.queries.aggregate(spec, filter, body.aggregate)
        : await this.queries.selectRows(spec, filter, body.select);

      const data: AgentQueryPayload = {
        items: result.items,
        meta: {
          table: spec.key,
          mode: body.aggregate ? 'aggregate' : 'rows',
          returned: result.items.length,
          limitApplied: result.limitApplied,
        },
      };
      this.audit.write({
        capability: 'query',
        table: body.table,
        queryDigest: digest,
        returned: data.items.length,
        durationMs: Date.now() - startedAt,
        outcome: 'ok',
      });
      return { success: true, data };
    } catch (error) {
      this.audit.write({
        capability: 'query',
        table: body.table,
        queryDigest: digest,
        durationMs: Date.now() - startedAt,
        ...this.outcomeOf(error),
      });
      throw error;
    }
  }

  /**
   * `AGENT-ZALO` — MỘT lệnh gọi trả đủ cho agent hỗ trợ khách / báo cáo chủ tịch.
   *
   * Thay cho việc agent tự ghép `zalo_group_summaries` + `zalo_group_links` +
   * `orders` + sản phẩm. Bốn vòng gọi cho một câu hỏi, mỗi chỗ ghép sai là một
   * câu trả lời sai gửi tới khách.
   *
   * Nhóm nội bộ KHÔNG BAO GIỜ xuất hiện ở đây: nguồn `zalo_group_summaries` chỉ
   * chứa nhóm khách/vận hành, tóm tắt bị xoá khi nhóm chuyển sang `internal`.
   */
  @Get('seller-support')
  @Auth([], [], { public: true })
  @Throttle({ default: { limit: AGENT_API_RATE_LIMIT_PER_MIN, ttl: AGENT_API_RATE_LIMIT_TTL_MS } })
  @ApiOperation({ summary: 'Tình hình từng nhóm khách/vận hành kèm số liệu đơn sống và sản phẩm hay đặt' })
  @HttpCode(HttpStatus.OK)
  async getSellerSupport(
    @Query('mucDo') mucDo?: string,
    @Query('userSku') userSku?: string,
    @Query('limit') limit?: string,
    @Query('kemSanPham') kemSanPham?: string,
  ): Promise<GetAgentSellerSupportResDto> {
    const startedAt = Date.now();
    this.log('GET', '/agent/seller-support', { mucDo });
    const data = await this.sellerSupport.list({
      mucDo,
      userSku,
      limit: limit ? Number(limit) : undefined,
      kemSanPham: kemSanPham === 'false' ? false : undefined,
    });
    this.audit.write({
      capability: 'seller_support',
      returned: data.length,
      durationMs: Date.now() - startedAt,
      outcome: 'ok',
    });

    return { success: true, data };
  }

  @Get('docs')
  @Auth([], [], { public: true })
  @Throttle({ default: { limit: AGENT_API_RATE_LIMIT_PER_MIN, ttl: AGENT_API_RATE_LIMIT_TTL_MS } })
  @ApiOperation({ summary: agentSummary('listDocs'), description: AGENT_SWAGGER_DESCRIPTION.listDocs })
  @HttpCode(HttpStatus.OK)
  listDocs(): ListAgentDocsResDto {
    const startedAt = Date.now();
    this.log('GET', '/agent/docs');
    const data = this.docs.list();
    this.audit.write({
      capability: 'docs_catalog',
      returned: data.length,
      durationMs: Date.now() - startedAt,
      outcome: 'ok',
    });
    return { success: true, data };
  }

  @Get('docs/:slug')
  @Auth([], [], { public: true })
  @Throttle({ default: { limit: AGENT_API_RATE_LIMIT_PER_MIN, ttl: AGENT_API_RATE_LIMIT_TTL_MS } })
  @ApiOperation({ summary: agentSummary('getDoc'), description: AGENT_SWAGGER_DESCRIPTION.getDoc })
  @HttpCode(HttpStatus.OK)
  getDoc(@Param('slug') slug: string): GetAgentDocResDto {
    const startedAt = Date.now();
    this.log('GET', '/agent/docs/:slug', { slug });
    try {
      const data = this.docs.get(slug);
      this.audit.write({
        capability: 'docs_get',
        docSlug: slug,
        returned: 1,
        durationMs: Date.now() - startedAt,
        outcome: 'ok',
      });
      return { success: true, data };
    } catch (error) {
      this.audit.write({
        capability: 'docs_get',
        docSlug: slug,
        durationMs: Date.now() - startedAt,
        ...this.outcomeOf(error),
      });
      throw error;
    }
  }

  /** Phân loại kết quả để ghi nhật ký — không bao giờ ném tiếp từ trong này. */
  private outcomeOf(error: unknown): { outcome: 'denied' | 'error' | 'timeout'; errorCode?: string } {
    const res = (error as { response?: { code?: string } })?.response;
    const code = typeof res?.code === 'string' ? res.code : undefined;
    if (code === 'QUERY_TIMEOUT') return { outcome: 'timeout', errorCode: code };
    if (code) return { outcome: 'denied', errorCode: code };
    return { outcome: 'error' };
  }
}
