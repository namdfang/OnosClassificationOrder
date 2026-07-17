import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DatabaseRepositoryAbstract } from 'core';
import { Model } from 'mongoose';

import type { OrderLogDocument } from './order-log.entity';
import { OrderLogEntity } from './order-log.entity';

@Injectable()
export class OrderLogRepository extends DatabaseRepositoryAbstract<OrderLogEntity, OrderLogDocument> {
  constructor(@InjectModel(OrderLogEntity.name) private readonly orderLogModel: Model<OrderLogEntity>) {
    super(orderLogModel);
  }

  /**
   * Backfill: tập mã `toolResultNote` ≠ ok (≠ rỗng) từng được đánh trên mỗi đơn
   * (nhóm theo orderId, distinct). Dùng seed `Order.toolCheckErrorNotes` 1 lần
   * trong `OrderService.onModuleInit`.
   */
  async aggregateToolCheckErrorNotes(): Promise<Array<{ orderId: string; notes: string[] }>> {
    return this.orderLogModel.aggregate<{ orderId: string; notes: string[] }>([
      { $match: { field: 'toolResultNote', after: { $nin: ['ok', '', null] } } },
      { $group: { _id: '$orderId', notes: { $addToSet: '$after' } } },
      { $project: { _id: 0, orderId: '$_id', notes: 1 } },
    ]);
  }
}
