import { BadRequestException, ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { AGENT_ERROR_CODES } from 'shared';

/**
 * Lỗi của bộ API agent (`API-1`). Bên gọi là AI agent, nên mỗi thông điệp phải
 * nêu **cách sửa** — nó không hỏi được người.
 *
 * Riêng lỗi xác thực KHÔNG nằm ở đây: guard ném `UnauthorizedException` không
 * tham số để thân phản hồi giống hệt nhau ở cả ba trường hợp thiếu/sai/rỗng
 * (AC-01).
 */

export const tableNotAllowed = (table: string): ForbiddenException =>
  new ForbiddenException({
    success: false,
    code: AGENT_ERROR_CODES.tableNotAllowed,
    message: `Table '${table}' is not accessible through this API.`,
  });

export const fieldNotAllowed = (field: string, reason: string): BadRequestException =>
  new BadRequestException({
    success: false,
    code: AGENT_ERROR_CODES.fieldNotAllowed,
    message: `Field '${field}' ${reason}`,
  });

export const invalidQuery = (message: string): BadRequestException =>
  new BadRequestException({ success: false, code: AGENT_ERROR_CODES.invalidQuery, message });

export const writeNotSupported = (): BadRequestException =>
  new BadRequestException({
    success: false,
    code: AGENT_ERROR_CODES.writeNotSupported,
    message: 'This API is read-only. Only filter, sort, count, group and aggregate are supported.',
  });

export const queryTimeout = (limitMs: number): HttpException =>
  new HttpException(
    {
      success: false,
      code: AGENT_ERROR_CODES.queryTimeout,
      message: `Query exceeded the time limit (${limitMs}ms). Narrow the filter or reduce the limit.`,
    },
    HttpStatus.REQUEST_TIMEOUT,
  );

export const docNotFound = (slug: string, available: string[]): NotFoundException =>
  new NotFoundException({
    success: false,
    code: AGENT_ERROR_CODES.docNotFound,
    message: `Document '${slug}' not found.`,
    available,
  });

export const docsUnavailable = (): HttpException =>
  new HttpException(
    {
      success: false,
      code: AGENT_ERROR_CODES.docsUnavailable,
      message: 'Documentation directory is not available on this server. Contact the system administrator.',
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );

/** Mongo `MaxTimeMSExpired` — mã 50. */
export const isMongoTimeout = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 50;
