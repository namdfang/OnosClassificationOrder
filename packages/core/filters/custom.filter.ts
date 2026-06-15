import type { ArgumentsHost } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { FastifyReply } from 'fastify';
import { I18nContext, I18nService } from 'nestjs-i18n';

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
    // const request = ctx.getRequest();

    const statusCode = exception.getStatus();
    const message = exception.message;
    let stackTrace;

    if (this.isDevelopment && statusCode !== HttpStatus.TOO_MANY_REQUESTS) {
      stackTrace = exception.stack;
      console.error(stackTrace);
    }

    let translation: string = message;
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
