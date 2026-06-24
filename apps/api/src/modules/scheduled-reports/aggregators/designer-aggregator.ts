import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RoleType } from 'shared';

import { OrderEntity } from '@/modules/order/order.entity';
import { RoleRepository } from '@/modules/role/role.repository';
import { UserEntity } from '@/modules/user/user.entity';

import type { DesignerReportData, DesignerRow, ReportPeriod } from '../types';

const MAX_DESIGNER_ROWS = 15;

@Injectable()
export class DesignerAggregator {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
    private readonly roleRepository: RoleRepository,
  ) {}

  async aggregate(period: ReportPeriod): Promise<DesignerReportData> {
    const roles = await this.roleRepository.findAll({
      name: { $in: [RoleType.Designer, RoleType.DesignerLeader] },
    });
    const roleIds = roles.map((r) => String(r._id));

    const designers = roleIds.length
      ? await this.userModel
          .find({ roleId: { $in: roleIds } }, { fullName: 1, email: 1 })
          .lean()
      : [];

    const [agg] = await this.orderModel.aggregate([
      { $match: { deletedAt: null } },
      {
        $facet: {
          snapshot: [
            {
              $group: {
                _id: { assignee: '$assignee', status: '$designerStatus' },
                count: { $sum: 1 },
              },
            },
          ],
          assignedInShift: [
            { $match: { designerAssignedAt: { $gte: period.from, $lte: period.to } } },
            { $group: { _id: '$assignee', count: { $sum: 1 } } },
          ],
          doneInShift: [
            { $match: { designerCompletedAt: { $gte: period.from, $lte: period.to } } },
            { $group: { _id: '$assignee', count: { $sum: 1 } } },
          ],
          unassigned: [
            {
              $match: {
                $or: [
                  { assignee: null },
                  { assignee: { $exists: false } },
                  { assignee: '' },
                ],
                designerStatus: 'unassigned',
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ]);

    const assignedMap = new Map<string, number>();
    const inProgressMap = new Map<string, number>();
    const reworkMap = new Map<string, number>();
    for (const s of agg.snapshot as Array<{ _id: { assignee?: string; status?: string }; count: number }>) {
      const userId = s._id.assignee;
      if (!userId) continue;
      if (s._id.status === 'assigned') assignedMap.set(userId, s.count);
      else if (s._id.status === 'in-progress') inProgressMap.set(userId, s.count);
      else if (s._id.status === 'rework') reworkMap.set(userId, s.count);
    }

    const totalShiftMap = new Map<string, number>();
    for (const r of agg.assignedInShift as Array<{ _id?: string; count: number }>) {
      if (r._id) totalShiftMap.set(r._id, r.count);
    }

    const doneShiftMap = new Map<string, number>();
    for (const r of agg.doneInShift as Array<{ _id?: string; count: number }>) {
      if (r._id) doneShiftMap.set(r._id, r.count);
    }

    const rows: DesignerRow[] = designers
      .map((u) => {
        const id = String(u._id);

        return {
          userId: id,
          fullName: u.fullName,
          totalInShift: totalShiftMap.get(id) ?? 0,
          doneInShift: doneShiftMap.get(id) ?? 0,
          assignedNow: assignedMap.get(id) ?? 0,
          inProgressNow: inProgressMap.get(id) ?? 0,
          reworkNow: reworkMap.get(id) ?? 0,
        };
      })
      .sort((a, b) => {
        const aTotal = a.totalInShift + a.assignedNow + a.inProgressNow + a.reworkNow;
        const bTotal = b.totalInShift + b.assignedNow + b.inProgressNow + b.reworkNow;
        if (bTotal !== aTotal) return bTotal - aTotal;

        return a.fullName.localeCompare(b.fullName);
      });

    const totals = rows.reduce(
      (acc, r) => ({
        totalInShift: acc.totalInShift + r.totalInShift,
        doneInShift: acc.doneInShift + r.doneInShift,
        assignedNow: acc.assignedNow + r.assignedNow,
        inProgressNow: acc.inProgressNow + r.inProgressNow,
        reworkNow: acc.reworkNow + r.reworkNow,
      }),
      { totalInShift: 0, doneInShift: 0, assignedNow: 0, inProgressNow: 0, reworkNow: 0 },
    );

    const unassignedNow = (agg.unassigned[0]?.count as number) ?? 0;

    return {
      rows: rows.slice(0, MAX_DESIGNER_ROWS),
      totals,
      unassignedNow,
      activeInProgress: totals.inProgressNow,
      activeRework: totals.reworkNow,
    };
  }
}
