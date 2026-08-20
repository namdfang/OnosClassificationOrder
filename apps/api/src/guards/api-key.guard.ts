// api-key.guard.ts — xác thực Public Order API bằng API key (ORD-4, plan §7).
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RateLimitException } from 'core';
import { createHash } from 'crypto';
import type { FastifyReply } from 'fastify';
import { CUSTOMER_API_KEY_PREFIX, RoleType } from 'shared';

import { CustomerService } from '@/modules/customer/customer.service';

import { RateLimiterService } from '../shared/services/rate-limiter.service';

/**
 * Header `X-Api-Key: onos_live_<32hex>` → sha256 → tra khách (index
 * `apiKeys.hash`, chỉ key chưa thu hồi + khách Active chưa xóa mềm) → gắn
 * `request.user` role ảo `Customer` (cùng ranh giới dữ liệu với JWT Customer —
 * mọi service chỉ đụng dữ liệu của CHÍNH khách đó qua `customer._id`).
 *
 * - Sai/thiếu/thu hồi/khách khóa → 401 với thông điệp CHUNG, không tiết lộ
 *   key hay khách nào tồn tại (SRS BR).
 * - Rate limit theo key (bucket session Redis, key = hash) + theo customerId
 *   (bucket user) — cùng hạn mức env `RATE_LIMITER_*` với phiên nhân viên.
 * - `lastUsedAt` cập nhật fire-and-forget, không chặn request.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly customerService: CustomerService,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const response = context.switchToHttp().getResponse() as FastifyReply;

    const raw = (request.headers['x-api-key'] ?? '') as string;
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key || !key.startsWith(CUSTOMER_API_KEY_PREFIX)) {
      throw new UnauthorizedException('Invalid API key');
    }

    const hash = createHash('sha256').update(key).digest('hex');
    const customer = await this.customerService.findByApiKeyHash(hash);
    if (!customer) throw new UnauthorizedException('Invalid API key');

    // Rate limit TRƯỚC khi cho vào — theo key rồi theo khách (1 khách nhiều key
    // vẫn chung 1 bucket user, không nhân hạn mức bằng cách tạo thêm key).
    const keyResult = await this.rateLimiterService.consumeToken(hash);
    if (keyResult.remainingPoints <= 0) {
      void response.header('X-RateLimit-Base', 'key');
      void response.header('X-RateLimit-Remaining', keyResult.remainingPoints);
      void response.header('X-RateLimit-Reset', Math.floor(keyResult.msBeforeNext / 1000));
      throw new RateLimitException('session');
    }
    const customerResult = await this.rateLimiterService.consumeUserId(String(customer._id));
    if (customerResult.remainingPoints <= 0) {
      void response.header('X-RateLimit-Base', 'customer');
      void response.header('X-RateLimit-Remaining', customerResult.remainingPoints);
      void response.header('X-RateLimit-Reset', Math.floor(customerResult.msBeforeNext / 1000));
      throw new RateLimitException('user');
    }

    // Mirror shape jwt.strategy branch Customer: controller đọc qua @AuthUser().
    (customer as unknown as { role?: { name: RoleType } }).role = { name: RoleType.Customer };
    request.user = customer;
    request.customerApiKeyHash = hash;

    void this.customerService.touchApiKeyUsage(String(customer._id), hash);
    return true;
  }
}
