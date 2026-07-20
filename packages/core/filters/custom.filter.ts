import type { ArgumentsHost } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { I18nService } from 'nestjs-i18n';

@Catch(HttpException)
export class CustomExceptionFilter extends BaseExceptionFilter {
  constructor(
    private readonly isDevelopment: boolean,
    private i18n: I18nService,
  ) {
    super();
  }

  async catch(exception: HttpException, host: ArgumentsHost): Promise<void> {
    // console.log("Catch custom filter");

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    // Echo back CORS headers on error responses — @fastify/cors onSend hook
    // can miss exception paths (guard throw, etc.), khiến browser báo "CORS
    // error" thay vì status code thật (429/500/504...). Set thủ công đảm bảo.
    const origin = request.headers?.origin as string | undefined;
    if (origin) {
      void response.header('Access-Control-Allow-Origin', origin);
      void response.header('Access-Control-Allow-Credentials', 'true');
      void response.header('Vary', 'Origin');
    }

    const statusCode = exception.getStatus();
    const message = exception.message;
    let stackTrace;

    if (this.isDevelopment && statusCode !== HttpStatus.TOO_MANY_REQUESTS) {
      stackTrace = exception.stack;
      console.error(stackTrace);
    }

    const translation: string = message;
    // try {
    //   translation = await this.i18n.t(message, {
    //     lang: I18nContext.current()?.lang,
    //     defaultValue: message,
    //   });
    // } catch (error) {
    //   console.error(error);
    // }

    await response.status(statusCode).send({
      statusCode,
      success: false,
      message: translation,
      stackTrace,
    });
  }
}
