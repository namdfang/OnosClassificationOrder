import React from 'react';
import { WorkshopConfigCategory } from 'shared';

import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/common/CopyButton';
import { Hint } from '@/components/common/Hint';
import { ColorBadgeSelectCell } from '@/components/orders/cells/ColorBadgeSelectCell';
import { IconSelectCell } from '@/components/orders/cells/IconSelectCell';
import { ImageThumbCell } from '@/components/orders/cells/ImageThumbCell';
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
  orderId?: string;
  inProductionAt?: string;
  factory?: { name?: string; shortName?: string };
  machineType?: { name?: string; shortName?: string };
  originalFactoryId?: string;
  factoryId?: string;
  isMapped?: boolean;
  productConfig?: { fullName?: string };

  printStatus?: string;
  printStatusNote?: string;
  toolResult?: string;
  toolResultNote?: string;
  errorFile?: string;
  errorFileNote?: string;
  assignee?: string;
  assigneeNote?: string;
  fabricType?: string;
  productionError?: string;
  productionErrorNote?: string;
};

export interface WorkshopRenderCtx {
  canEditField: (field: string) => boolean;
  patchRow: (id: string, patch: Partial<WorkshopOrderRow>) => void;
  openPreview: (url: string, title: string, originalUrl?: string) => void;
}

export type WorkshopColMeta = {
  key: string;
  label: string;
  /** Permission code required to view; null = always visible. */
  perm: string | null;
  width?: string;
  render: (row: WorkshopOrderRow, ctx: WorkshopRenderCtx) => React.ReactNode;
};

export const WORKSHOP_COLS: WorkshopColMeta[] = [
  {
    key: 'productionId',
    label: 'Production / Order',
    perm: null,
    width: 'min-w-[180px]',
    render: (r) => {
      const d = r.inProductionAt ? new Date(r.inProductionAt) : null;
      return (
        <div className="flex flex-col leading-tight gap-0.5">
          <div className="flex items-center gap-1">
            <CopyButton value={r.productionId} label="Production ID" iconSize={11} />
            <Hint content={`Production ID: ${r.productionId}`} forceRich>
              <span className="font-mono text-[13px] font-semibold text-foreground truncate max-w-[140px]">
                {r.productionId}
              </span>
            </Hint>
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
          {d && (
            <Hint content={`In Production At: ${d.toLocaleString('vi-VN', { hour12: false })}`} forceRich>
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                <span className="opacity-60">📅</span>
                {d.toLocaleString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
              </span>
            </Hint>
          )}
        </div>
      );
    },
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
    render: (r, ctx) => (
      <ColorBadgeSelectCell
        orderId={r._id}
        field="toolResultNote"
        category={WorkshopConfigCategory.ToolResultNote}
        value={r.toolResultNote}
        canEdit={ctx.canEditField('toolResultNote')}
        onUpdated={(v) => ctx.patchRow(r._id, { toolResultNote: v ?? undefined })}
      />
    ),
  },
  {
    key: 'errorFile',
    label: 'File sửa lỗi',
    perm: 'order.field.errorFile.view',
    width: 'min-w-[140px]',
    render: (r, ctx) => (
      <IconSelectCell
        orderId={r._id}
        field="errorFile"
        category={WorkshopConfigCategory.ErrorFileType}
        value={r.errorFile}
        canEdit={ctx.canEditField('errorFile')}
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
      <ColorBadgeSelectCell
        orderId={r._id}
        field="productionError"
        category={WorkshopConfigCategory.ProductionError}
        value={r.productionError}
        canEdit={ctx.canEditField('productionError')}
        onUpdated={(v) => ctx.patchRow(r._id, { productionError: v ?? undefined })}
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
      <IconSelectCell
        orderId={r._id}
        field="assignee"
        category={WorkshopConfigCategory.Assignee}
        value={r.assignee}
        canEdit={ctx.canEditField('assignee')}
        onUpdated={(v) => ctx.patchRow(r._id, { assignee: v ?? undefined })}
      />
    ),
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
