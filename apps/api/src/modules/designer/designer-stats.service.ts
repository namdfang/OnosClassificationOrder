import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  AssignBacklogGroup,
  AssignBacklogOrder,
  DesignerLeaderboardRow,
  DesignerTimelineBucket,
  ErrorStats,
  PersonErrorRow,
  ProductBreakdownDesigner,
  ToolCheckDayRow,
  ToolCheckErrorRow,
  ToolCheckFacet,
  ToolCheckOrder,
} from 'shared';
import {
  DesignerStatus,
  FULFILLMENT_STAGE_LABELS,
  FulfillmentStage,
  RoleType,
  Status,
  WorkshopConfigCategory,
} from 'shared';

import { OrderEntity } from '../order/order.entity';
import { OrderLogEntity } from '../order-log/order-log.entity';
import { ProductConfigEntity } from '../product-config/product-config.entity';
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
  private readonly logger = new Logger(DesignerStatsService.name);

  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
    @InjectModel(WorkshopConfigEntity.name)
    private readonly workshopConfigModel: Model<WorkshopConfigEntity>,
    @InjectModel(OrderLogEntity.name)
    private readonly orderLogModel: Model<OrderLogEntity>,
    @InjectModel(ProductConfigEntity.name)
    private readonly productConfigModel: Model<ProductConfigEntity>,
    private readonly roleRepository: RoleRepository,
  ) {}

  async getPerformance(from?: string, to?: string, userId?: string): Promise<DesignerLeaderboardRow[]> {
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
    // CHỈ designer ĐANG BẬT — leaderboard loại người đã tắt (kể cả lịch sử).
    const designerRole = await this.roleRepository.findOne({ name: RoleType.Designer });
    const teamUsers = designerRole
      ? await this.userModel
          .find({ roleId: designerRole._id, status: Status.Active }, { _id: 1, fullName: 1, email: 1 })
          .lean()
      : [];
    // Khi xem stats 1 user cụ thể (self-scope) → luôn cho phép; ngược lại chỉ
    // tính user active.
    const activeIds = new Set(teamUsers.map((u) => String(u._id)));
    const allow = (uid: string) => (userId ? uid === userId : activeIds.has(uid));

    const userIds = new Set<string>();
    for (const row of statusAgg) if (allow(row._id.uid)) userIds.add(row._id.uid);
    for (const o of completedDocs) {
      const a = (o as { assignee?: string }).assignee;
      if (a && allow(a)) userIds.add(a);
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
          fixedInPeriod: 0,
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
      {
        responseMs: number;
        responseN: number;
        workMs: number;
        workN: number;
        reworkSum: number;
        n: number;
        fixedN: number;
      }
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
        fixedN: 0,
      };
      c.n++;
      // "Đã sửa" = done trong period MÀ từng bị báo lỗi (designerReworkCount>0).
      if ((o.designerReworkCount || 0) > 0) c.fixedN++;
      const aAt = o.designerAssignedAt;
      const sAt = o.designerStartedAt;
      const fsAt = (o as { designerFirstStartedAt?: Date }).designerFirstStartedAt;
      const cAt = o.designerCompletedAt;
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
      c.reworkSum += o.designerReworkCount || 0;
      completedAgg.set(uid, c);
    }
    for (const [uid, c] of completedAgg) {
      const r = ensureRow(uid);
      r.completedInPeriod = c.n;
      r.fixedInPeriod = c.fixedN;
      r.avgResponseMin = c.responseN > 0 ? Math.round(c.responseMs / c.responseN / 60000) : 0;
      r.avgWorkMin = c.workN > 0 ? Math.round(c.workMs / c.workN / 60000) : 0;
      r.errorRate = c.n > 0 ? Math.round((c.reworkSum / c.n) * 100) / 100 : 0;
    }

    // ─── Total rework trong period ─────────────────────────────────
    // Đếm từ OrderLog (mỗi lần designerStatus chuyển sang rework ghi 1 log).
    // Group theo order.assignee hiện tại (đơn rework do người đang ôm sửa).
    const logAgg = await this.orderLogModel.aggregate<{
      _id: { uid: string };
      count: number;
    }>([
      {
        $match: {
          field: 'designerStatus',
          after: 'rework',
          createdAt: { $gte: range.start, $lte: range.end },
        },
      },
      { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'order' } },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: false } },
      ...(userId ? [{ $match: { 'order.assignee': userId } as Record<string, unknown> }] : []),
      { $group: { _id: { uid: '$order.assignee' }, count: { $sum: 1 } } },
    ]);
    for (const row of logAgg) {
      if (!row._id.uid) continue;
      ensureRow(row._id.uid).totalRework = row.count;
    }

    // ─── Total "Không làm được" trong period ───────────────────────
    // Nguồn = mảng lịch sử `designerRejections` trên order (quy về `fromUserId`
    // = người bàn giao, ĐÚNG người kể cả khi đơn đã sang tay người khác). Đếm
    // theo mốc `at` rơi trong kỳ.
    const rejectedAgg = await this.orderModel.aggregate<{ _id: string; count: number }>([
      { $match: { designerRejections: { $exists: true, $ne: [] } } },
      { $unwind: '$designerRejections' },
      {
        $match: {
          'designerRejections.at': { $gte: range.start, $lte: range.end },
          ...(userId ? { 'designerRejections.fromUserId': userId } : {}),
        },
      },
      { $group: { _id: '$designerRejections.fromUserId', count: { $sum: 1 } } },
    ]);
    for (const row of rejectedAgg) {
      if (!row._id) continue;
      ensureRow(row._id).totalRejected = row.count;
    }

    return (
      [...rows.values()]
        // Loại row của designer đã tắt (ensureRow ở các loop trên có thể tạo lại).
        .filter((r) => allow(r.userId))
        .sort((a, b) => b.completedInPeriod - a.completedInPeriod || b.assignedCount - a.assignedCount)
    );
  }

  async getTimeline(userId: string, from?: string, to?: string): Promise<DesignerTimelineBucket[]> {
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
      if (src && (!cur.source || row.count > 0)) cur.source = src;
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

  /**
   * Ma trận Designer × Ngày (inProductionAt, tz VN) trong N ngày gần nhất
   * (7/14/30) cho MỌI sub-designer. Snapshot lens — mỗi ô là số đơn VÀO SẢN
   * XUẤT ngày đó ĐANG ở từng trạng thái. Focus 3 trạng thái chưa xong
   * (assigned/rework/inProgress) + done kèm. Tự include designer chưa có đơn.
   */
  async getTeamDailyBreakdown(
    rangeDays: number,
    from?: string,
    to?: string,
    type?: string,
    customer?: string,
  ): Promise<{
    days: string[];
    rows: {
      userId: string;
      fullName: string;
      email?: string;
      cells: { assigned: number; rework: number; inProgress: number; done: number; unfinished: number }[];
      totals: { assigned: number; rework: number; inProgress: number; done: number; unfinished: number };
    }[];
    columnTotals: { assigned: number; rework: number; inProgress: number; done: number; unfinished: number }[];
    grandTotals: { assigned: number; rework: number; inProgress: number; done: number; unfinished: number };
    rangeDays: number;
  }> {
    const MS_DAY = 86_400_000;
    const DAY_CAP = 100; // giới hạn số cột sinh ra cho range tùy chỉnh rộng.
    const vnStart = (d: string) => new Date(`${d}T00:00:00+07:00`);
    const vnEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`);
    const vnToday = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Danh sách ngày (mới → cũ) + index map để đổ cell về đúng cột.
    const days: string[] = [];
    const dayIndex = new Map<string, number>();
    let start: Date;
    let end: Date;
    if (from || to) {
      // Khoảng tùy chỉnh (cho biểu đồ "theo designer"). Match theo [from,to] đầy
      // đủ; day-list cap DAY_CAP (chỉ ảnh hưởng cells, KHÔNG ảnh hưởng totals).
      const f = (from || to)!.slice(0, 10);
      const t = (to || from)!.slice(0, 10);
      start = vnStart(f);
      end = vnEnd(t);
      const startMs = start.getTime();
      let cur = vnStart(t).getTime();
      let i = 0;
      while (cur >= startMs && i < DAY_CAP) {
        const d = new Date(cur + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
        dayIndex.set(d, i);
        days.push(d);
        cur -= MS_DAY;
        i++;
      }
    } else {
      const baseMs = vnStart(vnToday).getTime();
      for (let i = 0; i < rangeDays; i++) {
        const d = new Date(baseMs - i * MS_DAY + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
        dayIndex.set(d, i);
        days.push(d);
      }
      start = new Date(baseMs - (rangeDays - 1) * MS_DAY);
      end = vnEnd(vnToday);
    }

    type CellKey = 'assigned' | 'rework' | 'inProgress' | 'done';
    const statusKey: Partial<Record<DesignerStatus, CellKey>> = {
      [DesignerStatus.Assigned]: 'assigned',
      [DesignerStatus.Rework]: 'rework',
      [DesignerStatus.InProgress]: 'inProgress',
      [DesignerStatus.Done]: 'done',
    };
    const emptyCell = () => ({ assigned: 0, rework: 0, inProgress: 0, done: 0, unfinished: 0 });

    // Filter sản phẩm / khách hàng (áp dụng chung cho ma trận + 2 biểu đồ cột).
    const extraMatch: Record<string, unknown> = {};
    if (type) extraMatch.type = type;
    if (customer) extraMatch.userSku = customer;

    const [agg, designerRole] = await Promise.all([
      this.orderModel.aggregate<{
        _id: { uid: string; day: string; status: DesignerStatus };
        count: number;
      }>([
        {
          $match: {
            assignee: { $exists: true, $ne: null },
            inProductionAt: { $gte: start, $lte: end },
            designerStatus: {
              $in: [DesignerStatus.Assigned, DesignerStatus.InProgress, DesignerStatus.Rework, DesignerStatus.Done],
            },
            ...extraMatch,
          },
        },
        {
          $group: {
            _id: {
              uid: '$assignee',
              day: { $dateToString: { format: '%Y-%m-%d', date: '$inProductionAt', timezone: '+07:00' } },
              status: '$designerStatus',
            },
            count: { $sum: 1 },
          },
        },
      ]),
      this.roleRepository.findOne({ name: RoleType.Designer }),
    ]);

    // CHỈ designer ĐANG BẬT — thống kê loại người đã tắt.
    const teamUsers = designerRole
      ? await this.userModel
          .find({ roleId: designerRole._id, status: Status.Active }, { _id: 1, fullName: 1, email: 1 })
          .lean()
      : [];
    const activeIds = new Set(teamUsers.map((u) => String(u._id)));

    const nameMap = new Map<string, { fullName: string; email?: string }>();
    for (const u of teamUsers) nameMap.set(String(u._id), { fullName: u.fullName, email: u.email });

    const KEYS = ['assigned', 'rework', 'inProgress', 'done', 'unfinished'] as const;
    const rowCells = new Map<string, ReturnType<typeof emptyCell>[]>();
    const rowTotals = new Map<string, ReturnType<typeof emptyCell>>();
    const ensureRow = (uid: string) => {
      if (!rowCells.has(uid))
        rowCells.set(
          uid,
          days.map(() => emptyCell()),
        );
      if (!rowTotals.has(uid)) rowTotals.set(uid, emptyCell());
    };
    if (designerRole) for (const u of teamUsers) ensureRow(String(u._id));

    for (const r of agg) {
      const key = statusKey[r._id.status];
      if (!key) continue;
      // Bỏ qua đơn của designer đã tắt (chỉ thống kê người active).
      if (!activeIds.has(r._id.uid)) continue;
      ensureRow(r._id.uid);
      // Totals cộng TRỰC TIẾP từ agg → đúng cho mọi khoảng (kể cả day-list bị cap).
      const tt = rowTotals.get(r._id.uid)!;
      tt[key] += r.count;
      if (key !== 'done') tt.unfinished += r.count;
      // Cells chỉ đổ khi ngày nằm trong day-list (preset ≤30; range cap 100).
      const col = dayIndex.get(r._id.day);
      if (col !== undefined) {
        const c = rowCells.get(r._id.uid)![col];
        c[key] += r.count;
        if (key !== 'done') c.unfinished += r.count;
      }
    }

    // Resolve tên cho assignee ngoài team (nếu có).
    const missingIds = [...rowTotals.keys()].filter((id) => !nameMap.has(id));
    if (missingIds.length > 0) {
      const extra = await this.userModel.find({ _id: { $in: missingIds } }, { _id: 1, fullName: 1, email: 1 }).lean();
      for (const u of extra) nameMap.set(String(u._id), { fullName: u.fullName, email: u.email });
    }

    const columnTotals = days.map(() => emptyCell());
    const grandTotals = emptyCell();
    const rows = [...rowTotals.entries()].map(([uid, totals]) => {
      const cells = rowCells.get(uid)!;
      cells.forEach((c, i) => {
        for (const k of KEYS) columnTotals[i][k] += c[k];
      });
      for (const k of KEYS) grandTotals[k] += totals[k];
      const info = nameMap.get(uid);
      return {
        userId: uid,
        fullName: info?.fullName || `#${uid.slice(-4)}`,
        email: info?.email,
        cells,
        totals,
      };
    });

    // Sort: tồn nhiều lên đầu; hết tồn thì theo done desc; rồi tên.
    rows.sort(
      (a, b) =>
        b.totals.unfinished - a.totals.unfinished ||
        b.totals.done - a.totals.done ||
        a.fullName.localeCompare(b.fullName),
    );

    return { days, rows, columnTotals, grandTotals, rangeDays };
  }

  /**
   * Danh sách option cho 2 dropdown filter (sản phẩm = `type`, khách hàng =
   * `userSku`) của tab Designer. Chỉ tính đơn đã gán designer (assignee set) để
   * khớp phạm vi của ma trận/biểu đồ. Customer cap 300 để payload không phình.
   */
  async getBreakdownFilters(): Promise<{
    products: { value: string; label: string; count: number }[];
    customers: { value: string; label: string; count: number }[];
  }> {
    const scope = { assignee: { $exists: true, $ne: null } };
    const [typeRows, customerRows] = await Promise.all([
      this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: { ...scope, type: { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: { ...scope, userSku: { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$userSku', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 300 },
      ]),
    ]);
    const toOpts = (rows: { _id: string; count: number }[]) =>
      rows.map((r) => ({ value: r._id, label: r._id, count: r.count }));
    return { products: toOpts(typeRows), customers: toOpts(customerRows) };
  }

  /**
   * Bảng tổng quan N ngày (7/14/30) cho tab Designer — 4 hàng:
   *   1. total     — tất cả đơn inProductionAt ngày đó (mọi trạng thái)
   *   2. unreviewed— toolResultNote null/'' (chưa soát)
   *   3. error     — toolResultNote set & != 'ok' (+ breakdown theo mã note)
   *   4. backlog   — toolResultNote != 'ok' (chưa soát + lỗi, theo Tool)
   * Kèm backlogByDesigner (per-designer × [assigned,inProgress,rework] — "Không
   * làm được"/rejected KHÔNG tính là tồn) + unassignedBacklog
   * cho bảng con khi expand hàng Tồn.
   */
  async getDailyOverview(
    rangeDays: number,
    type?: string,
    customer?: string,
    from?: string,
    to?: string,
  ): Promise<{
    days: string[];
    rows: {
      day: string;
      total: number;
      ok: number;
      unreviewed: number;
      error: number;
      errorTotal: number;
      errorUnassigned: number;
      errorByNote: { code: string; count: number }[];
      backlog: number;
      unassigned: number;
    }[];
    backlogByDesigner: {
      userId: string;
      fullName: string;
      email?: string;
      assigned: number;
      inProgress: number;
      rework: number;
      total: number;
    }[];
    unassignedBacklog: number;
    columnTotals: {
      total: number;
      ok: number;
      unreviewed: number;
      error: number;
      errorTotal: number;
      errorUnassigned: number;
      backlog: number;
    };
    rangeDays: number;
  }> {
    const { start, end, days } = this.resolveVnWindow(rangeDays, from, to);

    const extraMatch: Record<string, unknown> = {};
    if (type) extraMatch.type = type;
    if (customer) extraMatch.userSku = customer;
    // `cancelledAt: null` — loại đơn hủy khỏi mọi số liệu tổng quan.
    const baseMatch = { inProductionAt: { $gte: start, $lte: end }, cancelledAt: null, ...extraMatch };

    const dayExpr = { $dateToString: { format: '%Y-%m-%d', date: '$inProductionAt', timezone: '+07:00' } };
    const noteExpr = { $ifNull: ['$toolResultNote', ''] };
    const statusExpr = { $ifNull: ['$designerStatus', DesignerStatus.Unassigned] };

    const [rowsAgg, noteAgg, backlogAgg, designerRole] = await Promise.all([
      // (a) per-day counts
      this.orderModel.aggregate<{
        _id: string;
        total: number;
        ok: number;
        unreviewed: number;
        error: number;
        errorTotal: number;
        errorUnassigned: number;
        backlog: number;
        unassigned: number;
      }>([
        { $match: baseMatch },
        {
          $group: {
            _id: dayExpr,
            total: { $sum: 1 },
            // Đã soát xong, không lỗi (note = 'ok').
            ok: { $sum: { $cond: [{ $eq: [noteExpr, 'ok'] }, 1, 0] } },
            // Chưa soát (note rỗng).
            unreviewed: { $sum: { $cond: [{ $eq: [noteExpr, ''] }, 1, 0] } },
            // Lỗi thật (đã soát & note ≠ 'ok') — CÒN LẠI hiện tại.
            error: {
              $sum: {
                $cond: [{ $and: [{ $ne: [noteExpr, ''] }, { $ne: [noteExpr, 'ok'] }] }, 1, 0],
              },
            },
            // Đơn TỪNG lỗi trong ngày (kể cả đã sửa xong, note đã về 'ok') — hiển
            // thị "còn lại/tổng". Đơn lỗi từ file soát đã sửa không để lại dấu vết
            // riêng nên đếm best-effort qua counter lỗi tích lũy.
            errorTotal: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $and: [{ $ne: [noteExpr, ''] }, { $ne: [noteExpr, 'ok'] }] },
                      { $gt: [{ $ifNull: ['$productionErrorCount', 0] }, 0] },
                      { $gt: [{ $ifNull: ['$designerReworkCount', 0] }, 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            // Đơn ĐANG lỗi & chưa gán designer (assignee rỗng).
            errorUnassigned: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [noteExpr, ''] },
                      { $ne: [noteExpr, 'ok'] },
                      { $eq: [{ $ifNull: ['$assignee', ''] }, ''] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            // Tổng tồn = chưa 'ok' = chưa soát + lỗi (theo Tool, KHÔNG theo
            // designerStatus). Đảm bảo total = ok + backlog.
            backlog: { $sum: { $cond: [{ $ne: [noteExpr, 'ok'] }, 1, 0] } },
            // Đơn designerStatus=unassigned (cho bảng xổ "Chưa gán").
            unassigned: {
              $sum: { $cond: [{ $eq: [statusExpr, DesignerStatus.Unassigned] }, 1, 0] },
            },
          },
        },
      ]),
      // (b) errorByNote per day
      this.orderModel.aggregate<{ _id: { day: string; note: string }; count: number }>([
        { $match: { ...baseMatch, toolResultNote: { $nin: [null, '', 'ok'] } } },
        { $group: { _id: { day: dayExpr, note: '$toolResultNote' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // (c) backlog per designer (active statuses có assignee).
      // "Không làm được" (Rejected) KHÔNG tính là tồn — nằm ở backlog "Cần gán".
      this.orderModel.aggregate<{ _id: { uid: string; status: DesignerStatus }; count: number }>([
        {
          $match: {
            ...baseMatch,
            assignee: { $exists: true, $ne: null },
            designerStatus: {
              $in: [DesignerStatus.Assigned, DesignerStatus.InProgress, DesignerStatus.Rework],
            },
          },
        },
        { $group: { _id: { uid: '$assignee', status: '$designerStatus' }, count: { $sum: 1 } } },
      ]),
      this.roleRepository.findOne({ name: RoleType.Designer }),
    ]);

    // errorByNote gom theo ngày
    const noteByDay = new Map<string, { code: string; count: number }[]>();
    for (const r of noteAgg) {
      const list = noteByDay.get(r._id.day) || [];
      list.push({ code: r._id.note, count: r.count });
      noteByDay.set(r._id.day, list);
    }

    const rowMap = new Map(rowsAgg.map((r) => [r._id, r]));
    const columnTotals = { total: 0, ok: 0, unreviewed: 0, error: 0, errorTotal: 0, errorUnassigned: 0, backlog: 0 };
    let unassignedBacklog = 0;
    const rows = days.map((day) => {
      const r = rowMap.get(day);
      const total = r?.total ?? 0;
      const ok = r?.ok ?? 0;
      const unreviewed = r?.unreviewed ?? 0;
      const error = r?.error ?? 0;
      const errorTotal = r?.errorTotal ?? 0;
      const errorUnassigned = r?.errorUnassigned ?? 0;
      const backlog = r?.backlog ?? 0;
      const unassigned = r?.unassigned ?? 0;
      columnTotals.total += total;
      columnTotals.ok += ok;
      columnTotals.unreviewed += unreviewed;
      columnTotals.error += error;
      columnTotals.errorTotal += errorTotal;
      columnTotals.errorUnassigned += errorUnassigned;
      columnTotals.backlog += backlog;
      unassignedBacklog += unassigned;
      return {
        day,
        total,
        ok,
        unreviewed,
        error,
        errorTotal,
        errorUnassigned,
        errorByNote: noteByDay.get(day) || [],
        backlog,
        unassigned,
      };
    });

    // Resolve tên designer cho bảng con — CHỈ designer ĐANG BẬT (thống kê active).
    const teamUsers = designerRole
      ? await this.userModel
          .find({ roleId: designerRole._id, status: Status.Active }, { _id: 1, fullName: 1, email: 1 })
          .lean()
      : [];
    const activeIds = new Set(teamUsers.map((u) => String(u._id)));
    const nameMap = new Map<string, { fullName: string; email?: string }>();
    for (const u of teamUsers) nameMap.set(String(u._id), { fullName: u.fullName, email: u.email });

    type BL = { assigned: number; inProgress: number; rework: number };
    const blMap = new Map<string, BL>();
    const bump = (uid: string, status: DesignerStatus, n: number) => {
      const cur = blMap.get(uid) || { assigned: 0, inProgress: 0, rework: 0 };
      if (status === DesignerStatus.Assigned) cur.assigned += n;
      else if (status === DesignerStatus.InProgress) cur.inProgress += n;
      else if (status === DesignerStatus.Rework) cur.rework += n;
      blMap.set(uid, cur);
    };
    for (const r of backlogAgg) bump(r._id.uid, r._id.status, r.count);

    const missingIds = [...blMap.keys()].filter((id) => !nameMap.has(id));
    if (missingIds.length > 0) {
      const extra = await this.userModel.find({ _id: { $in: missingIds } }, { _id: 1, fullName: 1, email: 1 }).lean();
      for (const u of extra) nameMap.set(String(u._id), { fullName: u.fullName, email: u.email });
    }

    const backlogByDesigner = [...blMap.entries()]
      // Chỉ giữ designer đang bật (loại người đã tắt / assignee ngoài team).
      .filter(([uid]) => activeIds.has(uid))
      .map(([uid, c]) => {
        const info = nameMap.get(uid);
        return {
          userId: uid,
          fullName: info?.fullName || `#${uid.slice(-4)}`,
          email: info?.email,
          assigned: c.assigned,
          inProgress: c.inProgress,
          rework: c.rework,
          total: c.assigned + c.inProgress + c.rework,
        };
      })
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total || a.fullName.localeCompare(b.fullName));

    return { days, rows, backlogByDesigner, unassignedBacklog, columnTotals, rangeDays: days.length };
  }

  /**
   * Bảng "Cần gán designer" — đơn `toolResultNote` đã soát & ≠ ok VÀ chưa có
   * người ôm (unassigned / rejected / rework-chưa-ôm), gom theo sản phẩm
   * (productConfigId → mockup/level/fullName), đơn chưa map → nhóm "Chưa map".
   */
  async getAssignBacklog(
    rangeDays: number,
    type?: string,
    customer?: string,
    from?: string,
    to?: string,
  ): Promise<{ groups: AssignBacklogGroup[]; total: number; rangeDays: number }> {
    const { start, end, days } = this.resolveVnWindow(rangeDays, from, to);

    const match: Record<string, unknown> = {
      inProductionAt: { $gte: start, $lte: end },
      cancelledAt: null, // loại đơn hủy khỏi pool "Cần gán" + self-claim
      // Đã soát & khác ok (KHÔNG gồm chưa soát null/'').
      toolResultNote: { $nin: [null, '', 'ok'] },
      $or: [
        { designerStatus: DesignerStatus.Unassigned },
        { designerStatus: DesignerStatus.Rejected },
        // rework chưa ôm — assignee null/missing.
        { designerStatus: DesignerStatus.Rework, assignee: { $in: [null] } },
      ],
    };
    if (type) match.type = type;
    if (customer) match.userSku = customer;

    const orders = await this.orderModel
      .find(match, {
        productionId: 1,
        userSku: 1,
        size: 1,
        color: 1,
        type: 1,
        mockupUrl: 1,
        mockupOriginalUrl: 1,
        toolResultNote: 1,
        designerStatus: 1,
        inProductionAt: 1,
        productConfigId: 1,
        priority: 1,
      })
      .sort({ priority: -1, inProductionAt: -1 })
      .lean();

    const UNMAPPED = 'unmapped';
    const grouped = new Map<string, { orderIds: string[]; orders: AssignBacklogOrder[] }>();
    for (const o of orders as Array<Record<string, unknown>>) {
      const key = (o.productConfigId as string) || UNMAPPED;
      const g = grouped.get(key) || { orderIds: [], orders: [] };
      const id = String(o._id);
      g.orderIds.push(id);
      g.orders.push({
        _id: id,
        productionId: String(o.productionId ?? ''),
        userSku: o.userSku as string | undefined,
        size: o.size as string | undefined,
        color: o.color as string | undefined,
        type: o.type as string | undefined,
        mockupUrl: o.mockupUrl as string | undefined,
        mockupOriginalUrl: o.mockupOriginalUrl as string | undefined,
        toolResultNote: o.toolResultNote as string | undefined,
        designerStatus: o.designerStatus as string | undefined,
        inProductionAt: o.inProductionAt ? new Date(o.inProductionAt as Date).toISOString() : undefined,
        priority: o.priority as AssignBacklogOrder['priority'],
      });
      grouped.set(key, g);
    }

    const cfgIds = [...grouped.keys()].filter((k) => k !== UNMAPPED);
    const cfgs = cfgIds.length
      ? await this.productConfigModel
          .find({ _id: { $in: cfgIds } }, { fullName: 1, shortName: 1, mockup: 1, level: 1 })
          .lean()
      : [];
    const cfgMap = new Map<string, { fullName?: string; shortName?: string; mockup?: string; level?: number }>();
    for (const c of cfgs as Array<Record<string, unknown>>) {
      cfgMap.set(String(c._id), {
        fullName: c.fullName as string,
        shortName: c.shortName as string,
        mockup: c.mockup as string,
        level: c.level as number,
      });
    }

    const groups = [...grouped.entries()].map(([key, g]) => {
      const cfg = key !== UNMAPPED ? cfgMap.get(key) : undefined;
      return {
        key,
        fullName: cfg?.fullName || (key === UNMAPPED ? 'Chưa map' : `#${key.slice(-6)}`),
        shortName: cfg?.shortName,
        mockup: cfg?.mockup,
        level: cfg?.level,
        count: g.orders.length,
        orderIds: g.orderIds,
        orders: g.orders,
      };
    });

    // Sort count desc; nhóm "Chưa map" xuống cuối.
    groups.sort((a, b) => {
      if (a.key === UNMAPPED) return 1;
      if (b.key === UNMAPPED) return -1;
      return b.count - a.count || a.fullName.localeCompare(b.fullName);
    });

    return { groups, total: orders.length, rangeDays: days.length };
  }

  /**
   * Breakdown sản phẩm theo từng designer (cho tooltip biểu đồ Cơ cấu trạng
   * thái): mỗi designer → list sản phẩm (order.type) họ được gán trong kỳ +
   * số đơn/sản phẩm + level/mockup (từ ProductConfig). Phạm vi = mọi đơn đã gán
   * (assigned/in-progress/rework/done).
   */
  async getProductBreakdown(
    rangeDays: number,
    type?: string,
    customer?: string,
    from?: string,
    to?: string,
  ): Promise<{ designers: ProductBreakdownDesigner[] }> {
    const { start, end } = this.resolveVnWindow(rangeDays, from, to);

    const match: Record<string, unknown> = {
      inProductionAt: { $gte: start, $lte: end },
      assignee: { $exists: true, $ne: null },
      designerStatus: {
        $in: [DesignerStatus.Assigned, DesignerStatus.InProgress, DesignerStatus.Rework, DesignerStatus.Done],
      },
    };
    if (type) match.type = type;
    if (customer) match.userSku = customer;

    const [agg, designerRole] = await Promise.all([
      this.orderModel.aggregate<{
        _id: { uid: string; type: string };
        count: number;
        cfg: string | null;
      }>([
        { $match: match },
        {
          $group: {
            _id: { uid: '$assignee', type: { $ifNull: ['$type', ''] } },
            count: { $sum: 1 },
            cfg: { $max: '$productConfigId' },
          },
        },
      ]),
      this.roleRepository.findOne({ name: RoleType.Designer }),
    ]);

    // CHỈ designer ĐANG BẬT — thống kê sản phẩm loại người đã tắt.
    const teamUsers = designerRole
      ? await this.userModel.find({ roleId: designerRole._id, status: Status.Active }, { _id: 1, fullName: 1 }).lean()
      : [];
    const activeIds = new Set(teamUsers.map((u) => String(u._id)));
    const nameMap = new Map<string, string>();
    for (const u of teamUsers) nameMap.set(String(u._id), u.fullName);

    const cfgIds = [...new Set(agg.map((a) => a.cfg).filter(Boolean))] as string[];
    const cfgs = cfgIds.length
      ? await this.productConfigModel
          .find({ _id: { $in: cfgIds } }, { fullName: 1, shortName: 1, mockup: 1, level: 1 })
          .lean()
      : [];
    const cfgMap = new Map<string, { fullName?: string; shortName?: string; mockup?: string; level?: number }>();
    for (const c of cfgs as Array<Record<string, unknown>>) {
      cfgMap.set(String(c._id), {
        fullName: c.fullName as string,
        shortName: c.shortName as string,
        mockup: c.mockup as string,
        level: c.level as number,
      });
    }

    const byUser = new Map<string, ProductBreakdownDesigner>();
    for (const a of agg) {
      const uid = a._id.uid;
      if (!activeIds.has(uid)) continue; // bỏ designer đã tắt
      let d = byUser.get(uid);
      if (!d) {
        d = { userId: uid, fullName: nameMap.get(uid) || `#${uid.slice(-4)}`, total: 0, products: [] };
        byUser.set(uid, d);
      }
      const cfg = a.cfg ? cfgMap.get(a.cfg) : undefined;
      d.products.push({
        type: a._id.type || '(Chưa rõ)',
        fullName: cfg?.fullName,
        shortName: cfg?.shortName,
        mockup: cfg?.mockup,
        level: cfg?.level,
        count: a.count,
      });
      d.total += a.count;
    }

    const missingIds = [...byUser.keys()].filter((id) => !nameMap.has(id));
    if (missingIds.length > 0) {
      const extra = await this.userModel.find({ _id: { $in: missingIds } }, { _id: 1, fullName: 1 }).lean();
      for (const u of extra) {
        const d = byUser.get(String(u._id));
        if (d) d.fullName = u.fullName;
      }
    }

    const designers = [...byUser.values()].map((d) => ({
      ...d,
      products: d.products.sort((x, y) => y.count - x.count),
    }));
    return { designers };
  }

  /**
   * Tổng quan tab "Soát tool" (Support/Admin). Trong cửa sổ ngày (inProductionAt,
   * tz VN, + filter type/customer):
   *   - reworkList  : đơn In trả về "do soát tool" (source=tool-check + note=error) — ưu tiên
   *   - unreviewedList: đơn chưa soát (toolResultNote rỗng) — backlog
   *   - checkedCount : số đơn đã soát trong kỳ (toolCheckedAt ∈ kỳ)
   *   - errorCount   : số đơn đang chờ support (= reworkList)
   *   - byProduct / byCustomer / topCustomerError: thống kê lỗi tool-check (mọi
   *     đơn source=tool-check trong kỳ, cả đang chờ lẫn đã fix) theo sản phẩm /
   *     khách hàng (userSku) / khách × loại lỗi.
   */
  async getToolCheckOverview(
    rangeDays: number,
    type?: string,
    customer?: string,
    from?: string,
    to?: string,
    machineNumber?: string,
    priority?: string,
  ): Promise<{
    checkedCount: number;
    errorCount: number;
    reworkList: ToolCheckOrder[];
    unreviewedList: ToolCheckOrder[];
    errorHistory: ToolCheckErrorRow[];
    days: ToolCheckDayRow[];
    columnTotals: { unreviewed: number; rework: number };
    facets: {
      type: ToolCheckFacet[];
      customer: ToolCheckFacet[];
      machineNumber: ToolCheckFacet[];
      priority: ToolCheckFacet[];
    };
    rangeDays: number;
  }> {
    const { start, end, days } = this.resolveVnWindow(rangeDays, from, to);
    const inWindow = { $gte: start, $lte: end };
    const withFilters = (m: Record<string, unknown>) => {
      if (type) m.type = type;
      if (customer) m.userSku = customer;
      if (machineNumber) m.machineNumber = machineNumber;
      if (priority) m.priority = Number(priority);
      return m;
    };
    const dayExpr = {
      $dateToString: { format: '%Y-%m-%d', date: '$inProductionAt', timezone: '+07:00' },
    };
    // `null` khớp cả giá trị null lẫn field vắng mặt → loại đơn đã xoá/hủy.
    const alive = { deletedAt: null, cancelledAt: null };

    const checkedMatch = withFilters({ toolCheckedAt: inWindow, ...alive });
    const reworkMatch = withFilters({
      inProductionAt: inWindow,
      productionErrorSource: 'tool-check',
      toolResultNote: 'error',
      ...alive,
    });
    const unreviewedMatch = withFilters({
      inProductionAt: inWindow,
      toolResultNote: { $in: [null, ''] },
      ...alive,
    });
    // Lịch sử "lỗi do người soát tool tạo ra" = đơn TỪNG bị đánh Note kq Tool ≠
    // ok (kể cả đã sửa về 'ok'). Nguồn BỀN VỮNG = field `toolCheckErrorNotes`
    // (dedup mã note ≠ ok, không bị xoá khi sửa). Lọc kỳ theo `inProductionAt`.
    const errHistoryMatch = withFilters({
      inProductionAt: inWindow,
      'toolCheckErrorNotes.0': { $exists: true },
      ...alive,
    });

    const LIST_CAP = 500;
    const HISTORY_CAP = 5000;
    const proj = {
      productionId: 1,
      userSku: 1,
      type: 1,
      size: 1,
      color: 1,
      mockupUrl: 1,
      mockupOriginalUrl: 1,
      toolResultNote: 1,
      errorFile: 1,
      errorFileNote: 1,
      productionError: 1,
      productionErrorNote: 1,
      productionErrorCount: 1,
      machineNumber: 1,
      inProductionAt: 1,
      priority: 1,
    };

    // Phạm vi facet = đơn Support quan tâm trong kỳ (chưa soát ∪ tool-check),
    // KHÔNG áp 3 filter type/customer/machine → dropdown ổn định (chọn xong
    // options không biến mất). `alive` để loại đơn xoá/hủy.
    const facetScope = {
      inProductionAt: inWindow,
      ...alive,
      $or: [{ toolResultNote: { $in: [null, ''] } }, { productionErrorSource: 'tool-check' }],
    };
    const facetAgg = (field: string) =>
      this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: facetScope },
        { $group: { _id: { $ifNull: [`$${field}`, ''] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 200 },
      ]);
    const toFacet = (rows: { _id: string; count: number }[]): ToolCheckFacet[] =>
      rows.filter((r) => r._id !== '').map((r) => ({ value: r._id, count: r.count }));
    // `priority` là number → $toString để value ra chuỗi giống các facet khác.
    // Sort theo `_id` desc (cao→thấp) thay vì count để dropdown ổn định theo thứ tự mức.
    const priorityFacetAgg = () =>
      this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: facetScope },
        { $group: { _id: { $ifNull: [{ $toString: '$priority' }, ''] }, count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ]);

    const histProj = {
      productionId: 1,
      userSku: 1,
      userEmail: 1,
      type: 1,
      size: 1,
      color: 1,
      productConfigId: 1,
      mockupUrl: 1,
      mockupOriginalUrl: 1,
      toolCheckErrorNotes: 1,
      errorFileNote: 1,
      errorFile: 1,
    };

    const [
      checkedCount,
      reworkRaw,
      unreviewedRaw,
      candidatesRaw,
      unreviewedByDay,
      reworkByDay,
      typeFacetAgg,
      customerFacetAgg,
      machineFacetAgg,
      priorityFacetAggRows,
    ] = await Promise.all([
      this.orderModel.countDocuments(checkedMatch),
      this.orderModel.find(reworkMatch, proj).sort({ priority: -1, inProductionAt: -1 }).limit(LIST_CAP).lean(),
      this.orderModel.find(unreviewedMatch, proj).sort({ priority: -1, inProductionAt: -1 }).limit(LIST_CAP).lean(),
      // Candidate: đơn từng bị đánh Note kq Tool ≠ ok trong kỳ. Mã note (loại
      // lỗi) nằm sẵn trong `toolCheckErrorNotes` — không cần join thêm.
      this.orderModel.find(errHistoryMatch, histProj).sort({ inProductionAt: -1 }).limit(HISTORY_CAP).lean(),
      // Per-day: chưa soát + In trả về (áp cùng 3 filter type/customer/machine).
      this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: unreviewedMatch },
        { $group: { _id: dayExpr, count: { $sum: 1 } } },
      ]),
      this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: reworkMatch },
        { $group: { _id: dayExpr, count: { $sum: 1 } } },
      ]),
      // Facet options (phạm vi Support, KHÔNG áp 4 filter → ổn định).
      facetAgg('type'),
      facetAgg('userSku'),
      facetAgg('machineNumber'),
      priorityFacetAgg(),
    ]);

    const toOrder = (o: Record<string, unknown>): ToolCheckOrder => ({
      _id: String(o._id),
      productionId: String(o.productionId ?? ''),
      userSku: o.userSku as string | undefined,
      type: o.type as string | undefined,
      size: o.size as string | undefined,
      color: o.color as string | undefined,
      mockupUrl: o.mockupUrl as string | undefined,
      mockupOriginalUrl: o.mockupOriginalUrl as string | undefined,
      toolResultNote: o.toolResultNote as string | undefined,
      errorFile: Array.isArray(o.errorFile) ? (o.errorFile as string[]) : undefined,
      errorFileNote: o.errorFileNote as string | undefined,
      productionError: o.productionError as string | undefined,
      productionErrorNote: o.productionErrorNote as string | undefined,
      productionErrorCount: o.productionErrorCount as number | undefined,
      machineNumber: o.machineNumber as string | undefined,
      inProductionAt: o.inProductionAt ? new Date(o.inProductionAt as Date).toISOString() : undefined,
      priority: o.priority as ToolCheckOrder['priority'],
    });

    const candidates = candidatesRaw as Array<Record<string, unknown>>;
    if (candidates.length >= HISTORY_CAP) {
      this.logger.warn(
        `[tool-check] errorHistory candidate cap ${HISTORY_CAP} reached — thống kê lịch sử lỗi có thể thiếu (thu hẹp kỳ/filter).`,
      );
    }

    // Label mã note kq Tool (workshop_config tool_result_note): code → name.
    const noteCfgs = await this.workshopConfigModel
      .find({ category: WorkshopConfigCategory.ToolResultNote }, { code: 1, name: 1 })
      .lean();
    const noteNameMap = new Map<string, string>();
    for (const c of noteCfgs as Array<Record<string, unknown>>) {
      noteNameMap.set(String(c.code), String(c.name));
    }

    // Resolve mockup/level/fullName theo productConfigId của candidate.
    const cfgIds = [...new Set(candidates.map((o) => o.productConfigId).filter(Boolean))] as string[];
    const cfgs = cfgIds.length
      ? await this.productConfigModel.find({ _id: { $in: cfgIds } }, { fullName: 1, mockup: 1, level: 1 }).lean()
      : [];
    const cfgMap = new Map<string, { fullName?: string; mockup?: string; level?: number }>();
    for (const c of cfgs as Array<Record<string, unknown>>) {
      cfgMap.set(String(c._id), {
        fullName: c.fullName as string,
        mockup: c.mockup as string,
        level: c.level as number,
      });
    }

    // Flat rows: mỗi (đơn × mã note ≠ ok). Mã note lấy sẵn từ `toolCheckErrorNotes`.
    const errorHistory: ToolCheckErrorRow[] = [];
    for (const o of candidates) {
      const oid = String(o._id);
      const cfg = o.productConfigId ? cfgMap.get(String(o.productConfigId)) : undefined;
      const notes = Array.isArray(o.toolCheckErrorNotes) ? (o.toolCheckErrorNotes as string[]).filter(Boolean) : [];
      const codes = notes.length ? [...new Set(notes)] : [''];
      const base = {
        orderId: oid,
        productionId: o.productionId as string | undefined,
        userSku: o.userSku as string | undefined,
        userEmail: o.userEmail as string | undefined,
        type: o.type as string | undefined,
        fullName: cfg?.fullName,
        mockup: cfg?.mockup,
        level: cfg?.level,
        note: (o.errorFileNote as string | undefined) || undefined,
        errorFile: Array.isArray(o.errorFile) ? (o.errorFile as string[]).filter(Boolean) : undefined,
        mockupUrl: o.mockupUrl as string | undefined,
        mockupOriginalUrl: o.mockupOriginalUrl as string | undefined,
        size: o.size as string | undefined,
        color: o.color as string | undefined,
      };
      for (const code of codes) {
        errorHistory.push({ ...base, code, codeLabel: code ? noteNameMap.get(code) : undefined });
      }
    }

    // Dải theo ngày: căn theo `days` (mới→cũ) từ resolveVnWindow.
    const unreviewedDayMap = new Map(unreviewedByDay.map((r) => [r._id, r.count]));
    const reworkDayMap = new Map(reworkByDay.map((r) => [r._id, r.count]));
    const columnTotals = { unreviewed: 0, rework: 0 };
    const dayRows: ToolCheckDayRow[] = days.map((day) => {
      const unreviewed = unreviewedDayMap.get(day) ?? 0;
      const rework = reworkDayMap.get(day) ?? 0;
      columnTotals.unreviewed += unreviewed;
      columnTotals.rework += rework;
      return { day, unreviewed, rework };
    });

    return {
      checkedCount,
      errorCount: reworkRaw.length,
      reworkList: (reworkRaw as Array<Record<string, unknown>>).map(toOrder),
      unreviewedList: (unreviewedRaw as Array<Record<string, unknown>>).map(toOrder),
      errorHistory,
      days: dayRows,
      columnTotals,
      facets: {
        type: toFacet(typeFacetAgg),
        customer: toFacet(customerFacetAgg),
        machineNumber: toFacet(machineFacetAgg),
        priority: toFacet(priorityFacetAggRows),
      },
      rangeDays: days.length,
    };
  }

  /**
   * Cửa sổ ngày (tz VN) cho overview/assign-backlog. Nếu có cả `from`+`to` →
   * khoảng tùy biến (cap 60 ngày); ngược lại → N ngày gần nhất. `days` sort
   * mới→cũ (đồng bộ với FE reverse).
   */
  private resolveVnWindow(rangeDays: number, from?: string, to?: string): { start: Date; end: Date; days: string[] } {
    const MS_DAY = 86_400_000;
    const CAP = 60;
    const vnStart = (d: string) => new Date(`${d}T00:00:00+07:00`);
    const vnEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`);
    const vnToday = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const days: string[] = [];

    if (from && to) {
      const f = from.slice(0, 10);
      const t = to.slice(0, 10);
      const start = vnStart(f);
      const end = vnEnd(t);
      const startMs = start.getTime();
      let cur = vnStart(t).getTime();
      let i = 0;
      while (cur >= startMs && i < CAP) {
        days.push(new Date(cur + 7 * 60 * 60 * 1000).toISOString().slice(0, 10));
        cur -= MS_DAY;
        i++;
      }
      return { start, end, days };
    }

    const baseMs = vnStart(vnToday).getTime();
    for (let i = 0; i < rangeDays; i++) {
      days.push(new Date(baseMs - i * MS_DAY + 7 * 60 * 60 * 1000).toISOString().slice(0, 10));
    }
    return { start: new Date(baseMs - (rangeDays - 1) * MS_DAY), end: vnEnd(vnToday), days };
  }

  /** Range honoring `days` (nếu không có from/to). Mặc định 30 ngày. */
  private resolveRangeDays(from?: string, to?: string, days?: number): { start: Date; end: Date } {
    if (from || to) return this.resolveRange(from, to);
    if (days && days > 0) {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    return this.resolveRange();
  }

  /**
   * Thống kê lỗi theo NGƯỜI, 2 chiều:
   *  - `needFixCount`: đơn lỗi ĐANG cần người đó sửa (snapshot) = đơn đang mang
   *    lỗi & đang đứng ở công đoạn người đó phụ trách (fulfillment: theo
   *    (factory, currentFulfillmentStage); designer: designerStatus=rework +
   *    assignee). → chiều "bị quy lỗi / phải sửa".
   *  - `reportedCount`: số lần người đó ĐÃ báo lỗi (đẩy về) trong kỳ, đếm từ
   *    `fulfillmentTimeline` (action=rework-back, byUserId). → chiều "phát hiện".
   * Loại đơn hủy (`cancelledAt`). Date field: `inProductionAt` (needFix) /
   * `timeline.at` (reported).
   */
  async getPersonErrorOverview(
    from?: string,
    to?: string,
    days?: number,
    factoryId?: string,
  ): Promise<{ rows: PersonErrorRow[]; from?: string; to?: string }> {
    const range = this.resolveRangeDays(from, to, days);
    const errBase: Record<string, unknown> = {
      inProductionAt: { $gte: range.start, $lte: range.end },
      productionError: { $exists: true, $nin: [null, ''] },
      toolResultNote: 'error',
      cancelledAt: null, // match cả thiếu field lẫn null
      ...(factoryId ? { factoryId } : {}),
    };

    const [fulfillAgg, designerAgg, reportedAgg, stageUsers] = await Promise.all([
      // Fulfillment: đơn lỗi đang đứng ở 1 công đoạn (không phải designer rework).
      this.orderModel.aggregate<{ _id: { factoryId?: string; stage: string }; count: number }>([
        { $match: { ...errBase, designerStatus: { $ne: 'rework' }, currentFulfillmentStage: { $ne: null } } },
        { $group: { _id: { factoryId: '$factoryId', stage: '$currentFulfillmentStage' }, count: { $sum: 1 } } },
      ]),
      // Designer: đơn đang designerStatus=rework → assignee phải sửa.
      this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: { ...errBase, designerStatus: 'rework', assignee: { $exists: true, $ne: null } } },
        { $group: { _id: '$assignee', count: { $sum: 1 } } },
      ]),
      // Đã báo lỗi trong kỳ (theo thời điểm báo = timeline.at).
      this.orderModel.aggregate<{ _id: { uid: string; name?: string }; count: number }>([
        {
          $match: {
            fulfillmentTimeline: { $elemMatch: { action: 'rework-back' } },
            ...(factoryId ? { factoryId } : {}),
          },
        },
        { $unwind: '$fulfillmentTimeline' },
        {
          $match: {
            'fulfillmentTimeline.action': 'rework-back',
            'fulfillmentTimeline.at': { $gte: range.start, $lte: range.end },
            'fulfillmentTimeline.byUserId': { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: { uid: '$fulfillmentTimeline.byUserId', name: '$fulfillmentTimeline.byUserName' },
            count: { $sum: 1 },
          },
        },
      ]),
      // Map (factory, stage) → user phụ trách công đoạn đó.
      this.userModel
        .find(
          { fulfillmentStage: { $exists: true, $ne: null } },
          { _id: 1, fullName: 1, factoryId: 1, fulfillmentStage: 1 },
        )
        .lean(),
    ]);

    const stageUserMap = new Map<string, { id: string; name: string }>();
    for (const u of stageUsers) {
      stageUserMap.set(`${String(u.factoryId ?? '')}::${u.fulfillmentStage}`, {
        id: String(u._id),
        name: u.fullName,
      });
    }

    const rowMap = new Map<string, PersonErrorRow>();
    const ensure = (userId: string, name: string, roleLabel: string): PersonErrorRow => {
      let r = rowMap.get(userId);
      if (!r) {
        r = { userId, name, roleLabel, needFixCount: 0, reportedCount: 0 };
        rowMap.set(userId, r);
      }
      return r;
    };

    // Chiều needFix — fulfillment.
    for (const g of fulfillAgg) {
      const stage = g._id.stage as FulfillmentStage;
      const label = FULFILLMENT_STAGE_LABELS[stage] ?? stage;
      const key = `${String(g._id.factoryId ?? '')}::${stage}`;
      const su = stageUserMap.get(key);
      const userId = su?.id ?? `stage:${String(g._id.factoryId ?? '')}:${stage}`;
      const name = su?.name ?? `Chưa gán · ${label}`;
      ensure(userId, name, label).needFixCount += g.count;
    }
    // Chiều needFix — designer (tên resolve sau).
    const designerIds = designerAgg.map((g) => g._id).filter(Boolean);
    for (const g of designerAgg) ensure(g._id, `#${g._id.slice(-4)}`, 'Designer').needFixCount += g.count;

    // Chiều reported.
    for (const g of reportedAgg) {
      const uid = g._id.uid;
      if (!uid) continue;
      const existing = rowMap.get(uid);
      const roleLabel = existing?.roleLabel ?? '—';
      ensure(uid, g._id.name || existing?.name || `#${uid.slice(-4)}`, roleLabel).reportedCount += g.count;
    }

    // Resolve tên + roleLabel cho các user chưa có tên đẹp (designer assignee +
    // reporter chưa xuất hiện ở chiều needFix).
    const needName = [...rowMap.keys()].filter((id) => !id.startsWith('stage:'));
    if (needName.length > 0) {
      const users = await this.userModel
        .find({ _id: { $in: needName } }, { _id: 1, fullName: 1, fulfillmentStage: 1 })
        .lean();
      const isDesigner = new Set(designerIds.map(String));
      for (const u of users) {
        const r = rowMap.get(String(u._id));
        if (!r) continue;
        r.name = u.fullName || r.name;
        if (r.roleLabel === '—' || r.roleLabel === 'Designer') {
          if (u.fulfillmentStage) r.roleLabel = FULFILLMENT_STAGE_LABELS[u.fulfillmentStage] ?? r.roleLabel;
          else if (isDesigner.has(String(u._id))) r.roleLabel = 'Designer';
        }
      }
    }

    const rows = [...rowMap.values()].sort(
      (a, b) => b.needFixCount - a.needFixCount || b.reportedCount - a.reportedCount || a.name.localeCompare(b.name),
    );
    return { rows, from, to };
  }

  /**
   * Drill-down: danh sách đơn lỗi ĐANG cần 1 người sửa (từ leaderboard trên).
   * `userId` có thể là user thật hoặc synthetic `stage:<factory>:<stage>` (công
   * đoạn chưa gán người).
   */
  async getPersonErrorOrders(
    userId: string,
    from?: string,
    to?: string,
    days?: number,
  ): Promise<{ data: Record<string, unknown>[]; total: number }> {
    const range = this.resolveRangeDays(from, to, days);
    const base: Record<string, unknown> = {
      inProductionAt: { $gte: range.start, $lte: range.end },
      productionError: { $exists: true, $nin: [null, ''] },
      toolResultNote: 'error',
      cancelledAt: null,
    };

    let match: Record<string, unknown>;
    if (userId.startsWith('stage:')) {
      const [, factory, stage] = userId.split(':');
      match = {
        ...base,
        factoryId: factory || undefined,
        currentFulfillmentStage: stage,
        designerStatus: { $ne: 'rework' },
      };
    } else {
      const user = await this.userModel.findById(userId, { fulfillmentStage: 1, factoryId: 1 }).lean();
      if (user?.fulfillmentStage) {
        match = {
          ...base,
          factoryId: user.factoryId,
          currentFulfillmentStage: user.fulfillmentStage,
          designerStatus: { $ne: 'rework' },
        };
      } else {
        // Designer.
        match = { ...base, assignee: userId, designerStatus: 'rework' };
      }
    }

    const proj = {
      productionId: 1,
      type: 1,
      size: 1,
      color: 1,
      quantity: 1,
      mockupUrl: 1,
      productionError: 1,
      productionErrorNote: 1,
      productionErrorSource: 1,
      currentFulfillmentStage: 1,
      designerStatus: 1,
      inProductionAt: 1,
    };
    const [data, total] = await Promise.all([
      this.orderModel.find(match, proj).sort({ priority: -1, inProductionAt: -1 }).limit(500).lean(),
      this.orderModel.countDocuments(match),
    ]);
    return { data: data.map((d) => ({ ...d, _id: String(d._id) })), total };
  }

  /**
   * Bảng lỗi theo NGÀY (`inProductionAt`, VN tz) cho 1 công đoạn — hàng = mã lỗi,
   * cột = ngày. Dùng cho ô "Thống kê lỗi công đoạn" trong trang task fulfillment.
   */
  async getStageErrorDaily(
    stage: FulfillmentStage,
    factoryId?: string,
    from?: string,
    to?: string,
    days?: number,
  ): Promise<{
    days: string[];
    rows: { code: string; name: string; cells: number[]; total: number }[];
    columnTotals: number[];
    grandTotal: number;
  }> {
    const MS_DAY = 86_400_000;
    const DAY_CAP = 100;
    const vnStartD = (d: string) => new Date(`${d}T00:00:00+07:00`);
    const vnEndD = (d: string) => new Date(`${d}T23:59:59.999+07:00`);
    const vnToday = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const dayList: string[] = [];
    const dayIndex = new Map<string, number>();
    let start: Date;
    let end: Date;
    if (from || to) {
      const f = (from || to)!.slice(0, 10);
      const t = (to || from)!.slice(0, 10);
      start = vnStartD(f);
      end = vnEndD(t);
      let cur = vnStartD(t).getTime();
      const startMs = start.getTime();
      let i = 0;
      while (cur >= startMs && i < DAY_CAP) {
        const d = new Date(cur + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
        dayIndex.set(d, i);
        dayList.push(d);
        cur -= MS_DAY;
        i++;
      }
    } else {
      const rangeDays = days && days > 0 ? days : 7;
      const baseMs = vnStartD(vnToday).getTime();
      for (let i = 0; i < rangeDays; i++) {
        const d = new Date(baseMs - i * MS_DAY + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
        dayIndex.set(d, i);
        dayList.push(d);
      }
      start = new Date(baseMs - (rangeDays - 1) * MS_DAY);
      end = vnEndD(vnToday);
    }

    const agg = await this.orderModel.aggregate<{ _id: { code: string; day: string }; count: number }>([
      {
        $match: {
          inProductionAt: { $gte: start, $lte: end },
          currentFulfillmentStage: stage,
          productionError: { $exists: true, $nin: [null, ''] },
          toolResultNote: 'error',
          cancelledAt: null,
          ...(factoryId ? { factoryId } : {}),
        },
      },
      {
        $group: {
          _id: {
            code: '$productionError',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$inProductionAt', timezone: '+07:00' } },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Resolve code → name.
    const cfgs = await this.workshopConfigModel
      .find({ category: WorkshopConfigCategory.ProductionError }, { code: 1, name: 1 })
      .lean();
    const nameMap = new Map<string, string>();
    for (const c of cfgs) nameMap.set(c.code, c.name);

    const rowCells = new Map<string, number[]>();
    const rowTotal = new Map<string, number>();
    for (const r of agg) {
      const code = r._id.code;
      if (!rowCells.has(code))
        rowCells.set(
          code,
          dayList.map(() => 0),
        );
      rowTotal.set(code, (rowTotal.get(code) ?? 0) + r.count);
      const col = dayIndex.get(r._id.day);
      if (col !== undefined) rowCells.get(code)![col] += r.count;
    }

    const columnTotals = dayList.map(() => 0);
    let grandTotal = 0;
    const rows = [...rowCells.entries()].map(([code, cells]) => {
      cells.forEach((v, i) => (columnTotals[i] += v));
      const total = rowTotal.get(code) ?? 0;
      grandTotal += total;
      return { code, name: nameMap.get(code) || code, cells, total };
    });
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return { days: dayList, rows, columnTotals, grandTotal };
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
