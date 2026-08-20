import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, UnprocessableEntityException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AGENT_ERROR_CODES } from 'shared';
import { ZodError } from 'zod';

import { ApiConfigService } from '@/shared/services/api-config.service';

type Body = Record<string, unknown>;

/** Bốn khoá do chính filter này dựng — không lấy lại từ thân lỗi gốc. */
const RESERVED_KEYS = new Set(['statusCode', 'success', 'message', 'stackTrace']);

/**
 * Bộ lọc lỗi RIÊNG của 5 endpoint `/v1/agent/*` (`QA-2`).
 *
 * Vì sao cần lớp riêng thay vì sửa `CustomExceptionFilter` dùng chung:
 * filter chung **dựng lại thân phản hồi từ đầu** với đúng bốn khoá
 * `statusCode/success/message/stackTrace`, nên mọi trường mà module ném kèm
 * đều bị vứt trong im lặng — `code` của cả 8 mã lỗi, và `available` (danh sách
 * slug đang có) mà `agent-errors.ts` cố ý gửi để agent tự sửa lời gọi.
 *
 * Sửa filter chung sẽ đổi hình dạng thân lỗi của **mọi** endpoint trong app,
 * kể cả Customer Portal — rủi ro rộng hơn nhiều so với thứ đang phải sửa. Nên
 * bộ lọc này chỉ gắn vào `AgentApiController`, và giữ nguyên bốn khoá cũ để
 * thân lỗi vẫn là **siêu tập** của hình dạng trước đây, không phải hình dạng
 * khác.
 *
 * Bên gọi là AI agent, không hỏi được người: mất `code` nghĩa là nó phải so
 * khớp chuỗi tiếng Anh trong `message` để đoán ý, và vỡ ngay khi ai đó sửa câu
 * chữ.
 */
@Catch(HttpException)
export class AgentExceptionFilter implements ExceptionFilter<HttpException> {
  constructor(private readonly config: ApiConfigService) {}

  async catch(exception: HttpException, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    // Echo CORS như filter chung — thiếu header này thì trình duyệt báo "CORS
    // error" thay vì mã lỗi thật, và phần "Thử gọi" của `API-3` mất luôn ý nghĩa.
    const origin = request.headers?.origin;
    if (origin) {
      void response.header('Access-Control-Allow-Origin', origin);
      void response.header('Access-Control-Allow-Credentials', 'true');
      void response.header('Vary', 'Origin');
    }

    const { statusCode, code, message, extra } = this.describe(exception);

    const body: Body = { statusCode, success: false, code, message, ...extra };
    if (this.config.isDevelopment && statusCode !== (HttpStatus.TOO_MANY_REQUESTS as number)) {
      body.stackTrace = exception.stack;
    }

    await response.status(statusCode).send(body);
  }

  private describe(exception: HttpException): {
    statusCode: number;
    code: string | undefined;
    message: string;
    extra: Body;
  } {
    // Tham số sai kiểu rơi vào `ZodValidationPipe` và thành 422 — trong khi tài
    // liệu công bố 400 INVALID_QUERY. Bên gọi không phân biệt được "tôi gõ sai
    // toán tử" với "máy chủ hỏng" nếu mã trả về không khớp bảng đã công bố.
    if (exception instanceof UnprocessableEntityException) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: AGENT_ERROR_CODES.invalidQuery,
        message: describeZod(exception),
        extra: {},
      };
    }

    const statusCode = exception.getStatus();
    const raw = exception.getResponse();
    const fromBody = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Body) : {};

    const extra: Body = {};
    for (const [key, value] of Object.entries(fromBody)) {
      if (!RESERVED_KEYS.has(key) && key !== 'code') extra[key] = value;
    }

    // Guard xác thực ném `UnauthorizedException` KHÔNG tham số, cố ý, để thân
    // lỗi giống hệt nhau ở cả năm endpoint (`API-1` AC-01). Mã gắn ở đây nên
    // tính chất đó được giữ nguyên.
    const code =
      typeof fromBody.code === 'string'
        ? fromBody.code
        : statusCode === (HttpStatus.UNAUTHORIZED as number)
          ? AGENT_ERROR_CODES.unauthorized
          : undefined;

    return { statusCode, code, message: exception.message, extra };
  }
}

/** Nêu ĐÚNG trường sai — agent phải tự sửa được lời gọi mà không hỏi ai. */
function describeZod(exception: UnprocessableEntityException): string {
  const raw = exception.getResponse();
  const issues = raw instanceof ZodError ? raw.issues : (raw as { issues?: ZodError['issues'] })?.issues;

  if (!issues?.length) return 'Invalid query payload.';

  const detail = issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');

  return `Invalid query payload. ${detail}`;
}
