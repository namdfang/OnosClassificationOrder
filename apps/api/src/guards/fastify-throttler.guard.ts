import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

/**
 * Fastify-compatible ThrottlerGuard.
 * The default ThrottlerGuard calls res.header() which is Express API.
 * Fastify uses reply.header() — we override handleRequest to avoid that call
 * and use getRequestResponse() to return the Fastify request/reply objects.
 */
@Injectable()
export class FastifyThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext) {
    const http = context.switchToHttp();
    return {
      req: http.getRequest(),
      res: http.getResponse(),
    };
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, getTracker, generateKey, blockDuration } = requestProps;
    const { req, res } = this.getRequestResponse(context);

    const tracker = await getTracker(req, res);
    const key = generateKey(context, tracker, throttler.name ?? 'default');

    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttler.name ?? 'default',
      );

    if (isBlocked) {
      // Set header safely for Fastify
      if (typeof res.header === 'function') {
        res.header('Retry-After', timeToBlockExpire);
      }
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    return true;
  }
}
