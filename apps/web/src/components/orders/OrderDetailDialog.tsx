import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ExternalLink, FileText, Image as ImageIcon, Info, Link2, Loader2, ScissorsLineDashed } from 'lucide-react';
import type { ProductionOrder } from 'shared';

import { RepositoryRemote } from '@/services';

import { CopyButton } from '@/components/common/CopyButton';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { handleAxiosError } from '@/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  productionId?: string;
}

type OrderWithRels = ProductionOrder & {
  factory?: { name?: string; shortName?: string };
  machineType?: { name?: string; shortName?: string };
  productConfig?: { fullName?: string; shortName?: string };
};

/** Extract Drive fileId từ URL — đồng bộ với pattern BE `DriveFileNameService.extractFileId`. */
function extractDriveFileId(url?: string): string | null {
  if (!url) return null;
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  return null;
}

export function OrderDetailDialog({ open, onOpenChange, orderId, productionId }: Props) {
  const { t } = useTranslation('orders');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderWithRels | null>(null);
  // Preview state cho mockup thumbnail — reuse ImagePreviewDialog (zoom + open
  // original tab). Design files KHÔNG có preview vì chỉ lưu URL Drive (không
  // có ảnh resize/optimize) — user mở Drive thẳng để xem.
  const [preview, setPreview] = useState<{ url: string; original?: string; title: string } | null>(null);

  useEffect(() => {
    if (!open || (!orderId && !productionId)) {
      setOrder(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        // Dùng getByProductionId — exact match, không bị strip query field như getOrders.
        // (GetProductionOrdersZod không có `ids` → Zod silently strip → list endpoint
        //  trả đơn ngẫu nhiên trong scope user, hiển thị data sai.)
        if (!productionId) {
          if (!cancelled) setOrder(null);
          return;
        }
        const r = await RepositoryRemote.order.getByProductionId(productionId);
        if (!cancelled) setOrder((r?.data?.data ?? null) as OrderWithRels | null);
      } catch (e) {
        handleAxiosError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId, productionId]);

  const cuttingFileId = extractDriveFileId(order?.cuttingFileUrl);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info size={16} className="text-primary" />
              {t('dialogs.orderDetail.title')}
              {order?.productionId ? ` — ${order.productionId}` : ''}
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="py-12 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin mr-2" /> {t('common:status.loading')}
            </div>
          ) : !order ? (
            <div className="py-8 text-sm text-muted-foreground text-center">{t('dialogs.orderDetail.notFound')}</div>
          ) : (
            <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
              {/* Section: Info chung */}
              <Grid>
                <InfoRow label={t('dialogs.orderDetail.labelProductionId')} value={order.productionId} mono copyable />
                <InfoRow
                  label={t('dialogs.orderDetail.labelOrderId')}
                  value={order.orderId || '—'}
                  mono
                  copyable={!!order.orderId}
                />
                <InfoRow label={t('dialogs.orderDetail.labelType')} value={order.type || '—'} />
                <InfoRow
                  label={t('dialogs.orderDetail.labelSizeColor')}
                  value={`${order.size || '—'}${order.color ? ' / ' + order.color : ''}`}
                />
                <InfoRow label={t('dialogs.orderDetail.labelQuantity')} value={String(order.quantity ?? 1)} />
                <InfoRow
                  label={t('dialogs.orderDetail.labelFactory')}
                  value={order.factory?.shortName || order.factory?.name || '—'}
                />
                <InfoRow
                  label={t('dialogs.orderDetail.labelMachine')}
                  value={order.machineType?.shortName || order.machineType?.name || '—'}
                />
                <InfoRow
                  label={t('dialogs.orderDetail.labelProduct')}
                  value={order.productConfig?.shortName || order.productConfig?.fullName || '—'}
                />
              </Grid>

              {/* Section: Workshop / status */}
              <Grid>
                <InfoRow label={t('dialogs.orderDetail.labelPrintStatus')} value={order.printStatus || '—'} />
                <InfoRow label={t('dialogs.orderDetail.labelToolResult')} value={order.toolResult || '—'} />
                <InfoRow label={t('dialogs.orderDetail.labelNoteTool')} value={order.toolResultNote || '—'} />
                <InfoRow
                  label={t('dialogs.orderDetail.labelReadyFulfill')}
                  value={order.readyForFulfill ? t('common:actions.yes') : t('common:actions.no')}
                  badgeTone={order.readyForFulfill ? 'success' : undefined}
                />
                <InfoRow label={t('dialogs.orderDetail.labelDesignerStatus')} value={order.designerStatus || '—'} />
                <InfoRow
                  label={t('dialogs.orderDetail.labelCurrentStage')}
                  value={order.currentFulfillmentStage || '—'}
                />
              </Grid>

              {/* Section: Mockup + Design links — chỉ link, KHÔNG hiển thị ảnh.
                User click để mở tab mới hoặc copy URL (workflow xưởng cần URL
                gốc Drive để in/upload chỗ khác, không cần preview ngay tại đây). */}
              <DesignLinksSection
                productionId={order.productionId}
                mockupUrl={order.mockupUrl}
                mockupOriginalUrl={order.mockupOriginalUrl}
                designs={order.designs as Record<string, string | undefined> | undefined}
                designsOriginal={order.designsOriginal as Record<string, string | undefined> | undefined}
                onPreviewMockup={(url, original, title) => setPreview({ url, original, title })}
              />

              {/* Section: Cutting file preview */}
              <div className="rounded-lg border border-border bg-card">
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <ScissorsLineDashed size={14} /> {t('dialogs.orderDetail.cuttingFileTitle')}
                  </h4>
                  {order.cuttingFileUrl && (
                    <a
                      href={order.cuttingFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {t('dialogs.orderDetail.openDrive')} <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                {order.cuttingFileUrl ? (
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText size={13} />
                      <span className="font-mono truncate">{order.cuttingFileName || order.cuttingFileUrl}</span>
                      <CopyButton value={order.cuttingFileUrl} label="link" iconSize={11} />
                    </div>
                    {cuttingFileId ? (
                      <div className="aspect-[4/5] w-full bg-muted/30 rounded border border-border overflow-hidden">
                        <iframe
                          src={`https://drive.google.com/file/d/${cuttingFileId}/preview`}
                          className="w-full h-full"
                          title={order.cuttingFileName || 'Cutting file preview'}
                          allow="autoplay"
                        />
                      </div>
                    ) : (
                      <Button asChild variant="secondary">
                        <a href={order.cuttingFileUrl} target="_blank" rel="noopener noreferrer">
                          {t('dialogs.orderDetail.openFile')}
                        </a>
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    <Trans
                      i18nKey="dialogs.orderDetail.noCuttingFile"
                      ns="orders"
                      components={{ strong: <strong /> }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ImagePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        url={preview?.url}
        originalUrl={preview?.original}
        title={preview?.title}
      />
    </>
  );
}

function DesignLinksSection({
  productionId,
  mockupUrl,
  mockupOriginalUrl,
  designs,
  designsOriginal,
  onPreviewMockup,
}: {
  productionId: string;
  mockupUrl?: string;
  mockupOriginalUrl?: string;
  designs?: Record<string, string | undefined>;
  designsOriginal?: Record<string, string | undefined>;
  onPreviewMockup: (url: string, original: string | undefined, title: string) => void;
}) {
  const { t } = useTranslation('orders');
  // Gộp position từ cả 2 source — ưu tiên `designsOriginal` (URL Drive gốc)
  // vì xưởng cần file gốc để in/upload, không phải URL preview optimized.
  const positions = Array.from(new Set([...Object.keys(designs ?? {}), ...Object.keys(designsOriginal ?? {})])).filter(
    (k) => designsOriginal?.[k] || designs?.[k],
  );

  // Mockup: thumb dùng URL R2/optimized (`mockupUrl`), preview/copy ưu tiên
  // `mockupOriginalUrl` (Drive gốc — xưởng cần URL gốc để paste chỗ khác).
  const mockupThumb = mockupUrl;
  const mockupLink = mockupOriginalUrl || mockupUrl;
  const hasAny = positions.length > 0 || !!mockupLink;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
          <Link2 size={14} /> {t('dialogs.orderDetail.linkFileTitle')}
          {hasAny && (
            <span className="text-xs text-muted-foreground font-normal">
              ({positions.length + (mockupLink ? 1 : 0)})
            </span>
          )}
        </h4>
        <span className="text-[10px] text-muted-foreground italic">{t('dialogs.orderDetail.linkFileHint')}</span>
      </div>
      {!hasAny ? (
        <div className="p-6 text-center text-xs text-muted-foreground">{t('dialogs.orderDetail.noLinks')}</div>
      ) : (
        <div className="divide-y divide-border/40">
          {mockupLink && (
            <MockupRow
              productionId={productionId}
              thumbUrl={mockupThumb}
              fullUrl={mockupLink}
              originalUrl={mockupOriginalUrl}
              onPreview={onPreviewMockup}
            />
          )}
          <ul className="divide-y divide-border/40">
            {positions.map((k) => {
              const url = designsOriginal?.[k] || designs?.[k];
              if (!url) return null;
              return (
                <LinkRow
                  key={k}
                  icon={<FileText size={12} />}
                  label={k}
                  url={url}
                  copyLabel={`${k} — ${productionId}`}
                />
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function MockupRow({
  productionId,
  thumbUrl,
  fullUrl,
  originalUrl,
  onPreview,
}: {
  productionId: string;
  thumbUrl?: string;
  fullUrl: string;
  originalUrl?: string;
  onPreview: (url: string, original: string | undefined, title: string) => void;
}) {
  const { t } = useTranslation('orders');
  const title = `Mockup ${productionId}`;
  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
      <button
        type="button"
        onClick={() => onPreview(thumbUrl || fullUrl, originalUrl, title)}
        className="shrink-0 w-14 h-14 rounded border border-border overflow-hidden bg-checker hover:ring-2 hover:ring-primary/40"
        title={t('dialogs.orderDetail.clickToEnlarge')}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="w-full h-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon size={16} />
          </div>
        )}
      </button>
      <span className="shrink-0 text-xs font-semibold text-foreground min-w-[80px] uppercase tracking-wide">
        {t('dialogs.orderDetail.mockupLabel')}
      </span>
      <a
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 font-mono text-xs text-muted-foreground hover:text-primary hover:underline truncate"
        title={fullUrl}
      >
        {fullUrl}
      </a>
      <span className="shrink-0 inline-flex items-center gap-1">
        <CopyButton value={fullUrl} label={title} iconSize={11} />
        <a
          href={fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-primary"
          title={t('dialogs.orderDetail.openNewTab')}
        >
          <ExternalLink size={11} />
        </a>
      </span>
    </div>
  );
}

function LinkRow({
  icon,
  label,
  url,
  copyLabel,
}: {
  icon: React.ReactNode;
  label: string;
  url: string;
  copyLabel: string;
}) {
  const { t } = useTranslation('orders');
  return (
    <li className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30">
      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 text-muted-foreground">{icon}</span>
      <span className="shrink-0 font-semibold text-foreground min-w-[80px] uppercase tracking-wide">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 font-mono text-muted-foreground hover:text-primary hover:underline truncate"
        title={url}
      >
        {url}
      </a>
      <span className="shrink-0 inline-flex items-center gap-1">
        <CopyButton value={url} label={copyLabel} iconSize={11} />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-primary"
          title={t('dialogs.orderDetail.openNewTab')}
        >
          <ExternalLink size={11} />
        </a>
      </span>
    </li>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>;
}

function InfoRow({
  label,
  value,
  mono,
  copyable,
  badgeTone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  badgeTone?: 'success' | 'warning';
}) {
  return (
    <div className="rounded border border-border/60 bg-muted/20 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-sm text-foreground mt-1 inline-flex items-center gap-1.5 min-h-[20px]">
        {badgeTone ? (
          <Badge variant={badgeTone}>{value}</Badge>
        ) : (
          <span className={mono ? 'font-mono' : ''}>{value}</span>
        )}
        {copyable && value !== '—' && <CopyButton value={value} label={label} iconSize={10} />}
      </div>
    </div>
  );
}
