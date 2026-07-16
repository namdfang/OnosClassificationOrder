import React from 'react';
import { Clock } from 'lucide-react';
import { DesignerStatus, WorkshopConfigCategory } from 'shared';

import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/common/CopyButton';
import { Hint } from '@/components/common/Hint';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/date';
import { formatCountdown, getActiveStageKey, getStageDeadline } from '@/utils/priorityEstimate';
import { AssigneeSelectCell } from '@/components/orders/cells/AssigneeSelectCell';
import { ColorBadgeSelectCell } from '@/components/orders/cells/ColorBadgeSelectCell';
import { DesignThumbsCell } from '@/components/orders/cells/DesignThumbsCell';
import { ErrorSourceCell } from '@/components/orders/cells/ErrorSourceCell';
import { IconSelectCell } from '@/components/orders/cells/IconSelectCell';
import { MultiIconSelectCell } from '@/components/orders/cells/MultiIconSelectCell';
import { ImageThumbCell } from '@/components/orders/cells/ImageThumbCell';
import { PrioritySelectCell } from '@/components/orders/cells/PrioritySelectCell';
import { ProductionErrorSelectCell } from '@/components/orders/cells/ProductionErrorSelectCell';
import { TextEditCell } from '@/components/orders/cells/TextEditCell';

export type WorkshopOrderRow = {
  _id: string;
  productionId: string;
  userSku?: string;
  size?: string;
  color?: string;
  type?: string;
  mockupUrl?: string;
  mockupOriginalUrl?: string;
  designs?: { front?: string } & Record<string, string | undefined>;
  designsOriginal?: { front?: string } & Record<string, string | undefined>;
  /** Trạng thái pipeline R2 cho từng vị trí design (Design-R2-Pipeline). */
  designsStatus?: Partial<Record<string, 'pending' | 'ready' | 'failed'>>;
  orderId?: string;
  /** Thời gian khách lên đơn (lấy từ cột "Order at" trong sheet). */
  orderAt?: string;
  inProductionAt?: string;
  factory?: { name?: string; shortName?: string };
  machineType?: { name?: string; shortName?: string };
  originalFactoryId?: string;
  factoryId?: string;
  isMapped?: boolean;
  productConfig?: { fullName?: string };

  priority?: number;
  printStatus?: string;
  printStatusNote?: string;
  toolResult?: string;
  toolResultNote?: string;
  /** Multi-select array of workshop_config codes (category=error_file_type). */
  errorFile?: string[];
  errorFileNote?: string;
  assignee?: string;
  assigneeNote?: string;
  fabricType?: string;
  machineNumber?: string;
  productionError?: string;
  productionErrorNote?: string;
  productionErrorSource?: 'designer' | 'factory' | 'tool-check';
  productionErrorCount?: number;

  // Phase 3 Designer-Task-Workflow
  designerStatus?: DesignerStatus;
  designerAssignedAt?: string;
  designerStartedAt?: string;
  designerCompletedAt?: string;
  designerRejectedAt?: string;
  designerReworkAt?: string;
  designerRejectedReason?: string;
  designerReworkCount?: number;

  // Fulfillment — dùng cho cột action stage In trên trang Fulfillment print.
  currentFulfillmentStage?: string | null;
  fulfillmentStages?: Record<string, ({ status?: string } & Record<string, unknown>) | undefined>;

  // Hủy đơn (soft) — badge "Đã hủy" + gate action.
  cancelledAt?: string | null;
  cancelReason?: string;

  // Giữ đơn (hold) — badge "Đang giữ" + khóa mọi thao tác (reversible).
  heldAt?: string | null;
  holdReason?: string;
};

const DESIGNER_STATUS_META: Record<
  DesignerStatus,
  { label: string; cls: string; tooltip: string }
> = {
  [DesignerStatus.Unassigned]: {
    label: 'Chưa gán',
    cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    tooltip: 'Chưa assign cho designer nào',
  },
  [DesignerStatus.Assigned]: {
    label: 'Đã gán',
    cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
    tooltip: 'Designer được giao, chưa nhận làm',
  },
  [DesignerStatus.InProgress]: {
    label: 'Đang làm',
    cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    tooltip: 'Designer đang xử lý',
  },
  [DesignerStatus.Done]: {
    label: 'Đã xong',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    tooltip: 'Designer hoàn thành — toolResultNote auto = ok',
  },
  [DesignerStatus.Rejected]: {
    label: 'Không làm được',
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    tooltip: 'Designer báo file không làm được — leader cần giao lại',
  },
  [DesignerStatus.Rework]: {
    label: 'Cần làm lại',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    tooltip: 'Xưởng báo lỗi do design — chính designer này làm lại',
  },
};

export interface WorkshopRenderCtx {
  canEditField: (field: string) => boolean;
  patchRow: (id: string, patch: Partial<WorkshopOrderRow>) => void;
  /**
   * `sourceUrl` = URL gốc Drive/CDN (designsOriginal). Dialog dùng để gọi
   * ensure-preview BE upload preview nếu chưa có.
   */
  openPreview: (url: string, title: string, originalUrl?: string, sourceUrl?: string) => void;
  /** Mở OrderDetailDialog cho đơn (hiện preview file cutting + info). */
  openDetail?: (orderId: string, productionId: string) => void;
}

export type WorkshopColMeta = {
  key: string;
  label: string;
  /** Permission code required to view; null = always visible. */
  perm: string | null;
  width?: string;
  render: (row: WorkshopOrderRow, ctx: WorkshopRenderCtx) => React.ReactNode;
};

/**
 * Cell "Ưu tiên" tách riêng thành component (thay vì render inline như các
 * cột khác) vì chip đếm ngược cần `useNow` tick theo thời gian thực — hook chỉ
 * hợp lệ khi gọi trong 1 component thật, không phải trong hàm `render()` được
 * gọi lại mỗi hàng (số lần gọi hook sẽ đổi theo số dòng → vi phạm Rules of Hooks).
 */
function PriorityCell({ row, ctx }: { row: WorkshopOrderRow; ctx: WorkshopRenderCtx }) {
  const activeStage = getActiveStageKey(row);
  const stageState = activeStage
    ? (row.fulfillmentStages?.[activeStage] as { waitingAt?: string; startedAt?: string } | undefined)
    : undefined;
  // Đơn chưa chạy bước nào (unassigned, chưa có designerAssignedAt) → tính
  // giờ vào production làm mốc bắt đầu đếm ngược, thay vì bỏ trống estimate.
  const enteredAt =
    activeStage === 'designer'
      ? row.designerStartedAt || row.designerAssignedAt || row.inProductionAt
      : stageState?.startedAt || stageState?.waitingAt;
  const deadline = activeStage ? getStageDeadline(row.priority, activeStage, enteredAt) : undefined;
  const now = useNow(30_000);
  const countdown = deadline ? formatCountdown(deadline, now) : undefined;
  return (
    <div className="flex flex-col gap-1 items-start">
      <PrioritySelectCell
        orderId={row._id}
        value={row.priority}
        canEdit={ctx.canEditField('priority')}
        onUpdated={(v) => ctx.patchRow(row._id, { priority: v ?? undefined })}
      />
      {deadline && countdown && (
        <span
          className={cn(
            'text-[10px] inline-flex items-center gap-1 whitespace-nowrap',
            countdown.overdue ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground',
          )}
        >
          <Clock size={10} /> {countdown.text}
        </span>
      )}
    </div>
  );
}

export const WORKSHOP_COLS: WorkshopColMeta[] = [
  {
    key: 'productionId',
    label: 'Production / Order',
    perm: null,
    width: 'min-w-[180px]',
    render: (r, ctx) => {
      const orderTxt = r.orderAt ? formatDate(r.orderAt, 'HH:mm DD/MM/YYYY') : null;
      const prodTxt = r.inProductionAt ? formatDate(r.inProductionAt, 'HH:mm DD/MM/YYYY') : null;
      const hasCuttingFile = !!(r as { cuttingFileUrl?: string }).cuttingFileUrl;
      return (
        <div className="flex flex-col leading-tight gap-0.5">
          <div className="flex items-center gap-1">
            <CopyButton
              value={r.productionId}
              label="Production ID"
              iconSize={15}
              className="p-1 hover:ring-1 hover:ring-primary/40"
            />
            <Hint
              content={
                ctx.openDetail
                  ? 'Click để xem chi tiết'
                  : `Production ID: ${r.productionId}`
              }
              forceRich
            >
              {ctx.openDetail ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    ctx.openDetail?.(r._id, r.productionId);
                  }}
                  className="font-mono text-[13px] font-semibold text-foreground hover:text-primary hover:underline truncate max-w-[140px] text-left"
                >
                  {r.productionId}
                </button>
              ) : (
                <span className="font-mono text-[13px] font-semibold text-foreground truncate max-w-[140px]">
                  {r.productionId}
                </span>
              )}
            </Hint>
            {hasCuttingFile && (
              <Hint content="Đã map file cutting" forceRich>
                <span className="text-emerald-600 dark:text-emerald-400 text-[10px]" aria-label="cutting">
                  ✂
                </span>
              </Hint>
            )}
          </div>
          {r.orderId && (
            <div className="flex items-center gap-1">
              <CopyButton value={r.orderId} label="Order ID" iconSize={10} />
              <Hint content={`Order ID: ${r.orderId}`} forceRich>
                <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px]">
                  {r.orderId}
                </span>
              </Hint>
            </div>
          )}
          {/* {orderTxt && (
            <Hint content={`Khách lên đơn: ${orderTxt}`} forceRich>
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                <span className="opacity-60">🛒</span>
                {orderTxt}
              </span>
            </Hint>
          )} */}
          {prodTxt && (
            <Hint content={`In Production At: ${prodTxt}`} forceRich>
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                <span className="opacity-60">📅</span>
                {prodTxt}
              </span>
            </Hint>
          )}
        </div>
      );
    },
  },
  {
    key: 'priority',
    label: 'Ưu tiên',
    perm: 'order.field.priority.view',
    width: 'min-w-[120px]',
    render: (r, ctx) => <PriorityCell row={r} ctx={ctx} />,
  },
  {
    key: 'mockupTypeSize',
    label: 'Mockup / Type / Size / Color',
    perm: null,
    width: 'min-w-[260px] max-w-[320px]',
    render: (r, ctx) => {
      const url = r.mockupOriginalUrl || r.mockupUrl;
      const sizeColorText = `${r.size || '—'}${r.color ? ' / ' + r.color : ''}`;
      return (
        <div className="flex items-start gap-2">
          <div className="flex items-center gap-1 shrink-0">
            {url && <CopyButton value={url} label="link mockup" iconSize={11} />}
            <ImageThumbCell
              url={r.mockupUrl}
              originalUrl={r.mockupOriginalUrl}
              title={url ? `Mockup: ${url}` : 'Mockup'}
              onOpen={ctx.openPreview}
            />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1 leading-tight">
            <Hint content={r.type ? `Type: ${r.type}` : ''} forceRich>
              <span className="text-xs line-clamp-1 break-all text-foreground">
                {r.type || '—'}
              </span>
            </Hint>
            <Hint content={`Size / Color: ${sizeColorText}`} forceRich>
              <span className="text-[11px] text-muted-foreground line-clamp-1">
                {r.size || '—'}
                {r.color ? <span> / {r.color}</span> : null}
              </span>
            </Hint>
          </div>
        </div>
      );
    },
  },
  // [R2-disabled] tạm ẩn cột Design vì pipeline R2 đang tắt — bật lại
  // bằng cách uncomment block bên dưới (cùng `processDesigns` ở BE).
  // {
  //   key: 'designs',
  //   label: 'Design',
  //   perm: null,
  //   width: 'min-w-[110px]',
  //   render: (r, ctx) => (
  //     <DesignThumbsCell
  //       designs={r.designs}
  //       designsOriginal={r.designsOriginal}
  //       designsStatus={r.designsStatus}
  //       productionId={r.productionId}
  //       openPreview={ctx.openPreview}
  //     />
  //   ),
  // },
  {
    key: 'fabricType',
    label: 'Loại vải',
    perm: 'order.field.fabricType.view',
    width: 'min-w-[130px]',
    render: (r, ctx) => (
      <IconSelectCell
        orderId={r._id}
        field="fabricType"
        category={WorkshopConfigCategory.FabricType}
        value={r.fabricType}
        canEdit={ctx.canEditField('fabricType')}
        onUpdated={(v) => ctx.patchRow(r._id, { fabricType: v ?? undefined })}
      />
    ),
  },
  {
    key: 'machineNumber',
    label: 'Máy',
    perm: 'order.field.machineNumber.view',
    width: 'min-w-[100px]',
    render: (r, ctx) => (
      <ColorBadgeSelectCell
        orderId={r._id}
        field="machineNumber"
        category={WorkshopConfigCategory.Machine}
        value={r.machineNumber}
        canEdit={ctx.canEditField('machineNumber')}
        onUpdated={(v) => ctx.patchRow(r._id, { machineNumber: v ?? undefined })}
      />
    ),
  },
  {
    key: 'printStatus',
    label: 'Trạng thái in',
    perm: 'order.field.printStatus.view',
    width: 'min-w-[140px]',
    render: (r, ctx) => (
      <ColorBadgeSelectCell
        orderId={r._id}
        field="printStatus"
        category={WorkshopConfigCategory.PrintStatus}
        value={r.printStatus}
        canEdit={ctx.canEditField('printStatus')}
        onUpdated={(v) => ctx.patchRow(r._id, { printStatus: v ?? undefined })}
      />
    ),
  },
  {
    key: 'printStatusNote',
    label: 'Note Trạng thái in',
    perm: 'order.field.printStatusNote.view',
    width: 'min-w-[140px]',
    render: (r, ctx) => (
      <IconSelectCell
        orderId={r._id}
        field="printStatusNote"
        category={WorkshopConfigCategory.PrintStatusNote}
        value={r.printStatusNote}
        canEdit={ctx.canEditField('printStatusNote')}
        onUpdated={(v) => ctx.patchRow(r._id, { printStatusNote: v ?? undefined })}
      />
    ),
  },
  {
    key: 'toolResult',
    label: 'Kết quả Tool',
    perm: 'order.field.toolResult.view',
    width: 'min-w-[130px]',
    render: (r, ctx) => (
      <IconSelectCell
        orderId={r._id}
        field="toolResult"
        category={WorkshopConfigCategory.ToolResult}
        value={r.toolResult}
        canEdit={ctx.canEditField('toolResult')}
        onUpdated={(v) => ctx.patchRow(r._id, { toolResult: v ?? undefined })}
      />
    ),
  },
  {
    key: 'toolResultNote',
    label: 'Note kq Tool 1',
    perm: 'order.field.toolResultNote.view',
    width: 'min-w-[160px]',
    render: (r, ctx) => {
      const showCount =
        r.toolResultNote === 'error' && (r.productionErrorCount || 0) >= 2;
      return (
        <span className="inline-flex items-center gap-1.5">
          <ColorBadgeSelectCell
            orderId={r._id}
            field="toolResultNote"
            category={WorkshopConfigCategory.ToolResultNote}
            value={r.toolResultNote}
            canEdit={ctx.canEditField('toolResultNote')}
            onUpdated={(v) => ctx.patchRow(r._id, { toolResultNote: v ?? undefined })}
          />
          {showCount && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
              title={`Xưởng đã báo lỗi ${r.productionErrorCount} lần trên đơn này`}
            >
              ×{r.productionErrorCount}
            </span>
          )}
        </span>
      );
    },
  },
  {
    key: 'errorFile',
    label: 'File sửa lỗi',
    perm: 'order.field.errorFile.view',
    width: 'min-w-[160px]',
    render: (r, ctx) => (
      <MultiIconSelectCell
        orderId={r._id}
        field="errorFile"
        category={WorkshopConfigCategory.ErrorFileType}
        value={r.errorFile}
        canEdit={ctx.canEditField('errorFile')}
        maxVisible={2}
        onUpdated={(v) => ctx.patchRow(r._id, { errorFile: v ?? undefined })}
      />
    ),
  },
  {
    key: 'errorFileNote',
    label: 'Ghi chú file lỗi',
    perm: 'order.field.errorFileNote.view',
    width: 'min-w-[160px]',
    render: (r, ctx) => (
      <TextEditCell
        orderId={r._id}
        field="errorFileNote"
        value={r.errorFileNote}
        canEdit={ctx.canEditField('errorFileNote')}
        onUpdated={(v) => ctx.patchRow(r._id, { errorFileNote: v ?? undefined })}
        tooltipLabel="Ghi chú file lỗi"
      />
    ),
  },
  {
    key: 'productionError',
    label: 'Lỗi xưởng',
    perm: 'order.field.productionError.view',
    width: 'min-w-[140px]',
    render: (r, ctx) => (
      <ProductionErrorSelectCell
        orderId={r._id}
        category={WorkshopConfigCategory.ProductionError}
        value={r.productionError}
        errorSourceValue={r.productionErrorSource}
        errorNoteValue={r.productionErrorNote}
        canEdit={ctx.canEditField('productionError')}
        onUpdated={(code, source, note) =>
          ctx.patchRow(r._id, {
            productionError: code ?? undefined,
            // Bỏ chọn lỗi xưởng → clear luôn loại lỗi (mirror BE order.service.ts:3318).
            ...(!code
              ? { productionErrorSource: undefined }
              : source !== undefined
                ? { productionErrorSource: source }
                : {}),
            ...(note !== undefined ? { productionErrorNote: note } : {}),
          })
        }
      />
    ),
  },
  {
    key: 'productionErrorSource',
    label: 'Loại lỗi',
    perm: 'order.field.productionErrorSource.view',
    width: 'min-w-[110px]',
    render: (r, ctx) => (
      <ErrorSourceCell
        orderId={r._id}
        value={r.productionErrorSource}
        canEdit={ctx.canEditField('productionErrorSource')}
        onUpdated={(v) => ctx.patchRow(r._id, { productionErrorSource: v ?? undefined })}
      />
    ),
  },
  {
    key: 'productionErrorNote',
    label: 'Mô tả lỗi xưởng',
    perm: 'order.field.productionErrorNote.view',
    width: 'min-w-[180px]',
    render: (r, ctx) => (
      <TextEditCell
        orderId={r._id}
        field="productionErrorNote"
        value={r.productionErrorNote}
        canEdit={ctx.canEditField('productionErrorNote')}
        onUpdated={(v) => ctx.patchRow(r._id, { productionErrorNote: v ?? undefined })}
        tooltipLabel="Mô tả lỗi xưởng"
      />
    ),
  },
  {
    key: 'assignee',
    label: 'Người thực hiện',
    perm: 'order.field.assignee.view',
    width: 'min-w-[140px]',
    render: (r, ctx) => (
      <AssigneeSelectCell
        orderId={r._id}
        value={r.assignee}
        canEdit={ctx.canEditField('assignee')}
        blockedReason={
          r.toolResultNote === 'ok' ? "Đơn đã 'ok' (Note kq Tool 1) — không cần gán designer" : undefined
        }
        onUpdated={(v) => ctx.patchRow(r._id, { assignee: v ?? undefined })}
      />
    ),
  },
  {
    key: 'designerStatus',
    label: 'TT Designer',
    perm: 'order.field.designerStatus.view',
    width: 'min-w-[110px]',
    render: (r) => {
      const status = (r.designerStatus as DesignerStatus) || DesignerStatus.Unassigned;
      const meta = DESIGNER_STATUS_META[status];
      const rework = r.designerReworkCount && r.designerReworkCount > 0
        ? ` · ${r.designerReworkCount}×`
        : '';
      return (
        <Hint content={meta.tooltip} forceRich>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${meta.cls} cursor-help`}
          >
            {meta.label}{rework}
          </span>
        </Hint>
      );
    },
  },
  {
    key: 'assigneeNote',
    label: 'Note người thực hiện',
    perm: 'order.field.assigneeNote.view',
    width: 'min-w-[140px]',
    render: (r, ctx) => (
      <IconSelectCell
        orderId={r._id}
        field="assigneeNote"
        category={WorkshopConfigCategory.AssigneeNote}
        value={r.assigneeNote}
        canEdit={ctx.canEditField('assigneeNote')}
        onUpdated={(v) => ctx.patchRow(r._id, { assigneeNote: v ?? undefined })}
      />
    ),
  },
  {
    key: 'userSku',
    label: 'User SKU',
    perm: null,
    width: 'min-w-[120px]',
    render: (r) =>
      r.userSku ? (
        <div className="flex items-center gap-1">
          <CopyButton value={r.userSku} label="User SKU" iconSize={11} />
          <Hint content={`User SKU: ${r.userSku}`} forceRich>
            <span className="text-xs truncate max-w-[140px]">{r.userSku}</span>
          </Hint>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    key: 'typeFullName',
    label: 'Type.1',
    perm: null,
    width: 'min-w-[140px] max-w-[220px]',
    render: (r) => (
      <Hint content={r.productConfig?.fullName ? `Type.1: ${r.productConfig.fullName}` : ''} forceRich>
        <span className="text-xs line-clamp-1 break-all">
          {r.productConfig?.fullName || '—'}
        </span>
      </Hint>
    ),
  },
  {
    key: 'factoryMachine',
    label: 'Nhà máy / Phòng',
    perm: null,
    width: 'min-w-[180px]',
    render: (r) => {
      const hasMapping = !!(r.factory?.name || r.machineType?.name);
      if (!hasMapping) {
        return (
          <Hint
            content="Type của order không match với product config nào — chưa xác định được xưởng/máy"
            forceRich
          >
            <Badge variant="warning" className="cursor-help">
              Chưa mapping
            </Badge>
          </Hint>
        );
      }
      return (
        <div className="flex flex-col gap-1">
          {r.factory?.name && (
            <Hint
              content={`Nhà máy: ${r.factory.name}${r.factory.shortName ? ' (mã: ' + r.factory.shortName + ')' : ''}`}
              forceRich
            >
              <Badge variant="success" className="w-fit cursor-help text-[10px] py-0 px-1.5">
                {r.factory.shortName || '?'} · {r.factory.name || '?'}
              </Badge>
            </Hint>
          )}
          {r.machineType?.name && (
            <Hint
              content={`Phòng: ${r.machineType.name}${r.machineType.shortName ? ' (mã: ' + r.machineType.shortName + ')' : ''}`}
              forceRich
            >
              <Badge variant="secondary" className="w-fit cursor-help text-[10px] py-0 px-1.5">
                {r.machineType.shortName || '?'} · {r.machineType.name || '?'}
              </Badge>
            </Hint>
          )}
        </div>
      );
    },
  },
];

// ─── Cột riêng cho tài khoản In (PrintOrderTable) ───────────────────────────
// Khác WORKSHOP_COLS 2 điểm:
//  1. "Loại vải" gộp vào cột Mockup/Type/Size/Color — giá trị nằm DƯỚI Size.
//  2. 3 cột Lỗi xưởng / Loại lỗi / Mô tả lỗi xưởng dời lên NGAY SAU Note Trạng thái in.
const printMockupCol: WorkshopColMeta = {
  key: 'mockupTypeSize',
  label: 'Mockup / Type / Size / Color / Vải',
  perm: null,
  width: 'min-w-[260px] max-w-[320px]',
  render: (r, ctx) => {
    const url = r.mockupOriginalUrl || r.mockupUrl;
    return (
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-1 shrink-0">
          {url && <CopyButton value={url} label="link mockup" iconSize={11} />}
          <ImageThumbCell
            url={r.mockupUrl}
            originalUrl={r.mockupOriginalUrl}
            title={url ? `Mockup: ${url}` : 'Mockup'}
            onOpen={ctx.openPreview}
          />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1 leading-tight">
          <Hint content={r.type ? `Type: ${r.type}` : ''} forceRich>
            <span className="text-xs line-clamp-1 break-all text-foreground">{r.type || '—'}</span>
          </Hint>
          <Hint content={`Size / Color: ${r.size || '—'}${r.color ? ' / ' + r.color : ''}`} forceRich>
            <span className="text-[11px] text-muted-foreground line-clamp-1">
              {r.size || '—'}
              {r.color ? <span> / {r.color}</span> : null}
            </span>
          </Hint>
          {/* Loại vải — gộp vào đây, nằm dưới Size (cho tài khoản In). */}
          <IconSelectCell
            orderId={r._id}
            field="fabricType"
            category={WorkshopConfigCategory.FabricType}
            value={r.fabricType}
            canEdit={ctx.canEditField('fabricType')}
            onUpdated={(v) => ctx.patchRow(r._id, { fabricType: v ?? undefined })}
          />
        </div>
      </div>
    );
  },
};

export const PRINT_COLS: WorkshopColMeta[] = (() => {
  // Thứ tự dời lên NGAY SAU "Note Trạng thái in": Note kq Tool 1 → 3 cột lỗi xưởng.
  const MOVED_KEYS = [
    'toolResultNote',
    'productionError',
    'productionErrorSource',
    'productionErrorNote',
  ];
  const movedCols = MOVED_KEYS.map((k) => WORKSHOP_COLS.find((c) => c.key === k)!);
  // Note Trạng thái in — thu hẹp + rút gọn label (header `whitespace-nowrap` nên
  // label dài mới là thứ ép cột rộng) để đỡ tốn diện tích. Chỉ trong PRINT_COLS.
  const narrowPrintStatusNote: WorkshopColMeta = {
    ...WORKSHOP_COLS.find((c) => c.key === 'printStatusNote')!,
    label: 'Note TT in',
    width: 'min-w-[80px] max-w-[120px]',
  };
  const result: WorkshopColMeta[] = [];
  for (const col of WORKSHOP_COLS) {
    if (col.key === 'fabricType') continue; // đã gộp vào cột mockup
    if (MOVED_KEYS.includes(col.key)) continue; // dời lên sau printStatusNote
    if (col.key === 'mockupTypeSize') {
      result.push(printMockupCol);
      continue;
    }
    if (col.key === 'printStatusNote') {
      result.push(narrowPrintStatusNote);
      result.push(...movedCols);
      continue;
    }
    result.push(col);
  }
  return result;
})();
