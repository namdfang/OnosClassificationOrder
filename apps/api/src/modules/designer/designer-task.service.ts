import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { DesignerMyStats, DesignerTaskCard } from 'shared';
import {
  DesignerStatus,
  DesignerTransitionAction,
  FulfillmentStage,
  FulfillmentStageStatus,
  RoleType,
} from 'shared';

import { OrderLogService } from '../order-log/order-log.service';
import type { AuditContext } from '../order-log/order-log.service';
import { OrderEntity, OrderDocument } from '../order/order.entity';
import { UserDocument } from '../user/user.entity';

const READY_FOR_FULFILL_CODE = 'ok';

const OVERRIDE_ROLES: RoleType[] = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.DesignerLeader,
];

/**
 * State machine cho task của Designer. Mọi transition đi qua method `transition`.
 * Race-safe bằng cách `findOneAndUpdate` với filter `designerStatus: expected` —
 * nếu 2 user transition đồng thời, người sau nhận 409 (FE refetch + retry).
 *
 * Side effects (chỉ áp lúc done): `toolResultNote='ok'` + `readyForFulfill=true`
 * — Fulfillment có thể pickup ngay sau khi designer hoàn thành.
 *
 * Owner constraint: sub-designer chỉ transition task có `assignee = user.assigneeCode`.
 * Leader/Admin/Manager bypass (override).
 */
@Injectable()
export class DesignerTaskService {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    private readonly orderLogService: OrderLogService,
  ) {}

  async transition(
    orderId: string,
    user: UserDocument,
    action: DesignerTransitionAction,
    reason: string | undefined,
    ctx: AuditContext,
  ): Promise<OrderDocument> {
    const roleName = user.role?.name as RoleType | undefined;
    const isOverride = roleName ? OVERRIDE_ROLES.includes(roleName) : false;

    const order = await this.orderModel.findById(orderId).lean();
    if (!order) throw new NotFoundException('Order not found');

    if (!isOverride) {
      if (roleName !== RoleType.Designer) {
        throw new ForbiddenException(`Role ${roleName ?? 'unknown'} không có quyền transition task.`);
      }
      if (order.assignee !== String(user._id)) {
        throw new ForbiddenException('Task này không thuộc bạn — không transition được.');
      }
    }

    const currentStatus = (order.designerStatus as DesignerStatus) || DesignerStatus.Unassigned;
    const plan = this.resolveTransition(currentStatus, action, reason, {
      isFirstStart: !order.designerFirstStartedAt,
      designerStartedAt: order.designerStartedAt,
    });

    // Hook fulfillment 5-stage: designer.complete lần đầu (chưa từng vào
    // fulfillment) → kích hoạt stage Print với status=waiting. Trường hợp
    // designer đang trong cycle rework (đẩy về từ fulfillment), giữ nguyên
    // currentFulfillmentStage của reporter → đơn quay lại đúng stage cũ.
    if (
      action === DesignerTransitionAction.Complete &&
      plan.nextStatus === DesignerStatus.Done &&
      !order.currentFulfillmentStage
    ) {
      const set = (plan.patch.$set ?? {}) as Record<string, unknown>;
      set.currentFulfillmentStage = FulfillmentStage.Print;
      // `waitingAt = now` để user In thấy mốc "Nhận task lúc..." trong card.
      set['fulfillmentStages.print'] = {
        status: FulfillmentStageStatus.Waiting,
        reworkCount: 0,
        workMs: 0,
        waitingAt: new Date(),
      };
      plan.patch.$set = set;
    }

    // findOneAndUpdate với filter expected state → race-safe; nếu trong lúc
    // request đang xử lý mà user khác kéo card sang trạng thái khác thì update
    // này KHÔNG match, ta trả 409 để FE refetch.
    const updated = await this.orderModel.findOneAndUpdate(
      { _id: orderId, designerStatus: currentStatus },
      plan.patch,
      { new: true },
    );

    if (!updated) {
      throw new ConflictException(
        'Trạng thái task vừa thay đổi bởi người khác — refresh và thử lại.',
      );
    }

    void this.orderLogService.write({
      orderId,
      action: 'update',
      field: 'designerStatus',
      before: currentStatus,
      after: plan.nextStatus,
      ctx: { ...ctx, user },
    });

    if (plan.sideEffectLog) {
      void this.orderLogService.write({
        orderId,
        action: 'update',
        field: plan.sideEffectLog.field,
        before: plan.sideEffectLog.before,
        after: plan.sideEffectLog.after,
        ctx: { ...ctx, user },
      });
    }

    return updated;
  }

  /**
   * Quyết định patch + next state. Throw BadRequest nếu action không hợp lệ
   * với current state (vd. complete khi đang assigned).
   *
   * `context.designerStartedAt` + `isFirstStart` dùng để:
   *   - `start`: nếu first → set `designerFirstStartedAt`
   *   - `complete`: tính delta = now - startedAt → $inc `designerWorkMs`
   */
  private resolveTransition(
    current: DesignerStatus,
    action: DesignerTransitionAction,
    reason: string | undefined,
    context: {
      isFirstStart: boolean;
      designerStartedAt?: Date;
    },
  ): {
    nextStatus: DesignerStatus;
    patch: Record<string, unknown>;
    sideEffectLog?: { field: string; before: unknown; after: unknown };
  } {
    const now = new Date();

    switch (action) {
      case DesignerTransitionAction.Start: {
        if (current !== DesignerStatus.Assigned && current !== DesignerStatus.Rework) {
          throw new BadRequestException(
            `Action 'start' chỉ hợp lệ từ trạng thái 'assigned'/'rework' (current=${current}).`,
          );
        }
        const setPatch: Record<string, unknown> = {
          designerStatus: DesignerStatus.InProgress,
          designerStartedAt: now,
        };
        if (context.isFirstStart) {
          setPatch.designerFirstStartedAt = now;
        }
        return {
          nextStatus: DesignerStatus.InProgress,
          patch: { $set: setPatch },
        };
      }

      case DesignerTransitionAction.Restart: {
        if (current !== DesignerStatus.Rework) {
          throw new BadRequestException(
            `Action 'restart' chỉ hợp lệ từ trạng thái 'rework' (current=${current}).`,
          );
        }
        // Per-cycle: reset designerStartedAt để complete sau tính đúng delta.
        return {
          nextStatus: DesignerStatus.InProgress,
          patch: {
            $set: {
              designerStatus: DesignerStatus.InProgress,
              designerStartedAt: now,
            },
          },
        };
      }

      case DesignerTransitionAction.Complete: {
        if (current !== DesignerStatus.InProgress) {
          throw new BadRequestException(
            `Action 'complete' chỉ hợp lệ từ trạng thái 'in-progress' (current=${current}).`,
          );
        }
        // Cộng dồn workMs = now - startedAt. Nếu startedAt thiếu (data legacy
        // / corrupt) → 0 để không sinh số âm.
        const delta = context.designerStartedAt
          ? Math.max(0, now.getTime() - new Date(context.designerStartedAt).getTime())
          : 0;
        return {
          nextStatus: DesignerStatus.Done,
          patch: {
            $set: {
              designerStatus: DesignerStatus.Done,
              designerCompletedAt: now,
              toolResultNote: READY_FOR_FULFILL_CODE,
              readyForFulfill: true,
            },
            ...(delta > 0 ? { $inc: { designerWorkMs: delta } } : {}),
          },
          sideEffectLog: { field: 'toolResultNote', before: null, after: READY_FOR_FULFILL_CODE },
        };
      }

      case DesignerTransitionAction.Reject: {
        // Cho phép trả lại task từ cả 'assigned' (chưa nhận) lẫn 'in-progress'
        // (đã nhận làm nhưng muốn trả lại). Giống cột "Cần làm".
        if (current !== DesignerStatus.Assigned && current !== DesignerStatus.InProgress) {
          throw new BadRequestException(
            `Action 'reject' chỉ hợp lệ từ trạng thái 'assigned' hoặc 'in-progress' (current=${current}).`,
          );
        }
        return {
          nextStatus: DesignerStatus.Rejected,
          patch: {
            $set: {
              designerStatus: DesignerStatus.Rejected,
              designerRejectedAt: now,
              designerRejectedReason: reason || null,
            },
          },
        };
      }

      default: {
        throw new BadRequestException(`Action không hỗ trợ: ${action}`);
      }
    }
  }

  // ─── Sub-designer view (Phase 4) ────────────────────────────────────

  /**
   * Trả task của sub-designer hiện tại, grouped theo `designerStatus` cho
   * kanban 4 cột. Cột `done` filter trong period (mặc định today). Các cột
   * khác trả toàn bộ (Assigned/InProgress/Rework không filter date — task
   * còn open thì designer phải thấy bất kể tuổi).
   *
   * Reject column trả riêng (drawer dưới kanban) — không pollute "Cần làm".
   */
  async getMyTasks(
    user: UserDocument,
    query: {
      from?: string;
      to?: string;
      type?: string;
      fabricType?: string;
      machineNumber?: string;
      toolResult?: string;
      search?: string;
    },
  ): Promise<{
    columns: {
      assigned: DesignerTaskCard[];
      inProgress: DesignerTaskCard[];
      rework: DesignerTaskCard[];
      done: DesignerTaskCard[];
    };
    rejected: DesignerTaskCard[];
    userId: string;
    fullName?: string;
  }> {
    const userId = String(user._id);
    const range = this.resolveDateRange(query.from, query.to);
    const baseFilter = this.buildMyTaskFilter(userId, query);

    const [assignedRaw, inProgressRaw, reworkRaw, doneRaw, rejectedRaw] = await Promise.all([
      this.orderModel
        .find({ ...baseFilter, designerStatus: DesignerStatus.Assigned })
        .sort({ designerAssignedAt: -1, inProductionAt: -1 })
        .lean(),
      this.orderModel
        .find({ ...baseFilter, designerStatus: DesignerStatus.InProgress })
        .sort({ designerStartedAt: -1, inProductionAt: -1 })
        .lean(),
      this.orderModel
        .find({ ...baseFilter, designerStatus: DesignerStatus.Rework })
        .sort({ designerReworkAt: -1, inProductionAt: -1 })
        .lean(),
      this.orderModel
        .find({
          ...baseFilter,
          designerStatus: DesignerStatus.Done,
          designerCompletedAt: { $gte: range.start, $lte: range.end },
        })
        .sort({ designerCompletedAt: -1 })
        .lean(),
      this.orderModel
        .find({ ...baseFilter, designerStatus: DesignerStatus.Rejected })
        .sort({ designerRejectedAt: -1, inProductionAt: -1 })
        .lean(),
    ]);

    return {
      columns: {
        assigned: assignedRaw.map(this.toCard),
        inProgress: inProgressRaw.map(this.toCard),
        rework: reworkRaw.map(this.toCard),
        done: doneRaw.map(this.toCard),
      },
      rejected: rejectedRaw.map(this.toCard),
      userId,
      fullName: user.fullName,
    };
  }

  /**
   * Faceted filter options cho /my-tasks page. Mỗi facet exclude chính nó
   * khỏi filter để user thấy đầy đủ option của facet đó nhưng count phản ánh
   * cross-filter của các facet khác.
   */
  async getMyTaskFilters(
    user: UserDocument,
    query: {
      type?: string;
      fabricType?: string;
      machineNumber?: string;
      toolResult?: string;
    },
  ): Promise<{
    type: { value: string; label: string; count: number }[];
    fabricType: { value: string; label: string; count: number }[];
    machineNumber: { value: string; label: string; count: number }[];
    toolResult: { value: string; label: string; count: number }[];
  }> {
    const userId = String(user._id);

    type FacetKey = 'type' | 'fabricType' | 'machineNumber' | 'toolResult';
    const KEYS: FacetKey[] = ['type', 'fabricType', 'machineNumber', 'toolResult'];

    const aggregate = async (excludeKey: FacetKey, field: FacetKey) => {
      const filter = this.buildMyTaskFilter(userId, { ...query, [excludeKey]: undefined });
      const match = { ...filter, [field]: { $exists: true, $ne: null, $nin: [''] } };
      const agg = await this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
      return agg.map((r) => ({ value: r._id, label: r._id, count: r.count }));
    };

    const [typeOpts, fabricOpts, machineOpts, toolOpts] = await Promise.all(
      KEYS.map((k) => aggregate(k, k)),
    );

    return {
      type: typeOpts,
      fabricType: fabricOpts,
      machineNumber: machineOpts,
      toolResult: toolOpts,
    };
  }

  /**
   * Bulk transition cho nhiều task của cùng sub-designer. Mỗi task áp state
   * machine giống `transition()`. Task không hợp lệ (sai owner, sai state)
   * skip + report. Race-safe per-row qua `findOneAndUpdate` filter expected.
   */
  async bulkTransition(
    user: UserDocument,
    ids: string[],
    action: DesignerTransitionAction,
    reason: string | undefined,
    ctx: AuditContext,
  ): Promise<{
    matched: number;
    modified: number;
    skipped: { orderId: string; productionId: string; reason: string }[];
  }> {
    const roleName = user.role?.name as RoleType | undefined;
    const userId = String(user._id);
    const isOverride =
      !!roleName &&
      [RoleType.SuperAdmin, RoleType.Admin, RoleType.Manager].includes(roleName);

    const docs = await this.orderModel
      .find(
        { _id: { $in: ids } },
        {
          _id: 1,
          productionId: 1,
          assignee: 1,
          designerStatus: 1,
          designerStartedAt: 1,
          designerFirstStartedAt: 1,
        },
      )
      .lean();

    const skipped: { orderId: string; productionId: string; reason: string }[] = [];
    let modified = 0;

    for (const o of docs) {
      const orderId = String(o._id);
      const productionId = String((o as { productionId?: string }).productionId || orderId);

      if (!isOverride && o.assignee !== userId) {
        skipped.push({ orderId, productionId, reason: 'Task không thuộc bạn.' });
        continue;
      }

      const current = (o.designerStatus as DesignerStatus) || DesignerStatus.Unassigned;
      try {
        const plan = this.resolveTransition(current, action, reason, {
          isFirstStart: !o.designerFirstStartedAt,
          designerStartedAt: o.designerStartedAt,
        });
        const updated = await this.orderModel.findOneAndUpdate(
          { _id: orderId, designerStatus: current },
          plan.patch,
          { new: true },
        );
        if (!updated) {
          skipped.push({ orderId, productionId, reason: 'Trạng thái đã đổi (race) — refresh và thử lại.' });
          continue;
        }
        modified++;
        void this.orderLogService.write({
          orderId,
          action: 'update',
          field: 'designerStatus',
          before: current,
          after: plan.nextStatus,
          ctx: { ...ctx, user },
        });
        if (plan.sideEffectLog) {
          void this.orderLogService.write({
            orderId,
            action: 'update',
            field: plan.sideEffectLog.field,
            before: plan.sideEffectLog.before,
            after: plan.sideEffectLog.after,
            ctx: { ...ctx, user },
          });
        }
      } catch (err) {
        skipped.push({ orderId, productionId, reason: (err as Error).message });
      }
    }

    return { matched: docs.length, modified, skipped };
  }

  private buildMyTaskFilter(
    userId: string,
    query: {
      type?: string;
      fabricType?: string;
      machineNumber?: string;
      toolResult?: string;
      search?: string;
    },
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = { assignee: userId };
    if (query.type) filter.type = { $in: query.type.split(',').filter(Boolean) };
    if (query.fabricType)
      filter.fabricType = { $in: query.fabricType.split(',').filter(Boolean) };
    if (query.machineNumber)
      filter.machineNumber = { $in: query.machineNumber.split(',').filter(Boolean) };
    if (query.toolResult)
      filter.toolResult = { $in: query.toolResult.split(',').filter(Boolean) };
    if (query.search) {
      filter.$or = [
        { productionId: { $regex: query.search, $options: 'i' } },
        { orderId: { $regex: query.search, $options: 'i' } },
      ];
    }
    return filter;
  }

  async getMyStats(
    user: UserDocument,
    period: 'today' | '7d' | '30d' | 'custom',
    from?: string,
    to?: string,
  ): Promise<DesignerMyStats> {
    const userId = String(user._id);
    const range = this.resolvePeriodRange(period, from, to);

    const [statusAgg, completedAgg] = await Promise.all([
      this.orderModel.aggregate<{ _id: DesignerStatus; count: number }>([
        { $match: { assignee: userId } },
        { $group: { _id: '$designerStatus', count: { $sum: 1 } } },
      ]),
      this.orderModel
        .find(
          {
            assignee: userId,
            designerStatus: DesignerStatus.Done,
            designerCompletedAt: { $gte: range.start, $lte: range.end },
          },
          {
            designerAssignedAt: 1,
            designerStartedAt: 1,
            designerFirstStartedAt: 1,
            designerCompletedAt: 1,
            designerReworkCount: 1,
            designerWorkMs: 1,
          },
        )
        .lean(),
    ]);

    const counts: Partial<Record<DesignerStatus, number>> = {};
    for (const row of statusAgg) counts[row._id] = row.count;

    // Average response/work time chỉ tính trên completed period.
    let responseSumMs = 0;
    let responseN = 0;
    let workSumMs = 0;
    let workN = 0;
    let reworkSum = 0;
    for (const o of completedAgg) {
      // Response: ưu tiên firstStartedAt (immutable từ lần đầu). Fallback
      // designerStartedAt cho legacy data.
      const respStart =
        (o as { designerFirstStartedAt?: Date }).designerFirstStartedAt || o.designerStartedAt;
      if (o.designerAssignedAt && respStart) {
        responseSumMs += respStart.getTime() - o.designerAssignedAt.getTime();
        responseN++;
      }
      // Work: ưu tiên designerWorkMs cumulative. Fallback cho legacy (chỉ có
      // 1 cycle, không rework) → tính (completedAt - startedAt).
      const cumWorkMs = (o as { designerWorkMs?: number }).designerWorkMs;
      if (cumWorkMs && cumWorkMs > 0) {
        workSumMs += cumWorkMs;
        workN++;
      } else if (o.designerStartedAt && o.designerCompletedAt) {
        workSumMs += o.designerCompletedAt.getTime() - o.designerStartedAt.getTime();
        workN++;
      }
      reworkSum += o.designerReworkCount || 0;
    }

    const completedInPeriod = completedAgg.length;
    return {
      assignedCount: counts[DesignerStatus.Assigned] || 0,
      inProgressCount: counts[DesignerStatus.InProgress] || 0,
      reworkCount: counts[DesignerStatus.Rework] || 0,
      rejectedCount: counts[DesignerStatus.Rejected] || 0,
      completedInPeriod,
      avgResponseMin: responseN > 0 ? Math.round((responseSumMs / responseN) / 60000) : 0,
      avgWorkMin: workN > 0 ? Math.round((workSumMs / workN) / 60000) : 0,
      errorRate: completedInPeriod > 0 ? Math.round((reworkSum / completedInPeriod) * 100) / 100 : 0,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private toCard = (o: Record<string, unknown>): DesignerTaskCard => ({
    _id: String(o._id),
    productionId: String(o.productionId),
    orderId: (o.orderId as string) || undefined,
    type: (o.type as string) || undefined,
    size: (o.size as string) || undefined,
    color: (o.color as string) || undefined,
    mockupUrl: (o.mockupUrl as string) || undefined,
    mockupOriginalUrl: (o.mockupOriginalUrl as string) || undefined,
    fabricType: (o.fabricType as string) || undefined,
    machineNumber: (o.machineNumber as string) || undefined,
    toolResult: (o.toolResult as string) || undefined,
    toolResultNote: (o.toolResultNote as string) || undefined,
    designerStatus: (o.designerStatus as DesignerStatus) || DesignerStatus.Unassigned,
    designerAssignedAt: o.designerAssignedAt as Date | undefined,
    designerStartedAt: o.designerStartedAt as Date | undefined,
    designerFirstStartedAt: o.designerFirstStartedAt as Date | undefined,
    designerCompletedAt: o.designerCompletedAt as Date | undefined,
    designerRejectedAt: o.designerRejectedAt as Date | undefined,
    designerReworkAt: o.designerReworkAt as Date | undefined,
    designerRejectedReason: (o.designerRejectedReason as string) || undefined,
    designerReworkCount: (o.designerReworkCount as number) || 0,
    designerWorkMs: (o.designerWorkMs as number) || 0,
    productionError: (o.productionError as string) || undefined,
    productionErrorNote: (o.productionErrorNote as string) || undefined,
  });

  private resolveDateRange(from?: string, to?: string): { start: Date; end: Date } {
    if (from || to) {
      const start = from ? new Date(from) : new Date(0);
      start.setHours(0, 0, 0, 0);
      const end = to ? new Date(to) : new Date();
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    // Default: today
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private resolvePeriodRange(
    period: 'today' | '7d' | '30d' | 'custom',
    from?: string,
    to?: string,
  ): { start: Date; end: Date } {
    if (period === 'custom') return this.resolveDateRange(from, to);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (period === '7d') start.setDate(start.getDate() - 6);
    if (period === '30d') start.setDate(start.getDate() - 29);
    return { start, end };
  }

}
