import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  DesignerLeaderboardRow,
  DesignerTimelineBucket,
  ErrorStats,
} from 'shared';
import { DesignerStatus, RoleType, WorkshopConfigCategory } from 'shared';

import { OrderLogEntity } from '../order-log/order-log.entity';
import { OrderEntity } from '../order/order.entity';
import { RoleRepository } from '../role/role.repository';
import { UserEntity } from '../user/user.entity';
import { WorkshopConfigEntity } from '../workshop-config/workshop-config.entity';

/**
 * Aggregations cho dashboard tab Designer (Leader/Admin only). 3 view:
 *   - Leaderboard (1 row / sub-designer): count + avg time + errorRate
 *   - Timeline (per-day buckets cho 1 designer): line chart 4 series
 *   - Error stats (split by errorSource): pie + breakdown table
 *
 * Identity: assignee = user._id. Resolve fullName từ users collection.
 */
@Injectable()
export class DesignerStatsService {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
    @InjectModel(WorkshopConfigEntity.name)
    private readonly workshopConfigModel: Model<WorkshopConfigEntity>,
    @InjectModel(OrderLogEntity.name)
    private readonly orderLogModel: Model<OrderLogEntity>,
    private readonly roleRepository: RoleRepository,
  ) {}

  async getPerformance(
    from?: string,
    to?: string,
    userId?: string,
  ): Promise<DesignerLeaderboardRow[]> {
    const range = this.resolveRange(from, to);

    // 1) Snapshot counts theo status (không filter date).
    const statusMatch: Record<string, unknown> = {
      assignee: { $exists: true, $ne: null },
      designerStatus: { $exists: true },
    };
    if (userId) statusMatch.assignee = userId;
    const statusAgg = await this.orderModel.aggregate<{
      _id: { uid: string; status: DesignerStatus };
      count: number;
    }>([
      { $match: statusMatch },
      {
        $group: {
          _id: { uid: '$assignee', status: '$designerStatus' },
          count: { $sum: 1 },
        },
      },
    ]);

    // 2) Completed in period.
    const completedMatch: Record<string, unknown> = {
      designerStatus: DesignerStatus.Done,
      designerCompletedAt: { $gte: range.start, $lte: range.end },
    };
    if (userId) completedMatch.assignee = userId;
    const completedDocs = await this.orderModel
      .find(completedMatch, {
        assignee: 1,
        designerAssignedAt: 1,
        designerStartedAt: 1,
        designerFirstStartedAt: 1,
        designerCompletedAt: 1,
        designerReworkCount: 1,
        designerWorkMs: 1,
      })
      .lean();

    // 3) Auto-include designer users chưa có task → row 0 trong leaderboard.
    //    Lookup all Designer users + collect userIds from data.
    const designerRole = await this.roleRepository.findOne({ name: RoleType.Designer });
    const teamUsers = designerRole
      ? await this.userModel
          .find({ roleId: designerRole._id }, { _id: 1, fullName: 1, email: 1 })
          .lean()
      : [];

    const userIds = new Set<string>();
    for (const row of statusAgg) userIds.add(row._id.uid);
    for (const o of completedDocs) {
      const a = (o as { assignee?: string }).assignee;
      if (a) userIds.add(a);
    }
    if (!userId) for (const u of teamUsers) userIds.add(String(u._id));

    const userMap = new Map<string, { fullName: string; email?: string }>();
    for (const u of teamUsers) {
      userMap.set(String(u._id), { fullName: u.fullName, email: u.email });
    }

    // 4) Build rows.
    const rows = new Map<string, DesignerLeaderboardRow>();
    const ensureRow = (uid: string): DesignerLeaderboardRow => {
      let r = rows.get(uid);
      if (!r) {
        const u = userMap.get(uid);
        r = {
          userId: uid,
          fullName: u?.fullName || '(unknown)',
          email: u?.email,
          assignedCount: 0,
          inProgressCount: 0,
          reworkCount: 0,
          rejectedCount: 0,
          completedInPeriod: 0,
          totalRejected: 0,
          totalRework: 0,
          avgResponseMin: 0,
          avgWorkMin: 0,
          errorRate: 0,
        };
        rows.set(uid, r);
      }
      return r;
    };

    if (userId) {
      ensureRow(userId);
    } else {
      for (const uid of userIds) ensureRow(uid);
    }

    for (const row of statusAgg) {
      const r = ensureRow(row._id.uid);
      switch (row._id.status) {
        case DesignerStatus.Assigned:
          r.assignedCount = row.count;
          break;
        case DesignerStatus.InProgress:
          r.inProgressCount = row.count;
          break;
        case DesignerStatus.Rework:
          r.reworkCount = row.count;
          break;
        case DesignerStatus.Rejected:
          r.rejectedCount = row.count;
          break;
      }
    }

    const completedAgg = new Map<
      string,
      { responseMs: number; responseN: number; workMs: number; workN: number; reworkSum: number; n: number }
    >();
    for (const o of completedDocs) {
      const uid = (o as { assignee?: string }).assignee;
      if (!uid) continue;
      const c = completedAgg.get(uid) || {
        responseMs: 0,
        responseN: 0,
        workMs: 0,
        workN: 0,
        reworkSum: 0,
        n: 0,
      };
      c.n++;
      const aAt = o.designerAssignedAt as Date | undefined;
      const sAt = o.designerStartedAt as Date | undefined;
      const fsAt = (o as { designerFirstStartedAt?: Date }).designerFirstStartedAt;
      const cAt = o.designerCompletedAt as Date | undefined;
      // Response: ưu tiên firstStartedAt (immutable); fallback startedAt cho legacy.
      const respStart = fsAt || sAt;
      if (aAt && respStart) {
        c.responseMs += respStart.getTime() - aAt.getTime();
        c.responseN++;
      }
      // Work: cumulative workMs nếu có (chính xác qua các cycle); legacy fallback.
      const cumWorkMs = (o as { designerWorkMs?: number }).designerWorkMs;
      if (cumWorkMs && cumWorkMs > 0) {
        c.workMs += cumWorkMs;
        c.workN++;
      } else if (sAt && cAt) {
        c.workMs += cAt.getTime() - sAt.getTime();
        c.workN++;
      }
      c.reworkSum += (o.designerReworkCount as number) || 0;
      completedAgg.set(uid, c);
    }
    for (const [uid, c] of completedAgg) {
      const r = ensureRow(uid);
      r.completedInPeriod = c.n;
      r.avgResponseMin = c.responseN > 0 ? Math.round(c.responseMs / c.responseN / 60000) : 0;
      r.avgWorkMin = c.workN > 0 ? Math.round(c.workMs / c.workN / 60000) : 0;
      r.errorRate = c.n > 0 ? Math.round((c.reworkSum / c.n) * 100) / 100 : 0;
    }

    // ─── Total rejected / rework trong period ──────────────────────
    // Đếm từ OrderLog (mỗi lần designerStatus chuyển sang rejected/rework
    // được ghi 1 log). Group theo order.assignee hiện tại — assumption: chưa
    // reassign (cho test data đủ chính xác).
    const logMatch: Record<string, unknown> = {
      field: 'designerStatus',
      after: { $in: ['rejected', 'rework'] },
      createdAt: { $gte: range.start, $lte: range.end },
    };
    const logAgg = await this.orderLogModel.aggregate<{
      _id: { uid: string; after: 'rejected' | 'rework' };
      count: number;
    }>([
      { $match: logMatch },
      {
        $lookup: {
          from: 'orders',
          localField: 'orderId',
          foreignField: '_id',
          as: 'order',
        },
      },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: false } },
      ...(userId ? [{ $match: { 'order.assignee': userId } as Record<string, unknown> }] : []),
      {
        $group: {
          _id: { uid: '$order.assignee', after: '$after' },
          count: { $sum: 1 },
        },
      },
    ]);

    for (const row of logAgg) {
      if (!row._id.uid) continue;
      const r = ensureRow(row._id.uid);
      if (row._id.after === 'rejected') r.totalRejected = row.count;
      else if (row._id.after === 'rework') r.totalRework = row.count;
    }

    return [...rows.values()].sort(
      (a, b) => b.completedInPeriod - a.completedInPeriod || b.assignedCount - a.assignedCount,
    );
  }

  async getTimeline(
    userId: string,
    from?: string,
    to?: string,
  ): Promise<DesignerTimelineBucket[]> {
    const range = this.resolveRange(from, to);
    const tz = 'Asia/Ho_Chi_Minh';

    const bucket = async (field: string): Promise<Map<string, number>> => {
      const match: Record<string, unknown> = {
        assignee: userId,
        [field]: { $gte: range.start, $lte: range.end },
      };
      const agg = await this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: tz },
            },
            count: { $sum: 1 },
          },
        },
      ]);
      return new Map(agg.map((r) => [r._id, r.count]));
    };

    const [assigned, started, completed, rework] = await Promise.all([
      bucket('designerAssignedAt'),
      bucket('designerStartedAt'),
      bucket('designerCompletedAt'),
      bucket('designerReworkAt'),
    ]);

    const buckets: DesignerTimelineBucket[] = [];
    const cursor = new Date(range.start);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= range.end.getTime()) {
      const key = cursor.toISOString().slice(0, 10);
      buckets.push({
        date: key,
        assigned: assigned.get(key) || 0,
        started: started.get(key) || 0,
        completed: completed.get(key) || 0,
        rework: rework.get(key) || 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return buckets;
  }

  async getErrorStats(from?: string, to?: string): Promise<ErrorStats> {
    const range = this.resolveRange(from, to);

    // Label resolution từ workshop_config (chỉ để hiển thị tên đẹp).
    const configs = await this.workshopConfigModel
      .find({ category: WorkshopConfigCategory.ProductionError }, { code: 1, name: 1, errorSource: 1 })
      .lean();
    const cfgMap = new Map<string, { label?: string }>();
    for (const c of configs as Array<{ code: string; name?: string }>) {
      cfgMap.set(c.code, { label: c.name });
    }

    // Group theo (code, source) — source giờ là field per-order, không
    // resolve qua config nữa. Cho phép user override config khi cần.
    const agg = await this.orderModel.aggregate<{
      _id: { code: string; source: 'designer' | 'factory' | null };
      count: number;
    }>([
      {
        $match: {
          productionError: { $exists: true, $nin: [null, ''] },
          updatedAt: { $gte: range.start, $lte: range.end },
        },
      },
      {
        $group: {
          _id: {
            code: '$productionError',
            source: { $ifNull: ['$productionErrorSource', null] },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const bySource = { designer: 0, factory: 0, unknown: 0 };
    // Aggregate per-code (sum tất cả source thành 1 row code).
    const byCodeMap = new Map<string, { label?: string; source?: 'designer' | 'factory'; count: number }>();
    for (const row of agg) {
      const src = row._id.source;
      if (src === 'designer') bySource.designer += row.count;
      else if (src === 'factory') bySource.factory += row.count;
      else bySource.unknown += row.count;

      const cur = byCodeMap.get(row._id.code) || { label: cfgMap.get(row._id.code)?.label, count: 0 };
      cur.count += row.count;
      // Source ở byCode chỉ là indication — lấy source chính (designer/factory)
      // nếu có; nếu cùng code có cả 2 source thì giữ source phổ biến hơn.
      if (src && (!cur.source || row.count > 0)) cur.source = src as 'designer' | 'factory';
      byCodeMap.set(row._id.code, cur);
    }

    const byCode = [...byCodeMap.entries()]
      .map(([code, v]) => ({
        code,
        label: v.label,
        errorSource: v.source,
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      bySource,
      byCode,
      total: bySource.designer + bySource.factory + bySource.unknown,
    };
  }

  private resolveRange(from?: string, to?: string): { start: Date; end: Date } {
    if (!from && !to) {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date();
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    const start = from ? new Date(from) : new Date(0);
    start.setHours(0, 0, 0, 0);
    const end = to ? new Date(to) : new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
}
