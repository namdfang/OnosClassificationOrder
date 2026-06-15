import { HttpException, HttpStatus } from '@nestjs/common';

export class RateLimitException extends HttpException {
  constructor(public readonly limitType: 'session' | 'user') {
    super('Too many request for this ' + limitType, HttpStatus.TOO_MANY_REQUESTS);
  }
}
