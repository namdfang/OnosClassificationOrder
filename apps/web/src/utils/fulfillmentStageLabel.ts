import type { TFunction } from 'i18next';
import { FULFILLMENT_STAGE_LABELS, type FulfillmentStage } from 'shared';

/**
 * `FULFILLMENT_STAGE_LABELS` (packages/shared) is Vietnamese-only — it's
 * shared with the backend so we don't edit it directly. This wraps it with a
 * translation lookup that falls back to the shared label when a key is
 * missing (matches the pattern used for permission-catalog labels).
 */
export function getStageLabel(t: TFunction, stage: FulfillmentStage | string): string {
  return t(`stageLabels.${stage}`, {
    ns: 'fulfillmentWorkflow',
    defaultValue: FULFILLMENT_STAGE_LABELS[stage as FulfillmentStage] ?? stage,
  });
}
