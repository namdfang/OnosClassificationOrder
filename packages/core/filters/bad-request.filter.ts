import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpStatus, UnprocessableEntityException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { I18nService } from 'nestjs-i18n';
import { I18nContext } from 'nestjs-i18n';
import type { ZodError } from 'zod';

@Catch(UnprocessableEntityException)
export class UnprocessableEntityFilter implements ExceptionFilter<UnprocessableEntityException> {
  constructor(
    public reflector: Reflector,
    private readonly exposeStackTrace: boolean,
    private readonly i18n: I18nService,
  ) {}

  async catch(exception: UnprocessableEntityException, host: ArgumentsHost): Promise<void> {
    // console.log("Cache bad request filter");

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    // Echo CORS headers — xem comment ở CustomExceptionFilter.
    const origin = request.headers?.origin as string | undefined;
    if (origin) {
      void response.header('Access-Control-Allow-Origin', origin);
      void response.header('Access-Control-Allow-Credentials', 'true');
      void response.header('Vary', 'Origin');
    }

    const statusCode = exception.getStatus();

    // LUÔN ghi ra log máy chủ; chỉ GỬI RA phản hồi khi được bật tường minh.
    // Hai việc này từng nằm chung một nhánh `if`, nên tắt phần gửi ra ngoài là
    // mất luôn phần ghi log — mất manh mối lần lỗi mà không ai biết.
    console.error(exception.stack);
    const stackTrace = this.exposeStackTrace ? exception.stack : undefined;

    const exceptionResponse = exception.getResponse() as {
      errors: ZodError<unknown>[];
      message: string;
    };

    if (exceptionResponse.errors && exceptionResponse.errors.length > 0) {
      const validationError = exceptionResponse.errors[0];

      // @ts-expect-error zod error path type
      const target = validationError.path.join('.');
      const zodMessage = validationError.message;

      let message: string;
      if (zodMessage.includes(' ')) {
        message = target + ' - ' + zodMessage;
      } else {
        message = `error.fields.${zodMessage.split(' ')[1]}`;

        const translation: string = await this.i18n.t(message, { lang: I18nContext.current()?.lang });

        message = target + ' - ' + translation;
      }

      await response.status(statusCode).send({
        success: false,
        message,
        stackTrace,
      });
    } else {
      await response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        success: false,
        message: exception.message,
        stackTrace,
      });
    }
  }
}
