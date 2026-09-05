import React from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';

import { cn } from '@/utils/cn';
import { getStageLabel } from '@/utils/fulfillmentStageLabel';

interface Props {
  /** Lý do đã lưu ở `fulfillmentStages.<stage>.reworkReason`. */
  reason?: string;
  /** Công đoạn ĐÃ ĐẨY VỀ (`fulfillmentStages.<stage>.reworkFromStage`). */
  fromStage?: string;
  className?: string;
}

/**
 * Lý do bị đẩy về làm lại — thông tin sản xuất cốt lõi cho người nhận lại đơn.
 * Backend đã lưu `reworkReason` + `reworkFromStage` từ lâu nhưng trước đây
 * KHÔNG có chỗ nào render, nên thợ nhận đơn "Làm lại" không biết phải sửa gì.
 *
 * Dùng ở: kanban `FulfillmentTaskCard` + bảng công đoạn In (`workshopTableConfig`
 * → cột "Trạng thái in"). Trả `null` khi đơn không có lý do (không phải rework).
 */
export function ReworkReasonNote({ reason, fromStage, className }: Props) {
  const { t } = useTranslation('fulfillmentWorkflow');
  if (!reason && !fromStage) return null;
  const from = fromStage ? getStageLabel(t, fromStage) : null;
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-200',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1 font-medium">
        <RotateCcw size={10} />
        {from ? t('taskCard.reworkFrom', { stage: from }) : t('taskCard.reworkFromUnknown')}
      </span>
      {reason && <span className="whitespace-pre-wrap break-words">{reason}</span>}
    </div>
  );
}
