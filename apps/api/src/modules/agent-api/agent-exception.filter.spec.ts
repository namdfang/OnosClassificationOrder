import { Controller, Get, HttpStatus, UnprocessableEntityException, UseFilters } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { CustomExceptionFilter } from 'core';
import type { I18nService } from 'nestjs-i18n';
import { AGENT_ERROR_CODES } from 'shared';
import { z } from 'zod';

import { ApiConfigService } from '@/shared/services/api-config.service';

import {
  docNotFound,
  docsUnavailable,
  fieldNotAllowed,
  invalidQuery,
  queryTimeout,
  tableNotAllowed,
  writeNotSupported,
} from './agent-errors';
import { AgentExceptionFilter } from './agent-exception.filter';

/**
 * `QA-2` — kiểm **thân phản hồi HTTP THẬT**, không kiểm hàm dựng lỗi.
 *
 * Đây chính là điểm mù đã để lọt bug: 119 test cũ đều xanh trong khi trường
 * `code` bị nuốt sạch, vì chúng dừng ở `agent-errors.ts` và không đi tiếp qua
 * bộ lọc ngoại lệ. Nên bộ test này dựng một app Fastify thật, gắn **cả** filter
 * chung của repo lẫn filter riêng của agent, rồi đọc nguyên thân phản hồi.
 *
 * Ca `probe/plain` là lưới an toàn ngược lại: một controller KHÔNG gắn filter
 * riêng phải giữ nguyên hình dạng bốn khoá như trước — nếu ai đó sửa
 * `CustomExceptionFilter` dùng chung thì ca này đỏ.
 */
@Controller('probe')
@UseFilters(AgentExceptionFilter)
class ProbeController {
  @Get('table')
  table(): never {
    throw tableNotAllowed('users');
  }

  @Get('field')
  field(): never {
    throw fieldNotAllowed('variations.cost', 'exists but is never returned by this API.');
  }

  @Get('write')
  write(): never {
    throw writeNotSupported();
  }

  @Get('timeout')
  timeout(): never {
    throw queryTimeout(8000);
  }

  @Get('doc')
  doc(): never {
    throw docNotFound('khong-ton-tai', ['Orders', 'DataDictionary']);
  }

  @Get('docs-off')
  docsOff(): never {
    throw docsUnavailable();
  }

  @Get('invalid')
  invalid(): never {
    throw invalidQuery('Payload lồng quá sâu.');
  }

  @Get('zod')
  zod(): never {
    const parsed = z.object({ filter: z.object({ op: z.enum(['eq', 'ne']) }) }).safeParse({ filter: { op: 'xxx' } });
    throw new UnprocessableEntityException((parsed as { error: unknown }).error);
  }
}

/** Không gắn filter riêng — đại diện cho phần còn lại của app. */
@Controller('probe-plain')
class PlainController {
  @Get('table')
  table(): never {
    throw tableNotAllowed('users');
  }
}

describe('thân lỗi HTTP của /agent/* (QA-2)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController, PlainController],
      providers: [
        AgentExceptionFilter,
        { provide: ApiConfigService, useValue: { isDevelopment: false } as Partial<ApiConfigService> },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // Đúng thứ tự đang chạy thật: filter chung ở tầng global, filter riêng ở controller.
    app.useGlobalFilters(new CustomExceptionFilter(false, {} as I18nService));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  const call = async (path: string) => {
    const res = await app.inject({ method: 'GET', url: path });
    return { status: res.statusCode, body: res.json() };
  };

  it.each([
    ['/probe/table', HttpStatus.FORBIDDEN, AGENT_ERROR_CODES.tableNotAllowed],
    ['/probe/field', HttpStatus.BAD_REQUEST, AGENT_ERROR_CODES.fieldNotAllowed],
    ['/probe/write', HttpStatus.BAD_REQUEST, AGENT_ERROR_CODES.writeNotSupported],
    ['/probe/timeout', HttpStatus.REQUEST_TIMEOUT, AGENT_ERROR_CODES.queryTimeout],
    ['/probe/doc', HttpStatus.NOT_FOUND, AGENT_ERROR_CODES.docNotFound],
    ['/probe/docs-off', HttpStatus.SERVICE_UNAVAILABLE, AGENT_ERROR_CODES.docsUnavailable],
    ['/probe/invalid', HttpStatus.BAD_REQUEST, AGENT_ERROR_CODES.invalidQuery],
  ])('AC-01: %s trả đúng mã lỗi trong thân phản hồi', async (path, status, code) => {
    const { status: actual, body } = await call(path);

    expect({ status: actual, code: body.code, success: body.success, statusCode: body.statusCode }).toEqual({
      status,
      code,
      success: false,
      statusCode: status,
    });
    expect(typeof body.message).toBe('string');
  });

  it('AC-03: 404 slug sai giữ được mảng available để agent tự sửa lời gọi', async () => {
    const { body } = await call('/probe/doc');

    expect({ code: body.code, available: body.available }).toEqual({
      code: AGENT_ERROR_CODES.docNotFound,
      available: ['Orders', 'DataDictionary'],
    });
  });

  it('AC-04: lỗi tầng validate thành 400 INVALID_QUERY, không phải 422, và có statusCode', async () => {
    const { status, body } = await call('/probe/zod');

    expect({ status, statusCode: body.statusCode, code: body.code }).toEqual({
      status: HttpStatus.BAD_REQUEST,
      statusCode: HttpStatus.BAD_REQUEST,
      code: AGENT_ERROR_CODES.invalidQuery,
    });
    // Nêu ĐÚNG trường sai — agent không hỏi được người.
    expect(body.message).toContain('filter.op');
  });

  it('không rò stackTrace khi không phải môi trường dev', async () => {
    const { body } = await call('/probe/table');

    expect(Object.keys(body).sort()).toEqual(['code', 'message', 'statusCode', 'success']);
  });

  it('AC-05: controller KHÔNG gắn filter riêng giữ nguyên hình dạng bốn khoá như trước', async () => {
    const { status, body } = await call('/probe-plain/table');

    expect(status).toBe(HttpStatus.FORBIDDEN);
    expect(body.code).toBeUndefined();
    expect(Object.keys(body).sort()).toEqual(['message', 'statusCode', 'success']);
  });
});
