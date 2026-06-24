import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorkshopConfigCategory } from 'shared';

import { OrderEntity } from '@/modules/order/order.entity';
import { WorkshopConfigRepository } from '@/modules/workshop-config/workshop-config.repository';

import type { ErrorReportData, ReportPeriod } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TOP_CODES = 10;

@Injectable()
export class ErrorAggregator {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    private readonly workshopConfigRepository: WorkshopConfigRepository,
  ) {}

  async aggregate(_period: ReportPeriod): Promise<ErrorReportData> {
    const now = Date.now();
    const [agg] = await this.orderModel.aggregate([
      {
        $match: {
          deletedAt: null,
          productionError: { $exists: true, $nin: [null, ''] },
        },
      },
      {
        $facet: {
          total: [{ $count: 'count' }],
          bySource: [
            { $group: { _id: { $ifNull: ['$productionErrorSource', 'unknown'] }, count: { $sum: 1 } } },
          ],
          byUrgency: [
            {
              $addFields: {
                ageMs: {
                  $subtract: [
                    new Date(now),
                    { $ifNull: ['$productionFirstErrorAt', '$updatedAt'] },
                  ],
                },
              },
            },
            {
              $bucket: {
                groupBy: '$ageMs',
                boundaries: [0, DAY_MS, 2 * DAY_MS, 3 * DAY_MS, Number.MAX_SAFE_INTEGER],
                default: 'unknown',
                output: { count: { $sum: 1 } },
              },
            },
          ],
          topCodes: [
            { $group: { _id: '$productionError', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: MAX_TOP_CODES },
          ],
        },
      },
    ]);

    const total = (agg.total[0]?.count as number) ?? 0;

    const bySource = { designer: 0, factory: 0, unknown: 0 };
    for (const s of agg.bySource as Array<{ _id: string; count: number }>) {
      if (s._id === 'designer') bySource.designer = s.count;
      else if (s._id === 'factory') bySource.factory = s.count;
      else bySource.unknown += s.count;
    }

    const urgency = { new: 0, attention: 0, urgent: 0, critical: 0 };
    for (const b of agg.byUrgency as Array<{ _id: number | string; count: number }>) {
      if (b._id === 0) urgency.new = b.count;
      else if (b._id === DAY_MS) urgency.attention = b.count;
      else if (b._id === 2 * DAY_MS) urgency.urgent = b.count;
      else if (b._id === 3 * DAY_MS) urgency.critical = b.count;
    }

    const topCodes = agg.topCodes as Array<{ _id: string; count: number }>;
    const codeIds = topCodes.map((r) => r._id).filter(Boolean);
    const configs = codeIds.length
      ? await this.workshopConfigRepository.findAll({
          category: WorkshopConfigCategory.ProductionError,
          code: { $in: codeIds },
        })
      : [];
    const nameByCode = new Map(configs.map((c) => [c.code, c.name]));

    return {
      total,
      bySource,
      urgency,
      topCodes: topCodes.map((r) => ({
        code: r._id,
        name: nameByCode.get(r._id) ?? r._id,
        count: r.count,
      })),
    };
  }
}
