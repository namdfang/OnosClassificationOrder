import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery } from 'mongoose';
import { Model } from 'mongoose';
import type {
  FulfillmentStages,
  FulfillmentStageState,
  FulfillmentTaskTab,
  FulfillmentTimelineEntry,
  ProductionOrder,
} from 'shared';
import {
  FULFILLMENT_STAGE_ORDER,
  FULFILLMENT_STAGES,
  FulfillmentStage,
  FulfillmentStageStatus,
  FulfillmentTransitionAction,
  RoleType,
} from 'shared';

import type { AuditContext } from '../order-log/order-log.service';
import { OrderLogService } from '../order-log/order-log.service';
import { OrderDocument, OrderEntity } from '../order/order.entity';
import { UserDocument, UserEntity } from '../user/user.entity';

/**
 * Role được phép override transition (bỏ qua check assignee). Bình thường
 * worker chỉ transition task của (factory, stage) đúng của mình.
 */
const OVERRIDE_ROLES: RoleType[] = [
  RoleType.SuperAdmin,
  RoleType.Admin,
  RoleType.Manager,
  RoleType.SupportManager,
];

/**
 * Fulfillment 5-stage state machine.
 *
 * - 1 user duy nhất per `(factoryId, fulfillmentStage)` (BE enforce unique index).
 * - Đơn tới stage X → user X của factory tự thấy ở `My Tasks` (filter
 *   `currentFulfillmentStage = X` && `factoryId = user.factoryId`).
 * - Action:
 *     `start`        : waiting/rework → in-progress (cộng dồn workMs khi complete).
 *     `complete`     : in-progress    → done; auto-advance stage tiếp (hoặc set
 *                       `fulfillmentCompletedAt` nếu stage = pack).
 *     `rework-back`  : in-progress    → waiting (reporter giữ assignee).
 *                       target='designer' → reuse designer rework flow (set
 *                         productionErrorSource='designer', designerStatus='rework').
 *                       target=<stage>   → target + intermediates → rework,
 *                         currentFulfillmentStage = target.
 *
 * Race-safe: `findOneAndUpdate` với filter check status hiện tại của stage.
 * Nếu conflict → 409.
 */
@Injectable()
export class FulfillmentTaskService {
  constructor(
    @InjectModel(OrderEntity.name) private readonly orderModel: Model<OrderEntity>,
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>,
    private readonly orderLogService: OrderLogService,
  ) {}

  // ─── Transition ─────────────────────────────────────────────────

  async transition(
    orderId: string,
    user: UserDocument,
    body: {
      stage: FulfillmentStage;
      action: FulfillmentTransitionAction;
      target?: 'designer' | FulfillmentStage;
      reason?: string;
    },
    ctx: AuditContext,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).lean();
    if (!order) throw new NotFoundException('Order not found');
    if (order.cancelledAt) {
      throw new BadRequestException('Đơn đã bị hủy — không thao tác được.');
    }

    const roleName = user.role?.name as RoleType | undefined;
    const isOverride = roleName ? OVERRIDE_ROLES.includes(roleName) : false;

    // Worker constraint: stage tham số phải == user.fulfillmentStage và đơn
    // phải thuộc factory user. Override roles bypass.
    if (!isOverride) {
      if (roleName !== RoleType.Fulfillment) {
        throw new ForbiddenException(`Role ${roleName ?? 'unknown'} không có quyền transition fulfillment.`);
      }
      if (user.fulfillmentStage !== body.stage) {
        throw new ForbiddenException(
          `Bạn phụ trách stage '${user.fulfillmentStage}', không thao tác stage '${body.stage}'.`,
        );
      }
      if (!user.factoryId || String(order.factoryId) !== String(user.factoryId)) {
        throw new ForbiddenException('Đơn không thuộc factory của bạn.');
      }
      // Đơn phải đang ở stage này.
      if (order.currentFulfillmentStage !== body.stage) {
        throw new BadRequestException(
          `Đơn đang ở stage '${order.currentFulfillmentStage}', không phải '${body.stage}'.`,
        );
      }
    }

    const stages = (order.fulfillmentStages ?? {}) as FulfillmentStages;
    const stageState = stages[body.stage] ?? this.emptyState();
    const currentStatus = stageState.status ?? FulfillmentStageStatus.Waiting;

    const plan = this.resolveTransition({
      stage: body.stage,
      action: body.action,
      currentStatus,
      stageState,
      target: body.target,
      reason: body.reason,
      stages,
      user,
    });

    // Build atomic update — patch all stage state + timeline + top-level
    // currentFulfillmentStage / fulfillmentCompletedAt.
    const updated = await this.orderModel.findOneAndUpdate(
      {
        _id: orderId,
        [`fulfillmentStages.${body.stage}.status`]: currentStatus,
      },
      plan.patch,
      { new: true },
    );

    if (!updated) {
      throw new ConflictException(
        'Trạng thái stage vừa thay đổi bởi người khác — refresh và thử lại.',
      );
    }

    void this.orderLogService.write({
      orderId,
      action: 'update',
      field: `fulfillmentStages.${body.stage}.status`,
      before: currentStatus,
      after: plan.nextStatus,
      ctx: { ...ctx, user },
    });

    return updated;
  }

  /**
   * Quyết định patch + next status cho 1 transition. Trả `patch` để feed
   * thẳng vào `findOneAndUpdate`.
   */
  private resolveTransition(input: {
    stage: FulfillmentStage;
    action: FulfillmentTransitionAction;
    currentStatus: FulfillmentStageStatus;
    stageState: FulfillmentStageState;
    target?: 'designer' | FulfillmentStage;
    reason?: string;
    stages: FulfillmentStages;
    user: UserDocument;
  }): {
    nextStatus: FulfillmentStageStatus;
    patch: Record<string, unknown>;
  } {
    const now = new Date();
    const { stage, action, currentStatus, stageState, target, reason, stages, user } = input;
    const userId = String(user._id);
    const userName = user.fullName;

    const timelineEntry = (
      toStatus: FulfillmentStageStatus,
      extra: Partial<FulfillmentTimelineEntry> = {},
    ): FulfillmentTimelineEntry => ({
      stage,
      action,
      fromStatus: currentStatus,
      toStatus,
      byUserId: userId,
      byUserName: userName,
      at: now,
      ...extra,
    });

    switch (action) {
      case FulfillmentTransitionAction.Start: {
        if (
          currentStatus !== FulfillmentStageStatus.Waiting &&
          currentStatus !== FulfillmentStageStatus.Rework
        ) {
          throw new BadRequestException(
            `Action 'start' chỉ hợp lệ từ 'waiting'/'rework' (current=${currentStatus}).`,
          );
        }
        const set: Record<string, unknown> = {
          [`fulfillmentStages.${stage}.status`]: FulfillmentStageStatus.InProgress,
          [`fulfillmentStages.${stage}.assignee`]: userId,
          [`fulfillmentStages.${stage}.assignedAt`]: stageState.assignedAt ?? now,
          [`fulfillmentStages.${stage}.startedAt`]: now,
        };
        if (!stageState.firstStartedAt) {
          set[`fulfillmentStages.${stage}.firstStartedAt`] = now;
        }
        return {
          nextStatus: FulfillmentStageStatus.InProgress,
          patch: {
            $set: set,
            $push: { fulfillmentTimeline: timelineEntry(FulfillmentStageStatus.InProgress) },
          },
        };
      }

      case FulfillmentTransitionAction.Complete: {
        if (currentStatus !== FulfillmentStageStatus.InProgress) {
          throw new BadRequestException(
            `Action 'complete' chỉ hợp lệ từ 'in-progress' (current=${currentStatus}).`,
          );
        }
        const delta = stageState.startedAt
          ? Math.max(0, now.getTime() - new Date(stageState.startedAt).getTime())
          : 0;
        const set: Record<string, unknown> = {
          [`fulfillmentStages.${stage}.status`]: FulfillmentStageStatus.Done,
          [`fulfillmentStages.${stage}.completedAt`]: now,
        };
        const inc: Record<string, number> = {};
        if (delta > 0) inc[`fulfillmentStages.${stage}.workMs`] = delta;

        // Auto-advance: stage tiếp theo (nếu có). Set waiting bất kể đã từng
        // done hay chưa — workMs giữ nguyên cumulative cho stage đó. `waitingAt`
        // reset mỗi cycle (rework-back về lại stage này sẽ overwrite) — FE
        // hiển thị "Nhận task lúc..." cho user trong tab Đang chờ.
        const nextStage = this.nextStage(stage);
        if (nextStage) {
          set.currentFulfillmentStage = nextStage;
          set[`fulfillmentStages.${nextStage}.status`] = FulfillmentStageStatus.Waiting;
          set[`fulfillmentStages.${nextStage}.waitingAt`] = now;
        } else {
          // pack done → flow xong toàn bộ.
          set.currentFulfillmentStage = null;
          set.fulfillmentCompletedAt = now;
        }

        return {
          nextStatus: FulfillmentStageStatus.Done,
          patch: {
            $set: set,
            ...(Object.keys(inc).length > 0 ? { $inc: inc } : {}),
            $push: { fulfillmentTimeline: timelineEntry(FulfillmentStageStatus.Done) },
          },
        };
      }

      case FulfillmentTransitionAction.ReworkBack: {
        if (currentStatus !== FulfillmentStageStatus.InProgress) {
          throw new BadRequestException(
            `Action 'rework-back' chỉ hợp lệ từ 'in-progress' (current=${currentStatus}).`,
          );
        }
        if (!target) throw new BadRequestException('Field `target` bắt buộc khi rework-back.');
        if (!reason || !reason.trim()) {
          throw new BadRequestException('Field `reason` bắt buộc khi rework-back.');
        }

        // Reporter (this stage) → waiting (giữ assignee). Cộng workMs delta.
        const reporterDelta = stageState.startedAt
          ? Math.max(0, now.getTime() - new Date(stageState.startedAt).getTime())
          : 0;
        const set: Record<string, unknown> = {
          [`fulfillmentStages.${stage}.status`]: FulfillmentStageStatus.Waiting,
          [`fulfillmentStages.${stage}.reworkCount`]: (stageState.reworkCount ?? 0) + 1,
        };
        const inc: Record<string, number> = {};
        if (reporterDelta > 0) inc[`fulfillmentStages.${stage}.workMs`] = reporterDelta;

        if (target === 'designer') {
          // Đẩy về designer: reuse designer rework. Set productionError +
          // designerStatus = rework. Đơn rời khỏi flow fulfillment tạm thời.
          // currentFulfillmentStage giữ nguyên (= reporter stage); khi designer
          // complete xong, đơn quay lại đúng stage này. Worker thấy ở tab
          // "Đợi quay lại" (distinguish bằng `designerStatus === 'rework'`).
          set.designerStatus = 'rework';
          set.designerReworkAt = now;
          set.productionErrorSource = 'designer';
          set.productionErrorNote = reason;
          set.readyForFulfill = false;
          return {
            nextStatus: FulfillmentStageStatus.Waiting,
            patch: {
              $set: set,
              $inc: { ...inc, designerReworkCount: 1 },
              $push: {
                fulfillmentTimeline: timelineEntry(FulfillmentStageStatus.Waiting, {
                  reworkTarget: 'designer',
                  reason,
                }),
              },
            },
          };
        }

        // Target = FulfillmentStage → must be index < current.
        const reporterIdx = FULFILLMENT_STAGE_ORDER[stage];
        const targetIdx = FULFILLMENT_STAGE_ORDER[target];
        if (targetIdx >= reporterIdx) {
          throw new BadRequestException(
            `Target stage '${target}' không trước stage hiện tại '${stage}'.`,
          );
        }

        // Target stage → rework (sẽ được start lại). Intermediates (giữa target
        // và reporter, không bao gồm reporter) → rework để worker biết phải làm
        // lại. workMs giữ nguyên cumulative, reworkCount++ cho từng cái.
        set.currentFulfillmentStage = target;
        set[`fulfillmentStages.${target}.status`] = FulfillmentStageStatus.Rework;
        set[`fulfillmentStages.${target}.reworkAt`] = now;
        set[`fulfillmentStages.${target}.reworkFromStage`] = stage;
        set[`fulfillmentStages.${target}.reworkReason`] = reason;
        const targetState = (stages[target] ?? this.emptyState()) as FulfillmentStageState;
        set[`fulfillmentStages.${target}.reworkCount`] = (targetState.reworkCount ?? 0) + 1;

        for (let i = targetIdx + 1; i < reporterIdx; i += 1) {
          const intStage = FULFILLMENT_STAGES[i]!;
          const intState = (stages[intStage] ?? this.emptyState()) as FulfillmentStageState;
          set[`fulfillmentStages.${intStage}.status`] = FulfillmentStageStatus.Rework;
          set[`fulfillmentStages.${intStage}.reworkAt`] = now;
          set[`fulfillmentStages.${intStage}.reworkFromStage`] = stage;
          set[`fulfillmentStages.${intStage}.reworkCount`] = (intState.reworkCount ?? 0) + 1;
        }

        return {
          nextStatus: FulfillmentStageStatus.Waiting,
          patch: {
            $set: set,
            ...(Object.keys(inc).length > 0 ? { $inc: inc } : {}),
            $push: {
              fulfillmentTimeline: timelineEntry(FulfillmentStageStatus.Waiting, {
                reworkTarget: target,
                reason,
              }),
            },
          },
        };
      }

      default:
        throw new BadRequestException(`Action không hỗ trợ: ${action}`);
    }
  }

  private nextStage(stage: FulfillmentStage): FulfillmentStage | null {
    const idx = FULFILLMENT_STAGE_ORDER[stage];
    if (idx >= FULFILLMENT_STAGES.length - 1) return null;
    return FULFILLMENT_STAGES[idx + 1] ?? null;
  }

  private emptyState(): FulfillmentStageState {
    return {
      status: FulfillmentStageStatus.Waiting,
      reworkCount: 0,
      workMs: 0,
    };
  }

  // ─── My Tasks (worker view) ─────────────────────────────────────

  /**
   * 4 tab:
   *   waiting     — đơn ở stage tôi, status=waiting, designerStatus != rework
   *   in-progress — status=in-progress
   *   rework      — status=rework
   *   watching    — đơn tôi đã rework-back về designer/stage trước; chưa quay lại
   *                  (currentFulfillmentStage != stage tôi HOẶC designerStatus=rework)
   */
  async getMyTasks(
    user: UserDocument,
    query: { tab?: FulfillmentTaskTab; stage?: FulfillmentStage; factoryId?: string; page?: number; size?: number },
  ): Promise<{
    data: ProductionOrder[];
    total: number;
    page: number;
    size: number;
    tabCounts: { waiting: number; inProgress: number; rework: number; done: number; watching: number };
  }> {
    const roleName = user.role?.name as RoleType | undefined;
    const isOverride = roleName ? OVERRIDE_ROLES.includes(roleName) : false;

    const stage = query.stage ?? user.fulfillmentStage;
    const factoryId = query.factoryId ?? user.factoryId;
    if (!stage) throw new BadRequestException('Thiếu stage (user chưa gán fulfillmentStage).');
    if (!factoryId && !isOverride) {
      throw new BadRequestException('Thiếu factoryId (user chưa gán factoryId).');
    }

    const tab: FulfillmentTaskTab = query.tab ?? 'waiting';
    const page = query.page && query.page > 0 ? query.page : 1;
    const size = query.size && query.size > 0 ? Math.min(query.size, 100) : 50;

    const baseFilter = this.buildMyTaskBase(stage, factoryId);
    const filter = this.applyTabFilter(baseFilter, tab, stage, String(user._id));

    const [data, total, tabCounts] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ orderAt: -1, inProductionAt: -1 })
        .skip((page - 1) * size)
        .limit(size)
        .lean(),
      this.orderModel.countDocuments(filter),
      this.countAllTabs(baseFilter, stage, String(user._id)),
    ]);

    return {
      data: data as unknown as ProductionOrder[],
      total,
      page,
      size,
      tabCounts,
    };
  }

  private buildMyTaskBase(stage: FulfillmentStage, factoryId?: string): FilterQuery<OrderEntity> {
    const f: FilterQuery<OrderEntity> = { cancelledAt: { $in: [null, undefined] } };
    if (factoryId) f.factoryId = factoryId;
    // Bao gồm cả đơn không ở stage tôi (cho tab watching) — lọc theo timeline.
    void stage;
    return f;
  }

  private applyTabFilter(
    base: FilterQuery<OrderEntity>,
    tab: FulfillmentTaskTab,
    stage: FulfillmentStage,
    userId: string,
  ): FilterQuery<OrderEntity> {
    switch (tab) {
      case 'waiting':
        return {
          ...base,
          currentFulfillmentStage: stage,
          [`fulfillmentStages.${stage}.status`]: FulfillmentStageStatus.Waiting,
          designerStatus: { $ne: 'rework' },
        };
      case 'in-progress':
        return {
          ...base,
          currentFulfillmentStage: stage,
          [`fulfillmentStages.${stage}.status`]: FulfillmentStageStatus.InProgress,
        };
      case 'rework':
        return {
          ...base,
          currentFulfillmentStage: stage,
          [`fulfillmentStages.${stage}.status`]: FulfillmentStageStatus.Rework,
        };
      case 'done':
        // Đơn user đã hoàn thành stage này (đã có completedAt) VÀ đơn đã
        // rời stage (currentFulfillmentStage > stage hoặc null nếu pack done).
        // Sort theo completedAt desc khi caller dùng — nhưng giữ sort chung
        // ở `getMyTasks` (orderAt desc) để code đơn giản. Nếu muốn period filter
        // (today/7d/30d) → caller truyền vào, hiện chưa cần.
        return {
          ...base,
          [`fulfillmentStages.${stage}.completedAt`]: { $exists: true, $ne: null },
          $or: [
            { currentFulfillmentStage: { $ne: stage } },
            { currentFulfillmentStage: { $in: [null, undefined] } },
          ],
        };
      case 'watching':
        // Đơn worker (userId) đã từng rework-back, đang chờ quay lại.
        // Match: timeline có entry stage=mineStage + action=rework-back + byUserId=userId
        // VÀ currentFulfillmentStage != stage mine (đang ở stage trước) HOẶC
        // designerStatus = rework.
        return {
          ...base,
          fulfillmentTimeline: {
            $elemMatch: {
              stage,
              action: FulfillmentTransitionAction.ReworkBack,
              byUserId: userId,
            },
          },
          $or: [
            { currentFulfillmentStage: { $ne: stage } },
            { designerStatus: 'rework' },
          ],
        };
      default:
        return base;
    }
  }

  private async countAllTabs(
    base: FilterQuery<OrderEntity>,
    stage: FulfillmentStage,
    userId: string,
  ): Promise<{ waiting: number; inProgress: number; rework: number; done: number; watching: number }> {
    const [waiting, inProgress, rework, done, watching] = await Promise.all([
      this.orderModel.countDocuments(this.applyTabFilter(base, 'waiting', stage, userId)),
      this.orderModel.countDocuments(this.applyTabFilter(base, 'in-progress', stage, userId)),
      this.orderModel.countDocuments(this.applyTabFilter(base, 'rework', stage, userId)),
      this.orderModel.countDocuments(this.applyTabFilter(base, 'done', stage, userId)),
      this.orderModel.countDocuments(this.applyTabFilter(base, 'watching', stage, userId)),
    ]);
    return { waiting, inProgress, rework, done, watching };
  }
}
