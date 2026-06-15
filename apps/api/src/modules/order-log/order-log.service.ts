import { Injectable } from '@nestjs/common';
import type { GetOrderLogsDto, GetOrderLogsResDto, ProductionOrderLogAction, RoleType } from 'shared';

import type { UserDocument } from '../user/user.entity';
import { OrderLogRepository } from './order-log.repository';

export type AuditContext = {
  user?: Pick<UserDocument, '_id' | 'fullName' | 'email'> & { role?: { name?: RoleType } };
  ip?: string;
  userAgent?: string;
};

type WriteParams = {
  orderId: string;
  action: ProductionOrderLogAction;
  field?: string;
  before?: unknown;
  after?: unknown;
  ctx?: AuditContext;
};

@Injectable()
export class OrderLogService {
  constructor(private readonly repo: OrderLogRepository) {}

  /**
   * Single-row write. Caller decides which field/before/after to record.
   * Failure to log must never block the user action — we swallow errors
   * but log them for observability.
   */
  async write(params: WriteParams): Promise<void> {
    try {
      await this.repo.create({
        orderId: params.orderId,
        action: params.action,
        field: params.field,
        before: params.before,
        after: params.after,
        userId: params.ctx?.user?._id?.toString(),
        userName: params.ctx?.user?.fullName,
        userEmail: params.ctx?.user?.email,
        roleCode: params.ctx?.user?.role?.name,
        ip: params.ctx?.ip,
        userAgent: params.ctx?.userAgent,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[order-log] write failed', err);
    }
  }

  async writeMany(rows: WriteParams[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.repo.createMany(
        rows.map((p) => ({
          orderId: p.orderId,
          action: p.action,
          field: p.field,
          before: p.before,
          after: p.after,
          userId: p.ctx?.user?._id?.toString(),
          userName: p.ctx?.user?.fullName,
          userEmail: p.ctx?.user?.email,
          roleCode: p.ctx?.user?.role?.name,
          ip: p.ctx?.ip,
          userAgent: p.ctx?.userAgent,
        })),
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[order-log] writeMany failed', err);
    }
  }

  async listByOrder(orderId: string, dto: GetOrderLogsDto): Promise<GetOrderLogsResDto> {
    const { page, limit, sort, order } = dto;
    const filter: Record<string, unknown> = { orderId };
    if (dto.action) filter.action = dto.action;
    if (dto.field) filter.field = dto.field;

    const { data, total } = await this.repo.findAllAndCount(filter, {
      paging: { skip: limit * (page - 1), limit },
      sort: { [sort || 'createdAt']: order === 'asc' ? 1 : -1 },
    });

    return { success: true, data, total };
  }
}
