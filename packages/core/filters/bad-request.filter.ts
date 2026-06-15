import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpStatus, UnprocessableEntityException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply } from 'fastify';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { ZodError } from 'zod';

@Catch(UnprocessableEntityException)
export class UnprocessableEntityFilter implements ExceptionFilter<UnprocessableEntityException> {
  constructor(
    public reflector: Reflector,
    private readonly isDevelopment: boolean,
    private readonly i18n: I18nService,
  ) {}

  async catch(exception: UnprocessableEntityException, host: ArgumentsHost): Promise<void> {
    // console.log("Cache bad request filter");

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    const statusCode = exception.getStatus();

    let stackTrace;

    if (this.isDevelopment) {
      stackTrace = exception.stack;
      console.error(stackTrace);
    }

    const exceptionResponse = exception.getResponse() as {
      errors: ZodError<unknown>[];
      message: string;
    };

    if (exceptionResponse.errors && exceptionResponse.errors.length > 0) {
      const validationError = exceptionResponse.errors[0];

      // @ts-ignore
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
