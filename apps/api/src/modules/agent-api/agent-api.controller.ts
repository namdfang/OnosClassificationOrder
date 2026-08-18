import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AgentQueryPayload } from 'shared';
import {
  AgentQueryDto,
  AgentQueryResDto,
  GetAgentDocResDto,
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
  listTables(): ListAgentTablesResDto {
    const startedAt = Date.now();
    this.log('GET', '/agent/tables');
    const data = this.read.listTables();
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
        returned: data.items.length,
        durationMs: Date.now() - startedAt,
        outcome: 'ok',
      });
      return { success: true, data };
    } catch (error) {
      this.audit.write({
        capability: 'read_rows',
        table,
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
