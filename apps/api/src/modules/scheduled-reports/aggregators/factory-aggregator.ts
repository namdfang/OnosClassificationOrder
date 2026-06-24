import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { FactoryRepository } from '@/modules/factory/factory.repository';
import { OrderEntity } from '@/modules/order/order.entity';

import type { FactoryReportData, FactoryRow, ReportPeriod } from '../types';

const PRINTED_MACHINE_CODES = ['machine-1', 'machine-2', 'machine-3', 'machine-4', 'machine-94'];

@Injectable()
export class FactoryAggregator {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    private readonly factoryRepository: FactoryRepository,
  ) {}

  async aggregate(_period: ReportPeriod): Promise<FactoryReportData> {
    const factories = await this.factoryRepository.findAll({ isActive: true });
    const nameById = new Map(factories.map((f) => [String(f._id), { name: f.name, shortName: f.shortName }]));

    const [byCurrent, byOrigin, unmappedCount] = await Promise.all([
      this.orderModel.aggregate([
        {
          $match: {
            deletedAt: null,
            factoryId: { $exists: true, $ne: null, $nin: [''] },
          },
        },
        {
          $group: {
            _id: '$factoryId',
            total: { $sum: 1 },
            notPrinted: {
              $sum: { $cond: [{ $eq: [{ $ifNull: ['$printStatus', ''] }, ''] }, 1, 0] },
            },
            printed: {
              $sum: { $cond: [{ $in: ['$printStatus', PRINTED_MACHINE_CODES] }, 1, 0] },
            },
            error: {
              $sum: { $cond: [{ $ne: [{ $ifNull: ['$productionError', ''] }, ''] }, 1, 0] },
            },
            transferredIn: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [{ $ifNull: ['$originalFactoryId', null] }, null] },
                      { $ne: ['$factoryId', '$originalFactoryId'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      this.orderModel.aggregate([
        {
          $match: {
            deletedAt: null,
            originalFactoryId: { $exists: true, $ne: null, $nin: [''] },
            $expr: { $ne: ['$factoryId', '$originalFactoryId'] },
          },
        },
        { $group: { _id: '$originalFactoryId', transferredOut: { $sum: 1 } } },
      ]),
      this.orderModel.countDocuments({
        deletedAt: null,
        $or: [{ factoryId: null }, { factoryId: { $exists: false } }, { factoryId: '' }],
      }),
    ]);

    const outMap = new Map<string, number>();
    for (const r of byOrigin as Array<{ _id: string; transferredOut: number }>) {
      outMap.set(String(r._id), r.transferredOut);
    }

    const rows: FactoryRow[] = factories
      .map((f) => {
        const id = String(f._id);
        const current = (byCurrent as Array<{ _id: string; total: number; notPrinted: number; printed: number; error: number; transferredIn: number }>).find(
          (r) => String(r._id) === id,
        );

        return {
          factoryId: id,
          name: f.name,
          shortName: f.shortName,
          total: current?.total ?? 0,
          notPrinted: current?.notPrinted ?? 0,
          printed: current?.printed ?? 0,
          error: current?.error ?? 0,
          transferredIn: current?.transferredIn ?? 0,
          transferredOut: outMap.get(id) ?? 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    // Catch-all: orders với factoryId không match factory active (legacy/orphan)
    const knownIds = new Set(factories.map((f) => String(f._id)));
    for (const r of byCurrent as Array<{ _id: string }>) {
      const id = String(r._id);
      if (!knownIds.has(id) && id) {
        const cur = r as { _id: string; total: number; notPrinted: number; printed: number; error: number; transferredIn: number };
        const meta = nameById.get(id);
        rows.push({
          factoryId: id,
          name: meta?.name ?? `#${id.slice(-6)}`,
          shortName: meta?.shortName ?? `#${id.slice(-4)}`,
          total: cur.total,
          notPrinted: cur.notPrinted,
          printed: cur.printed,
          error: cur.error,
          transferredIn: cur.transferredIn,
          transferredOut: outMap.get(id) ?? 0,
        });
      }
    }

    const totals = rows.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        notPrinted: acc.notPrinted + r.notPrinted,
        printed: acc.printed + r.printed,
        error: acc.error + r.error,
        transferredIn: acc.transferredIn + r.transferredIn,
        transferredOut: acc.transferredOut + r.transferredOut,
      }),
      { total: 0, notPrinted: 0, printed: 0, error: 0, transferredIn: 0, transferredOut: 0 },
    );

    return { rows, totals, unmapped: unmappedCount };
  }
}
