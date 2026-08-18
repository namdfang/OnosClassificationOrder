import type { FulfillmentStages, FulfillmentStageState, FulfillmentTimelineEntry } from 'shared';
import {
  FulfillmentStage,
  FulfillmentStageStatus,
  FulfillmentTransitionAction,
  redirectMergedTarget,
} from 'shared';

import type { UserDocument } from '../user/user.entity';
import { FulfillmentTaskService } from './fulfillment-task.service';

/**
 * Luồng rút gọn xưởng gỗ (`FactoryEntity.flowType='merged'`) — test thẳng
 * `resolveTransition` (pure: chỉ build patch, không đụng Mongo) bằng cách
 * instantiate service với deps null. Nếu constructor thêm dep mới chỉ cần thêm
 * null tương ứng.
 */
const svc = new FulfillmentTaskService(null as never, null as never, null as never, null as never);

type TransitionInput = {
  stage: FulfillmentStage;
  action: FulfillmentTransitionAction;
  currentStatus: FulfillmentStageStatus;
  stageState: FulfillmentStageState;
  target?: 'designer' | FulfillmentStage;
  reason?: string;
  stages: FulfillmentStages;
  user: UserDocument;
  mergedFlow?: boolean;
};
type TransitionPlan = {
  nextStatus: FulfillmentStageStatus;
  patch: {
    $set: Record<string, unknown>;
    $inc?: Record<string, number>;
    $push: { fulfillmentTimeline: { $each: FulfillmentTimelineEntry[] } | FulfillmentTimelineEntry };
  };
};
const resolve = (input: TransitionInput): TransitionPlan =>
  (svc as unknown as { resolveTransition: (i: TransitionInput) => TransitionPlan }).resolveTransition(input);

const worker = { _id: 'worker-1', fullName: 'Worker In' } as unknown as UserDocument;

const inProgress = (startedAt?: Date): FulfillmentStageState => ({
  status: FulfillmentStageStatus.InProgress,
  reworkCount: 0,
  workMs: 0,
  startedAt,
});

const timelineEntries = (plan: TransitionPlan): FulfillmentTimelineEntry[] => {
  const pushed = plan.patch.$push.fulfillmentTimeline;
  return '$each' in pushed ? pushed.$each : [pushed];
};

describe('redirectMergedTarget — đích rework trên xưởng luồng rút gọn', () => {
  it('stage gộp về stage gốc: press→print, sew-out→sew-in', () => {
    expect(redirectMergedTarget(FulfillmentStage.Press)).toBe(FulfillmentStage.Print);
    expect(redirectMergedTarget(FulfillmentStage.SewOut)).toBe(FulfillmentStage.SewIn);
  });

  it('stage thường giữ nguyên', () => {
    expect(redirectMergedTarget(FulfillmentStage.Print)).toBe(FulfillmentStage.Print);
    expect(redirectMergedTarget(FulfillmentStage.QCPostPress)).toBe(FulfillmentStage.QCPostPress);
    expect(redirectMergedTarget(FulfillmentStage.Pack)).toBe(FulfillmentStage.Pack);
  });
});

describe('Complete trên xưởng merged — auto-complete stage gộp', () => {
  it('In xong → Ép tự Done đủ timestamp, đơn nhảy thẳng QC', () => {
    const plan = resolve({
      stage: FulfillmentStage.Print,
      action: FulfillmentTransitionAction.Complete,
      currentStatus: FulfillmentStageStatus.InProgress,
      stageState: inProgress(new Date(Date.now() - 60_000)),
      stages: {} as FulfillmentStages,
      user: worker,
      mergedFlow: true,
    });

    const set = plan.patch.$set;
    expect(set['fulfillmentStages.print.status']).toBe(FulfillmentStageStatus.Done);
    expect(set['fulfillmentStages.press.status']).toBe(FulfillmentStageStatus.Done);
    // Đủ timestamp để duration = 0 thay vì NaN ở SLA/lifecycle.
    for (const field of ['waitingAt', 'startedAt', 'firstStartedAt', 'completedAt', 'assignedAt']) {
      expect(set[`fulfillmentStages.press.${field}`]).toBeInstanceOf(Date);
    }
    expect(set['fulfillmentStages.press.assignee']).toBe('worker-1');
    // State press chưa init → counter mặc định.
    expect(set['fulfillmentStages.press.workMs']).toBe(0);
    expect(set['fulfillmentStages.press.reworkCount']).toBe(0);
    // Nhảy thẳng QC, không dừng ở Ép.
    expect(set.currentFulfillmentStage).toBe(FulfillmentStage.QCPostPress);
    expect(set['fulfillmentStages.qc-post-press.status']).toBe(FulfillmentStageStatus.Waiting);

    // Timeline 2 entry: print complete + press auto-complete (ghi vết người In).
    const entries = timelineEntries(plan);
    expect(entries).toHaveLength(2);
    expect(entries[1].stage).toBe(FulfillmentStage.Press);
    expect(entries[1].toStatus).toBe(FulfillmentStageStatus.Done);
    expect(entries[1].byUserId).toBe('worker-1');
  });

  it('May vào xong → May ra tự Done, đơn nhảy thẳng Đóng hàng', () => {
    const plan = resolve({
      stage: FulfillmentStage.SewIn,
      action: FulfillmentTransitionAction.Complete,
      currentStatus: FulfillmentStageStatus.InProgress,
      stageState: inProgress(),
      stages: {} as FulfillmentStages,
      user: worker,
      mergedFlow: true,
    });
    const set = plan.patch.$set;
    expect(set['fulfillmentStages.sew-out.status']).toBe(FulfillmentStageStatus.Done);
    expect(set.currentFulfillmentStage).toBe(FulfillmentStage.Pack);
    expect(set.fulfillmentCompletedAt).toBeUndefined();
  });

  it('vòng rework: Ép từng Done → auto-complete lại đánh dấu làm lại (reworkAt + $inc reworkCount)', () => {
    const plan = resolve({
      stage: FulfillmentStage.Print,
      action: FulfillmentTransitionAction.Complete,
      currentStatus: FulfillmentStageStatus.InProgress,
      stageState: inProgress(),
      stages: {
        press: {
          status: FulfillmentStageStatus.Done,
          reworkCount: 0,
          workMs: 0,
          completedAt: new Date(Date.now() - 3_600_000),
        },
      } as FulfillmentStages,
      user: worker,
      mergedFlow: true,
    });
    const set = plan.patch.$set;
    expect(set['fulfillmentStages.press.reworkAt']).toBeInstanceOf(Date);
    expect(plan.patch.$inc?.['fulfillmentStages.press.reworkCount']).toBe(1);
    // KHÔNG $set đè reworkCount khi đã $inc — Mongo cấm set+inc cùng path.
    expect(set['fulfillmentStages.press.reworkCount']).toBeUndefined();
  });

  it('xưởng thường (mergedFlow=false): In xong dừng ở Ép như cũ', () => {
    const plan = resolve({
      stage: FulfillmentStage.Print,
      action: FulfillmentTransitionAction.Complete,
      currentStatus: FulfillmentStageStatus.InProgress,
      stageState: inProgress(),
      stages: {} as FulfillmentStages,
      user: worker,
      mergedFlow: false,
    });
    const set = plan.patch.$set;
    expect(set.currentFulfillmentStage).toBe(FulfillmentStage.Press);
    expect(set['fulfillmentStages.press.status']).toBe(FulfillmentStageStatus.Waiting);
    expect(set['fulfillmentStages.press.completedAt']).toBeUndefined();
    expect(timelineEntries(plan)).toHaveLength(1);
  });

  it('Complete trực tiếp trên Ép (admin override cứu đơn kẹt) vẫn advance bình thường', () => {
    const plan = resolve({
      stage: FulfillmentStage.Press,
      action: FulfillmentTransitionAction.Complete,
      currentStatus: FulfillmentStageStatus.InProgress,
      stageState: inProgress(),
      stages: {} as FulfillmentStages,
      user: worker,
      mergedFlow: true,
    });
    // MERGED_STAGE_SOURCE[qc-post-press] không tồn tại → không auto-complete gì thêm.
    expect(plan.patch.$set.currentFulfillmentStage).toBe(FulfillmentStage.QCPostPress);
    expect(timelineEntries(plan)).toHaveLength(1);
  });
});

describe('ReworkBack trên xưởng merged — redirect đích về stage gốc', () => {
  it('QC báo lỗi target=Ép → lùi về In', () => {
    const plan = resolve({
      stage: FulfillmentStage.QCPostPress,
      action: FulfillmentTransitionAction.ReworkBack,
      currentStatus: FulfillmentStageStatus.InProgress,
      stageState: inProgress(),
      target: FulfillmentStage.Press,
      reason: 'Lỗi ép',
      stages: {} as FulfillmentStages,
      user: worker,
      mergedFlow: true,
    });
    const set = plan.patch.$set;
    expect(set.currentFulfillmentStage).toBe(FulfillmentStage.Print);
    expect(set['fulfillmentStages.print.status']).toBe(FulfillmentStageStatus.Rework);
    expect(set['fulfillmentStages.press.status']).toBeUndefined();
    expect(timelineEntries(plan)[0].reworkTarget).toBe(FulfillmentStage.Print);
  });

  it('Đóng hàng báo lỗi target=May ra → lùi về May vào', () => {
    const plan = resolve({
      stage: FulfillmentStage.Pack,
      action: FulfillmentTransitionAction.ReworkBack,
      currentStatus: FulfillmentStageStatus.InProgress,
      stageState: inProgress(),
      target: FulfillmentStage.SewOut,
      reason: 'Lỗi may',
      stages: {} as FulfillmentStages,
      user: worker,
      mergedFlow: true,
    });
    expect(plan.patch.$set.currentFulfillmentStage).toBe(FulfillmentStage.SewIn);
  });

  it('xưởng thường: target=Ép giữ nguyên (không redirect)', () => {
    const plan = resolve({
      stage: FulfillmentStage.QCPostPress,
      action: FulfillmentTransitionAction.ReworkBack,
      currentStatus: FulfillmentStageStatus.InProgress,
      stageState: inProgress(),
      target: FulfillmentStage.Press,
      reason: 'Lỗi ép',
      stages: {} as FulfillmentStages,
      user: worker,
      mergedFlow: false,
    });
    expect(plan.patch.$set.currentFulfillmentStage).toBe(FulfillmentStage.Press);
  });
});
